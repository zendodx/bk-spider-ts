/**
 * 房源列表查询 API
 * GET /api/listings/query?community=xxx&crawlDate=2026-03-24&houseType=3室&excludeBasement=true&excludeLowFloor=true&orderBy=unit_price&order=asc&limit=500
 * crawlDate 为精确日期，查询当天采集的数据（DATE(crawl_time) = crawlDate）
 */

import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/database';
import { getDBConfig } from '@/lib/settings';

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
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const community      = searchParams.get('community')?.trim() ?? '';
    const crawlDate      = searchParams.get('crawlDate')?.trim() ?? '';   // YYYY-MM-DD
    const houseType      = searchParams.get('houseType')?.trim() ?? '';
    const excludeBasement  = searchParams.get('excludeBasement') !== 'false';
    const excludeLowFloor  = searchParams.get('excludeLowFloor') !== 'false';
    // 排序字段白名单，防注入
    const allowedOrder   = ['unit_price', 'total_price', 'area', 'crawl_time'];
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

    const pool = getPool(getDBConfig());

    const conditions: string[] = ['is_deleted = 0'];
    const params: unknown[] = [];

    conditions.push('community LIKE ?');
    params.push(`%${community}%`);

    if (crawlDate) {
      // 精确匹配某一天：DATE(crawl_time) = 'YYYY-MM-DD'
      conditions.push('DATE(crawl_time) = ?');
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

    const where = conditions.join(' AND ');

    // 按 detail_url 去重，保留 created_at 最新的那一行：
    // 1. 子查询：在满足条件的记录中，按 detail_url 分组取最大 created_at
    // 2. 外层 JOIN 回原表取完整字段
    // 3. 最外层按用户指定字段排序并分页
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
        DATE_FORMAT(t.publish_time, '%Y-%m-%d')       AS publish_time,
        DATE_FORMAT(t.crawl_time,   '%Y-%m-%d %H:%i') AS crawl_time
      FROM house_listings t
      INNER JOIN (
        SELECT detail_url, MAX(created_at) AS max_created
        FROM house_listings
        WHERE ${where}
        GROUP BY detail_url
      ) dedup
        ON t.detail_url = dedup.detail_url
       AND t.created_at  = dedup.max_created
      WHERE ${where}
      ORDER BY t.${orderBy} ${order}
      LIMIT ?
    `;

    // 子查询和外层 WHERE 各用一份 params，最后加 limit
    const [rows] = await pool.query(sql, [...params, ...params, limit]) as any;

    return Response.json({ success: true, data: rows as ListingRow[], total: rows.length });
  } catch (e) {
    return Response.json({ success: false, error: String(e), data: [] }, { status: 500 });
  }
}
