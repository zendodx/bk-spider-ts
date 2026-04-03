/**
 * 图片代理 API — 绕过贝壳 CDN 的 Referer 防盗链
 * GET /api/proxy/image?url=https://...
 *
 * 服务端发起请求时不带 Referer，CDN 不会拦截，
 * 然后将图片字节流直接透传给前端。
 */

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 只允许代理贝壳相关域名，防止被滥用为开放代理
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url') ?? '';

  if (!imageUrl) {
    return new Response('缺少 url 参数', { status: 400 });
  }

  if (!isAllowed(imageUrl)) {
    return new Response('不允许代理该域名', { status: 403 });
  }

  try {
    const upstream = await fetch(imageUrl, {
      headers: {
        // 模拟从贝壳网站本身发出的请求，绕过防盗链
        'Referer': 'https://www.ke.com/',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });

    if (!upstream.ok) {
      return new Response(`上游返回 ${upstream.status}`, { status: upstream.status });
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
    const buffer = await upstream.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // 缓存 1 天
      },
    });
  } catch (e) {
    return new Response(`代理请求失败: ${e}`, { status: 500 });
  }
}
