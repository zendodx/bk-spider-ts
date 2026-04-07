/**
 * 小区价格统计 API
 * GET /api/stats/community?community=xxx&houseType=3室&excludeBasement=true&excludeLowFloor=true&limit=100
 *
 * SQLite 中位数计算方案：
 * 使用 ROW_NUMBER() 窗口函数 + 奇偶行取均值，兼容 SQLite 3.25+（2018年发布）
 */

import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';

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
    const excludeBasement = searchParams.get('excludeBasement') !== 'false';
    const excludeLowFloor = searchParams.get('excludeLowFloor') !== 'false';
    const excludeTwoFloor = searchParams.get('excludeTwoFloor') === 'true';
    const excludeOneFloor = searchParams.get('excludeOneFloor') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500);

    if (!community) {
      return Response.json({ success: false, error: '参数缺失：community 为必填项', data: [] }, { status: 400 });
    }

    const db = getDb(getDBPath());

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
    if (excludeTwoFloor) {
      conditions.push("floor_info NOT LIKE '%共2%层%'");
    }
    if (excludeOneFloor) {
      conditions.push("floor_info NOT LIKE '%共1%层%'");
    }

    const where = conditions.join(' AND ');

    /**
     * SQLite 中位数计算：
     * 1. ranked_up：按每天按 unit_price 升序排列，生成行号 rn 和总数 cnt
     * 2. 外层聚合时，取满足中位数条件的行均值：
     *    - 奇数行：取 rn = (cnt+1)/2
     *    - 偶数行：取 rn IN (cnt/2, cnt/2+1) 的平均值
     *    通用公式：rn IN (ceil(cnt*1.0/2), ceil((cnt+1)*1.0/2)) 的 AVG
     */
    const sql = `
      WITH filtered AS (
        SELECT
          date(created_at)  AS stat_date,
          detail_url,
          unit_price,
          total_price
        FROM house_listings
        WHERE ${where}
      ),
      ranked_up AS (
        SELECT
          stat_date,
          unit_price,
          total_price,
          ROW_NUMBER() OVER (PARTITION BY stat_date ORDER BY unit_price)     AS rn_up,
          COUNT(*)          OVER (PARTITION BY stat_date)                     AS cnt
        FROM filtered
      ),
      ranked_tp AS (
        SELECT
          stat_date,
          total_price,
          ROW_NUMBER() OVER (PARTITION BY stat_date ORDER BY total_price)    AS rn_tp,
          COUNT(*)          OVER (PARTITION BY stat_date)                     AS cnt_tp
        FROM filtered
        WHERE total_price IS NOT NULL
      ),
      daily_stats AS (
        SELECT
          stat_date,
          COUNT(DISTINCT detail_url)  AS unique_listings,
          MIN(unit_price)             AS min_unit_price,
          AVG(unit_price)             AS avg_unit_price,
          MAX(unit_price)             AS max_unit_price,
          MIN(total_price)            AS min_price,
          AVG(total_price)            AS avg_price,
          MAX(total_price)            AS max_price
        FROM filtered
        GROUP BY stat_date
      ),
      median_up AS (
        SELECT
          stat_date,
          AVG(unit_price) AS median_unit_price
        FROM ranked_up
        WHERE rn_up IN (
          CAST((cnt + 1) / 2 AS INTEGER),
          CAST((cnt + 2) / 2 AS INTEGER)
        )
        GROUP BY stat_date
      ),
      median_tp AS (
        SELECT
          stat_date,
          AVG(total_price) AS median_price
        FROM ranked_tp
        WHERE rn_tp IN (
          CAST((cnt_tp + 1) / 2 AS INTEGER),
          CAST((cnt_tp + 2) / 2 AS INTEGER)
        )
        GROUP BY stat_date
      )
      SELECT
        d.stat_date,
        d.unique_listings,
        ROUND(d.min_unit_price, 4)    AS min_unit_price,
        ROUND(d.avg_unit_price, 4)    AS avg_unit_price,
        ROUND(d.max_unit_price, 4)    AS max_unit_price,
        ROUND(mu.median_unit_price, 4) AS median_unit_price,
        ROUND(d.min_price, 2)         AS min_price,
        ROUND(d.avg_price, 2)         AS avg_price,
        ROUND(d.max_price, 2)         AS max_price,
        ROUND(mt.median_price, 2)     AS median_price
      FROM daily_stats d
      LEFT JOIN median_up mu ON d.stat_date = mu.stat_date
      LEFT JOIN median_tp mt ON d.stat_date = mt.stat_date
      ORDER BY d.stat_date DESC
      LIMIT ?
    `;

    const rows = db.prepare(sql).all(...params, limit) as StatRow[];

    return Response.json({ success: true, data: rows });
  } catch (e) {
    return Response.json({ success: false, error: String(e), data: [] }, { status: 500 });
  }
}
