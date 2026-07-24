/**
 * 采光分析 - 小区方案数据访问层
 * 以 community_url 作为唯一键读写 community_sunlight_plan 表
 */

import Database from 'better-sqlite3';
import type { BuildingPlanData, CommunitySunlightPlanListItem, SunlightAnalysisResult } from '@/types/sunlight';

interface PlanRow {
  id: number;
  community_url: string;
  community: string;
  city: string;
  district: string;
  base_image_mime: string | null;
  base_image_name: string | null;
  has_base_image: number;
  plan_json: string;
  analysis_json: string | null;
  plan_fingerprint: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanDetail {
  id: number;
  communityUrl: string;
  community: string;
  city: string;
  district: string;
  hasBaseImage: boolean;
  baseImageMime: string | null;
  planJson: BuildingPlanData;
  analysisJson: SunlightAnalysisResult | null;
  planFingerprint: string | null;
  createdAt: string;
  updatedAt: string;
}

function nowBeijing(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');
}

function rowToDetail(row: PlanRow): PlanDetail {
  return {
    id: row.id,
    communityUrl: row.community_url,
    community: row.community,
    city: row.city,
    district: row.district,
    hasBaseImage: row.has_base_image === 1,
    baseImageMime: row.base_image_mime,
    planJson: JSON.parse(row.plan_json),
    analysisJson: row.analysis_json ? JSON.parse(row.analysis_json) : null,
    planFingerprint: row.plan_fingerprint,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SunlightPlanRepository {
  constructor(private db: Database.Database) {}

  /** 查询指定小区的采光方案详情（不含图片二进制） */
  getByCommunityUrl(communityUrl: string): PlanDetail | null {
    const row = this.db
      .prepare(
        `SELECT id, community_url, community, city, district,
                base_image_mime, base_image_name,
                (base_image_blob IS NOT NULL) AS has_base_image,
                plan_json, analysis_json, plan_fingerprint, created_at, updated_at
         FROM community_sunlight_plan
         WHERE community_url = ?
         LIMIT 1`
      )
      .get(communityUrl) as PlanRow | undefined;
    return row ? rowToDetail(row) : null;
  }

  /** 获取底图二进制及其 mime 类型 */
  getBaseImage(communityUrl: string): { blob: Buffer; mime: string; name: string | null } | null {
    const row = this.db
      .prepare(
        `SELECT base_image_blob AS blob, base_image_mime AS mime, base_image_name AS name
         FROM community_sunlight_plan
         WHERE community_url = ?
         LIMIT 1`
      )
      .get(communityUrl) as { blob: Buffer | null; mime: string | null; name: string | null } | undefined;
    if (!row || !row.blob) return null;
    return { blob: row.blob, mime: row.mime || 'image/jpeg', name: row.name };
  }

  /** 列出所有已配置采光方案的小区（用于列表页角标标记） */
  listAll(): CommunitySunlightPlanListItem[] {
    const rows = this.db
      .prepare(
        `SELECT community_url, community, city, district,
                (base_image_blob IS NOT NULL) AS has_base_image, updated_at
         FROM community_sunlight_plan
         ORDER BY updated_at DESC`
      )
      .all() as { community_url: string; community: string; city: string; district: string; has_base_image: number; updated_at: string }[];

    return rows.map(r => ({
      communityUrl: r.community_url,
      community: r.community,
      city: r.city,
      district: r.district,
      hasBaseImage: r.has_base_image === 1,
      updatedAt: r.updated_at,
    }));
  }

  /**
   * 保存/更新标注方案（UPSERT）。
   * 若传入 imageBuffer 则同时更新底图；不传则保留原有底图不变。
   * 标注更新后会清空历史分析结果缓存（因为几何/参数已变化，旧结果不再可信）。
   */
  upsertPlan(params: {
    communityUrl: string;
    community: string;
    city?: string;
    district?: string;
    planJson: BuildingPlanData;
    planFingerprint: string;
    imageBuffer?: Buffer | null;
    imageMime?: string | null;
    imageName?: string | null;
  }): void {
    const now = nowBeijing();
    const existing = this.db
      .prepare('SELECT id FROM community_sunlight_plan WHERE community_url = ? LIMIT 1')
      .get(params.communityUrl) as { id: number } | undefined;

    if (existing) {
      if (params.imageBuffer) {
        this.db
          .prepare(
            `UPDATE community_sunlight_plan
             SET community = ?, city = ?, district = ?,
                 plan_json = ?, plan_fingerprint = ?, analysis_json = NULL,
                 base_image_blob = ?, base_image_mime = ?, base_image_name = ?,
                 updated_at = ?
             WHERE community_url = ?`
          )
          .run(
            params.community,
            params.city ?? '',
            params.district ?? '',
            JSON.stringify(params.planJson),
            params.planFingerprint,
            params.imageBuffer,
            params.imageMime ?? null,
            params.imageName ?? null,
            now,
            params.communityUrl
          );
      } else {
        this.db
          .prepare(
            `UPDATE community_sunlight_plan
             SET community = ?, city = ?, district = ?,
                 plan_json = ?, plan_fingerprint = ?, analysis_json = NULL,
                 updated_at = ?
             WHERE community_url = ?`
          )
          .run(
            params.community,
            params.city ?? '',
            params.district ?? '',
            JSON.stringify(params.planJson),
            params.planFingerprint,
            now,
            params.communityUrl
          );
      }
    } else {
      this.db
        .prepare(
          `INSERT INTO community_sunlight_plan (
             community_url, community, city, district,
             base_image_blob, base_image_mime, base_image_name,
             plan_json, plan_fingerprint, analysis_json, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
        )
        .run(
          params.communityUrl,
          params.community,
          params.city ?? '',
          params.district ?? '',
          params.imageBuffer ?? null,
          params.imageMime ?? null,
          params.imageName ?? null,
          JSON.stringify(params.planJson),
          params.planFingerprint,
          now,
          now
        );
    }
  }

  /** 单独更新分析结果缓存 */
  updateAnalysis(communityUrl: string, analysisJson: SunlightAnalysisResult): boolean {
    const now = nowBeijing();
    const result = this.db
      .prepare(`UPDATE community_sunlight_plan SET analysis_json = ?, updated_at = ? WHERE community_url = ?`)
      .run(JSON.stringify(analysisJson), now, communityUrl);
    return result.changes > 0;
  }

  /** 删除指定小区的采光方案 */
  deleteByCommunityUrl(communityUrl: string): boolean {
    const result = this.db.prepare('DELETE FROM community_sunlight_plan WHERE community_url = ?').run(communityUrl);
    return result.changes > 0;
  }
}
