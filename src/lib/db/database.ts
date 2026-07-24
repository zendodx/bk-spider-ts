/**
 * SQLite 数据库连接管理
 * 使用 better-sqlite3 替代 mysql2
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

let db: Database.Database | null = null;

/**
 * 获取 SQLite 数据库文件路径
 */
export function getDefaultDbPath(): string {
  return process.env.DB_PATH || path.join(os.homedir(), 'bk_spider_data', 'bk_spider.db');
}

/**
 * 获取数据库实例（懒初始化，单例）
 */
export function getDb(dbPath?: string): Database.Database {
  if (!db) {
    const filePath = dbPath || getDefaultDbPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(filePath);
    // WAL 模式提升并发读写性能
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/**
 * 重置数据库实例（用于切换数据库文件路径）
 */
export function resetDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * 测试数据库连接（SQLite 只需尝试打开文件即可）
 */
export async function testConnection(dbPath?: string): Promise<boolean> {
  try {
    const filePath = dbPath || getDefaultDbPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const testDb = new Database(filePath);
    testDb.pragma('journal_mode = WAL');
    testDb.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * 初始化数据库表（如不存在则创建）
 */
export async function initDatabase(dbPath?: string): Promise<void> {
  const instance = getDb(dbPath);

  instance.exec(`
    CREATE TABLE IF NOT EXISTS house_listings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT    NOT NULL DEFAULT '',
      header_image  TEXT,
      header_image_desc TEXT,
      province      TEXT    NOT NULL DEFAULT '',
      city          TEXT    NOT NULL DEFAULT '',
      district      TEXT    NOT NULL DEFAULT '',
      community     TEXT    NOT NULL DEFAULT '',
      community_url TEXT,
      floor_info    TEXT,
      build_year    INTEGER,
      house_type    TEXT,
      area          REAL,
      orientation   TEXT,
      total_price   REAL,
      unit_price    REAL,
      tags          TEXT,
      detail_url    TEXT,
      follow_count  INTEGER NOT NULL DEFAULT 0,
      publish_time  TEXT,
      crawl_time    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
      updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
      is_deleted    INTEGER NOT NULL DEFAULT 0
    )
  `);

  // 创建 house_listings 索引
  instance.exec(`
    CREATE INDEX IF NOT EXISTS idx_city_district      ON house_listings (city, district);
    CREATE INDEX IF NOT EXISTS idx_community          ON house_listings (community);
    CREATE INDEX IF NOT EXISTS idx_price              ON house_listings (total_price);
    CREATE INDEX IF NOT EXISTS idx_area               ON house_listings (area);
    CREATE INDEX IF NOT EXISTS idx_house_type         ON house_listings (house_type);
    CREATE INDEX IF NOT EXISTS idx_publish_time       ON house_listings (publish_time);
    CREATE INDEX IF NOT EXISTS idx_crawl_time         ON house_listings (crawl_time);
    CREATE INDEX IF NOT EXISTS idx_build_year         ON house_listings (build_year);
    CREATE INDEX IF NOT EXISTS idx_province_city      ON house_listings (province, city, district);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_detail_url_crawl_time ON house_listings (detail_url, crawl_time);
    -- 供 /api/community/stats 小区聚合查询使用：WHERE is_deleted=0 GROUP BY community
    CREATE INDEX IF NOT EXISTS idx_deleted_community  ON house_listings (is_deleted, community);
  `);

  // Cookie 存储表
  instance.exec(`
    CREATE TABLE IF NOT EXISTS bk_cookie (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      host       TEXT    NOT NULL DEFAULT '',
      cookie     TEXT    NOT NULL DEFAULT '',
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
      updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bk_cookie_host ON bk_cookie (host);
  `);

  // 房源收藏表
  instance.exec(`
    CREATE TABLE IF NOT EXISTS house_favorite (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      title             TEXT    NOT NULL DEFAULT '',
      header_image      TEXT,
      header_image_desc TEXT,
      province          TEXT    NOT NULL DEFAULT '',
      city              TEXT    NOT NULL DEFAULT '',
      district          TEXT    NOT NULL DEFAULT '',
      community         TEXT    NOT NULL DEFAULT '',
      community_url     TEXT,
      floor_info        TEXT,
      build_year        INTEGER,
      house_type        TEXT,
      area              REAL,
      orientation       TEXT,
      total_price       REAL,
      unit_price        REAL,
      detail_url        TEXT,
      note              TEXT,
      created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
      updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_house_favorite_detail_url ON house_favorite (detail_url);
    CREATE INDEX IF NOT EXISTS idx_house_favorite_community ON house_favorite (community);
  `);

  // 房源备注表（独立于收藏，任意房源均可记录备注）
  instance.exec(`
    CREATE TABLE IF NOT EXISTS house_note (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      detail_url TEXT    NOT NULL,
      note       TEXT    NOT NULL DEFAULT '',
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
      updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_house_note_detail_url ON house_note (detail_url);
  `);

  // 小区采光分析方案表：规划标注底图 + 标注 JSON + 分析结果缓存（每个小区仅保留一份最新方案）
  // 以 community_url（小区详情页链接）作为唯一键，因为不同城市/区域可能存在同名小区，
  // community 名称本身不具备唯一性，只作为展示冗余字段保留。
  //
  // 兼容旧版本表结构（早期以 community 作为唯一键，缺少 community_url/district/base_image_* 等列）：
  // 若检测到旧结构，直接丢弃重建——该表仅用于缓存标注方案，重建不影响爬虫主数据。
  const existingSunlightPlanColumns = instance
    .prepare("PRAGMA table_info(community_sunlight_plan)")
    .all() as { name: string }[];
  if (existingSunlightPlanColumns.length > 0 && !existingSunlightPlanColumns.some(c => c.name === 'community_url')) {
    instance.exec('DROP TABLE IF EXISTS community_sunlight_plan');
  }

  instance.exec(`
    CREATE TABLE IF NOT EXISTS community_sunlight_plan (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      community_url    TEXT    NOT NULL,
      community        TEXT    NOT NULL DEFAULT '',
      city             TEXT    NOT NULL DEFAULT '',
      district         TEXT    NOT NULL DEFAULT '',
      base_image_blob  BLOB,
      base_image_mime  TEXT,
      base_image_name  TEXT,
      plan_json        TEXT    NOT NULL,
      analysis_json    TEXT,
      plan_fingerprint TEXT,
      created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
      updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sunlight_plan_community_url ON community_sunlight_plan (community_url);
  `);
}

/**
 * 关闭数据库连接
 */
export async function closeDb(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
}
