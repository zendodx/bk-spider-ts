/**
 * 小区价格统计 API
 * GET /api/stats/community?community=xxx&houseType=3室&excludeBasement=true&excludeLowFloor=true&limit=100
 */

import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/database';
import { getDBConfig } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface StatRow {
  stat_date: string;
  unique_listings: number;
  min_unit_price: number | null;
  avg_unit_price: number | null;
  max_unit_price: number | null;
  median_unit_price: number | null;
  min_price: number | null;
  avg_price: number | null;
  max_price: number | null;
  median_price: number | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const community = searchParams.get('community')?.trim() ?? '';
    const houseType = searchParams.get('houseType')?.trim() ?? '';
    const excludeBasement = searchParams.get('excludeBasement') !== 'false';   // 默认排除地下室
    const excludeLowFloor = searchParams.get('excludeLowFloor') !== 'false';   // 默认排除共3层
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500);

    if (!community) {
      return Response.json({ success: false, error: '参数缺失：community 为必填项', data: [] }, { status: 400 });
    }

    const pool = getPool(getDBConfig());

    // 动态构建 WHERE 条件
    const conditions: string[] = [
      'is_deleted = 0',
      'unit_price IS NOT NULL',
      'unit_price > 0',
    ];
    const params: unknown[] = [];

    conditions.push('community LIKE ?');
    params.push(`%${community}%`);

    if (houseType) {
      conditions.push('house_type LIKE ?');
      params.push(`%${houseType}%`);
    }
    if (excludeBasement) {
      conditions.push("floor_info NOT LIKE '%地下室%'");
    }
    if (excludeLowFloor) {
      conditions.push("floor_info NOT LIKE '%共3%层%'");
    }

    const where = conditions.join(' AND ');

    const sql = `
      SELECT
        stat_date                       AS stat_date,
        unique_listings                 AS unique_listings,
        ROUND(min_unit_price,  4)       AS min_unit_price,
        ROUND(avg_unit_price,  4)       AS avg_unit_price,
        ROUND(max_unit_price,  4)       AS max_unit_price,
        ROUND(median_unit_price, 4)     AS median_unit_price,
        ROUND(min_price,  2)            AS min_price,
        ROUND(avg_price,  2)            AS avg_price,
        ROUND(max_price,  2)            AS max_price,
        ROUND(median_price, 2)          AS median_price
      FROM (
        SELECT
          DATE(crawl_time)                   AS stat_date,
          COUNT(DISTINCT detail_url)         AS unique_listings,
          MIN(unit_price)                    AS min_unit_price,
          AVG(unit_price)                    AS avg_unit_price,
          MAX(unit_price)                    AS max_unit_price,
          SUBSTRING_INDEX(
            SUBSTRING_INDEX(
              GROUP_CONCAT(unit_price ORDER BY unit_price SEPARATOR ','),
              ',',
              CEIL(COUNT(*) / 2)
            ),
            ',', -1
          ) + 0                              AS median_unit_price,
          MIN(total_price)                   AS min_price,
          AVG(total_price)                   AS avg_price,
          MAX(total_price)                   AS max_price,
          SUBSTRING_INDEX(
            SUBSTRING_INDEX(
              GROUP_CONCAT(total_price ORDER BY total_price SEPARATOR ','),
              ',',
              CEIL(COUNT(*) / 2)
            ),
            ',', -1
          ) + 0                              AS median_price
        FROM house_listings
        WHERE ${where}
        GROUP BY DATE(crawl_time)
      ) t
      ORDER BY stat_date DESC
      LIMIT ?
    `;

    const [rows] = await pool.query(sql, [...params, limit]) as any;

    return Response.json({ success: true, data: rows as StatRow[] });
  } catch (e) {
    return Response.json({ success: false, error: String(e), data: [] }, { status: 500 });
  }
}
