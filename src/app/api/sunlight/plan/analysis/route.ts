/**
 * 小区采光分析结果缓存 API
 * PUT /api/sunlight/plan/analysis
 * Body: { communityUrl: string, analysisJson: SunlightAnalysisResult }
 *
 * 3D 分析完成后调用此接口，将结果缓存回数据库，避免下次进入重复计算。
 */

import { NextRequest } from 'next/server';
import { getDb, initDatabase } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';
import { SunlightPlanRepository } from '@/lib/sunlight/plan-repository';
import type { SunlightAnalysisResult } from '@/types/sunlight';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { communityUrl, analysisJson } = body as { communityUrl?: string; analysisJson?: SunlightAnalysisResult };

    if (!communityUrl) {
      return Response.json({ success: false, error: '缺少 communityUrl 参数' }, { status: 400 });
    }
    if (!analysisJson || typeof analysisJson !== 'object') {
      return Response.json({ success: false, error: '缺少 analysisJson 参数' }, { status: 400 });
    }

    await initDatabase(getDBPath());
    const db = getDb(getDBPath());
    const repo = new SunlightPlanRepository(db);
    const updated = repo.updateAnalysis(communityUrl, analysisJson);

    if (!updated) {
      return Response.json({ success: false, error: '未找到对应的采光方案，请先保存标注' }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
