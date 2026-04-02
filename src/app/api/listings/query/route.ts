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

    const sql = `
      SELECT
        id,
        title,
        community,
        floor_info,
        build_year,
        house_type,
        area,
        orientation,
        total_price,
        unit_price,
        tags,
        detail_url,
        follow_count,
        DATE_FORMAT(publish_time, '%Y-%m-%d') AS publish_time,
        DATE_FORMAT(crawl_time,   '%Y-%m-%d %H:%i') AS crawl_time
      FROM house_listings
      WHERE ${where}
      ORDER BY ${orderBy} ${order}
      LIMIT ?
    `;

    const [rows] = await pool.query(sql, [...params, limit]) as any;

    return Response.json({ success: true, data: rows as ListingRow[], total: rows.length });
  } catch (e) {
    return Response.json({ success: false, error: String(e), data: [] }, { status: 500 });
  }
}
