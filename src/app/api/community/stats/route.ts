/**
 * 小区汇总统计 API
 * GET /api/community/stats?keyword=xxx&orderBy=listing_count&order=desc&limit=200
 *
 * 返回所有小区的聚合信息：
 *   - 省市区、小区名、小区链接
 *   - 最新一次采集日期
 *   - 最新采集的挂牌数（基准：最新采集日当天 distinct detail_url 数）
 *   - 历史累计出现过的 distinct 房源数
 *   - 最新单价：均价、中位价、最低、最高
 *   - 最新总价：均价、中位价、最低、最高
 *   - 首次采集日期
 *   - 累计采集天数
 */

import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface CommunityStatRow {
  community: string;
  province: string;
  city: string;
  district: string;
  community_url: string | null;
  /** 最新采集日期 */
  latest_date: string;
  /** 首次采集日期 */
  first_date: string;
  /** 累计采集天数 */
  crawl_days: number;
  /** 最新采集日的挂牌数 */
  listing_count: number;
  /** 历史累计出现过的 distinct 房源数 */
  total_unique: number;
  /** 最新采集日均价（万/平，需 *10000 显示元/平） */
  avg_unit_price: number | null;
  median_unit_price: number | null;
  min_unit_price: number | null;
  max_unit_price: number | null;
  /** 最新采集日总价（万） */
  avg_total_price: number | null;
  min_total_price: number | null;
  max_total_price: number | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword  = searchParams.get('keyword')?.trim() ?? '';
    const city     = searchParams.get('city')?.trim() ?? '';
    const allowedOrder = ['listing_count', 'total_unique', 'avg_unit_price', 'latest_date', 'community', 'crawl_days'];
    const rawOrderBy   = searchParams.get('orderBy')?.trim() ?? 'listing_count';
    const orderBy      = allowedOrder.includes(rawOrderBy) ? rawOrderBy : 'listing_count';
    const order        = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
    const limit        = Math.min(parseInt(searchParams.get('limit') ?? '200', 10), 1000);

    const db = getDb(getDBPath());

    const extraConds: string[] = [];
    const extraParams: unknown[] = [];
    if (keyword) { extraConds.push(`community LIKE '%' || ? || '%'`); extraParams.push(keyword); }
    if (city)    { extraConds.push(`city LIKE '%' || ? || '%'`);      extraParams.push(city); }
    const extraWhere = extraConds.length ? 'AND ' + extraConds.join(' AND ') : '';

    // Step 1: 查询每个小区的基础信息 + 最新采集日
    const communitySql = `
      SELECT
        community,
        MAX(province)       AS province,
        MAX(city)           AS city,
        MAX(district)       AS district,
        MAX(community_url)  AS community_url,
        date(MAX(created_at)) AS latest_date,
        date(MIN(created_at)) AS first_date,
        COUNT(DISTINCT date(created_at)) AS crawl_days,
        COUNT(DISTINCT detail_url)       AS total_unique
      FROM house_listings
      WHERE is_deleted = 0
        AND community != ''
        ${extraWhere}
      GROUP BY community
    `;

    const communities = db.prepare(communitySql).all(...extraParams) as {
      community: string;
      province: string;
      city: string;
      district: string;
      community_url: string | null;
      latest_date: string;
      first_date: string;
      crawl_days: number;
      total_unique: number;
    }[];

    if (communities.length === 0) {
      return Response.json({ success: true, data: [], total: 0 });
    }

    // Step 2: 批量查询每个小区在其最新采集日的挂牌数和价格统计
    // 用一条大 SQL 通过 CASE/JOIN 完成，避免 N+1
    // 先构造 (community, latest_date) 的临时集合，用 VALUES 拼接
    const placeholders = communities.map(() => '(?, ?)').join(', ');
    const pairParams: string[] = [];
    communities.forEach(c => { pairParams.push(c.community, c.latest_date); });

    const latestStatsSql = `
      WITH latest_pairs(community, latest_date) AS (
        VALUES ${placeholders}
      ),
      latest_listings AS (
        SELECT
          h.community,
          h.detail_url,
          h.unit_price,
          h.total_price
        FROM house_listings h
        INNER JOIN latest_pairs lp
          ON h.community = lp.community
         AND date(h.created_at) = lp.latest_date
        WHERE h.is_deleted = 0
          AND h.detail_url IS NOT NULL
        GROUP BY h.community, h.detail_url
        HAVING MAX(h.id)
      ),
      ranked AS (
        SELECT
          community,
          unit_price,
          total_price,
          ROW_NUMBER() OVER (PARTITION BY community ORDER BY unit_price) AS rn,
          COUNT(*) OVER (PARTITION BY community) AS cnt
        FROM latest_listings
        WHERE unit_price IS NOT NULL AND unit_price > 0
      )
      SELECT
        ll.community,
        COUNT(DISTINCT ll.detail_url)    AS listing_count,
        ROUND(AVG(ll.unit_price), 4)     AS avg_unit_price,
        ROUND(MIN(ll.unit_price), 4)     AS min_unit_price,
        ROUND(MAX(ll.unit_price), 4)     AS max_unit_price,
        ROUND(AVG(ll.total_price), 2)    AS avg_total_price,
        ROUND(MIN(ll.total_price), 2)    AS min_total_price,
        ROUND(MAX(ll.total_price), 2)    AS max_total_price,
        (
          SELECT ROUND(AVG(unit_price), 4)
          FROM ranked r2
          WHERE r2.community = ll.community
            AND r2.rn IN (
              CAST((r2.cnt + 1) / 2 AS INTEGER),
              CAST((r2.cnt + 2) / 2 AS INTEGER)
            )
        ) AS median_unit_price
      FROM latest_listings ll
      GROUP BY ll.community
    `;

    const latestStats = db.prepare(latestStatsSql).all(...pairParams) as {
      community: string;
      listing_count: number;
      avg_unit_price: number | null;
      min_unit_price: number | null;
      max_unit_price: number | null;
      avg_total_price: number | null;
      min_total_price: number | null;
      max_total_price: number | null;
      median_unit_price: number | null;
    }[];

    // 建立 map 以便 O(1) 合并
    const statsMap = new Map(latestStats.map(s => [s.community, s]));

    // Step 3: 合并结果
    const result: CommunityStatRow[] = communities.map(c => {
      const stats = statsMap.get(c.community);
      return {
        community:        c.community,
        province:         c.province,
        city:             c.city,
        district:         c.district,
        community_url:    c.community_url,
        latest_date:      c.latest_date,
        first_date:       c.first_date,
        crawl_days:       c.crawl_days,
        total_unique:     c.total_unique,
        listing_count:    stats?.listing_count    ?? 0,
        avg_unit_price:   stats?.avg_unit_price   ?? null,
        median_unit_price: stats?.median_unit_price ?? null,
        min_unit_price:   stats?.min_unit_price   ?? null,
        max_unit_price:   stats?.max_unit_price   ?? null,
        avg_total_price:  stats?.avg_total_price  ?? null,
        min_total_price:  stats?.min_total_price  ?? null,
        max_total_price:  stats?.max_total_price  ?? null,
      };
    });

    // Step 4: 排序
    type NumKey = 'listing_count' | 'total_unique' | 'avg_unit_price' | 'crawl_days';
    type StrKey = 'community' | 'latest_date';
    const numericCols = new Set<string>(['listing_count', 'total_unique', 'avg_unit_price', 'crawl_days']);
    result.sort((a, b) => {
      if (numericCols.has(orderBy)) {
        const na = (a[orderBy as NumKey] as number | null) ?? -Infinity;
        const nb = (b[orderBy as NumKey] as number | null) ?? -Infinity;
        return order === 'ASC' ? na - nb : nb - na;
      }
      // 字符串排序
      const sa = String((a[orderBy as StrKey] as string | null) ?? '');
      const sb = String((b[orderBy as StrKey] as string | null) ?? '');
      return order === 'ASC' ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });

    return Response.json({
      success: true,
      data:    result.slice(0, limit),
      total:   result.length,
    });
  } catch (e) {
    return Response.json({ success: false, error: String(e), data: [] }, { status: 500 });
  }
}
