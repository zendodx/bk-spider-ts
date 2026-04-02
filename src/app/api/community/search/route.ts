/**
 * 小区搜索 API
 * GET /api/community/search?keyword=xxx&limit=20
 * 从数据库查询 community 去重列表，支持模糊搜索
 */

import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/database';
import { getDBConfig } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword')?.trim() ?? '';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '30', 10), 100);

    const pool = getPool(getDBConfig());

    let rows: any[];

    if (keyword) {
      [rows] = await pool.query(
        `SELECT DISTINCT community
         FROM house_listings
         WHERE is_deleted = 0
           AND community LIKE ?
         ORDER BY community
         LIMIT ?`,
        [`%${keyword}%`, limit]
      ) as any;
    } else {
      [rows] = await pool.query(
        `SELECT DISTINCT community
         FROM house_listings
         WHERE is_deleted = 0
           AND community != ''
         ORDER BY community
         LIMIT ?`,
        [limit]
      ) as any;
    }

    const communities: string[] = rows.map((r: any) => r.community);
    return Response.json({ success: true, data: communities });
  } catch (e) {
    return Response.json({ success: false, error: String(e), data: [] }, { status: 500 });
  }
}
