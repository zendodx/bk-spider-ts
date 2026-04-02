/**
 * 数据库连接测试 API
 * POST /api/db/test
 */

import { NextRequest } from 'next/server';
import { testConnection, initDatabase } from '@/lib/db/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const config = body.config;

    const connected = await testConnection(config);

    if (!connected) {
      return Response.json({
        success: false,
        message: '数据库连接失败，请检查配置',
      });
    }

    // 如果连接成功，初始化数据库表
    await initDatabase(config);

    return Response.json({
      success: true,
      message: '数据库连接成功，表结构已初始化',
    });
  } catch (e) {
    return Response.json({ success: false, message: String(e) }, { status: 500 });
  }
}
