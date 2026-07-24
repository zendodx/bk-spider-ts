/**
 * 小区采光规划标注 API
 */

import { NextRequest } from 'next/server';
import { getDb, initDatabase } from '@/lib/db/database';
import { getDBPath } from '@/lib/settings';
import { SunlightPlanRepository } from '@/lib/sunlight/plan-repository';
import { normalizeBuildingData } from '@/lib/sunlight/validate';
import { createFingerprint } from '@/lib/sunlight/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const communityUrl = searchParams.get('communityUrl')?.trim() ?? '';

    await initDatabase(getDBPath());
    const db = getDb(getDBPath());
    const repo = new SunlightPlanRepository(db);

    if (!communityUrl) {
      return Response.json({ success: true, data: repo.listAll() });
    }

    const detail = repo.getByCommunityUrl(communityUrl);
    if (!detail) {
      return Response.json({ success: true, data: null });
    }

    return Response.json({
      success: true,
      data: {
        communityUrl: detail.communityUrl,
        community: detail.community,
        city: detail.city,
        district: detail.district,
        hasBaseImage: detail.hasBaseImage,
        planJson: detail.planJson,
        analysisJson: detail.analysisJson,
        planFingerprint: detail.planFingerprint,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
      },
    });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}

// ─── POST：保存/更新标注方案（可携带底图文件） ─────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return Response.json({ success: false, error: '请使用 multipart/form-data 提交' }, { status: 400 });
    }

    const formData = await request.formData();
    const communityUrl = String(formData.get('communityUrl') ?? '').trim();
    const community = String(formData.get('community') ?? '').trim();
    const city = String(formData.get('city') ?? '').trim();
    const district = String(formData.get('district') ?? '').trim();
    const planJsonRaw = formData.get('planJson');
    const imageFile = formData.get('image');

    if (!communityUrl) {
      return Response.json({ success: false, error: '缺少 communityUrl 参数' }, { status: 400 });
    }
    if (!community) {
      return Response.json({ success: false, error: '缺少 community 参数' }, { status: 400 });
    }
    if (typeof planJsonRaw !== 'string' || !planJsonRaw) {
      return Response.json({ success: false, error: '缺少 planJson 参数' }, { status: 400 });
    }

    let parsedPlan: unknown;
    try {
      parsedPlan = JSON.parse(planJsonRaw);
    } catch {
      return Response.json({ success: false, error: 'planJson 不是合法的 JSON' }, { status: 400 });
    }

    const normalized = normalizeBuildingData(parsedPlan);
    if (!normalized.valid || !normalized.data) {
      return Response.json(
        { success: false, error: '标注数据校验失败', details: normalized.errors.slice(0, 10) },
        { status: 400 }
      );
    }

    let imageBuffer: Buffer | null = null;
    let imageMime: string | null = null;
    let imageName: string | null = null;
    // 不同 Node.js 版本对全局 File 的支持不一致（Node 20+ 才默认全局可用），
    // 这里改用 duck-typing 判断，避免 `imageFile instanceof File` 在低版本 Node 下抛出 ReferenceError。
    if (
      imageFile &&
      typeof imageFile === 'object' &&
      'arrayBuffer' in imageFile &&
      typeof (imageFile as Blob).arrayBuffer === 'function' &&
      typeof (imageFile as Blob).size === 'number' &&
      (imageFile as Blob).size > 0
    ) {
      const file = imageFile as File;
      imageBuffer = Buffer.from(await file.arrayBuffer());
      imageMime = file.type || 'image/jpeg';
      imageName = file.name || null;
    }

    await initDatabase(getDBPath());
    const db = getDb(getDBPath());
    const repo = new SunlightPlanRepository(db);

    const planFingerprint = createFingerprint(normalized.data);
    repo.upsertPlan({
      communityUrl,
      community,
      city,
      district,
      planJson: normalized.data,
      planFingerprint,
      imageBuffer,
      imageMime,
      imageName,
    });

    return Response.json({ success: true, data: { communityUrl, planFingerprint } });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}

// ─── DELETE：删除指定小区的采光方案 ───────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const communityUrl = searchParams.get('communityUrl')?.trim() ?? '';
    if (!communityUrl) {
      return Response.json({ success: false, error: '缺少 communityUrl 参数' }, { status: 400 });
    }

    await initDatabase(getDBPath());
    const db = getDb(getDBPath());
    const repo = new SunlightPlanRepository(db);
    const deleted = repo.deleteByCommunityUrl(communityUrl);

    return Response.json({ success: deleted });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
