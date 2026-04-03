/**
 * 认证与 Cookie 管理
 * 对应原 Python 项目 core/auth.py
 * 使用 Playwright BrowserContext storageState 替代 pickle
 */

import fs from 'fs';
import path from 'path';
import { BrowserContext, Page } from 'playwright';
import { URLBuilder } from './url-builder';
import { setWindowVisible } from './driver';

export class AuthManager {
  private cookieFile: string;
  private host: string;

  constructor(cookieFile: string, host: string) {
    this.cookieFile = cookieFile;
    this.host = host;
  }

  /**
   * 确保登录状态
   *
   * 优化后流程（尽量减少页面导航次数）：
   *
   * 有 Cookie 文件：
   *   1. 加载 Cookie（无需先导航，addCookies 根据 cookie.domain 生效）
   *   2. 直接 goto(testUrl) —— 只需 1 次导航
   *   3. 用 Promise.race 同时检测登录浮层 OR 正常页面元素，哪个先出现立即决策
   *
   * 无 Cookie 文件：
   *   1. goto(host) —— 1 次导航，展示登录页
   *   2. 等待人工登录
   */
  async ensureLogin(context: BrowserContext, page: Page, timeout = 300000): Promise<void> {
    const testUrl = URLBuilder.buildListUrl(this.host, '', 1, '');

    if (fs.existsSync(this.cookieFile)) {
      // ── 有 Cookie：直接加载后访问测试页，一次导航搞定 ──
      await this.loadCookies(context);
      await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } else {
      // ── 无 Cookie：访问主页等待登录浮层出现 ──
      await page.goto(this.host, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // 快速判断：同时等「登录浮层」和「正常页面元素」，看哪个先出现
    const needLogin = await this.detectLoginRequired(page);

    if (needLogin) {
      console.log('⚠️ 检测到登录浮层，请手动完成登录');
      await setWindowVisible(page, true);   // 将浏览器窗口展示出来
      await this.waitForManualLogin(page, timeout);
      await this.saveCookies(context);
      await setWindowVisible(page, false);  // 登录完成，将窗口移回屏幕外
      console.log('✓ 登录成功，Cookie 已保存');
    } else {
      console.log('✓ 已恢复登录态');
    }
  }

  /**
   * 快速检测是否需要登录
   *
   * 用 Promise.race 同时监听两个信号：
   *   - 登录浮层出现（div.window-login）→ 需要登录
   *   - 房源列表容器出现（ul.sellListContent 或 .content__list）→ 已登录
   *
   * 两者都没出现时，3 秒超时后检查一次 DOM 快照，避免死等。
   */
  private async detectLoginRequired(page: Page): Promise<boolean> {
    try {
      const result = await Promise.race([
        page.waitForSelector('div.window-login', { timeout: 3000, state: 'attached' })
          .then(() => 'login' as const),
        page.waitForSelector('ul.sellListContent, .content__list', { timeout: 3000, state: 'attached' })
          .then(() => 'ok' as const),
      ]);
      return result === 'login';
    } catch {
      // 两个选择器都没出现（超时）：做一次 DOM 快照检查
      const modal = await page.$('div.window-login');
      return !!modal;
    }
  }

  /**
   * 等待人工完成登录（轮询检测登录浮层是否消失）
   */
  private async waitForManualLogin(page: Page, timeout: number): Promise<void> {
    const POLL_MS = 3000;
    const startTime = Date.now();

    console.log(`⏳ 等待手动登录完成（最长 ${Math.round(timeout / 1000)} 秒）...`);

    while (Date.now() - startTime < timeout) {
      await page.waitForTimeout(POLL_MS);

      // 登录浮层消失 → 登录成功
      const stillVisible = await page.$('div.window-login');
      if (!stillVisible) {
        return;
      }

      const remaining = Math.ceil((timeout - (Date.now() - startTime)) / 1000);
      console.log(`⏳ 等待登录... 剩余时间 ${remaining}s`);
    }

    throw new Error('登录超时，请重新运行程序');
  }

  /**
   * 加载 Cookie（对应 Python _load_cookies）
   * Playwright 的 addCookies 依赖 cookie.domain 字段，无需事先导航到该域
   */
  private async loadCookies(context: BrowserContext): Promise<void> {
    try {
      const data = JSON.parse(fs.readFileSync(this.cookieFile, 'utf-8'));
      if (data.cookies && Array.isArray(data.cookies)) {
        // 过滤掉可能导致兼容性问题的 sameSite 字段（对应 Python 的 del c["sameSite"]）
        const cleaned = data.cookies.map((c: Record<string, unknown>) => {
          const { sameSite: _sameSite, ...rest } = c;
          return rest;
        });
        await context.addCookies(cleaned);
      }
    } catch {
      console.warn('加载 Cookie 失败，将重新登录');
    }
  }

  /**
   * 保存 Cookie（对应 Python _save_cookies）
   */
  private async saveCookies(context: BrowserContext): Promise<void> {
    const cookies = await context.cookies();
    const dir = path.dirname(this.cookieFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.cookieFile, JSON.stringify({ cookies }, null, 2), 'utf-8');
  }
}
