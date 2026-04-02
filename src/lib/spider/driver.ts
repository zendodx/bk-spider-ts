/**
 * Playwright 浏览器驱动工厂
 * 对应原 Python 项目 core/driver.py
 * 使用 playwright-extra + stealth 插件绕过自动化指纹检测
 * 屏蔽图片/字体只加载 HTML/CSS/JS
 */

import { Browser, BrowserContext, Page } from 'playwright';
import { chromium as chromiumExtra } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// 注册 stealth 插件（覆盖 20+ 自动化检测点）
chromiumExtra.use(StealthPlugin());

export interface DriverOptions {
  headless?: boolean;
  /** 是否屏蔽图片/字体资源（默认 false，保留图片确保验证码可见；爬取正文时可开启以加速） */
  blockResources?: boolean;
  userDataDir?: string;
}

let _browser: Browser | null = null;

/**
 * 创建并配置 Playwright 浏览器实例
 * 集成了 stealth 插件 + 反检测启动参数
 */
export async function createBrowser(options: DriverOptions = {}): Promise<Browser> {
  const { headless = false } = options;

  // 启动 chromium，注入反检测参数
  const launchArgs = [
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--window-size=1280,800',
  ];

  _browser = await chromiumExtra.launch({
    headless,
    args: launchArgs,
  });

  return _browser;
}

/**
 * 创建带反检测配置的浏览器上下文
 */
export async function createContext(
  browser: Browser,
  options: DriverOptions = {}
): Promise<BrowserContext> {
  const { blockResources = false } = options;

  // 不手动设置 userAgent / sec-ch-ua：stealth 插件内部维护了一套与 JS 指纹完全一致的
  // Chrome UA，如果在这里随机替换 UA 或手动写 sec-ch-ua，会导致 HTTP 头与 JS 指纹不一致
  // 从而被贝壳等风控系统识别为机器人（这正是装了 stealth 反而触发验证码的根本原因）。
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    // 只保留 Accept-Language，其余 sec-ch-ua 系列由 stealth 插件自动注入
    extraHTTPHeaders: {
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });

  // ⚠️ 不在这里手动 addInitScript 覆盖 webdriver/plugins/chrome/languages：
  // stealth 插件已经全部处理，重复注入会导致两套脚本竞争，产生可被检测的异常状态。

  // 屏蔽图片 / 字体资源，只加载 HTML/CSS/JS（加速爬取）
  if (blockResources) {
    await context.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      const blockedTypes = ['image', 'media', 'font', 'other'];

      if (blockedTypes.includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });
  }

  return context;
}

/**
 * 创建页面并注入额外的 stealth 配置
 */
export async function createPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();

  // 防止 headless 检测
  await page.addInitScript(() => {
    // 随机 canvas 指纹扰动
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
      if (parameter === 37445) return 'Intel Inc.';
      if (parameter === 37446) return 'Intel Iris OpenGL Engine';
      return getParameter.call(this, parameter);
    };
  });

  return page;
}

/**
 * 关闭浏览器
 */
export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}


