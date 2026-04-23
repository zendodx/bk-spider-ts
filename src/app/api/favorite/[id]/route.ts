/**
 * 房源收藏 - 单条操作
 * DELETE /api/favorite/:id   删除指定收藏
 * 备注统一由 /api/listings/note 管理，此处不再提供 PATCH
 */

import { NextRequest } from 'next/server';
import { getDb, initDatabase } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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


