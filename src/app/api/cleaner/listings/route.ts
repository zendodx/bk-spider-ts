/**
 * 数据清洗 API
 *
 * GET  /api/cleaner/listings?community=xxx&dateFrom=2026-04-13&dateTo=2026-04-13
 *   → 预览满足条件的房源数量
 *
 * DELETE /api/cleaner/listings
 *   body: { community, dateFrom, dateTo }
 *   → 物理删除（is_deleted=1 软删除）满足条件的房源数据，返回删除条数
 */

import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function buildConditions(community: string, dateFrom: string, dateTo: string) {
  const conditions: string[] = ['is_deleted = 0'];
  const params: unknown[] = [];

  if (community) {
    conditions.push('community LIKE ?');
    params.push(`%${community}%`);
  }
  if (dateFrom) {
    conditions.push("date(created_at) >= ?");
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("date(created_at) <= ?");
    params.push(dateTo);
  }

  return { where: conditions.join(' AND '), params };
}

/** 预览：统计满足条件的记录数 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const community = searchParams.get('community')?.trim() ?? '';
    const dateFrom  = searchParams.get('dateFrom')?.trim() ?? '';
    const dateTo    = searchParams.get('dateTo')?.trim() ?? '';

    if (!community) {
      return Response.json({ success: false, error: '请填写小区名称' }, { status: 400 });
    }

    const db = getDb(getDBPath());
    const { where, params } = buildConditions(community, dateFrom, dateTo);

    const row = db.prepare(`SELECT COUNT(*) AS cnt FROM house_listings WHERE ${where}`)
      .get(...params) as { cnt: number };

    return Response.json({ success: true, count: row.cnt });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}

/** 删除：软删除满足条件的记录 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json() as { community?: string; dateFrom?: string; dateTo?: string };
    const community = (body.community ?? '').trim();
    const dateFrom  = (body.dateFrom  ?? '').trim();
    const dateTo    = (body.dateTo    ?? '').trim();

    if (!community) {
      return Response.json({ success: false, error: '请填写小区名称' }, { status: 400 });
    }

    const db = getDb(getDBPath());
    const { where, params } = buildConditions(community, dateFrom, dateTo);

    const result = db.prepare(
      `UPDATE house_listings SET is_deleted = 1, updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime') WHERE ${where}`
    ).run(...params);

    return Response.json({ success: true, deleted: result.changes });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
