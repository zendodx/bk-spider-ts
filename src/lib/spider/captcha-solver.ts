/**
 * AI 驱动的极验验证码求解器
 *
 * 思路：
 * - 极验的滑块缺口、点选文字都渲染在 <canvas> 中，DOM 里没有可定位的目标元素，
 *   因此 Stagehand 这类基于 DOM/可访问性树的 AI 操作无法直接解决；
 * - 这里采用「截图 → 视觉大模型（通义千问 Qwen-VL）识别坐标 → Playwright 拟人轨迹执行」的方式；
 * - AI 尝试次数有限（默认 2 次），失败立即返回 false，由调用方回退人工接管。
 *
 * 配置（.env.local）：
 *   QWEN_API_KEY=sk-xxx          # 阿里云百炼 DashScope API Key（必填，未配置则禁用 AI 求解）
 *   QWEN_VL_MODEL=qwen-vl-max-latest  # 可选，视觉模型名称
 *   QWEN_BASE_URL=...            # 可选，OpenAI 兼容接口地址
 */

import { Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SETTINGS_FILE = path.join(os.homedir(), 'bk_spider_data', 'settings.json');

/** 调试截图保存目录 */
const DEBUG_DIR = path.join(os.homedir(), 'bk_spider_data', 'captcha_debug');

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen-vl-max-latest';

/** 可选的视觉模型预设（供系统设置页下拉提示用） */
export const QWEN_VL_MODEL_PRESETS = [
  'qwen-vl-max-latest',
  'qwen-vl-max',
  'qwen-vl-plus-latest',
  'qwen-vl-plus',
  'qwen2.5-vl-72b-instruct',
  'qwen2.5-vl-32b-instruct',
];

/** AI 求解单次验证码的最大尝试轮数（每轮含一次截图识别 + 一次操作） */
const AI_MAX_ATTEMPTS = 5;

/** 操作完成后等待验证码组件消失的时间 */
const VERIFY_WAIT_MS = 3000;

const VISION_PROMPT = `你是验证码分析助手。请分析这张网页截图，判断是否出现了极验(geetest)人机验证，并返回 JSON（只返回 JSON 本身，不要 markdown 代码块、不要任何解释文字）。

返回格式：
{
  "type": "slider" | "click" | "none",
  "gapX": 缺口（拼图需要拖到的目标位置）中心的水平坐标，仅 slider 时需要,
  "sliderX": 滑块按钮中心的水平坐标，仅 slider 时需要,
  "sliderY": 滑块按钮中心的垂直坐标，仅 slider 时需要,
  "points": [{"x": 水平坐标, "y": 垂直坐标, "text": "该点的文字内容（图标/手势则留空）"}]  候选目标，仅 click 时需要,
  "hint": "顶部提示语要求依次点击的目标文字（仅文字类必填，否则为空字符串）",
  "hintKind": "text" | "icon"   // 仅 click 时需要：候选目标是汉字还是手势/图标图案
}

判断规则：
- 截图中有"滑块拼图"（一个可拖动的滑块按钮 + 带缺口凹槽的背景图）→ type = "slider"
- 截图中要求"按顺序/按语序点击文字或图标"→ type = "click"。此时：
  1. 识别出下方图片区域中所有候选文字/图标的中心位置（不要把顶部提示语当作候选点）；
  2. 如果候选是汉字：hintKind="text"，每个点带 text 字段，hint 填提示语中的目标文字（如提示语"请在下图依次点击 酿枇杷"则 hint="酿枇杷"，不含"请点击"等字样）；如果提示语只是"请按语序依次点击"这类没有给出具体目标文字的，hint 必须留空；
  3. 如果候选是手势/图标图案：hintKind="icon"，text 和 hint 留空，排序由后续程序处理；
  4. 只输出候选本身，不要输出提示语、「确定」按钮等其他元素；
  5. 不需要你排序，points 按任意顺序返回即可。
- 截图中没有验证码、或验证码图片区域还是空白未加载出来 → type = "none"

所有坐标一律用占图片宽/高的百分比表示（0-100，保留 1 位小数），取值绝不能超过 100。`;

/** 手势/图标验证码的元素定位提示词（第二阶段：框出提示条和每个候选图案） */
const ICON_LOCATE_PROMPT = `这是一张点选验证码截图。顶部提示语右侧有一排提示图案（线稿手势/图标），下方大图中散布着若干彩色图案。
返回 JSON（只返回 JSON 本身，不要 markdown 代码块）：
{
  "hintBox": {"x": 0, "y": 0, "w": 0, "h": 0},
  "hintCount": 提示图案个数,
  "icons": [{"x": 0, "y": 0, "w": 0, "h": 0}]
}
- hintBox：整排提示图案的外接框（不要包含"请依次点击"等文字）
- icons：大图中每个彩色图案的外接框，框要紧贴图案边缘
- 所有坐标/尺寸为占图片宽/高的百分比（0-100），取值不超过 100`;

interface SliderPlan {
  type: 'slider';
  gapX: number;
  sliderX: number;
  sliderY: number;
}

interface ClickPlan {
  type: 'click';
  points: { x: number; y: number; text?: string }[];
  /** 顶部提示语要求依次点击的目标文字（如 "酿枇杷"），无提示语时为 undefined */
  hint?: string;
  /** 候选目标是汉字还是手势/图标图案（icon 时走图像比对排序） */
  hintKind?: 'text' | 'icon';
}

interface NonePlan {
  type: 'none';
}

type CaptchaPlan = SliderPlan | ClickPlan | NonePlan;

/**
 * 检测模型返回坐标的量纲并给出归一化除数：
 * 提示词要求 0-100 百分比，但 Qwen-VL 系列经常返回 0-1000 的千分比坐标；
 * 只要任一坐标超过 100，就按千分比处理（除以 10 归一到百分比）。
 */
function detectScale(values: (number | undefined)[]): number {
  return values.some(v => typeof v === 'number' && v > 100) ? 10 : 1;
}

/** 验证码在页面上的实际区域（CSS 像素坐标），用于截图裁剪与坐标映射 */
interface CaptchaRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 极验验证码容器候选选择器（优先截容器而不是全页，VL 定位更准） */
const CAPTCHA_CONTAINER_SELECTORS = [
  '.geetest_panel_box',
  '.geetest_box',
  '.geetest_widget',
  '#captcha',
  '.captcha-container',
  'div[class*="captcha"]',
];

export interface CaptchaSolverOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  /** 日志输出（默认 console.log） */
  log?: (msg: string) => void;
}

export class CaptchaSolver {
  /** 构造参数（可选，优先级高于 settings.json 与环境变量） */
  private overrides: { apiKey?: string; baseURL?: string; model?: string };
  private log: (msg: string) => void;
  /** 入口按钮是否已在本次验证码会话中点击过（只点一次，重试不再点） */
  private entryClicked = false;

  constructor(options: CaptchaSolverOptions = {}) {
    this.overrides = {
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      model: options.model,
    };
    this.log = options.log ?? ((msg) => console.log(msg));
  }

  /**
   * 动态解析配置，优先级：构造参数 > settings.json（系统设置页保存）> 环境变量 > 默认值
   *
   * 每次求解前重新读取，保证在「系统设置」里切换模型 / Key 后无需重启即生效。
   */
  private resolveConfig(): { apiKey: string | null; baseURL: string; model: string } {
    let saved: Record<string, string> = {};
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      }
    } catch {
      // 设置文件损坏时静默降级到环境变量
    }

    const pick = (...candidates: (string | undefined)[]): string | null => {
      for (const c of candidates) {
        if (c) return c; // 跳过 undefined 和空字符串
      }
      return null;
    };

    return {
      apiKey: pick(
        this.overrides.apiKey,
        saved.qwenApiKey,
        process.env.QWEN_API_KEY,
        process.env.DASHSCOPE_API_KEY
      ),
      baseURL:
        pick(this.overrides.baseURL, saved.qwenBaseUrl, process.env.QWEN_BASE_URL) ??
        DEFAULT_BASE_URL,
      model:
        pick(this.overrides.model, saved.qwenModel, process.env.QWEN_VL_MODEL) ?? DEFAULT_MODEL,
    };
  }

  /** 是否已配置 API Key（未配置时 AI 求解整体跳过） */
  isEnabled(): boolean {
    return !!this.resolveConfig().apiKey;
  }

  /**
   * AI 尝试解决当前页面上的验证码。
   * @param captchaSelectors 用于判定验证码是否仍存在的选择器列表
   * @returns true = 已通过；false = AI 未能解决，调用方应回退人工
   */
  async trySolve(
    page: Page,
    captchaSelectors: string[],
    onLog?: (msg: string) => void
  ): Promise<boolean> {
    const log = onLog ?? this.log;
    if (!this.isEnabled()) return false;

    // 新的验证码会话：重置入口按钮状态（首次尝试时点击一次，后续重试不再点）
    this.entryClicked = false;

    const { model } = this.resolveConfig();
    for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt++) {
      log(`🤖 AI 验证码识别中（模型 ${model}，第 ${attempt}/${AI_MAX_ATTEMPTS} 次）...`);
      try {
        const solved = await this.trySolveOnce(page, captchaSelectors, log, attempt);
        if (solved) {
          log('🤖 AI 验证通过 ✓');
          return true;
        }
        // 本轮失败：极验会自动刷新出新题，无需手动点刷新，等新题加载即可
        if (attempt < AI_MAX_ATTEMPTS) {
          log('🤖 本轮未通过，等待新验证码自动加载...');
          await page.waitForTimeout(2000);
        }
      } catch (e) {
        log(`🤖 AI 识别异常: ${e instanceof Error ? e.message : e}`);
        await page.waitForTimeout(2000);
      }
    }

    log(`🤖 AI 尝试 ${AI_MAX_ATTEMPTS} 次均未通过，转人工处理`);
    return false;
  }

  /**
   * 保存本轮发送给模型的截图到调试目录，便于事后核对模型实际看到的画面
   */
  private saveDebugScreenshot(buf: Buffer, attempt: number, log: (msg: string) => void): void {
    try {
      fs.mkdirSync(DEBUG_DIR, { recursive: true });
      const ts = new Date()
        .toISOString()
        .replace(/[-:T]/g, '')
        .slice(0, 14);
      const file = path.join(DEBUG_DIR, `captcha_${ts}_attempt${attempt}.jpg`);
      fs.writeFileSync(file, buf);
      log(`🤖 截图已保存：${file}（${(buf.length / 1024).toFixed(1)}KB）`);
    } catch {
      // 调试截图保存失败不影响主流程
    }
  }

  /**
   * 连通性测试：发送一条纯文本消息，验证 API Key / 模型 / 接口地址是否可用
   * @returns success + 可读的结果描述（含延迟与模型回复或错误详情）
   */
  async testConnection(): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const { apiKey, baseURL, model } = this.resolveConfig();
    if (!apiKey) {
      return { success: false, message: '未配置 API Key，请先填写后再测试' };
    }

    const start = Date.now();
    try {
      const resp = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 16,
          temperature: 0,
          messages: [{ role: 'user', content: '请只回复两个字：正常' }],
        }),
      });
      const latencyMs = Date.now() - start;

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        // 提取 DashScope/OpenAI 风格的错误信息
        let detail = body.slice(0, 200);
        try {
          const errObj = JSON.parse(body);
          detail = errObj.error?.message || errObj.message || detail;
        } catch { /* 保留原始文本 */ }
        return { success: false, latencyMs, message: `HTTP ${resp.status}：${detail}` };
      }

      const data = (await resp.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const reply = data.choices?.[0]?.message?.content?.trim() || '(空回复)';
      return {
        success: true,
        latencyMs,
        message: `连通成功，模型「${model}」响应 ${latencyMs}ms，回复：${reply.slice(0, 30)}`,
      };
    } catch (e) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `网络错误：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  /** 单轮求解：截图 → 识别 → 执行 → 校验 */
  private async trySolveOnce(
    page: Page,
    captchaSelectors: string[],
    log: (msg: string) => void,
    attempt = 1
  ): Promise<boolean> {
    // 贝壳验证页是「入口按钮」模式：先点「点击按钮开始验证」才弹出滑块/点选面板，
    // 且风险低时点击后直接无感通过
    await this.clickEntryButtonIfPresent(page, log);

    // 入口点击后若无感通过（验证码元素已消失），直接成功
    if (await this.isCaptchaGone(page, captchaSelectors)) {
      log('🤖 点击入口按钮后无感通过 ✓');
      return true;
    }

    // 优先裁剪验证码容器区域截图（更高相对分辨率，VL 坐标更准），找不到容器则全页截图
    const region = await this.findCaptchaRegion(page);
    log(
      region
        ? `🤖 截图区域：验证码容器 (${Math.round(region.x)}, ${Math.round(region.y)}) ${Math.round(region.width)}×${Math.round(region.height)}`
        : '🤖 截图区域：未找到验证码容器，使用全页截图'
    );
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 95,
      timeout: 15000, // 快速失败，避免占满整轮尝试时间
      ...(region ? { clip: region } : {}),
    });
    const base64 = screenshot.toString('base64');
    this.saveDebugScreenshot(screenshot, attempt, log);

    const map: CaptchaRegion = region ?? (() => {
      const vp = page.viewportSize() ?? { width: 1280, height: 800 };
      return { x: 0, y: 0, width: vp.width, height: vp.height };
    })();

    const plan = await this.askVisionModel(base64, log);
    if (!plan || plan.type === 'none') {
      log('🤖 视觉模型未识别出可操作的验证码');
      return false;
    }
    log(`🤖 模型识别结果：${JSON.stringify(plan)}`);

    if (plan.type === 'slider') {
      await this.solveSlider(page, plan, map, log);
    } else {
      // 手势/图标类：VL 命名不可靠，改用「裁剪图像两两比对」确定顺序；失败退回文字排序逻辑
      let sortedPoints: ClickPlan['points'] | null = null;
      if (plan.hintKind === 'icon') {
        sortedPoints = await this.matchIconOrder(page, map, log);
      }
      if (!sortedPoints) {
        sortedPoints = await this.orderClickPoints(plan.points, plan.hint, log);
      }
      await this.solveClick(page, { ...plan, points: sortedPoints }, map, log);
    }

    // 操作完成后如出现「确定」按钮则点击提交（部分极验样式需要手动提交，不点等于没做）
    await this.clickCommitIfPresent(page, log);

    // 等待验证结果生效，然后检查验证码元素是否已消失
    await page.waitForTimeout(VERIFY_WAIT_MS);
    for (const sel of captchaSelectors) {
      if (await page.$(sel)) return false; // 验证码仍在，本轮失败
    }
    return true;
  }

  /** 检查验证码元素是否已全部消失 */
  private async isCaptchaGone(page: Page, captchaSelectors: string[]): Promise<boolean> {
    for (const sel of captchaSelectors) {
      if (await page.$(sel)) return false;
    }
    return true;
  }

  /**
   * 点击极验的「点击按钮开始验证」入口按钮（如果存在且可见）
   * 用鼠标拟人点击而不是 el.click，避免被行为检测
   */
  private async clickEntryButtonIfPresent(page: Page, log: (msg: string) => void): Promise<void> {
    // 本次会话已点过入口按钮，直接跳过
    if (this.entryClicked) return;

    const ENTRY_SELECTORS = [
      '.geetest_btn_click',
      '.geetest_radar_btn',
      'text=点击按钮开始验证',
      'text=开始验证',
    ];
    for (const sel of ENTRY_SELECTORS) {
      const el = await page.$(sel);
      if (!el) continue;
      const visible = await el.isVisible().catch(() => false);
      if (!visible) continue;
      const box = await el.boundingBox().catch(() => null);
      if (!box) continue;

      log('🤖 检测到验证入口按钮，点击进入验证...');
      this.entryClicked = true;
      const targetX = box.x + box.width / 2 + (Math.random() * 8 - 4);
      const targetY = box.y + box.height / 2 + (Math.random() * 6 - 3);
      await page.mouse.move(targetX - 40, targetY + 10, { steps: 6 });
      await page.waitForTimeout(120 + Math.random() * 150);
      await page.mouse.move(targetX, targetY, { steps: 4 });
      await page.waitForTimeout(100 + Math.random() * 150);
      await page.mouse.down();
      await page.waitForTimeout(60 + Math.random() * 90);
      await page.mouse.up();

      // 等待验证面板加载：先等 2 秒，再等题目内容元素出现（滑块轨道/点选图片/提示语），
      // 避免截到空白面板（内容未加载时模型只能返回 none）
      await page.waitForTimeout(2000);
      await page
        .waitForSelector(
          '.geetest_item_img, .geetest_canvas_bg, .geetest_ques_tips, .geetest_slider_track, .geetest_slider_button',
          { timeout: 5000 }
        )
        .catch(() => {});
      return;
    }
  }

  /** 找到可见的验证码容器并返回其裁剪区域（四周留 20px 边距，限制在视口内） */
  private async findCaptchaRegion(page: Page): Promise<CaptchaRegion | null> {
    const vp = page.viewportSize() ?? { width: 1280, height: 800 };
    for (const sel of CAPTCHA_CONTAINER_SELECTORS) {
      const el = await page.$(sel);
      if (!el) continue;
      const box = await el.boundingBox().catch(() => null);
      if (!box || box.width < 50 || box.height < 50) continue;
      const pad = 20;
      return {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: Math.min(vp.width, box.x + box.width + pad) - Math.max(0, box.x - pad),
        height: Math.min(vp.height, box.y + box.height + pad) - Math.max(0, box.y - pad),
      };
    }
    return null;
  }

  /**
   * 滑块验证码：以拟人轨迹把滑块拖到缺口位置
   * @param map VL 返回的百分比坐标所对应的页面区域（裁剪图的原点与尺寸）
   */
  private async solveSlider(
    page: Page,
    plan: SliderPlan,
    map: CaptchaRegion,
    log: (msg: string) => void
  ): Promise<void> {
    // 缺口在页面上的绝对坐标
    const gapPageX = map.x + (plan.gapX / 100) * map.width;

    // 优先用真实的滑块 DOM 元素定位起点（比视觉估计更准）
    const sliderEl = await page.$('.geetest_slider_button, .geetest_btn_click');
    let startX: number;
    let startY: number;
    const elBox = sliderEl ? await sliderEl.boundingBox().catch(() => null) : null;
    if (elBox) {
      startX = elBox.x + elBox.width / 2;
      startY = elBox.y + elBox.height / 2;
    } else {
      startX = map.x + (plan.sliderX / 100) * map.width;
      startY = map.y + (plan.sliderY / 100) * map.height;
    }

    const distance = gapPageX - startX;
    if (distance <= 0) {
      log(`🤖 识别出的拖动距离异常（${distance.toFixed(1)}px），跳过本轮`);
      return;
    }
    const startXDesc = elBox ? 'DOM 元素' : '视觉估计';
    log(`🤖 滑块验证码：起点 (${startX.toFixed(1)}, ${startY.toFixed(1)})[${startXDesc}]，缺口 x=${gapPageX.toFixed(1)}，拖动距离 ${distance.toFixed(1)}px`);

    await this.humanDrag(page, startX, startY, distance);
  }

  /**
   * 点击「确定/提交」按钮（如果存在且可见）
   * 部分极验样式（尤其是点选）需要手动提交答案，不点不会触发服务端校验
   */
  private async clickCommitIfPresent(page: Page, log: (msg: string) => void): Promise<void> {
    const COMMIT_SELECTORS = [
      '.geetest_commit',
      '.geetest_commit_tip',
      'a.geetest_commit',
      'div[aria-label="确定"]',
      'text=确 定',
      'text=确定',
    ];
    // 稍等片刻让按钮渲染出来
    await page.waitForTimeout(400);
    for (const sel of COMMIT_SELECTORS) {
      const el = await page.$(sel);
      if (!el) continue;
      const visible = await el.isVisible().catch(() => false);
      if (!visible) continue;
      try {
        await el.click();
        log('🤖 已点击「确定」提交验证');
        return;
      } catch {
        // 点不动就试下一个选择器
      }
    }
  }

  /**
   * 手势/图标点选验证码：通过「裁剪图像两两比对」确定点击顺序。
   *
   * 为什么不用文字描述：VL 对手势的命名不稳定（同一手势可能叫"点赞"也可能叫"竖拇指"），
   * 但 VL 做"这两张图是不是同一个手势"的视觉比对要可靠得多。
   *
   * 流程：定位提示条与候选图案的外接框 → 分别裁剪 → 每个候选与提示条比对得到编号 →
   * 按提示编号顺序输出点击点。任一步失败返回 null，调用方退回文字排序逻辑。
   */
  private async matchIconOrder(
    page: Page,
    map: CaptchaRegion,
    log: (msg: string) => void
  ): Promise<{ x: number; y: number }[] | null> {
    try {
      // 1. 重截一张当前面板图，让 VL 框出提示条和所有候选图案
      const shot = await page.screenshot({ type: 'jpeg', quality: 95, timeout: 15000, clip: map });
      const located = await this.locateIcons(shot.toString('base64'));
      if (!located || located.hintCount < 1) {
        log('🤖 手势定位失败，退回文字排序逻辑');
        return null;
      }
      log(`🤖 手势定位：${located.hintCount} 个提示图案，${located.icons.length} 个候选图案`);

      // 百分比框 → 页面 CSS 像素 clip（带少量外扩，避免图案被裁掉边缘）
      const toClip = (b: { x: number; y: number; w: number; h: number }, padPct = 2) => ({
        x: Math.max(0, map.x + ((b.x - padPct) / 100) * map.width),
        y: Math.max(0, map.y + ((b.y - padPct) / 100) * map.height),
        width: ((b.w + padPct * 2) / 100) * map.width,
        height: ((b.h + padPct * 2) / 100) * map.height,
      });

      const hintShot = await page.screenshot({ type: 'jpeg', quality: 95, timeout: 15000, clip: toClip(located.hintBox) });
      const hintB64 = hintShot.toString('base64');

      // 2. 每个候选图案与提示条比对，得到它对应第几个提示
      const matched: { hintIndex: number; cx: number; cy: number }[] = [];
      for (let i = 0; i < located.icons.length; i++) {
        const icon = located.icons[i];
        const iconShot = await page.screenshot({ type: 'jpeg', quality: 95, timeout: 15000, clip: toClip(icon) });
        const hintIndex = await this.matchIconToHint(hintB64, iconShot.toString('base64'), located.hintCount);
        log(
          `🤖 候选图案 #${i + 1}（中心 ${icon.x + icon.w / 2},${icon.y + icon.h / 2}）→ 匹配提示 #${hintIndex || '无'}`
        );
        if (hintIndex >= 1) {
          matched.push({ hintIndex, cx: icon.x + icon.w / 2, cy: icon.y + icon.h / 2 });
        }
      }

      // 3. 按提示顺序消耗式取点；任何一个提示没有对应候选则整体放弃
      const remaining = [...matched];
      const ordered: { x: number; y: number }[] = [];
      for (let h = 1; h <= located.hintCount; h++) {
        const idx = remaining.findIndex(m => m.hintIndex === h);
        if (idx === -1) {
          log(`🤖 提示 #${h} 未匹配到候选图案，退回文字排序逻辑`);
          return null;
        }
        const m = remaining.splice(idx, 1)[0];
        ordered.push({ x: m.cx, y: m.cy });
      }
      log(`🤖 手势比对排序完成：${ordered.map(p => `(${p.x},${p.y})`).join(' → ')}`);
      return ordered;
    } catch (e) {
      log(`🤖 手势图标匹配异常，退回文字排序逻辑（${e instanceof Error ? e.message : e}）`);
      return null;
    }
  }

  /** 手势定位：让 VL 框出提示条和每个候选图案（百分比坐标） */
  private async locateIcons(base64Jpeg: string): Promise<{
    hintBox: { x: number; y: number; w: number; h: number };
    hintCount: number;
    icons: { x: number; y: number; w: number; h: number }[];
  } | null> {
    const { text } = await this.postVision([
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` } },
      { type: 'text', text: ICON_LOCATE_PROMPT },
    ]);
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const obj = JSON.parse(m[0]);
      if (!obj.hintBox || !Array.isArray(obj.icons) || obj.icons.length === 0) return null;
      const boxes = [obj.hintBox, ...obj.icons];
      const all = boxes.flatMap((b: { x?: number; y?: number; w?: number; h?: number }) => [b?.x, b?.y, b?.w, b?.h]);
      if (all.some((v: unknown) => typeof v !== 'number')) return null;
      const scale = detectScale(all as number[]);
      const norm = (b: { x: number; y: number; w: number; h: number }) => ({
        x: b.x / scale,
        y: b.y / scale,
        w: b.w / scale,
        h: b.h / scale,
      });
      return {
        hintBox: norm(obj.hintBox),
        hintCount:
          typeof obj.hintCount === 'number' && obj.hintCount >= 1 ? Math.round(obj.hintCount) : obj.icons.length,
        icons: obj.icons.map(norm),
      };
    } catch {
      return null;
    }
  }

  /**
   * 图案比对：给 VL 两张图（提示条 + 单个候选图案），判断候选对应提示条中第几个。
   * 返回 1..hintCount，无法匹配返回 0。
   */
  private async matchIconToHint(hintB64: string, iconB64: string, hintCount: number): Promise<number> {
    const { text } = await this.postVision(
      [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${hintB64}` } },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${iconB64}` } },
        {
          type: 'text',
          text: `第一张图是验证码顶部的一排提示图案，从左到右编号 1 到 ${hintCount}。第二张图是验证码大图中的一个彩色图案。
判断第二张图的图案与第一张中第几个是同一个（颜色、大小、旋转角度可能不同，只比较形状/手势含义）。
返回 JSON（只返回 JSON）：{"match": 编号}；都不相同返回 {"match": 0}`,
        },
      ],
      50
    );
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return 0;
    try {
      const n = JSON.parse(m[0]).match;
      return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= hintCount ? n : 0;
    } catch {
      return 0;
    }
  }

  /**
   * 点选目标排序，三级策略：
   * 1. 有提示语（如"请依次点击 酿枇杷"）→ 本地精确匹配排序，最可靠；
   * 2. 无提示语（需自己组句）→ 纯文本 LLM 组句排序；
   * 3. 都失败 → 保持 VL 返回的原顺序。
   */
  private async orderClickPoints(
    points: { x: number; y: number; text?: string }[],
    hint: string | undefined,
    log: (msg: string) => void
  ): Promise<{ x: number; y: number; text?: string }[]> {
    if (hint) {
      const byHint = this.orderPointsByHint(points, hint);
      if (byHint) {
        log(`🤖 按提示语「${hint}」排序：${byHint.map(p => p.text).join(' → ')}`);
        return byHint;
      }
      log(`🤖 提示语「${hint}」与识别结果不完全匹配，改用语义排序`);
    }
    return this.sortClickPointsByLLM(points, hint, log);
  }

  /**
   * 按提示语本地精确排序：依次在候选点中查找与提示语每个字匹配的点（消耗式匹配，支持重复字）。
   * 提示语中任何一个字找不到对应点，则返回 null 交给 LLM 排序。
   */
  private orderPointsByHint(
    points: { x: number; y: number; text?: string }[],
    hint: string
  ): { x: number; y: number; text?: string }[] | null {
    const chars = [...hint.replace(/\s/g, '')];
    if (chars.length === 0) return null;
    const remaining = [...points];
    const ordered: typeof points = [];
    for (const ch of chars) {
      const idx = remaining.findIndex(p => p.text && [...p.text].includes(ch));
      if (idx === -1) return null;
      ordered.push(remaining.splice(idx, 1)[0]);
    }
    return ordered;
  }

  /**
   * 用语义模型对点选目标排序：
   * VL 模型识別文字和位置很准，但把散字组成通顺短语（语序）不可靠，
   * 因此排序单独用一次纯文本调用完成。失败时保持原顺序。
   */
  private async sortClickPointsByLLM(
    points: { x: number; y: number; text?: string }[],
    hint: string | undefined,
    log: (msg: string) => void
  ): Promise<{ x: number; y: number; text?: string }[]> {
    if (points.length < 2 || points.some(p => !p.text)) return points;

    const chars = points.map(p => p.text as string);
    // 无提示语（组句型）走短语输出 + 本地校验；有提示语仍走下标排序
    return hint ? this.sortByHintWithLLM(points, hint, chars, log) : this.sortByPhraseWithLLM(points, chars, log);
  }

  /**
   * 组句型（"请按语序依次点击"，无目标提示）：
   * 让 LLM 直接输出组成的短语文字（如「泡好茶水」），而不是下标排列——
   * 组句是 LLM 的强项，数下标不是。短语由程序校验「用字与识别结果完全一致」
   * （多重集合相等），再用消耗式匹配映射回坐标点，计数和映射都由程序保证。
   */
  private async sortByPhraseWithLLM(
    points: { x: number; y: number; text?: string }[],
    chars: string[],
    log: (msg: string) => void
  ): Promise<{ x: number; y: number; text?: string }[]> {
    const { apiKey, baseURL, model } = this.resolveConfig();
    const prompt = `这是一组从验证码图片中识别出的汉字（顺序已打乱）：${JSON.stringify(chars)}
验证码要求"按语序依次点击"，即这 ${chars.length} 个汉字能组成一句通顺的话。
规则：
- 必须恰好使用全部 ${chars.length} 个汉字，每个字用且只用一次，不能增删替换任何字；
- 这类题目的答案绝大多数是「动词 + 名词」的动宾结构（或两个动宾词组连用）。先找出字里的动词，再把它支配的名词/宾语跟在后面；
- 参考示例（打乱的字 → 正确答案）：
  ["收","好","彩","笔"] → 收好彩笔（动词"收"+ 名词"彩笔"）
  ["餐","摆","套","具"] → 摆好餐具（动词"摆"+ 名词"餐具"）
  ["开","门","推","柜"] → 开门推柜（动宾"开门"+ 动宾"推柜"）
  ["节","约","用","电"] → 节约用电（动词"节约"+ 宾语"用电"）
  ["泡","茶","好","水"] → 好水泡茶（"好水"修饰，动词"泡"+ 名词"茶"）
  ["保","护","环","境"] → 保护环境
返回 JSON（只返回 JSON 本身）：{"phrase": "组成的短语"}`;

    try {
      const resp = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 100,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content?.trim() ?? '';
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('返回中未找到 JSON');
      const phrase = String(JSON.parse(m[0]).phrase ?? '').replace(/[\s，。、,.!！?？「」]/g, '');
      // 校验：短语用字必须与识别用字构成相同的多重集合（每个字用且只用一次）
      const phraseChars = [...phrase];
      const sameMultiset = (a: string[], b: string[]) => [...a].sort().join('\n') === [...b].sort().join('\n');
      if (!phrase || !sameMultiset(phraseChars, chars)) {
        throw new Error(`短语「${phrase}」用字与识别结果 ${JSON.stringify(chars)} 不一致`);
      }
      // 消耗式映射回坐标点
      const remaining = [...points];
      const sorted: typeof points = [];
      for (const ch of phraseChars) {
        const idx = remaining.findIndex(p => p.text && [...p.text].includes(ch));
        if (idx === -1) throw new Error(`短语中的「${ch}」找不到对应点`);
        sorted.push(remaining.splice(idx, 1)[0]);
      }
      log(`🤖 语序排序：${chars.join('')} → ${phrase}`);
      return sorted;
    } catch (e) {
      log(`🤖 语序排序失败，按原顺序点击（${e instanceof Error ? e.message : e}）`);
      return points;
    }
  }

  /** 提示语型降级：本地精确匹配失败时，让 LLM 按下标给出与提示对应的点击顺序 */
  private async sortByHintWithLLM(
    points: { x: number; y: number; text?: string }[],
    hint: string,
    chars: string[],
    log: (msg: string) => void
  ): Promise<{ x: number; y: number; text?: string }[]> {
    const { apiKey, baseURL, model } = this.resolveConfig();
    const prompt = `这是一组从验证码图片中识别出的汉字：${JSON.stringify(chars)}
验证码提示要求依次点击「${hint}」。请返回这些字中与提示对应的点击顺序。
返回 JSON（只返回 JSON 本身）：{"order": [按点击顺序排列的原数组下标]}，例如 {"order": [2, 0, 3, 1]}`;

    try {
      const resp = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 100,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content?.trim() ?? '';
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('返回中未找到 JSON');
      const order = JSON.parse(m[0]).order;
      // 校验必须是 0..n-1 的一个排列，否则不信任排序结果
      const isValidPermutation =
        Array.isArray(order) &&
        order.length === points.length &&
        order.every((i: unknown) => typeof i === 'number' && Number.isInteger(i)) &&
        new Set(order).size === points.length &&
        Math.min(...order) === 0 &&
        Math.max(...order) === points.length - 1;
      if (!isValidPermutation) throw new Error(`order 不是有效排列: ${text.slice(0, 100)}`);

      const sorted = order.map((i: number) => points[i]);
      log(`🤖 语序排序：${chars.join('')} → ${sorted.map(p => p.text).join('')}`);
      return sorted;
    } catch (e) {
      log(`🤖 语序排序失败，按原顺序点击（${e instanceof Error ? e.message : e}）`);
      return points;
    }
  }

  /**
   * 点选验证码：按顺序点击目标坐标
   */
  private async solveClick(
    page: Page,
    plan: ClickPlan,
    map: CaptchaRegion,
    log: (msg: string) => void
  ): Promise<void> {
    if (!plan.points?.length) {
      log('🤖 点选验证码：未识别到目标点');
      return;
    }
    const orderDesc = plan.points.map(p => p.text || `(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join(' → ');
    log(`🤖 点选验证码：依次点击 ${plan.points.length} 个目标，顺序：${orderDesc}`);
    for (const pt of plan.points) {
      const x = map.x + (pt.x / 100) * map.width;
      const y = map.y + (pt.y / 100) * map.height;
      // 点击位置加微小随机偏移，避免每次都落在完全相同的像素
      await page.mouse.click(x + (Math.random() * 4 - 2), y + (Math.random() * 4 - 2));
      await page.waitForTimeout(400 + Math.random() * 400);
    }
  }

  /**
   * 拟人拖拽轨迹：
   * - 先移动到滑块上方（带弧线抖动）
   * - 按下后按 easeInOutQuad 缓动前进（先加速后减速）
   * - 轻微过冲后回调（模拟人眼对准缺口）
   * - 垂直方向随机抖动，步长随机
   */
  private async humanDrag(page: Page, fromX: number, fromY: number, distance: number): Promise<void> {
    // 1. 先自然移动到滑块位置
    await page.mouse.move(fromX - 30 + Math.random() * 10, fromY + Math.random() * 6 - 3, { steps: 5 });
    await page.waitForTimeout(100 + Math.random() * 150);
    await page.mouse.move(fromX, fromY, { steps: 3 });
    await page.waitForTimeout(150 + Math.random() * 200);

    await page.mouse.down();
    await page.waitForTimeout(80 + Math.random() * 120);

    // 2. 主拖拽：缓动 + 抖动
    const steps = 28 + Math.floor(Math.random() * 10);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      const jitterY = (Math.random() - 0.5) * 3;
      const jitterX = (Math.random() - 0.5) * 1.5;
      await page.mouse.move(fromX + distance * ease + jitterX, fromY + jitterY);
      await page.waitForTimeout(8 + Math.random() * 18);
    }

    // 3. 轻微过冲再回调（人类很难一次停准）
    const overshoot = 2 + Math.random() * 4;
    await page.mouse.move(fromX + distance + overshoot, fromY + (Math.random() - 0.5) * 2);
    await page.waitForTimeout(120 + Math.random() * 180);
    await page.mouse.move(fromX + distance, fromY + (Math.random() - 0.5) * 2);
    await page.waitForTimeout(150 + Math.random() * 250);

    await page.mouse.up();
  }

  /** 视觉模型的通用请求：发送图文内容，返回原始文本与耗时 */
  private async postVision(
    content: ({ type: 'image_url'; image_url: { url: string } } | { type: 'text'; text: string })[],
    maxTokens?: number
  ): Promise<{ text: string; latencyMs: number }> {
    const { apiKey, baseURL, model } = this.resolveConfig();
    const reqStart = Date.now();
    const resp = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      // 30 秒超时，防止代理挂起导致一直等待
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model,
        temperature: 0,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        messages: [{ role: 'user', content }],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Qwen-VL 请求失败 HTTP ${resp.status}: ${body.slice(0, 200)}`);
    }

    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { text: data.choices?.[0]?.message?.content?.trim() ?? '', latencyMs: Date.now() - reqStart };
  }

  /**
   * 调用通义千问视觉模型（DashScope OpenAI 兼容接口），解析返回的验证码操作方案
   */
  private async askVisionModel(base64Jpeg: string, log?: (msg: string) => void): Promise<CaptchaPlan | null> {
    const { text, latencyMs } = await this.postVision([
      {
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` },
      },
      { type: 'text', text: VISION_PROMPT },
    ]);
    log?.(`🤖 模型原始返回（耗时 ${(latencyMs / 1000).toFixed(1)}s）：${text.slice(0, 300)}${text.length > 300 ? '…' : ''}`);
    return this.parsePlan(text);
  }

  /** 从模型输出中提取 JSON（容忍 markdown 代码块包裹和首尾杂文本） */
  private parsePlan(text: string): CaptchaPlan | null {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const obj = JSON.parse(match[0]);
      if (obj.type === 'slider' && typeof obj.gapX === 'number') {
        const scale = detectScale([obj.gapX, obj.sliderX, obj.sliderY]);
        return {
          type: 'slider',
          gapX: obj.gapX / scale,
          sliderX: typeof obj.sliderX === 'number' ? obj.sliderX / scale : 0,
          sliderY: typeof obj.sliderY === 'number' ? obj.sliderY / scale : 50,
        };
      }
if (obj.type === 'click' && Array.isArray(obj.points) && obj.points.length > 0) {
const pts = obj.points.filter(
(p: { x?: number; y?: number }) => typeof p?.x === 'number' && typeof p?.y === 'number'
);
if (pts.length === 0) return { type: 'none' };
const scale = detectScale(pts.flatMap((p: { x: number; y: number }) => [p.x, p.y]));
return {
type: 'click',
hint: typeof obj.hint === 'string' && obj.hint.trim() ? obj.hint.trim() : undefined,
hintKind: obj.hintKind === 'icon' ? ('icon' as const) : ('text' as const),
points: pts.map((p: { x: number; y: number; text?: string }) => ({
x: p.x / scale,
            y: p.y / scale,
            text: typeof p.text === 'string' ? p.text : undefined,
          })),
        };
      }
      return { type: 'none' };
    } catch {
      return null;
    }
  }
}

let _instance: CaptchaSolver | null = null;

/** 全局单例（API Key 从环境变量读取，一次初始化即可） */
export function getCaptchaSolver(): CaptchaSolver {
  if (!_instance) {
    _instance = new CaptchaSolver();
  }
  return _instance;
}
