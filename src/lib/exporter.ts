/**
 * 数据导出工具（Excel / CSV）
 * 对应原 Python 项目 utils/exporters.py
 */

import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { HouseRawData } from './spider/parser';

export class DataExporter {
  constructor(private outputDir: string) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  /**
   * 导出为 Excel
   */
  toExcel(data: HouseRawData[], filenamePrefix: string): string {
    if (data.length === 0) return '';

    // 移除内部字段（以 _ 开头）
    const cleanData = data.map(item => {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item)) {
        if (!k.startsWith('_')) {
          cleaned[k] = v;
        }
      }
      return cleaned;
    });

    const ws = XLSX.utils.json_to_sheet(cleanData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const date = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10).replace(/-/g, '');
    const filename = `${filenamePrefix}_${date}.xlsx`;
    const filepath = path.join(this.outputDir, filename);

    XLSX.writeFile(wb, filepath);
    return filepath;
  }

  /**
   * 导出为 CSV
   */
  toCsv(data: HouseRawData[], filenamePrefix: string): string {
    if (data.length === 0) return '';

    // 移除内部字段
    const cleanData = data.map(item => {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item)) {
        if (!k.startsWith('_')) {
          cleaned[k] = v;
        }
      }
      return cleaned;
    });

    const ws = XLSX.utils.json_to_sheet(cleanData);
    const csv = XLSX.utils.sheet_to_csv(ws);

    const date = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10).replace(/-/g, '');
    const filename = `${filenamePrefix}_${date}.csv`;
    const filepath = path.join(this.outputDir, filename);

    // 添加 BOM 以支持 Excel 正确打开中文
    const bom = '\uFEFF';
    fs.writeFileSync(filepath, bom + csv, 'utf-8');

    return filepath;
  }
}
