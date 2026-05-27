/**
 * 数据备份 API
 * POST /api/backup  - 执行备份，返回备份文件的下载流
 * GET  /api/backup  - 查询备份目录下已有的备份文件列表
 *
 * 支持三种备份方式：
 *   plain   - 直接复制 .db 文件
 *   zip     - 无加密 zip 压缩
 *   zip_enc - AES 加密 zip 压缩（调用系统 zip 命令）
 */

import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getDBPath } from '@/lib/settings';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 备份文件存放目录 */
function getBackupDir(): string {
  return path.join(os.homedir(), 'bk_spider_data', 'backups');
}

/** 生成带时间戳的备份文件名 */
function buildTimestamp(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

// ─────────────────────────────────────────────
// GET /api/backup  — 列出已有备份文件
// ─────────────────────────────────────────────
export async function GET() {
  try {
    const backupDir = getBackupDir();
    if (!fs.existsSync(backupDir)) {
      return Response.json({ success: true, data: [] });
    }

    const files = fs
      .readdirSync(backupDir)
      .filter(f => /\.(db|zip)$/.test(f))
      .map(f => {
        const fullPath = path.join(backupDir, f);
        const stat = fs.statSync(fullPath);
        return {
          name: f,
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

    return Response.json({ success: true, data: files });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// POST /api/backup  — 执行备份并返回下载流
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const {
    mode = 'plain',        // 'plain' | 'zip' | 'zip_enc' | '__download__'
    password = '',
    dbPath: dbPathParam,
    filename: downloadFilename,
  } = body as { mode?: string; password?: string; dbPath?: string; filename?: string };

  // ── 下载已有备份文件 ──────────────────────────────
  if (mode === '__download__') {
    if (!downloadFilename) {
      return Response.json({ success: false, error: '缺少 filename 参数' }, { status: 400 });
    }
    const backupDir = getBackupDir();
    const fullPath = path.resolve(backupDir, downloadFilename);
    if (!fullPath.startsWith(backupDir + path.sep)) {
      return Response.json({ success: false, error: '非法路径' }, { status: 403 });
    }
    if (!fs.existsSync(fullPath)) {
      return Response.json({ success: false, error: '文件不存在' }, { status: 404 });
    }
    const fileBuffer = fs.readFileSync(fullPath);
    const contentType = downloadFilename.endsWith('.zip') ? 'application/zip' : 'application/octet-stream';
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${downloadFilename}"`,
        'Content-Length': String(fileBuffer.length),
      },
    });
  }

  const srcDb = dbPathParam || getDBPath();

  if (!fs.existsSync(srcDb)) {
    return Response.json(
      { success: false, error: `数据库文件不存在: ${srcDb}` },
      { status: 400 }
    );
  }

  if (mode === 'zip_enc' && !password) {
    return Response.json(
      { success: false, error: '加密模式必须提供密码' },
      { status: 400 }
    );
  }

  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const ts = buildTimestamp();
  const dbBaseName = path.basename(srcDb, '.db');

  try {
    if (mode === 'plain') {
      // ── 直接复制 ──────────────────────────────────
      const destName = `${dbBaseName}_backup_${ts}.db`;
      const destPath = path.join(backupDir, destName);
      fs.copyFileSync(srcDb, destPath);

      const fileBuffer = fs.readFileSync(destPath);
      return new Response(fileBuffer, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${destName}"`,
          'Content-Length': String(fileBuffer.length),
        },
      });

    } else if (mode === 'zip') {
      // ── 无加密 zip ────────────────────────────────
      const zipName = `${dbBaseName}_backup_${ts}.zip`;
      const zipPath = path.join(backupDir, zipName);

      await execFileAsync('zip', ['-j', zipPath, srcDb]);

      const fileBuffer = fs.readFileSync(zipPath);
      return new Response(fileBuffer, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${zipName}"`,
          'Content-Length': String(fileBuffer.length),
        },
      });

    } else if (mode === 'zip_enc') {
      // ── 加密 zip（调用系统 zip 命令，-e 标准 ZipCrypto 加密）──
      const zipName = `${dbBaseName}_backup_${ts}_enc.zip`;
      const zipPath = path.join(backupDir, zipName);

      // 使用 --password 参数传递密码（非交互式）
      await execFileAsync('zip', ['-j', '--password', password, zipPath, srcDb]);

      const fileBuffer = fs.readFileSync(zipPath);
      return new Response(fileBuffer, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${zipName}"`,
          'Content-Length': String(fileBuffer.length),
        },
      });

    } else {
      return Response.json({ success: false, error: `未知备份模式: ${mode}` }, { status: 400 });
    }

  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// DELETE /api/backup  — 删除指定备份文件
// ─────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const { filename } = await request.json();
    if (!filename || typeof filename !== 'string') {
      return Response.json({ success: false, error: '缺少 filename 参数' }, { status: 400 });
    }

    // 安全检查：只允许删除备份目录内的文件，防止路径穿越
    const backupDir = getBackupDir();
    const fullPath = path.resolve(backupDir, filename);
    if (!fullPath.startsWith(backupDir + path.sep)) {
      return Response.json({ success: false, error: '非法路径' }, { status: 403 });
    }

    if (!fs.existsSync(fullPath)) {
      return Response.json({ success: false, error: '文件不存在' }, { status: 404 });
    }

    fs.unlinkSync(fullPath);
    return Response.json({ success: true, message: `已删除 ${filename}` });
  } catch (e) {
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
