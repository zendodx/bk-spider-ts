/**
 * 数据访问层（Repository 模式）
 * 对应原 Python 项目 models/repository.py
 */

import { Pool } from 'mysql2/promise';
import { HouseRecord } from '../spider/data-transformer';

/**
 * 将 Date 对象格式化为北京时间字符串 "YYYY-MM-DD HH:MM:SS"
 * 因为 mysql2 连接配置了 timezone: '+08:00'，传入的字符串会被当成北京时间处理，
 * 所以必须传北京时间字符串，而非 toISOString() 输出的 UTC 字符串。
 */
function toBeijingTimeStr(date: Date): string {
  return date.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');
}

export class HouseRepository {
  constructor(private pool: Pool) {}

  /**
   * 批量插入（忽略重复 detail_url + crawl_time）
   */
  async bulkInsert(records: HouseRecord[], batchSize = 100): Promise<number> {
    if (records.length === 0) return 0;

    let total = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const saved = await this.insertBatch(batch);
      total += saved;
    }

    return total;
  }

  private async insertBatch(records: HouseRecord[]): Promise<number> {
    const sql = `
      INSERT IGNORE INTO house_listings (
        title, header_image, header_image_desc,
        province, city, district,
        community, community_url,
        floor_info, build_year, house_type, area, orientation,
        total_price, unit_price,
        tags, detail_url, follow_count, publish_time, crawl_time,
        is_deleted
      ) VALUES ?
    `;

    const values = records.map(r => [
      r.title,
      r.header_image,
      r.header_image_desc,
      r.province,
      r.city,
      r.district,
      r.community,
      r.community_url,
      r.floor_info,
      r.build_year,
      r.house_type,
      r.area,
      r.orientation,
      r.total_price,
      r.unit_price,
      r.tags,
      r.detail_url,
      r.follow_count,
      r.publish_time ? toBeijingTimeStr(r.publish_time) : null,
      toBeijingTimeStr(r.crawl_time),
      r.is_deleted ? 1 : 0,
    ]);

    const [result] = await this.pool.query(sql, [values]) as any;
    return result.affectedRows ?? 0;
  }

  /**
   * 根据 URL 检查是否存在
   */
  async existsByUrl(detailUrl: string): Promise<boolean> {
    const [rows] = await this.pool.query(
      'SELECT 1 FROM house_listings WHERE detail_url = ? AND is_deleted = 0 LIMIT 1',
      [detailUrl]
    ) as any;
    return rows.length > 0;
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{ total_records: number }> {
    const [rows] = await this.pool.query(
      'SELECT COUNT(*) AS total FROM house_listings WHERE is_deleted = 0'
    ) as any;
    return { total_records: rows[0]?.total ?? 0 };
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

    const [countRows] = await this.pool.query(
      `SELECT COUNT(*) AS total FROM house_listings WHERE ${where}`,
      params
    ) as any;
    const total = countRows[0]?.total ?? 0;

    const [data] = await this.pool.query(
      `SELECT * FROM house_listings WHERE ${where} ORDER BY crawl_time DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    ) as any;

    return { data, total };
  }
}
