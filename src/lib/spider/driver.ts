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

  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),
    viewport: { width: 1280, height: 800 },
    // 伪装常见浏览器属性
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    extraHTTPHeaders: {
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
    },
  });

  // 注入 stealth 脚本 —— 覆盖 navigator.webdriver 等自动化特征
  await context.addInitScript(() => {
    // 删除 webdriver 标记
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // 伪造 plugins（真实浏览器有插件）
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const mockPlugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        ];
        return Object.assign(mockPlugins, { length: mockPlugins.length, item: (i: number) => mockPlugins[i] });
      },
    });

    // 覆盖 chrome 对象
    (window as any).chrome = {
      runtime: {},
      loadTimes: () => {},
      csi: () => {},
      app: {},
    };

    // 覆盖 permissions
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission } as any)
          : originalQuery(parameters);
    }

    // 修复 languages
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
  });

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

/**
 * 获取随机 User-Agent
 */
function getRandomUserAgent(): string {
  const userAgents = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}
