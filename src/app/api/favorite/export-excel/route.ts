/**
 * 收藏房源导出 Excel API
 * POST /api/favorite/export-excel
 * Body: { rows: FavoriteRow[], includeNote?: boolean }
 *
 * 说明：备注列读取每行的 row.note 字段。
 * 该字段由前端在导出前已将 house_note 表的房源备注注入到 note 中。
 */

import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import type { FavoriteRow } from '@/lib/pdf/FavoritesPdfTemplate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 格式化工具
const fmtUnit = (v: number | null) =>
  v == null ? '' : (Number(v) * 10000).toFixed(0);

const fmtPrice = (v: number | null) =>
  v == null ? '' : Number(v).toFixed(2);

const fmtArea = (v: number | null) =>
  v == null ? '' : Number(v).toFixed(1);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rows, includeNote } = body as {
      rows: FavoriteRow[];
      includeNote?: boolean;
    };

    if (!rows || !Array.isArray(rows)) {
      return Response.json({ success: false, error: '数据格式错误' }, { status: 400 });
    }

    // ── 构造表头行 ──
    const headers = [
      '序号', '小区', '标题', '省', '市', '区',
      '户型', '面积(㎡)', '楼层', '朝向', '楼龄(年)',
      '单价(元/㎡)', '总价(万)',
      '链接', '收藏时间',
    ];
    if (includeNote) headers.push('备注');

    // ── 构造数据行 ──
    const dataRows = rows.map((row, i) => {
      const cells: (string | number)[] = [
        i + 1,
        row.community || '',
        row.title || '',
        row.province || '',
        row.city || '',
        row.district || '',
        row.house_type || '',
        fmtArea(row.area),
        row.floor_info || '',
        row.orientation || '',
        row.build_year ?? '',
        fmtUnit(row.unit_price),
        fmtPrice(row.total_price),
        row.detail_url || '',
        row.created_at
          ? new Date(row.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
          : '',
      ];
      if (includeNote) cells.push(row.note || '');
      return cells;
    });

    // ── 构造工作表 ──
    const wsData = [headers, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // ── 列宽自适应 ──
    const colWidths = headers.map((h, colIdx) => {
      const maxLen = wsData.reduce((max, row) => {
        const cell = row[colIdx];
        const len = cell == null ? 0 : String(cell).length;
        return Math.max(max, len);
      }, h.length);
      return { wch: Math.min(Math.max(maxLen + 2, 8), 60) };
    });
    ws['!cols'] = colWidths;

    // ── 冻结首行 ──
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    // ── 创建工作簿 ──
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '收藏房源');

    // ── 写入 Buffer ──
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    // ── 文件名 ──
    const dateStr = new Date()
      .toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
      .replace(/[: ]/g, '-')
      .slice(0, 16);
    const filename = `收藏房源_${dateStr}.xlsx`;

    return new Response(xlsxBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(xlsxBuffer.byteLength),
      },
    });
  } catch (e) {
    console.error('[export-excel] error:', e);
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
