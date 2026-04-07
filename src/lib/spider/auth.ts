/**
 * 认证与 Cookie 管理
 * 对应原 Python 项目 core/auth.py
 * Cookie 持久化改为存储在 SQLite（bk_cookie 表）中
 */

import { BrowserContext, Page } from 'playwright';
import { URLBuilder } from './url-builder';
import { setWindowVisible } from './driver';
import { getDb } from '../db/database';

export class AuthManager {
  private host: string;

  constructor(host: string) {
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

    // Step 2: 加载已保存的 Cookie 并刷新
    const hasCookie = await this.loadCookies(context);
    if (hasCookie) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Step 3: 访问测试页，等待最多 5 秒检查登录浮层是否出现
    const testUrl = URLBuilder.buildListUrl(this.host, '', 1, '');
    await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const loginModalVisible = await this.isLoginModalPresent(page, 5000);

    if (loginModalVisible) {
      // Step 4: 需要人工登录
      console.log('⚠️ 检测到登录浮层，请手动完成登录');
      await setWindowVisible(page, true);
      await this.waitForManualLogin(page, timeout);
      await this.saveCookies(context);
      await setWindowVisible(page, false);
      console.log('✓ 登录成功，Cookie 已保存至数据库');
    } else {
      console.log('✓ 已恢复登录态');
    }
  }

  /**
   * 检测登录浮层是否出现
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
   * 等待人工完成登录
   */
  private async waitForManualLogin(page: Page, timeout: number): Promise<void> {
    const POLL_MS = 3000;
    const startTime = Date.now();

    console.log(`⏳ 等待手动登录完成（最长 ${Math.round(timeout / 1000)} 秒）...`);

    while (Date.now() - startTime < timeout) {
      await page.waitForTimeout(POLL_MS);

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
   * 从 SQLite 加载 Cookie
   * @returns 是否成功加载到 Cookie
   */
  private async loadCookies(context: BrowserContext): Promise<boolean> {
    try {
      const db = getDb();
      const row = db
        .prepare('SELECT cookie FROM bk_cookie WHERE host = ? LIMIT 1')
        .get(this.host) as { cookie: string } | undefined;

      if (!row?.cookie) return false;

      const data = JSON.parse(row.cookie);
      if (data.cookies && Array.isArray(data.cookies)) {
        const cleaned = data.cookies.map((c: Record<string, unknown>) => {
          const { sameSite: _sameSite, ...rest } = c;
          return rest;
        });
        await context.addCookies(cleaned);
        return true;
      }
      return false;
    } catch {
      console.warn('加载 Cookie 失败，将重新登录');
      return false;
    }
  }

  /**
   * 将当前 Cookie 保存到 SQLite（UPSERT）
   */
  private async saveCookies(context: BrowserContext): Promise<void> {
    const cookies = await context.cookies();
    const cookieJson = JSON.stringify({ cookies });
    const db = getDb();
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');

    db.prepare(`
      INSERT INTO bk_cookie (host, cookie, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(host) DO UPDATE SET
        cookie     = excluded.cookie,
        updated_at = excluded.updated_at
    `).run(this.host, cookieJson, now, now);
  }
}
