/**
 * 房源收藏 API
 * GET  /api/favorite?community=xxx&detailUrl=xxx&page=1&pageSize=50
 * POST /api/favorite   body: { listing }   备注统一存 house_note 表
 */

import { NextRequest } from 'next/server';
import { getDb, initDatabase } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getBeijingNow(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');
}

// ─── GET：查询收藏列表 ────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const community = searchParams.get('community')?.trim() ?? '';
    const detailUrl = searchParams.get('detailUrl')?.trim() ?? '';
    const page      = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize  = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') ?? '50', 10)));

    await initDatabase(getDBPath());
    const db = getDb(getDBPath());

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (community) {
      conditions.push('community LIKE ?');
      params.push(`%${community}%`);
    }
    if (detailUrl) {
      conditions.push('detail_url LIKE ?');
      params.push(`%${detailUrl}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const total = (db.prepare(`SELECT COUNT(*) as cnt FROM house_favorite ${where}`).get(...params as unknown[]) as { cnt: number }).cnt;
    const data  = db.prepare(`
      SELECT * FROM house_favorite ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    return Response.json({ success: true, data, total, page, pageSize });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}

// ─── POST：新增收藏 ───────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { listing } = body as {
      listing: {
        title?: string;
        header_image?: string | null;
        header_image_desc?: string | null;
        province?: string;
        city?: string;
        district?: string;
        community?: string;
        community_url?: string | null;
        floor_info?: string | null;
        build_year?: number | null;
        house_type?: string | null;
        area?: number | null;
        orientation?: string | null;
        total_price?: number | null;
        unit_price?: number | null;
        detail_url?: string | null;
      };
    };

    if (!listing?.detail_url) {
      return Response.json({ success: false, error: 'detail_url 不能为空' }, { status: 400 });
    }

    await initDatabase(getDBPath());
    const db  = getDb(getDBPath());
    const now = getBeijingNow();

    // UPSERT：相同 detail_url 则更新基本信息和 updated_at（备注统一存 house_note 表）
    const stmt = db.prepare(`
      INSERT INTO house_favorite
        (title, header_image, header_image_desc, province, city, district,
         community, community_url, floor_info, build_year, house_type,
         area, orientation, total_price, unit_price, detail_url,
         created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(detail_url) DO UPDATE SET
        updated_at = excluded.updated_at
    `);

    const info = stmt.run(
      listing.title             ?? '',
      listing.header_image      ?? null,
      listing.header_image_desc ?? null,
      listing.province          ?? '',
      listing.city              ?? '',
      listing.district          ?? '',
      listing.community         ?? '',
      listing.community_url     ?? null,
      listing.floor_info        ?? null,
      listing.build_year        ?? null,
      listing.house_type        ?? null,
      listing.area              ?? null,
      listing.orientation       ?? null,
      listing.total_price       ?? null,
      listing.unit_price        ?? null,
      listing.detail_url,
      now,
      now,
    );

    return Response.json({ success: true, id: info.lastInsertRowid });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
