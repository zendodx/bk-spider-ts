/**
 * 房源备注 API
 * GET /api/listings/note?detailUrl=xxx          查询单条备注
 * PUT /api/listings/note  body: { detailUrl, note }  新增或更新备注
 */

import { NextRequest } from 'next/server';
import { getDb, initDatabase } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getBeijingNow(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');
}

// ─── GET：查询备注 ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const detailUrl = searchParams.get('detailUrl')?.trim() ?? '';

    if (!detailUrl) {
      return Response.json({ success: false, error: 'detailUrl 不能为空' }, { status: 400 });
    }

    await initDatabase(getDBPath());
    const db = getDb(getDBPath());

    const row = db
      .prepare('SELECT note, updated_at FROM house_note WHERE detail_url = ? LIMIT 1')
      .get(detailUrl) as { note: string; updated_at: string } | undefined;

    return Response.json({ success: true, note: row?.note ?? null, updated_at: row?.updated_at ?? null });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}

// ─── PUT：新增或更新备注（UPSERT）──────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as { detailUrl?: string; note?: string };
    const { detailUrl, note } = body;

    if (!detailUrl?.trim()) {
      return Response.json({ success: false, error: 'detailUrl 不能为空' }, { status: 400 });
    }

    await initDatabase(getDBPath());
    const db  = getDb(getDBPath());
    const now = getBeijingNow();

    db.prepare(`
      INSERT INTO house_note (detail_url, note, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(detail_url) DO UPDATE SET
        note       = excluded.note,
        updated_at = excluded.updated_at
    `).run(detailUrl.trim(), note ?? '', now, now);

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
