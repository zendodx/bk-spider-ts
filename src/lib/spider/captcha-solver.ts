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
const AI_MAX_ATTEMPTS = 2;

/** 操作完成后等待验证码组件消失的时间 */
const VERIFY_WAIT_MS = 3000;

const VISION_PROMPT = `你是验证码分析助手。请分析这张网页截图，判断是否出现了极验(geetest)人机验证，并返回 JSON（只返回 JSON 本身，不要 markdown 代码块、不要任何解释文字）。

返回格式：
{
  "type": "slider" | "click" | "none",
  "gapX": 缺口（拼图需要拖到的目标位置）中心的水平坐标，仅 slider 时需要,
  "sliderX": 滑块按钮中心的水平坐标，仅 slider 时需要,
  "sliderY": 滑块按钮中心的垂直坐标，仅 slider 时需要,
  "points": [{"x": 水平坐标, "y": 垂直坐标}]  需要依次点击的目标文字/图标中心坐标，仅 click 时需要
}

判断规则：
- 截图中有"滑块拼图"（一个可拖动的滑块按钮 + 带缺口凹槽的背景图）→ type = "slider"
- 截图中要求"按顺序点击文字/图标"→ type = "click"
- 截图中没有验证码 → type = "none"

所有坐标一律用占图片宽/高的百分比表示（0-100，保留 1 位小数）。`;

interface SliderPlan {
  type: 'slider';
  gapX: number;
  sliderX: number;
  sliderY: number;
}

interface ClickPlan {
  type: 'click';
  points: { x: number; y: number }[];
}

interface NonePlan {
  type: 'none';
}

type CaptchaPlan = SliderPlan | ClickPlan | NonePlan;

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

    const { model } = this.resolveConfig();
    for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt++) {
      log(`🤖 AI 验证码识别中（模型 ${model}，第 ${attempt}/${AI_MAX_ATTEMPTS} 次）...`);
      try {
        const solved = await this.trySolveOnce(page, captchaSelectors, log);
        if (solved) {
          log('🤖 AI 验证通过 ✓');
          return true;
        }
      } catch (e) {
        log(`🤖 AI 识别异常: ${e instanceof Error ? e.message : e}`);
      }
    }

    log('🤖 AI 未能通过验证，转人工处理');
    return false;
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
    log: (msg: string) => void
  ): Promise<boolean> {
    // 优先裁剪验证码容器区域截图（更高相对分辨率，VL 坐标更准），找不到容器则全页截图
    const region = await this.findCaptchaRegion(page);
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 95,
      ...(region ? { clip: region } : {}),
    });
    const base64 = screenshot.toString('base64');

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
      await this.solveClick(page, plan, map, log);
    }

    // 等待验证结果生效，然后检查验证码元素是否已消失
    await page.waitForTimeout(VERIFY_WAIT_MS);
    for (const sel of captchaSelectors) {
      if (await page.$(sel)) return false; // 验证码仍在，本轮失败
    }
    return true;
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
    log(`🤖 滑块验证码：拖动距离 ${distance.toFixed(1)}px`);

    await this.humanDrag(page, startX, startY, distance);
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
    log(`🤖 点选验证码：依次点击 ${plan.points.length} 个目标`);
    for (const pt of plan.points) {
      const x = map.x + (pt.x / 100) * map.width;
      const y = map.y + (pt.y / 100) * map.height;
      // 点击位置加微小随机偏移，避免每次都落在完全相同的像素
      await page.mouse.click(x + (Math.random() * 4 - 2), y + (Math.random() * 4 - 2));
      await page.waitForTimeout(400 + Math.random() * 400);
    }
    // 点选完成后通常需要点击「确认」按钮
    const confirmBtn = await page.$('.geetest_commit, .geetest_commit_tip');
    if (confirmBtn) {
      await confirmBtn.click().catch(() => {});
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

  /**
   * 调用通义千问视觉模型（DashScope OpenAI 兼容接口），解析返回的验证码操作方案
   */
  private async askVisionModel(base64Jpeg: string, log?: (msg: string) => void): Promise<CaptchaPlan | null> {
    const { apiKey, baseURL, model } = this.resolveConfig();
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
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` },
              },
              { type: 'text', text: VISION_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Qwen-VL 请求失败 HTTP ${resp.status}: ${body.slice(0, 200)}`);
    }

    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    log?.(`🤖 模型原始返回：${text.slice(0, 300)}${text.length > 300 ? '…' : ''}`);
    return this.parsePlan(text);
  }

  /** 从模型输出中提取 JSON（容忍 markdown 代码块包裹和首尾杂文本） */
  private parsePlan(text: string): CaptchaPlan | null {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const obj = JSON.parse(match[0]);
      if (obj.type === 'slider' && typeof obj.gapX === 'number') {
        return {
          type: 'slider',
          gapX: obj.gapX,
          sliderX: typeof obj.sliderX === 'number' ? obj.sliderX : 0,
          sliderY: typeof obj.sliderY === 'number' ? obj.sliderY : 50,
        };
      }
      if (obj.type === 'click' && Array.isArray(obj.points) && obj.points.length > 0) {
        return {
          type: 'click',
          points: obj.points.filter(
            (p: { x?: number; y?: number }) => typeof p?.x === 'number' && typeof p?.y === 'number'
          ),
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
