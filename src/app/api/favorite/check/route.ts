/**
 * 批量检查收藏状态
 * POST /api/favorite/check
 * body: { detailUrls: string[] }
 * response: { success: true, favorited: { [detail_url]: id } }
 *   — 返回已收藏的 detail_url → 收藏记录 id 的映射
 */

import { NextRequest } from 'next/server';
import { getDb, initDatabase } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { detailUrls?: string[] };
    const detailUrls = body.detailUrls ?? [];

    if (!Array.isArray(detailUrls) || detailUrls.length === 0) {
      return Response.json({ success: true, favorited: {} });
    }

    await initDatabase(getDBPath());
    const db = getDb(getDBPath());

    // 批量查询，用 IN 占位符
    const placeholders = detailUrls.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT id, detail_url FROM house_favorite WHERE detail_url IN (${placeholders})`
    ).all(...detailUrls) as { id: number; detail_url: string }[];

    // 转成 { detail_url -> id } map
    const favorited: Record<string, number> = {};
    for (const row of rows) {
      favorited[row.detail_url] = row.id;
    }

    return Response.json({ success: true, favorited });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
