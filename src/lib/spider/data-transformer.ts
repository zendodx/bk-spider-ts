/**
 * 数据转换与清洗服务
 * 对应原 Python 项目 services/data_transformer.py
 */

import { HouseRawData } from './parser';

export interface HouseRecord {
  title: string;
  header_image: string | null;
  header_image_desc: string | null;
  province: string;
  city: string;
  district: string;
  community: string;
  community_url: string | null;
  floor_info: string | null;
  build_year: number | null;
  house_type: string | null;
  area: number | null;
  orientation: string | null;
  total_price: number | null;
  unit_price: number | null;
  tags: string | null;
  detail_url: string | null;
  follow_count: number | null;
  publish_time: Date | null;
  crawl_time: Date;
  is_deleted: boolean;
}

// 城市映射表
export const CITY_MAPPING: Record<string, [string, string]> = {
  bj: ['北京市', '北京市'],
  sh: ['上海市', '上海市'],
  gz: ['广东省', '广州市'],
  sz: ['广东省', '深圳市'],
  jn: ['山东省', '济南市'],
  cd: ['四川省', '成都市'],
  hz: ['浙江省', '杭州市'],
  nj: ['江苏省', '南京市'],
  wh: ['湖北省', '武汉市'],
  xa: ['陕西省', '西安市'],
};

// 济南区域关键词
export const JINAN_DISTRICTS = ['历下', '市中', '槐荫', '天桥', '历城', '长清', '章丘', '济阳', '莱芜', '钢城'];

export class DataTransformer {
  constructor(
    private cityMapping: typeof CITY_MAPPING = CITY_MAPPING,
    private districtKeywords: string[] = JINAN_DISTRICTS
  ) {}

  transform(raw: HouseRawData): HouseRecord | null {
    try {
      const [province, city, district] = this.extractLocation(raw);

      return {
        title: raw['标题'] || '',
        header_image: raw['头图'],
        header_image_desc: raw['头图描述'],
        province,
        city,
        district,
        community: raw['小区'] || '',
        community_url: raw['小区链接'] || null,
        floor_info: raw['楼层'] || null,
        build_year: this.toInt(raw['年份']),
        house_type: raw['户型'] || null,
        area: this.toFloat(raw['面积']?.replace('平米', '')),
        orientation: raw['朝向'] || null,
        total_price: this.toFloat(raw['总价(万)']),
        unit_price: this.toFloat(raw['单价(元/平)']),
        tags: raw['标签'] || null,
        detail_url: raw['详情页URL'] || null,
        follow_count: this.toInt(raw['关注人数']),
        publish_time: this.parseTime(raw['发布时间']),
        crawl_time: this.parseCrawlTime(raw['采集时间']),
        is_deleted: false,
      };
    } catch (e) {
      console.error('数据转换失败:', e);
      return null;
    }
  }

  private extractLocation(data: HouseRawData): [string, string, string] {
    const host = data['_host'] || '';
    const title = data['标题'] || '';

    let province = '';
    let city = '';
    let district = '';

    try {
      const match = host.match(/https?:\/\/([^.]+)\./);
      if (match) {
        const cityCode = match[1];
        if (cityCode in this.cityMapping) {
          [province, city] = this.cityMapping[cityCode];
        }
      }
    } catch {
      // 忽略解析错误
    }

    for (const keyword of this.districtKeywords) {
      if (title.includes(keyword)) {
        district = `${keyword}区`;
        break;
      }
    }

    return [province, city, district];
  }

  private parseTime(text: string): Date | null {
    if (!text) return null;

    try {
      if (text.includes('.')) {
        const parts = text.split('.');
        if (parts.length === 3) {
          return new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
        }
      }

      const daysMatch = text.match(/(\d+)天前/);
      if (daysMatch) {
        const days = parseInt(daysMatch[1]);
        const d = new Date();
        d.setDate(d.getDate() - days);
        return d;
      }

      const monthsMatch = text.match(/(\d+)个月前/);
      if (monthsMatch) {
        const months = parseInt(monthsMatch[1]);
        const d = new Date();
        d.setDate(d.getDate() - months * 30);
        return d;
      }
    } catch {
      // 忽略解析错误
    }

    return null;
  }

  private parseCrawlTime(text: string): Date {
    try {
      return new Date(text.replace(' ', 'T'));
    } catch {
      return new Date();
    }
  }

  private toInt(value: unknown): number | null {
    if (!value) return null;
    const n = parseInt(String(value).trim());
    return isNaN(n) ? null : n;
  }

  private toFloat(value: unknown): number | null {
    if (!value) return null;
    const clean = String(value)
      .replace('万', '')
      .replace('元/平', '')
      .replace('平米', '')
      .replace(',', '')
      .trim();
    if (!clean) return null;
    const n = parseFloat(clean);
    return isNaN(n) ? null : n;
  }
}
