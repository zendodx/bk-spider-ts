/**
 * 房源价格历史查询 API
 * GET /api/listings/price-history?detailUrl=xxx
 * 按采集日期倒序返回该房源的所有价格记录
 */

import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/database';
import { getDBConfig } from '@/lib/settings';

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

    const pool = getPool(getDBConfig());

    // 每天只保留最新一条（crawl_time 最大），按日期倒序
    const sql = `
      SELECT
        t.id,
        DATE_FORMAT(t.crawl_time, '%Y-%m-%d')       AS crawl_date,
        DATE_FORMAT(t.crawl_time, '%Y-%m-%d %H:%i') AS crawl_time,
        t.unit_price,
        t.total_price,
        t.follow_count
      FROM house_listings t
      INNER JOIN (
        SELECT DATE(crawl_time) AS d, MAX(crawl_time) AS max_crawl
        FROM house_listings
        WHERE detail_url = ? AND is_deleted = 0
        GROUP BY DATE(crawl_time)
      ) dedup
        ON DATE(t.crawl_time) = dedup.d
       AND t.crawl_time = dedup.max_crawl
      WHERE t.detail_url = ? AND t.is_deleted = 0
      ORDER BY t.crawl_time DESC
      LIMIT 365
    `;

    const [rows] = await pool.query(sql, [detailUrl, detailUrl]) as any;

    return Response.json({ success: true, data: rows as PriceHistoryRow[] });
  } catch (e) {
    return Response.json({ success: false, error: String(e), data: [] }, { status: 500 });
  }
}
