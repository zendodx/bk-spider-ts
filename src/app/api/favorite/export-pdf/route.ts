/**
 * 收藏房源导出 PDF API
 * POST /api/favorite/export-pdf
 * Body: { rows: FavoriteRow[], filterDesc?: string }
 */

import { NextRequest } from 'next/server';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { FavoritesPdfDocument, FavoriteRow } from '@/lib/pdf/FavoritesPdfTemplate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 允许代理的域名（与 /api/proxy/image 保持一致）
const ALLOWED_HOSTS = [
  'img.ljcdn.com',
  'pic.kblimg.com',
  'ke.com',
  'beike.com',
  'ljcdn.com',
  'kblimg.com',
];

function isAllowed(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname;
    return ALLOWED_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

/**
 * 将图片 URL 抓取为 base64 data URL
 * 失败时静默返回 null，不影响 PDF 生成
 */
async function fetchImageAsDataUrl(imageUrl: string): Promise<string | null> {
  if (!imageUrl || !isAllowed(imageUrl)) return null;
  try {
    const res = await fetch(imageUrl, {
      headers: {
        'Referer': 'https://www.ke.com/',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      // 超时控制（Node 18+ signal）
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rows, filterDesc, includeNote } = body as {
      rows: FavoriteRow[];
      filterDesc?: string;
      includeNote?: boolean;
    };

    if (!rows || !Array.isArray(rows)) {
      return Response.json({ success: false, error: '数据格式错误' }, { status: 400 });
    }

    // 并发预拉取所有图片（限制并发数避免超时）
    const CONCURRENCY = 5;
    const imageDataUrls: (string | null)[] = new Array(rows.length).fill(null);

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const batch = rows.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(row =>
          row.header_image ? fetchImageAsDataUrl(row.header_image) : Promise.resolve(null)
        )
      );
      for (let j = 0; j < results.length; j++) {
        imageDataUrls[i + j] = results[j];
      }
    }

    // 将 image_data 注入到行数据中
    const rowsWithImages: FavoriteRow[] = rows.map((row, i) => ({
      ...row,
      image_data: imageDataUrls[i] ?? undefined,
    }));

    const generatedAt = new Date().toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    // 渲染 PDF 到 Buffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(
      React.createElement(FavoritesPdfDocument, {
        rows: rowsWithImages,
        generatedAt,
        filterDesc,
        includeNote: includeNote ?? false,
      }) as any
    );

    // 生成文件名
    const dateStr = new Date()
      .toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
      .replace(/[: ]/g, '-')
      .replace('T', '_')
      .slice(0, 16);
    const filename = `收藏房源_${dateStr}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(pdfBuffer.byteLength),
      },
    });
  } catch (e) {
    console.error('[export-pdf] error:', e);
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
