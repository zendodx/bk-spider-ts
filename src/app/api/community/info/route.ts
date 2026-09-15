/**
 * 小区基本信息 API（用户手工维护，爬虫不覆盖）
 * GET  /api/community/info?community=xxx  查询单个小区的基本信息（不存在返回 data: null）
 * POST /api/community/info                新增/更新小区基本信息（按 community 幂等 upsert）
 */

import { NextRequest } from 'next/server';
import { getDb, initDatabase } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface CommunityInfo {
  community: string;
  /** 所属板块 */
  bizcircle: string;
  /** 小区地址 */
  address: string;
  /** 建筑年代（文本，支持区间，如 1998-2005） */
  build_year: string;
  /** 开发商 */
  developer: string;
  /** 物业公司 */
  property_company: string;
  /** 备注 */
  note: string;
  updated_at?: string;
}

export async function GET(request: NextRequest) {
  try {
    const community = new URL(request.url).searchParams.get('community')?.trim() ?? '';
    if (!community) {
      return Response.json({ success: false, error: '缺少 community 参数' }, { status: 400 });
    }
    await initDatabase(getDBPath());
    const db = getDb(getDBPath());
    const row = db.prepare(`
      SELECT community, bizcircle, address, build_year, developer, property_company, note, updated_at
      FROM community_info
      WHERE community = ?
    `).get(community) as CommunityInfo | undefined;
    return Response.json({ success: true, data: row ?? null });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const community = String(body.community ?? '').trim();
    if (!community) {
      return Response.json({ success: false, error: '小区名不能为空' }, { status: 400 });
    }
    const bizcircle       = String(body.bizcircle ?? '').trim();
    const address         = String(body.address ?? '').trim();
    const buildYear       = String(body.build_year ?? '').trim();
    const developer       = String(body.developer ?? '').trim();
    const propertyCompany = String(body.property_company ?? '').trim();
    const note            = String(body.note ?? '').trim();

    await initDatabase(getDBPath());
    const db = getDb(getDBPath());
    db.prepare(`
      INSERT INTO community_info (community, bizcircle, address, build_year, developer, property_company, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(community) DO UPDATE SET
        bizcircle        = excluded.bizcircle,
        address          = excluded.address,
        build_year       = excluded.build_year,
        developer        = excluded.developer,
        property_company = excluded.property_company,
        note             = excluded.note,
        updated_at       = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')
    `).run(community, bizcircle, address, buildYear, developer, propertyCompany, note);

    return Response.json({ success: true, message: '小区信息已保存' });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
