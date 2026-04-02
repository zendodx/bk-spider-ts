/**
 * 数据导出 API
 * POST /api/export
 */

import { NextRequest } from 'next/server';
import { DataExporter } from '@/lib/exporter';
import { getDataDir } from '@/lib/settings';
import { HouseRawData } from '@/lib/spider/parser';

export async function POST(request: NextRequest) {
  try {
    const { data, sug, format, outputDir } = await request.json();

    if (!data || !Array.isArray(data)) {
      return Response.json({ success: false, error: '数据格式错误' }, { status: 400 });
    }

    const exporter = new DataExporter(outputDir || getDataDir());
    const results: Record<string, string> = {};

    if (format === 'excel' || format === 'both') {
      const path = exporter.toExcel(data as HouseRawData[], sug || '导出数据');
      results.excel = path;
    }

    if (format === 'csv' || format === 'both') {
      const path = exporter.toCsv(data as HouseRawData[], sug || '导出数据');
      results.csv = path;
    }

    return Response.json({ success: true, paths: results });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
