/**
 * 查询指定小区有数据的采集日期列表
 * GET /api/listings/dates?community=xxx
 * 返回格式：{ success: true, dates: ['2026-04-01', '2026-04-02', ...] }
 */

import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const community = searchParams.get('community')?.trim() ?? '';
    const city      = searchParams.get('city')?.trim() ?? '';

    if (!community) {
      return Response.json({ success: false, error: '参数缺失：community 为必填项', dates: [] }, { status: 400 });
    }

    const db = getDb(getDBPath());

    const conditions = ['community LIKE ?', 'is_deleted = 0'];
    const params: unknown[] = [`%${community}%`];
    if (city) { conditions.push('city LIKE ?'); params.push(`%${city}%`); }

    const rows = db.prepare(`
      SELECT DISTINCT date(created_at) AS crawl_date
      FROM house_listings
      WHERE ${conditions.join(' AND ')}
      ORDER BY crawl_date DESC
      LIMIT 365
    `).all(...params) as { crawl_date: string }[];

    const dates = rows.map(r => r.crawl_date);

    return Response.json({ success: true, dates });
  } catch (e) {
    return Response.json({ success: false, error: String(e), dates: [] }, { status: 500 });
  }
}
