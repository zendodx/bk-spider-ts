/**
 * 房源价格历史查询 API
 * GET /api/listings/price-history?detailUrl=xxx
 * 按采集日期倒序返回该房源的所有价格记录
 */

import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface PriceHistoryRow {
  id: number;
  crawl_date: string;   // YYYY-MM-DD
  crawl_time: string;   // YYYY-MM-DD HH:mm
  unit_price: number | null;
  total_price: number | null;
  follow_count: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const detailUrl = searchParams.get('detailUrl')?.trim() ?? '';

    if (!detailUrl) {
      return Response.json(
        { success: false, error: '参数缺失：detailUrl 为必填项', data: [] },
        { status: 400 }
      );
    }

    const db = getDb(getDBPath());

    // 每天只保留最新一条（crawl_time 最大），按日期倒序
    // SQLite 使用 strftime 和 date() 函数替代 MySQL 的 DATE_FORMAT / DATE
    const sql = `
      SELECT
        t.id,
        strftime('%Y-%m-%d', t.crawl_time)       AS crawl_date,
        strftime('%Y-%m-%d %H:%M', t.crawl_time) AS crawl_time,
        t.unit_price,
        t.total_price,
        t.follow_count
      FROM house_listings t
      INNER JOIN (
        SELECT date(crawl_time) AS d, MAX(crawl_time) AS max_crawl
        FROM house_listings
        WHERE detail_url = ? AND is_deleted = 0
        GROUP BY date(crawl_time)
      ) dedup
        ON date(t.crawl_time) = dedup.d
       AND t.crawl_time = dedup.max_crawl
      WHERE t.detail_url = ? AND t.is_deleted = 0
      ORDER BY t.crawl_time DESC
      LIMIT 365
    `;

    const rows = db.prepare(sql).all(detailUrl, detailUrl) as PriceHistoryRow[];

    return Response.json({ success: true, data: rows });
  } catch (e) {
    return Response.json({ success: false, error: String(e), data: [] }, { status: 500 });
  }
}
