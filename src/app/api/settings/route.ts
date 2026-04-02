/**
 * 设置管理 API
 * GET /api/settings - 获取配置
 * POST /api/settings - 保存配置
 */

import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SETTINGS_FILE = path.join(os.homedir(), 'bk_spider_data', 'settings.json');

interface AppSettings {
  host: string;
  sug: string;
  maxPage: number;
  pageWait: number;
  speedMode: string;
  minDelay: number;
  maxDelay: number;
  pageInterval: number;
  maxRetries: number;
  exportExcel: boolean;
  exportCsv: boolean;
  dataDir: string;
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPassword: string;
  dbName: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  host: 'https://jn.ke.com',
  sug: '济南尊',
  maxPage: 50,
  pageWait: 1.0,
  speedMode: 'normal',
  minDelay: 1.5,
  maxDelay: 3.5,
  pageInterval: 2.0,
  maxRetries: 3,
  exportExcel: true,
  exportCsv: true,
  dataDir: path.join(os.homedir(), 'bk_spider_data', '采集数据'),
  dbHost: 'localhost',
  dbPort: 3306,
  dbUser: 'root',
  dbPassword: 'root',
  dbName: 'bk_spider',
};

export async function GET() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return Response.json({ success: true, data: DEFAULT_SETTINGS });
    }

    const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const saved = JSON.parse(content);
    const data = { ...DEFAULT_SETTINGS, ...saved };
    return Response.json({ success: true, data });
  } catch (e) {
    return Response.json({ success: true, data: DEFAULT_SETTINGS });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { data } = await request.json();

    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const merged = { ...DEFAULT_SETTINGS, ...data };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');

    return Response.json({ success: true, message: '设置已保存' });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
