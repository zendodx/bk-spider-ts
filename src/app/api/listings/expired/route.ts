/**
 * 失效房源查询 API
 * GET /api/listings/expired?community=xxx&baseDate=2026-07-07&compareDate=2026-07-06
 *
 * 逻辑：
 *   1. 获取"基准日期"（baseDate，通常是最新采集日期）当天的全部 detail_url 集合
 *   2. 获取该小区"历史上所有出现过"的 detail_url（基准日期之前）
 *   3. 两者取差集，即历史存在但最新不存在的房源 => 失效房源
 *   4. 每条失效房源附带：最后一次出现的日期、最后一次的价格信息等
 *
 * 若不传 baseDate，则取数据库中该小区最新的采集日期作为基准。
 * 若不传 compareDate，则对比该小区在 baseDate 之前所有历史数据。
 */

import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface ExpiredListingRow {
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
  /** 最后一次出现的采集时间 */
  last_seen_date: string;
  /** 最后一次出现时的采集时间（精确） */
  last_crawl_time: string;
  /** 首次出现的采集时间 */
  first_seen_date: string;
  /** 历史上出现的总次数（采集天数） */
  appear_count: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const community   = searchParams.get('community')?.trim() ?? '';
    const city        = searchParams.get('city')?.trim() ?? '';         // 城市过滤
    let   baseDate    = searchParams.get('baseDate')?.trim() ?? '';   // YYYY-MM-DD，基准（最新）日期
    const houseType   = searchParams.get('houseType')?.trim() ?? '';
    const excludeBasement = searchParams.get('excludeBasement') !== 'false';
    const excludeLowFloor = searchParams.get('excludeLowFloor') !== 'false';
    const excludeTwoFloor = searchParams.get('excludeTwoFloor') === 'true';
    const excludeOneFloor = searchParams.get('excludeOneFloor') === 'true';
    const areaMin     = parseFloat(searchParams.get('areaMin') ?? '');
    const areaMax     = parseFloat(searchParams.get('areaMax') ?? '');
    const allowedOrder = ['unit_price', 'total_price', 'area', 'last_seen_date'];
    const rawOrderBy   = searchParams.get('orderBy')?.trim() ?? 'last_seen_date';
    const orderBy      = allowedOrder.includes(rawOrderBy) ? rawOrderBy : 'last_seen_date';
    const order        = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
    const limit        = Math.min(parseInt(searchParams.get('limit') ?? '500', 10), 2000);

    if (!community) {
      return Response.json(
        { success: false, error: '参数缺失：community 为必填项', data: [], baseDate: '', latestDate: '' },
        { status: 400 }
      );
    }

    const db = getDb(getDBPath());

    // 1. 若未传 baseDate，则自动取该小区最新采集日期
    if (!baseDate) {
      const baseConds = ['community LIKE ?', 'is_deleted = 0'];
      const basePs: unknown[] = [`%${community}%`];
      if (city) { baseConds.push('city LIKE ?'); basePs.push(`%${city}%`); }
      const row = db.prepare(`
        SELECT date(created_at) AS latest_date
        FROM house_listings
        WHERE ${baseConds.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT 1
      `).get(...basePs) as { latest_date: string } | undefined;

      if (!row) {
        return Response.json({ success: true, data: [], baseDate: '', latestDate: '', total: 0 });
      }
      baseDate = row.latest_date;
    }

    // 2. 获取基准日期当天的所有 detail_url 集合（去重，保留最新记录）
    // 用 created_at >= 当天零点 AND < 次日零点（区间比较）代替 date(created_at) = ?，避免函数包裹导致索引失效
    const baseDateEnd = `${baseDate} 23:59:59`;
    const latestConds = ['community LIKE ?', 'is_deleted = 0', 'created_at >= ?', 'created_at <= ?', 'detail_url IS NOT NULL'];
    const latestPs: unknown[] = [`%${community}%`, `${baseDate} 00:00:00`, baseDateEnd];
    if (city) { latestConds.push('city LIKE ?'); latestPs.push(`%${city}%`); }
    const latestUrlsResult = db.prepare(`
      SELECT DISTINCT detail_url
      FROM house_listings
      WHERE ${latestConds.join(' AND ')}
    `).all(...latestPs) as { detail_url: string }[];

    const latestUrlSet = new Set(latestUrlsResult.map(r => r.detail_url));

    // 3. 基本筛选条件
    //    innerConds：用于子查询（无表别名，直接作用于 house_listings）
    //    outerConds：用于外层 WHERE（所有字段加 t. 前缀，避免 JOIN 后歧义）
    //
    // 性能说明：用 created_at < 'baseDate 00:00:00'（字符串比较）代替 date(created_at) < baseDate，
    // 两者语义等价（created_at 格式统一为 'YYYY-MM-DD HH:MM:SS'），但前者能命中 idx_detail_url_created_at /
    // idx_crawl_time 等索引做范围扫描，避免对 created_at 逐行计算 date() 导致索引失效、大数据量下变慢。
    const baseDateStart = `${baseDate} 00:00:00`;
    const innerConds: string[] = [
      'is_deleted = 0',
      'community LIKE ?',
      'created_at < ?',   // 只看基准日期之前的历史数据
      'detail_url IS NOT NULL',
    ];
    const outerConds: string[] = [
      't.is_deleted = 0',
      't.community LIKE ?',
      't.created_at < ?',
      't.detail_url IS NOT NULL',
    ];
    const params: unknown[] = [`%${community}%`, baseDateStart];

    if (city) {
      innerConds.push('city LIKE ?');
      outerConds.push('t.city LIKE ?');
      params.push(`%${city}%`);
    }

    if (houseType) {
      innerConds.push('house_type LIKE ?');
      outerConds.push('t.house_type LIKE ?');
      params.push(`%${houseType}%`);
    }
    if (excludeBasement) {
      innerConds.push("floor_info NOT LIKE '%地下室%'");
      outerConds.push("t.floor_info NOT LIKE '%地下室%'");
    }
    if (excludeLowFloor) {
      innerConds.push("floor_info NOT LIKE '%共3%层%'");
      outerConds.push("t.floor_info NOT LIKE '%共3%层%'");
    }
    if (excludeTwoFloor) {
      innerConds.push("floor_info NOT LIKE '%共2%层%'");
      outerConds.push("t.floor_info NOT LIKE '%共2%层%'");
    }
    if (excludeOneFloor) {
      innerConds.push("floor_info NOT LIKE '%共1%层%'");
      outerConds.push("t.floor_info NOT LIKE '%共1%层%'");
    }
    if (!isNaN(areaMin)) {
      innerConds.push('area >= ?');
      outerConds.push('t.area >= ?');
      params.push(areaMin);
    }
    if (!isNaN(areaMax)) {
      innerConds.push('area <= ?');
      outerConds.push('t.area <= ?');
      params.push(areaMax);
    }

    const innerWhere = innerConds.join(' AND ');
    const outerWhere = outerConds.join(' AND ');

    // 4. 查询历史房源（按 detail_url 去重，每套只取 id 最大的那条记录）
    //    同时统计每套房源的：首次出现日期、最后出现日期、出现天数
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
        stats.last_seen_date,
        strftime('%Y-%m-%d %H:%M', t.created_at) AS last_crawl_time,
        stats.first_seen_date,
        stats.appear_count
      FROM house_listings t
      INNER JOIN (
        SELECT
          detail_url,
          MAX(id)                            AS max_id,
          date(MAX(created_at))              AS last_seen_date,
          date(MIN(created_at))              AS first_seen_date,
          COUNT(DISTINCT date(created_at))   AS appear_count
        FROM house_listings
        WHERE ${innerWhere}
        GROUP BY detail_url
      ) stats
        ON t.id = stats.max_id
      WHERE ${outerWhere}
      ORDER BY stats.last_seen_date ${order},
               t.unit_price ASC
      LIMIT ?
    `;

    // params 被用于内层子查询和外层 WHERE，各一份
    const allRows = db.prepare(sql).all(...params, ...params, limit) as ExpiredListingRow[];

    // 5. 过滤掉在基准日期当天仍存在的房源（即：在历史中存在 AND 在最新日期中不存在 => 失效）
    const expiredRows = allRows.filter(
      row => row.detail_url && !latestUrlSet.has(row.detail_url)
    );

    // 6. 若按价格/面积排序，在 JS 层重新排序（因 SQL 中默认按 last_seen_date）
    if (['unit_price', 'total_price', 'area'].includes(orderBy)) {
      type NumKey = 'unit_price' | 'total_price' | 'area';
      expiredRows.sort((a, b) => {
        const va = (a[orderBy as NumKey] as number | null) ?? 0;
        const vb = (b[orderBy as NumKey] as number | null) ?? 0;
        return order === 'ASC' ? va - vb : vb - va;
      });
    }

    return Response.json({
      success: true,
      data: expiredRows,
      total: expiredRows.length,
      baseDate,   // 基准日期（最新采集日）
      latestCount: latestUrlSet.size,  // 最新日期中的房源总数
    });
  } catch (e) {
    return Response.json({ success: false, error: String(e), data: [] }, { status: 500 });
  }
}
