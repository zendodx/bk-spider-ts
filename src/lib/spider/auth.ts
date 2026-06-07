/**
 * 认证与 Cookie 管理
 * 对应原 Python 项目 core/auth.py
 * Cookie 持久化改为存储在 SQLite（bk_cookie 表）中
 */

import { BrowserContext, Cookie, Page } from 'playwright';
import { URLBuilder } from './url-builder';
import { setWindowVisible } from './driver';
import { getDb } from '../db/database';

/** Playwright addCookies 接受的 sameSite 合法值 */
type SameSiteValue = 'Strict' | 'Lax' | 'None';

export class AuthManager {
  private host: string;
  private dbPath?: string;

  constructor(host: string, dbPath?: string) {
    this.host = host;
    this.dbPath = dbPath;
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
      // 登录后页面可能还在跳转，等待彻底稳定再采集 Cookie
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await this.saveCookiesFromContext(context);
      await setWindowVisible(page, false);
      console.log('✓ 登录成功，Cookie 已保存至数据库');
    } else {
      console.log('✓ 已恢复登录态');
      // Cookie 有效，顺手更新数据库中的 Cookie（可能服务端有变更）
      await this.saveCookiesFromContext(context);
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
   *
   * 登录完成的两种信号：
   *   1. 页面发生导航（登录后跳转）→ 执行上下文销毁，page.$ 会抛异常，捕获即视为完成
   *   2. 登录浮层 div.window-login 从 DOM 中消失
   */
  private async waitForManualLogin(page: Page, timeout: number): Promise<void> {
    const POLL_MS = 1500;
    const startTime = Date.now();

    console.log(`⏳ 等待手动登录完成（最长 ${Math.round(timeout / 1000)} 秒）...`);

    while (Date.now() - startTime < timeout) {
      await page.waitForTimeout(POLL_MS);

      try {
        const stillVisible = await page.$('div.window-login');
        if (!stillVisible) {
          // 浮层已消失，登录完成
          return;
        }
      } catch (e) {
        const msg = String(e);
        // "Execution context was destroyed" / "most likely because of a navigation"
        // 说明页面已跳转（登录成功），直接认为登录完成
        if (
          msg.includes('context was destroyed') ||
          msg.includes('navigation') ||
          msg.includes('Target closed') ||
          msg.includes('Session closed')
        ) {
          console.log('✓ 检测到页面跳转，登录已完成');
          // 等待页面稳定后再继续
          await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
          return;
        }
        // 其他未知错误继续抛出
        throw e;
      }

      const remaining = Math.ceil((timeout - (Date.now() - startTime)) / 1000);
      console.log(`⏳ 等待登录... 剩余时间 ${remaining}s`);
    }

    throw new Error('登录超时，请重新运行程序');
  }

  /**
   * 从 SQLite 加载 Cookie
   *
   * 修复：
   * 1. 保留 sameSite 字段，并规范化为 Playwright 要求的 'Strict' | 'Lax' | 'None'
   * 2. 过滤已过期的持久 Cookie（expires > 0 且已过期）
   * 3. Session Cookie（expires = -1）保留，因为 context 还活着
   * 4. sameSite=None 且 secure=false 的 Cookie，强制设 secure=true（浏览器要求）
   */
  private async loadCookies(context: BrowserContext): Promise<boolean> {
    try {
      const db = getDb(this.dbPath);
      const row = db
        .prepare('SELECT cookie FROM bk_cookie WHERE host = ? LIMIT 1')
        .get(this.host) as { cookie: string } | undefined;

      if (!row?.cookie) return false;

      const data = JSON.parse(row.cookie);
      if (!data.cookies || !Array.isArray(data.cookies)) return false;

      const now = Date.now() / 1000; // 当前 Unix 时间戳（秒）

      const validCookies = data.cookies
        .filter((c: Record<string, unknown>) => {
          // 过滤已过期的持久 Cookie（expires > 0 表示持久 Cookie）
          const expires = typeof c.expires === 'number' ? c.expires : -1;
          if (expires > 0 && expires < now) {
            console.log(`  跳过已过期 Cookie: ${c.name} (expires: ${new Date(expires * 1000).toISOString()})`);
            return false;
          }
          return true;
        })
        .map((c: Record<string, unknown>) => {
          const cookie: Record<string, unknown> = { ...c };

          // 规范化 sameSite
          const rawSameSite = String(cookie.sameSite || 'Lax');
          const sameSite = this.normalizeSameSite(rawSameSite);
          cookie.sameSite = sameSite;

          // sameSite=None 时浏览器要求 secure=true
          if (sameSite === 'None' && !cookie.secure) {
            cookie.secure = true;
          }

          // Playwright 要求 expires 为数字
          if (cookie.expires !== undefined && typeof cookie.expires !== 'number') {
            cookie.expires = -1;
          }

          return cookie;
        });

      if (validCookies.length === 0) {
        console.log('  所有 Cookie 已过期，需要重新登录');
        return false;
      }

      console.log(`  加载 ${validCookies.length} 个有效 Cookie`);
      await context.addCookies(validCookies as Cookie[]);
      return true;
    } catch (e) {
      console.warn('加载 Cookie 失败，将重新登录:', e);
      return false;
    }
  }

  /**
   * 将 sameSite 值规范化为 Playwright 接受的枚举
   * Playwright 只接受 'Strict' | 'Lax' | 'None'（首字母大写）
   */
  private normalizeSameSite(value: string): SameSiteValue {
    const lower = value.toLowerCase().trim();
    if (lower === 'strict') return 'Strict';
    if (lower === 'none') return 'None';
    return 'Lax'; // 默认值
  }

  /**
   * 将当前 Context 中的 Cookie 保存到 SQLite（UPSERT）
   * 可在爬取完成后调用，确保服务端刷新的 token 被持久化
   */
  async saveCookiesFromContext(context: BrowserContext): Promise<void> {
    const cookies = await context.cookies();
    const cookieJson = JSON.stringify({ cookies });
    const db = getDb(this.dbPath);
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
