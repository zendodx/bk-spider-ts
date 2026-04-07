/**
 * 数据库连接测试 API
 * POST /api/db/test
 */

import { NextRequest } from 'next/server';
import { testConnection, initDatabase, resetDb } from '@/lib/db/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const dbPath: string | undefined = body.dbPath;

    // 如果传入了新路径，先重置当前实例再测试
    if (dbPath) {
      resetDb();
    }

    const connected = await testConnection(dbPath);

    if (!connected) {
      return Response.json({
        success: false,
        message: '数据库连接失败，请检查路径是否可写',
      });
    }

    // 连接成功后初始化表结构
    await initDatabase(dbPath);

    return Response.json({
      success: true,
      message: '数据库连接成功，表结构已初始化',
    });
  } catch (e) {
    return Response.json({ success: false, message: String(e) }, { status: 500 });
  }
}
