/**
 * 小区搜索 API
 * GET /api/community/search?keyword=xxx&limit=20
 * 从数据库查询 community 去重列表，支持模糊搜索
 */

import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword')?.trim() ?? '';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '30', 10), 100);

    const db = getDb(getDBPath());

    let rows: { community: string }[];

    if (keyword) {
      rows = db.prepare(`
        SELECT DISTINCT community
        FROM house_listings
        WHERE is_deleted = 0
          AND community LIKE ?
        ORDER BY community
        LIMIT ?
      `).all(`%${keyword}%`, limit) as { community: string }[];
    } else {
      rows = db.prepare(`
        SELECT DISTINCT community
        FROM house_listings
        WHERE is_deleted = 0
          AND community != ''
        ORDER BY community
        LIMIT ?
      `).all(limit) as { community: string }[];
    }

    const communities: string[] = rows.map(r => r.community);
    return Response.json({ success: true, data: communities });
  } catch (e) {
    return Response.json({ success: false, error: String(e), data: [] }, { status: 500 });
  }
}
