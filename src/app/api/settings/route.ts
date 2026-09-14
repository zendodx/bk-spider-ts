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
  dbPath: string;
  /** 城市名 -> HOST URL 映射，支持自定义 */
  cityHostMap: Record<string, string>;
  /** AI 验证码求解：通义千问 API Key（空则禁用 AI 求解） */
  qwenApiKey: string;
  /** AI 验证码求解：视觉模型名称 */
  qwenModel: string;
  /** AI 验证码求解：OpenAI 兼容接口地址 */
  qwenBaseUrl: string;
  /** AI 验证码求解：是否开启 AI 自动识别（默认关闭，开启后仍需配置 API Key） */
  aiCaptchaEnabled: boolean;
  /** AI 验证码求解：单次验证码最大尝试轮数 */
  aiMaxAttempts: number;
}

const DEFAULT_CITY_HOST_MAP: Record<string, string> = {
  '济南市': 'https://jn.ke.com',
  '北京市': 'https://bj.ke.com',
  '上海市': 'https://sh.ke.com',
  '广州市': 'https://gz.ke.com',
  '深圳市': 'https://sz.ke.com',
  '成都市': 'https://cd.ke.com',
  '杭州市': 'https://hz.ke.com',
  '南京市': 'https://nj.ke.com',
  '武汉市': 'https://wh.ke.com',
  '西安市': 'https://xa.ke.com',
};

const DEFAULT_SETTINGS: AppSettings = {
  host: 'https://jn.ke.com',
  sug: '济南尊',
  maxPage: 50,
  pageWait: 1.0,
  speedMode: 'fast',
  minDelay: 1.5,
  maxDelay: 3.5,
  pageInterval: 2.0,
  maxRetries: 3,
  exportExcel: true,
  exportCsv: false,
  dataDir: path.join(os.homedir(), 'bk_spider_data', '采集数据'),
  dbPath: path.join(os.homedir(), 'bk_spider_data', 'bk_spider.db'),
  cityHostMap: DEFAULT_CITY_HOST_MAP,
  qwenApiKey: '',
  qwenModel: 'qwen-vl-max-latest',
  qwenBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  aiCaptchaEnabled: true,
  aiMaxAttempts: 10,
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

    // 先读出已保存的值再合并，避免调用方未提交的字段（如采集页的 AI 配置）被默认值覆盖
    let existing: Record<string, unknown> = {};
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        existing = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      }
    } catch {
      // 文件损坏则视为无历史值
    }

    const merged = { ...DEFAULT_SETTINGS, ...existing, ...data };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');

    return Response.json({ success: true, message: '设置已保存' });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
