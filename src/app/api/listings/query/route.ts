/**
 * 房源列表查询 API
 * GET /api/listings/query?community=xxx&crawlDate=2026-03-24&houseType=3室&excludeBasement=true&excludeLowFloor=true&orderBy=unit_price&order=asc&limit=500
 * crawlDate 为精确日期，查询当天采集的数据（date(created_at) = crawlDate）
 */

import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface ListingRow {
  id: number;
  title: string;
  header_image: string | null;
  province: string;
  city: string;
  district: string;
  community: string;
  floor_info: string | null;
  build_year: number | null;
  house_type: string | null;
  area: number | null;
  orientation: string | null;
  total_price: number | null;
  unit_price: number | null;
  tags: string | null;
  detail_url: string | null;
  follow_count: number;
  publish_time: string | null;
  crawl_time: string;
  /** 上一次采集日期（不含当天）的单价，用于趋势对比，可能为 null */
  prev_unit_price: number | null;
  /** 上一次采集日期（不含当天）的总价，用于趋势对比，可能为 null */
  prev_total_price: number | null;
  /** 上一次采集日期 */
  prev_crawl_date: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const community      = searchParams.get('community')?.trim() ?? '';
    const city           = searchParams.get('city')?.trim() ?? '';         // 城市过滤
    const crawlDate      = searchParams.get('crawlDate')?.trim() ?? '';   // YYYY-MM-DD
    const houseType      = searchParams.get('houseType')?.trim() ?? '';
    const excludeBasement  = searchParams.get('excludeBasement') !== 'false';
    const excludeLowFloor  = searchParams.get('excludeLowFloor') !== 'false';
    const excludeTwoFloor  = searchParams.get('excludeTwoFloor') === 'true';
    const excludeOneFloor  = searchParams.get('excludeOneFloor') === 'true';
    // 楼层类型筛选：逗号分隔，如 "低楼层,中楼层"；空字符串=不过滤
    const floorTypes       = (searchParams.get('floorTypes') ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const areaMin        = parseFloat(searchParams.get('areaMin') ?? '');
    const areaMax        = parseFloat(searchParams.get('areaMax') ?? '');
    // 排序字段白名单，防注入
    const allowedOrder   = ['unit_price', 'total_price', 'area', 'created_at'];
    const rawOrderBy     = searchParams.get('orderBy')?.trim() ?? 'unit_price';
    const orderBy        = allowedOrder.includes(rawOrderBy) ? rawOrderBy : 'unit_price';
    const order          = searchParams.get('order') === 'desc' ? 'DESC' : 'ASC';
    const limit          = Math.min(parseInt(searchParams.get('limit') ?? '500', 10), 1000);

    if (!community) {
      return Response.json(
        { success: false, error: '参数缺失：community 为必填项', data: [] },
        { status: 400 }
      );
    }

    const db = getDb(getDBPath());

    const conditions: string[] = ['is_deleted = 0'];
    const params: unknown[] = [];

    conditions.push('community LIKE ?');
    params.push(`%${community}%`);

    if (city) {
      conditions.push('city LIKE ?');
      params.push(`%${city}%`);
    }

    if (crawlDate) {
      // SQLite: date(created_at) = 'YYYY-MM-DD'
      conditions.push("date(created_at) = ?");
      params.push(crawlDate);
    }

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

    // 楼层类型筛选：floor_info LIKE '%低楼层%' OR '%中楼层%' OR '%高楼层%'
    if (floorTypes.length > 0 && floorTypes.length < 3) {
      const clauses = floorTypes.map(() => "floor_info LIKE ?").join(' OR ');
      conditions.push(`(${clauses})`);
      for (const ft of floorTypes) params.push(`%${ft}%`);
    }

    if (!isNaN(areaMin)) {
      conditions.push('area >= ?');
      params.push(areaMin);
    }
    if (!isNaN(areaMax)) {
      conditions.push('area <= ?');
      params.push(areaMax);
    }

    const where = conditions.join(' AND ');

    // 按 detail_url 去重，保留 created_at 最新的那一行
    // 通过相关标量子查询获取上一次采集日期的价格，用于趋势展示
    const sql = `
      SELECT
        t.id,
        t.title,
        t.header_image,
        t.province,
        t.city,
        t.district,
        t.community,
        t.floor_info,
        t.build_year,
        t.house_type,
        t.area,
        t.orientation,
        t.total_price,
        t.unit_price,
        t.tags,
        t.detail_url,
        t.follow_count,
        strftime('%Y-%m-%d', t.publish_time)     AS publish_time,
        strftime('%Y-%m-%d %H:%M', t.created_at) AS crawl_time,
        (
          SELECT h2.unit_price
          FROM house_listings h2
          WHERE h2.detail_url = t.detail_url
            AND h2.is_deleted = 0
            AND date(h2.created_at) < date(t.created_at)
          ORDER BY h2.created_at DESC
          LIMIT 1
        ) AS prev_unit_price,
        (
          SELECT h3.total_price
          FROM house_listings h3
          WHERE h3.detail_url = t.detail_url
            AND h3.is_deleted = 0
            AND date(h3.created_at) < date(t.created_at)
          ORDER BY h3.created_at DESC
          LIMIT 1
        ) AS prev_total_price,
        (
          SELECT strftime('%Y-%m-%d', h4.created_at)
          FROM house_listings h4
          WHERE h4.detail_url = t.detail_url
            AND h4.is_deleted = 0
            AND date(h4.created_at) < date(t.created_at)
          ORDER BY h4.created_at DESC
          LIMIT 1
        ) AS prev_crawl_date
      FROM house_listings t
      INNER JOIN (
        SELECT detail_url, MAX(created_at) AS max_created
        FROM house_listings
        WHERE ${where}
        GROUP BY detail_url
      ) dedup
        ON t.detail_url = dedup.detail_url
       AND t.created_at = dedup.max_created
      WHERE ${where}
      ORDER BY t.${orderBy} ${order}
      LIMIT ?
    `;

    // 子查询和外层 WHERE 各用一份 params，最后加 limit
    const rows = db.prepare(sql).all(...params, ...params, limit) as ListingRow[];

    return Response.json({ success: true, data: rows, total: rows.length });
  } catch (e) {
    return Response.json({ success: false, error: String(e), data: [] }, { status: 500 });
  }
}
