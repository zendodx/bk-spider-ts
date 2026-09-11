/**
 * AI 验证码模型连通性测试 API
 * POST /api/settings/test-qwen
 *
 * Body（均可选，不传则使用已保存的设置 / 环境变量）：
 *   { apiKey?: string; model?: string; baseUrl?: string }
 *
 * 返回：{ success: boolean; message: string; latencyMs?: number }
 */

import { NextRequest } from 'next/server';
import { CaptchaSolver } from '@/lib/spider/captcha-solver';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // 只把非空字段作为覆盖项传入，空值走「已保存设置 → 环境变量」的解析链
    const overrides: { apiKey?: string; baseURL?: string; model?: string } = {};
    if (typeof body.apiKey === 'string' && body.apiKey.trim()) overrides.apiKey = body.apiKey.trim();
    if (typeof body.baseUrl === 'string' && body.baseUrl.trim()) overrides.baseURL = body.baseUrl.trim();
    if (typeof body.model === 'string' && body.model.trim()) overrides.model = body.model.trim();

    const solver = new CaptchaSolver(overrides);
    const result = await solver.testConnection();
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { success: false, message: `测试失败：${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}
