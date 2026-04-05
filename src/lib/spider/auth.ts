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
   * 确保登录状态（对应 Python ensure_login）
   *
   * 流程：
   * 1. 先访问 host 主页（建立域名上下文）
   * 2. 若有已保存的 Cookie 则加载，并刷新页面使 Cookie 生效
   * 3. 访问测试页检查是否弹出登录浮层（等待最多 5 秒）
   * 4. 若出现登录浮层：展示浏览器窗口，等待人工登录完成，保存 Cookie
   * 5. 若无登录浮层：直接恢复登录态
   */
  async ensureLogin(context: BrowserContext, page: Page, timeout = 300000): Promise<void> {
    // Step 1: 访问 host 主页，确保 Cookie 域已建立
    await page.goto(this.host, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Step 2: 加载已保存的 Cookie 并刷新（对应 Python load_cookies + driver.refresh）
    if (fs.existsSync(this.cookieFile)) {
      await this.loadCookies(context);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Step 3: 访问测试页，等待最多 5 秒检查登录浮层是否出现
    const testUrl = URLBuilder.buildListUrl(this.host, '', 1, '');
    await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const loginModalVisible = await this.isLoginModalPresent(page, 5000);

    if (loginModalVisible) {
      // Step 4: 需要人工登录
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
   * 检测登录浮层是否出现（对应 Python WebDriverWait presence_of_element_located）
   * @param page Playwright Page
   * @param waitMs 最长等待毫秒数（默认 5000）
   */
  private async isLoginModalPresent(page: Page, waitMs = 5000): Promise<boolean> {
    try {
      await page.waitForSelector('div.window-login', { timeout: waitMs, state: 'attached' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 等待人工完成登录（对应 Python _manual_login / waitForManualLogin）
   * 轮询检测登录浮层是否消失
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
