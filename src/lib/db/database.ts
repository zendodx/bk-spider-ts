/**
 * MySQL 数据库连接管理
 * 使用 mysql2/promise 替代 SQLAlchemy
 */

import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

export interface DBConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function getDefaultConfig(): DBConfig {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'bk_spider',
  };
}

/**
 * 初始化连接池
 */
export function initPool(config?: DBConfig): mysql.Pool {
  const cfg = config || getDefaultConfig();

  pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: '+08:00',
    supportBigNumbers: true,
    bigNumberStrings: false,
  });

  return pool;
}

/**
 * 获取连接池（懒初始化）
 */
export function getPool(config?: DBConfig): mysql.Pool {
  if (!pool) {
    pool = initPool(config);
  }
  return pool;
}

/**
 * 测试数据库连接
 */
export async function testConnection(config?: DBConfig): Promise<boolean> {
  try {
    const p = getPool(config);
    const conn = await p.getConnection();
    await conn.ping();
    conn.release();
    return true;
  } catch {
    return false;
  }
}

/**
 * 初始化数据库表（如不存在则创建）
 */
export async function initDatabase(config?: DBConfig): Promise<void> {
  const p = getPool(config);

  // 创建数据库（如不存在）
  const tempPool = mysql.createPool({
    host: config?.host || getDefaultConfig().host,
    port: config?.port || getDefaultConfig().port,
    user: config?.user || getDefaultConfig().user,
    password: config?.password || getDefaultConfig().password,
    waitForConnections: true,
    connectionLimit: 1,
    charset: 'utf8mb4',
  });

  const conn = await tempPool.getConnection();
  const dbName = config?.database || getDefaultConfig().database;

  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  conn.release();
  await tempPool.end();

  // 创建表
  await p.query(`
    CREATE TABLE IF NOT EXISTS \`house_listings\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
      \`title\` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '标题',
      \`header_image\` VARCHAR(500) DEFAULT NULL COMMENT '头图URL',
      \`header_image_desc\` VARCHAR(255) DEFAULT NULL COMMENT '头图描述',
      \`province\` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '省',
      \`city\` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '市',
      \`district\` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '区',
      \`community\` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '小区名称',
      \`community_url\` VARCHAR(500) DEFAULT NULL COMMENT '小区链接',
      \`floor_info\` VARCHAR(50) DEFAULT NULL COMMENT '楼层信息',
      \`build_year\` YEAR DEFAULT NULL COMMENT '建造年份',
      \`house_type\` VARCHAR(50) DEFAULT NULL COMMENT '户型',
      \`area\` DECIMAL(10, 2) DEFAULT NULL COMMENT '面积（平方米）',
      \`orientation\` VARCHAR(50) DEFAULT NULL COMMENT '朝向',
      \`total_price\` DECIMAL(12, 2) DEFAULT NULL COMMENT '总价（万元）',
      \`unit_price\` DECIMAL(10, 4) DEFAULT NULL COMMENT '单价（万元/平方米）',
      \`tags\` VARCHAR(500) DEFAULT NULL COMMENT '标签',
      \`detail_url\` VARCHAR(500) DEFAULT NULL COMMENT '详情页URL',
      \`follow_count\` INT UNSIGNED DEFAULT 0 COMMENT '关注人数',
      \`publish_time\` DATETIME DEFAULT NULL COMMENT '发布时间',
      \`crawl_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '采集时间',
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      \`is_deleted\` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '软删除标记',
      PRIMARY KEY (\`id\`),
      KEY \`idx_city_district\` (\`city\`, \`district\`),
      KEY \`idx_community\` (\`community\`),
      KEY \`idx_price\` (\`total_price\`),
      KEY \`idx_area\` (\`area\`),
      KEY \`idx_house_type\` (\`house_type\`),
      KEY \`idx_publish_time\` (\`publish_time\`),
      KEY \`idx_crawl_time\` (\`crawl_time\`),
      KEY \`idx_build_year\` (\`build_year\`),
      KEY \`idx_province_city\` (\`province\`, \`city\`, \`district\`),
      UNIQUE KEY \`idx_detail_url_crawl_time\` (\`detail_url\`, \`crawl_time\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='房产房源信息表'
  `);
}

/**
 * 关闭连接池
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
