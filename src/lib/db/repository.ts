/**
 * 数据访问层（Repository 模式）
 * 使用 better-sqlite3 同步 API
 */

import Database from 'better-sqlite3';
import { HouseRecord } from '../spider/data-transformer';

/**
 * 将 Date 对象格式化为北京时间字符串 "YYYY-MM-DD HH:MM:SS"
 */
function toBeijingTimeStr(date: Date): string {
  return date.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');
}

export class HouseRepository {
  constructor(private db: Database.Database) {}

  /**
   * 批量插入（忽略重复 detail_url + crawl_time）
   */
  async bulkInsert(records: HouseRecord[], batchSize = 100): Promise<number> {
    if (records.length === 0) return 0;

    let total = 0;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      total += this.insertBatch(batch);
    }
    return total;
  }

  private insertBatch(records: HouseRecord[]): number {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO house_listings (
        title, header_image, header_image_desc,
        province, city, district,
        community, community_url,
        floor_info, build_year, house_type, area, orientation,
        total_price, unit_price,
        tags, detail_url, follow_count, publish_time, crawl_time,
        is_deleted
      ) VALUES (
        @title, @header_image, @header_image_desc,
        @province, @city, @district,
        @community, @community_url,
        @floor_info, @build_year, @house_type, @area, @orientation,
        @total_price, @unit_price,
        @tags, @detail_url, @follow_count, @publish_time, @crawl_time,
        @is_deleted
      )
    `);

    const insertMany = this.db.transaction((rows: object[]) => {
      let count = 0;
      for (const row of rows) {
        const result = stmt.run(row);
        count += result.changes;
      }
      return count;
    });

    const rows = records.map(r => ({
      title: r.title,
      header_image: r.header_image ?? null,
      header_image_desc: r.header_image_desc ?? null,
      province: r.province,
      city: r.city,
      district: r.district,
      community: r.community,
      community_url: r.community_url ?? null,
      floor_info: r.floor_info ?? null,
      build_year: r.build_year ?? null,
      house_type: r.house_type ?? null,
      area: r.area ?? null,
      orientation: r.orientation ?? null,
      total_price: r.total_price ?? null,
      unit_price: r.unit_price ?? null,
      tags: r.tags ?? null,
      detail_url: r.detail_url ?? null,
      follow_count: r.follow_count ?? 0,
      publish_time: r.publish_time ? toBeijingTimeStr(r.publish_time) : null,
      crawl_time: toBeijingTimeStr(r.crawl_time),
      is_deleted: r.is_deleted ? 1 : 0,
    }));

    return insertMany(rows) as number;
  }

  /**
   * 根据 URL 检查是否存在
   */
  async existsByUrl(detailUrl: string): Promise<boolean> {
    const row = this.db
      .prepare('SELECT 1 FROM house_listings WHERE detail_url = ? AND is_deleted = 0 LIMIT 1')
      .get(detailUrl);
    return row !== undefined;
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{ total_records: number }> {
    const row = this.db
      .prepare('SELECT COUNT(*) AS total FROM house_listings WHERE is_deleted = 0')
      .get() as { total: number };
    return { total_records: row?.total ?? 0 };
  }

  /**
   * 查询房源列表（分页）
   */
  async queryListings(options: {
    community?: string;
    city?: string;
    district?: string;
    minPrice?: number;
    maxPrice?: number;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ data: any[]; total: number }> {
    const {
      community,
      city,
      district,
      minPrice,
      maxPrice,
      page = 1,
      pageSize = 50,
    } = options;

    const conditions: string[] = ['is_deleted = 0'];
    const params: unknown[] = [];

    if (community) {
      conditions.push('community LIKE ?');
      params.push(`%${community}%`);
    }
    if (city) {
      conditions.push('city = ?');
      params.push(city);
    }
    if (district) {
      conditions.push('district = ?');
      params.push(district);
    }
    if (minPrice !== undefined) {
      conditions.push('total_price >= ?');
      params.push(minPrice);
    }
    if (maxPrice !== undefined) {
      conditions.push('total_price <= ?');
      params.push(maxPrice);
    }

    const where = conditions.join(' AND ');
    const offset = (page - 1) * pageSize;

    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS total FROM house_listings WHERE ${where}`)
      .get(...params as any[]) as { total: number };
    const total = countRow?.total ?? 0;

    const data = this.db
      .prepare(
        `SELECT * FROM house_listings WHERE ${where} ORDER BY crawl_time DESC LIMIT ? OFFSET ?`
      )
      .all(...params as any[], pageSize, offset);

    return { data, total };
  }
}
