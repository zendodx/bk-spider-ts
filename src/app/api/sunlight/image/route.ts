/**
 * 小区采光规划底图 API
 * GET /api/sunlight/image?communityUrl=xxx
 *
 * 直接返回存储在数据库中的底图二进制，供 <img> 标签或 Canvas 加载。
 */

import { NextRequest } from 'next/server';
import { getDb, initDatabase } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';
import { SunlightPlanRepository } from '@/lib/sunlight/plan-repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const communityUrl = searchParams.get('communityUrl')?.trim() ?? '';
    if (!communityUrl) {
      return new Response('缺少 communityUrl 参数', { status: 400 });
    }

    await initDatabase(getDBPath());
    const db = getDb(getDBPath());
    const repo = new SunlightPlanRepository(db);
    const image = repo.getBaseImage(communityUrl);

    if (!image) {
      return new Response('未找到底图', { status: 404 });
    }

    return new Response(new Uint8Array(image.blob), {
      status: 200,
      headers: {
        'Content-Type': image.mime,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    return new Response(`获取底图失败: ${e}`, { status: 500 });
  }
}
