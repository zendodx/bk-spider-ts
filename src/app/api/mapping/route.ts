/**
 * 小区映射 API
 * GET /api/mapping - 获取映射
 * POST /api/mapping - 保存映射
 */

import { NextRequest } from 'next/server';
import fs from 'fs';
import { getMappingFile, getResourcesDir } from '@/lib/settings';

export async function GET() {
  try {
    const mappingFile = getMappingFile();

    if (!fs.existsSync(mappingFile)) {
      return Response.json({ success: true, data: {} });
    }

    const content = fs.readFileSync(mappingFile, 'utf-8');
    const data = JSON.parse(content);
    return Response.json({ success: true, data });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { data } = await request.json();

    const resourcesDir = getResourcesDir();
    if (!fs.existsSync(resourcesDir)) {
      fs.mkdirSync(resourcesDir, { recursive: true });
    }

    const mappingFile = getMappingFile();
    fs.writeFileSync(mappingFile, JSON.stringify(data, null, 2), 'utf-8');

    return Response.json({ success: true, message: '映射已保存' });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
