'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/** 返回今天的日期字符串 YYYY-MM-DD（本地时区） */
function today(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10);
}

// ===== 确认删除弹窗 =====
function ConfirmModal({
  community,
  dateFrom,
  dateTo,
  count,
  onConfirm,
  onCancel,
}: {
  community: string;
  dateFrom: string;
  dateTo: string;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
          <span className="text-xl">⚠️</span>
          <h3 className="text-base font-semibold text-gray-800">确认删除</h3>
        </div>
        <div className="px-6 py-5 space-y-3 text-sm text-gray-700">
          <p>即将删除以下条件的房源数据：</p>
          <ul className="space-y-1.5 bg-red-50 rounded-lg px-4 py-3 text-red-800 text-xs leading-6">
            <li><span className="font-medium">小区：</span>{community}</li>
            <li><span className="font-medium">日期范围：</span>
              {dateFrom} {dateTo && dateFrom !== dateTo ? `~ ${dateTo}` : ''}
            </li>
            <li><span className="font-medium">共计：</span>
              <span className="font-bold text-red-600 text-sm">{count.toLocaleString()}</span> 条记录
            </li>
          </ul>
          <p className="text-gray-500 text-xs">此操作不可撤销，请谨慎操作。</p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors font-medium"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 操作结果提示 =====
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all
      ${type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
      <span>{type === 'success' ? '✅' : '❌'}</span>
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 text-gray-400 hover:text-gray-600 text-base leading-none">✕</button>
    </div>
  );
}

// ===== 主组件 =====
export default function CleanerPanel() {
  const [community, setCommunity]   = useState('');
  const [dateFrom,  setDateFrom]    = useState(today());
  const [dateTo,    setDateTo]      = useState(today());

  // 小区搜索建议
  const [suggestions, setSuggestions]     = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestRef = useRef<HTMLDivElement>(null);

  // 预览结果
  const [previewCount,   setPreviewCount]   = useState<number | null>(null);
  const [previewing,     setPreviewing]     = useState(false);
  const [previewError,   setPreviewError]   = useState('');

  // 删除状态
  const [showConfirm,    setShowConfirm]    = useState(false);
  const [deleting,       setDeleting]       = useState(false);

  // 历史操作记录
  const [logs, setLogs] = useState<{ time: string; msg: string; type: 'success' | 'error' }[]>([]);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 点击外部关闭建议列表
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 搜索小区建议
  const fetchSuggestions = useCallback(async (keyword: string) => {
    if (!keyword.trim()) { setSuggestions([]); return; }
    try {
      const res = await fetch(`/api/community/search?keyword=${encodeURIComponent(keyword)}&limit=20`);
      const json = await res.json();
      if (json.success) setSuggestions(json.data as string[]);
    } catch {
      setSuggestions([]);
    }
  }, []);

  // 预览满足条件的数量
  const handlePreview = useCallback(async () => {
    if (!community.trim()) {
      setPreviewError('请填写小区名称');
      return;
    }
    setPreviewing(true);
    setPreviewError('');
    setPreviewCount(null);
    try {
      const params = new URLSearchParams({ community: community.trim(), dateFrom, dateTo });
      const res  = await fetch(`/api/cleaner/listings?${params}`);
      const json = await res.json();
      if (json.success) {
        setPreviewCount(json.count as number);
      } else {
        setPreviewError(json.error ?? '查询失败');
      }
    } catch (e) {
      setPreviewError(`请求异常: ${e}`);
    } finally {
      setPreviewing(false);
    }
  }, [community, dateFrom, dateTo]);

  // 执行删除
  const handleDelete = useCallback(async () => {
    setShowConfirm(false);
    setDeleting(true);
    try {
      const res  = await fetch('/api/cleaner/listings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ community: community.trim(), dateFrom, dateTo }),
      });
      const json = await res.json();
      const now  = new Date().toLocaleTimeString('zh-CN');
      if (json.success) {
        const msg = `已删除「${community}」${dateFrom}${dateTo !== dateFrom ? `~${dateTo}` : ''} 共 ${json.deleted} 条`;
        setLogs(prev => [{ time: now, msg, type: 'success' }, ...prev]);
        setToast({ message: msg, type: 'success' });
        setPreviewCount(null);
      } else {
        const msg = `删除失败：${json.error}`;
        setLogs(prev => [{ time: now, msg, type: 'error' }, ...prev]);
        setToast({ message: msg, type: 'error' });
      }
    } catch (e) {
      const msg = `请求异常: ${e}`;
      setToast({ message: msg, type: 'error' });
    } finally {
      setDeleting(false);
    }
  }, [community, dateFrom, dateTo]);

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* 标题 */}
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧹</span>
          <div>
            <h2 className="text-lg font-bold text-gray-800">数据清洗</h2>
            <p className="text-xs text-gray-400 mt-0.5">删除指定小区在某时间范围内采集的房源数据</p>
          </div>
        </div>

        {/* 功能卡片 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <span className="text-base">🗑️</span>
            <h3 className="text-sm font-semibold text-gray-700">按小区 + 日期范围删除房源</h3>
          </div>

          <div className="px-5 py-5 space-y-4">
            {/* 小区名称 */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">小区名称 <span className="text-red-400">*</span></label>
              <div className="relative" ref={suggestRef}>
                <input
                  type="text"
                  value={community}
                  onChange={e => {
                    setCommunity(e.target.value);
                    setPreviewCount(null);
                    fetchSuggestions(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                  placeholder="输入小区名称，支持模糊匹配"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {suggestions.map(s => (
                      <button
                        key={s}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 transition-colors"
                        onMouseDown={() => {
                          setCommunity(s);
                          setShowSuggestions(false);
                          setPreviewCount(null);
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 日期范围 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600">开始日期</label>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo}
                  onChange={e => { setDateFrom(e.target.value); setPreviewCount(null); }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600">结束日期</label>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  onChange={e => { setDateTo(e.target.value); setPreviewCount(null); }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>
            </div>

            {/* 快捷日期按钮 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400">快捷：</span>
              {[
                { label: '今天', from: today(), to: today() },
                { label: '昨天', from: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10); })(), to: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10); })() },
                { label: '近7天', from: (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10); })(), to: today() },
                { label: '近30天', from: (() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10); })(), to: today() },
              ].map(btn => (
                <button
                  key={btn.label}
                  onClick={() => { setDateFrom(btn.from); setDateTo(btn.to); setPreviewCount(null); }}
                  className="px-2.5 py-1 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* 错误提示 */}
            {previewError && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <span>❌</span>{previewError}
              </p>
            )}

            {/* 预览结果 */}
            {previewCount !== null && (
              <div className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm
                ${previewCount === 0 ? 'bg-gray-50 text-gray-500' : 'bg-orange-50 text-orange-800 border border-orange-200'}`}>
                <span>{previewCount === 0 ? 'ℹ️' : '⚠️'}</span>
                <span>
                  符合条件的房源：
                  <strong className={previewCount > 0 ? 'text-orange-600' : ''}>{previewCount.toLocaleString()}</strong> 条
                  {previewCount > 0 && <span className="text-xs ml-1 text-orange-500">（删除后不可恢复）</span>}
                </span>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handlePreview}
                disabled={previewing || !community.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {previewing ? (
                  <><span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />查询中…</>
                ) : (
                  <><span>🔍</span>预览数量</>
                )}
              </button>

              <button
                onClick={() => {
                  if (!community.trim()) { setPreviewError('请填写小区名称'); return; }
                  if (previewCount === null) { setPreviewError('请先点击「预览数量」确认要删除的记录数'); return; }
                  if (previewCount === 0) { setPreviewError('没有符合条件的数据，无需删除'); return; }
                  setPreviewError('');
                  setShowConfirm(true);
                }}
                disabled={deleting || previewCount === null || previewCount === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? (
                  <><span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />删除中…</>
                ) : (
                  <><span>🗑️</span>执行删除</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 操作日志 */}
        {logs.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <span>📋</span>操作记录
              </span>
              <button
                onClick={() => setLogs([])}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                清空
              </button>
            </div>
            <ul className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
              {logs.map((log, i) => (
                <li key={i} className="px-5 py-2.5 flex items-start gap-3 text-xs">
                  <span className="text-gray-400 whitespace-nowrap font-mono">{log.time}</span>
                  <span className={log.type === 'success' ? 'text-green-700' : 'text-red-600'}>{log.msg}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 确认弹窗 */}
      {showConfirm && previewCount !== null && (
        <ConfirmModal
          community={community}
          dateFrom={dateFrom}
          dateTo={dateTo}
          count={previewCount}
          onConfirm={handleDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* Toast 提示 */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
