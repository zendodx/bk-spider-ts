'use client';

import { useState, useEffect, useCallback } from 'react';

type BackupMode = 'plain' | 'zip' | 'zip_enc';

interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
}

interface BackupResult {
  ok: boolean;
  message: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

const MODE_OPTIONS: { value: BackupMode; label: string; icon: string; desc: string }[] = [
  {
    value: 'plain',
    label: '直接备份',
    icon: '📄',
    desc: '直接复制 .db 文件，速度最快，文件最大',
  },
  {
    value: 'zip',
    label: '无加密 ZIP',
    icon: '📦',
    desc: '压缩为 .zip 文件，体积更小，无密码保护',
  },
  {
    value: 'zip_enc',
    label: '加密 ZIP',
    icon: '🔐',
    desc: '压缩并加密为 .zip 文件，需设置解压密码',
  },
];

export default function BackupPanel() {
  const [mode, setMode] = useState<BackupMode>('zip');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [dbPath, setDbPath] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BackupResult | null>(null);
  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  /** 加载已有备份文件列表 */
  const loadBackupFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const res = await fetch('/api/backup');
      const json = await res.json();
      if (json.success) setBackupFiles(json.data || []);
    } catch {
      // 忽略加载失败
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackupFiles();
    // 加载当前数据库路径
    fetch('/api/settings')
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data?.dbPath) {
          setDbPath(res.data.dbPath);
        }
      })
      .catch(() => {});
  }, [loadBackupFiles]);

  /** 执行备份 */
  const handleBackup = async () => {
    if (mode === 'zip_enc' && !password.trim()) {
      setResult({ ok: false, message: '加密模式下必须填写密码' });
      return;
    }

    setIsRunning(true);
    setResult(null);

    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          password: password.trim(),
          dbPath: dbPath.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setResult({ ok: false, message: json.error || `请求失败 (${res.status})` });
        return;
      }

      // 触发浏览器下载
      const contentDisposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = contentDisposition.match(/filename="(.+?)"/);
      const filename = filenameMatch ? filenameMatch[1] : 'backup';

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setResult({ ok: true, message: `备份成功：${filename}` });
      // 刷新文件列表
      await loadBackupFiles();
    } catch (e) {
      setResult({ ok: false, message: `备份失败：${e}` });
    } finally {
      setIsRunning(false);
    }
  };

  /** 下载已有备份文件 */
  const handleDownload = async (filename: string) => {
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 通过特殊参数让后端直接返回已存在的文件
        body: JSON.stringify({ mode: '__download__', filename }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      // 忽略
    }
  };

  /** 删除备份文件 */
  const handleDelete = async (filename: string) => {
    if (!confirm(`确定要删除备份文件 "${filename}" 吗？`)) return;
    setDeletingFile(filename);
    try {
      const res = await fetch('/api/backup', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const json = await res.json();
      if (json.success) {
        await loadBackupFiles();
      } else {
        alert(`删除失败：${json.error}`);
      }
    } catch (e) {
      alert(`删除失败：${e}`);
    } finally {
      setDeletingFile(null);
    }
  };

  const selectedMode = MODE_OPTIONS.find(m => m.value === mode)!;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* 页面标题 */}
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">💾</span>
          <div>
            <h2 className="text-base font-bold text-gray-800">数据备份</h2>
            <p className="text-xs text-gray-500 mt-0.5">将当前 SQLite 数据库备份到本地，支持压缩和加密</p>
          </div>
        </div>

        {/* 备份配置 */}
        <section className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 space-y-4">
          <h3 className="text-sm font-bold text-gray-700">📋 备份配置</h3>

          {/* 数据库路径 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              数据库文件路径
              <span className="ml-1 text-gray-400 font-normal">（留空使用系统默认路径）</span>
            </label>
            <input
              type="text"
              value={dbPath}
              onChange={e => setDbPath(e.target.value)}
              placeholder="默认: ~/bk_spider_data/bk_spider.db"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          {/* 备份方式选择 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">备份方式</label>
            <div className="grid grid-cols-3 gap-3">
              {MODE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setMode(opt.value); setResult(null); }}
                  className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border-2 transition-all text-center ${
                    mode === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-xl">{opt.icon}</span>
                  <span className="text-xs font-semibold">{opt.label}</span>
                  <span className="text-xs text-gray-400 leading-tight">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 密码输入（仅加密模式显示）*/}
          {mode === 'zip_enc' && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                解压密码 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="请输入解压密码（备份后请妥善保存）"
                  className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                  title={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                <span>⚠️</span>
                加密密码丢失后将无法解压，请务必记录保存
              </p>
            </div>
          )}

          {/* 当前选择摘要 */}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md text-xs text-gray-500">
            <span>{selectedMode.icon}</span>
            <span>当前选择：<strong className="text-gray-700">{selectedMode.label}</strong>，{selectedMode.desc}</span>
          </div>
        </section>

        {/* 操作按钮 & 结果 */}
        <section className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBackup}
              disabled={isRunning}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-blue-500 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isRunning ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  备份中...
                </>
              ) : (
                <>💾 立即备份并下载</>
              )}
            </button>

            {result && (
              <div className={`flex items-center gap-1.5 text-sm ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
                <span>{result.ok ? '✅' : '❌'}</span>
                <span>{result.message}</span>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 mt-2">
            备份文件会同时保存到 <code className="bg-gray-100 px-1 rounded">~/bk_spider_data/backups/</code> 目录，文件名包含时间戳
          </p>
        </section>

        {/* 历史备份文件列表 */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <span>🗂️</span> 历史备份文件
              {backupFiles.length > 0 && (
                <span className="text-xs font-normal text-gray-400">（共 {backupFiles.length} 个）</span>
              )}
            </h3>
            <button
              onClick={loadBackupFiles}
              disabled={filesLoading}
              className="text-xs text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {filesLoading ? (
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : '🔄'}
              刷新
            </button>
          </div>

          {filesLoading && backupFiles.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">加载中...</div>
          ) : backupFiles.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              <div className="text-3xl mb-2">📭</div>
              暂无备份文件，点击上方「立即备份」开始第一次备份
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {/* 表头 */}
              <div className="grid grid-cols-[2fr_1fr_2fr_auto] gap-3 px-5 py-2 bg-gray-50 text-xs font-semibold text-gray-500">
                <span>文件名</span>
                <span>大小</span>
                <span>备份时间</span>
                <span>操作</span>
              </div>
              {backupFiles.map(file => (
                <div
                  key={file.name}
                  className="grid grid-cols-[2fr_1fr_2fr_auto] gap-3 px-5 py-3 items-center text-sm hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base flex-shrink-0">
                      {file.name.endsWith('.zip') ? '📦' : '📄'}
                    </span>
                    <span
                      className="text-gray-700 truncate font-mono text-xs"
                      title={file.name}
                    >
                      {file.name}
                    </span>
                    {file.name.includes('_enc') && (
                      <span className="flex-shrink-0 text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                        🔐 加密
                      </span>
                    )}
                  </div>
                  <span className="text-gray-500 text-xs whitespace-nowrap">
                    {formatSize(file.size)}
                  </span>
                  <span className="text-gray-400 text-xs whitespace-nowrap">
                    {formatDate(file.modifiedAt)}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleDownload(file.name)}
                      className="text-xs text-blue-500 hover:text-blue-700 transition-colors whitespace-nowrap"
                      title="下载此备份文件"
                    >
                      ⬇ 下载
                    </button>
                    <button
                      onClick={() => handleDelete(file.name)}
                      disabled={deletingFile === file.name}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors whitespace-nowrap disabled:opacity-50"
                      title="删除此备份文件"
                    >
                      {deletingFile === file.name ? '删除中...' : '🗑 删除'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 说明 */}
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1.5">
          <p className="font-semibold flex items-center gap-1">📌 备份说明</p>
          <ul className="space-y-1 text-amber-700 list-disc list-inside">
            <li>备份期间会暂时读取数据库文件，如有爬虫正在运行，建议先暂停</li>
            <li>备份文件同时存储在 <code className="bg-amber-100 px-1 rounded">~/bk_spider_data/backups/</code></li>
            <li>加密 ZIP 使用系统 <code className="bg-amber-100 px-1 rounded">zip</code> 命令的标准加密，解压时需在 macOS Finder 或 7-Zip 中输入密码</li>
            <li>文件名包含时间戳（格式：<code className="bg-amber-100 px-1 rounded">YYYYMMDD_HHMMSS</code>），方便区分不同时间点的备份</li>
          </ul>
        </section>

      </div>
    </div>
  );
}
