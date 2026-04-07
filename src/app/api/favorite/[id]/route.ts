/**
 * 房源收藏 - 单条操作
 * DELETE /api/favorite/:id   删除指定收藏
 * PATCH  /api/favorite/:id   更新备注
 */

import { NextRequest } from 'next/server';
import { getDb, initDatabase } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getBeijingNow(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return Response.json({ success: false, error: '无效的 ID' }, { status: 400 });
    }

    await initDatabase(getDBPath());
    const db   = getDb(getDBPath());
    const info = db.prepare('DELETE FROM house_favorite WHERE id = ?').run(numId);

    if (info.changes === 0) {
      return Response.json({ success: false, error: '收藏记录不存在' }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}

// ─── PATCH：更新备注 ──────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return Response.json({ success: false, error: '无效的 ID' }, { status: 400 });
    }

    const body = await request.json();
    const note = body.note ?? null;
    const now  = getBeijingNow();

    await initDatabase(getDBPath());
    const db   = getDb(getDBPath());
    const info = db.prepare(
      'UPDATE house_favorite SET note = ?, updated_at = ? WHERE id = ?'
    ).run(note, now, numId);

    if (info.changes === 0) {
      return Response.json({ success: false, error: '收藏记录不存在' }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
