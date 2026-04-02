/**
 * 全局配置管理
 * 对应原 Python 项目 config/settings.py
 * 在 Electron 环境下使用 electron-store，在纯 Next.js 环境下使用环境变量
 */

import path from 'path';
import os from 'os';

// =====================
// 默认配置
// =====================

export const DEFAULT_HOST = 'https://jn.ke.com';
export const DEFAULT_SUG = '济南尊';
export const DEFAULT_MAX_PAGE = 50;
export const DEFAULT_PAGE_WAIT = 1.0;
export const DEFAULT_SPEED_MODE = 'normal';

// =====================
// 路径配置
// =====================

/** 数据目录（用户主目录下） */
export function getDataDir(): string {
  return process.env.DATA_DIR || path.join(os.homedir(), 'bk_spider_data', '采集数据');
}

/** Cookie/资源目录 */
export function getResourcesDir(): string {
  return process.env.RESOURCES_DIR || path.join(os.homedir(), 'bk_spider_data', 'resources');
}

/** Mapping 文件路径 */
export function getMappingFile(): string {
  return path.join(getResourcesDir(), 'mapping.json');
}

/** Cookie 文件路径（按域名区分） */
export function getCookieFile(host: string): string {
  const url = new URL(host);
  return path.join(getResourcesDir(), `${url.hostname}_beike_cookies.json`);
}

// =====================
// 数据库配置
// =====================

export interface DBConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function getDBConfig(): DBConfig {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'bk_spider',
  };
}

// =====================
// 城市映射
// =====================

export const CITY_MAPPING: Record<string, [string, string]> = {
  bj: ['北京市', '北京市'],
  sh: ['上海市', '上海市'],
  gz: ['广东省', '广州市'],
  sz: ['广东省', '深圳市'],
  jn: ['山东省', '济南市'],
  cd: ['四川省', '成都市'],
  hz: ['浙江省', '杭州市'],
  nj: ['江苏省', '南京市'],
  wh: ['湖北省', '武汉市'],
  xa: ['陕西省', '西安市'],
};

// 济南区域关键词
export const JINAN_DISTRICTS = [
  '历下', '市中', '槐荫', '天桥', '历城', '长清', '章丘', '济阳', '莱芜', '钢城',
];
