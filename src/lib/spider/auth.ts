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
   */
  async ensureLogin(context: BrowserContext, page: Page, timeout = 300000): Promise<void> {
    // 加载已有 Cookie
    if (fs.existsSync(this.cookieFile)) {
      await this.loadCookies(context);
    }

    // 访问测试页面检查登录状态
    const testUrl = URLBuilder.buildListUrl(this.host, '', 1, '');
    await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 检查登录弹窗
    const loginModal = await page.$('div.window-login');
    if (loginModal) {
      console.log('⚠️ 检测到登录浮层，请手动完成登录');
      await setWindowVisible(page, true);   // 需要登录：将窗口显示出来
      await this.waitForManualLogin(page, timeout);
      await this.saveCookies(context);
      await setWindowVisible(page, false);  // 登录完成：将窗口移回屏幕外
      console.log('✓ 登录成功，Cookie 已保存');
    } else {
      console.log('✓ 已恢复登录态');
    }
  }

  private async waitForManualLogin(page: Page, timeout: number): Promise<void> {
    try {
      await page.waitForFunction(
        () => !document.querySelector('div.window-login'),
        { timeout }
      );
    } catch {
      throw new Error('登录超时，请重新运行程序');
    }
  }

  private async loadCookies(context: BrowserContext): Promise<void> {
    try {
      const data = JSON.parse(fs.readFileSync(this.cookieFile, 'utf-8'));
      if (data.cookies && Array.isArray(data.cookies)) {
        await context.addCookies(data.cookies);
      }
    } catch {
      console.warn('加载 Cookie 失败，将重新登录');
    }
  }

  private async saveCookies(context: BrowserContext): Promise<void> {
    const cookies = await context.cookies();
    const dir = path.dirname(this.cookieFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.cookieFile, JSON.stringify({ cookies }, null, 2), 'utf-8');
  }
}
