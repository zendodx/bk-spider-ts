'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useCityContext } from '@/lib/CityContext';

interface SummaryResult {
  summary: string;
  baseDate: string;
  inventoryCount: number;
  expiredCount: number;
  notesCount: number;
  latencyMs: number;
  /** 记录 ID（历史记录/新生成的都有） */
  recordId: number | null;
  /** 分析生成时间 */
  createdAt: string;
  /** true = 查看的历史记录；false = 本次新生成 */
  isHistory: boolean;
}

/** 历史记录（与 community_ai_analysis 表结构对应） */
interface AnalysisRecord {
  id: number;
  community: string;
  city: string;
  base_date: string;
  inventory_count: number;
  expired_count: number;
  notes_count: number;
  summary: string;
  latency_ms: number;
  created_at: string;
}

/** 行内 **加粗** 渲染 */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-semibold text-gray-800">{p.slice(2, -2)}</strong>
      : p
  );
}

/** 轻量 Markdown 渲染：标题 / 列表 / 加粗 / 空行 */
function MarkdownView({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed text-gray-600 space-y-1">
      {text.split('\n').map((line, i) => {
        const t = line.trim();
        const h = t.match(/^(#{1,4})\s+(.*)$/);
        if (h) {
          const level = h[1].length;
          const cls = level <= 2
            ? 'text-base font-bold text-gray-800 mt-4 mb-1'
            : 'text-sm font-bold text-gray-700 mt-3 mb-1';
          return <div key={i} className={cls}>{renderInline(h[2])}</div>;
        }
        if (/^[-*]\s+/.test(t)) {
          return (
            <div key={i} className="pl-4 flex gap-1.5">
              <span className="text-gray-400">•</span>
              <span className="flex-1">{renderInline(t.replace(/^[-*]\s+/, ''))}</span>
            </div>
          );
        }
        if (/^\d+\.\s+/.test(t)) {
          return <div key={i} className="pl-4">{renderInline(t)}</div>;
        }
        if (t === '') return <div key={i} className="h-2" />;
        return <div key={i}>{renderInline(t)}</div>;
      })}
    </div>
  );
}

export default function AiSummaryPanel() {
  const { selectedCityFilter } = useCityContext();

  // 小区搜索 combobox
  const [community, setCommunity]             = useState('');
  const [communityKeyword, setCommunityKeyword] = useState('');
  const [communityOptions, setCommunityOptions] = useState<string[]>([]);
  const [communityDropdownOpen, setCommunityDropdownOpen] = useState(false);
  const communityRef = useRef<HTMLDivElement>(null);

  // 结果
  const [result, setResult]   = useState<SummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // 历史分析记录
  const [history, setHistory]         = useState<AnalysisRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deletingId, setDeletingId]   = useState<number | null>(null);

  // 防抖查询小区候选
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const _cq = selectedCityFilter ? `&city=${encodeURIComponent(selectedCityFilter)}` : '';
        const url = communityKeyword
          ? `/api/community/search?keyword=${encodeURIComponent(communityKeyword)}&limit=30${_cq}`
          : `/api/community/search?limit=30${_cq}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.success) setCommunityOptions(json.data ?? []);
      } catch {
        setCommunityOptions([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [communityKeyword, selectedCityFilter]);

  // 点击外部关闭下拉
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (communityRef.current && !communityRef.current.contains(e.target as Node)) {
        setCommunityDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /** 查看一条历史记录 */
  const viewRecord = useCallback((rec: AnalysisRecord) => {
    setResult({
      summary: rec.summary,
      baseDate: rec.base_date,
      inventoryCount: rec.inventory_count,
      expiredCount: rec.expired_count,
      notesCount: rec.notes_count,
      latencyMs: rec.latency_ms,
      recordId: rec.id,
      createdAt: rec.created_at,
      isHistory: true,
    });
    setError('');
  }, []);

  /** 拉取历史分析记录；autoViewLatest=true 时自动展示最近一条（避免重复分析） */
  const fetchHistory = useCallback(async (c: string, autoViewLatest: boolean) => {
    if (!c.trim()) { setHistory([]); return; }
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/ai/summary?community=${encodeURIComponent(c.trim())}`);
      const json = await res.json();
      if (json.success) {
        const list = (json.data ?? []) as AnalysisRecord[];
        setHistory(list);
        if (autoViewLatest && list.length > 0) viewRecord(list[0]);
      }
    } catch { /* 忽略历史加载失败 */ }
    finally { setHistoryLoading(false); }
  }, [viewRecord]);

  const handleGenerate = async () => {
    const c = community.trim();
    if (!c) {
      setError('请输入或选择小区名称');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          community: c,
          ...(selectedCityFilter ? { city: selectedCityFilter } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        setResult({
          summary: d.summary,
          baseDate: d.baseDate,
          inventoryCount: d.inventoryCount,
          expiredCount: d.expiredCount,
          notesCount: d.notesCount,
          latencyMs: d.latencyMs,
          recordId: d.id ?? null,
          createdAt: d.createdAt ?? '',
          isHistory: false,
        });
        // 刷新历史列表（新生成的会出现在最上面）
        fetchHistory(c, false);
      } else {
        setError(json.error ?? '生成失败');
      }
    } catch (e) {
      setError(`请求异常: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除这条分析记录？')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/ai/summary?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setHistory(prev => prev.filter(r => r.id !== id));
        if (result?.recordId === id) setResult(null);
      } else {
        alert(json.error ?? '删除失败');
      }
    } catch (e) {
      alert(`请求异常: ${e}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="h-full overflow-auto px-6 py-5">
      {/* 头部说明 */}
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <span>🧭</span>购房决策 AI 分析
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          先分析在架库存，再分析失效（卖出/下架）房源，最后结合手记真实价格给出购房判断；分析结果自动保存，选择小区即展示最近一次分析
        </p>
      </div>

      {/* 查询条件 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative" ref={communityRef}>
            <label className="block text-xs font-medium text-gray-600 mb-1">小区名称</label>
            <input
              type="text"
              value={community}
              onChange={e => {
                setCommunity(e.target.value);
                setCommunityKeyword(e.target.value);
                setCommunityDropdownOpen(true);
              }}
              onFocus={() => { setCommunityKeyword(community); setCommunityDropdownOpen(true); }}
              onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); }}
              placeholder="输入小区名搜索..."
              className="w-64 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {communityDropdownOpen && communityOptions.length > 0 && (
              <ul className="absolute z-20 mt-1 w-64 max-h-60 overflow-auto bg-white border border-gray-200 rounded-md shadow-lg">
                {communityOptions.map(opt => (
                  <li
                    key={opt}
                    onClick={() => {
                      setCommunity(opt);
                      setCommunityDropdownOpen(false);
                      // 选中小区：自动加载最近一次分析，避免重复调用 AI
                      fetchHistory(opt, true);
                    }}
                    className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50 ${opt === community ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                  >
                    {opt}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-6 py-2 text-white text-sm font-semibold rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 bg-blue-500 hover:bg-blue-600"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                AI 分析中...
              </>
            ) : '🤖 生成购房分析'}
          </button>
        </div>
        {loading && (
          <p className="text-xs text-gray-400 mt-2">正在聚合库存与失效房源数据并调用 AI 生成三段式分析，通常需要 20~90 秒，请耐心等待...</p>
        )}
      </div>

      {/* 错误 */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">❌ {error}</div>
      )}

      {/* 历史分析记录 */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-600">🕘 历史分析（{history.length}）</span>
            {historyLoading && <span className="text-xs text-gray-400">刷新中...</span>}
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {history.map(rec => (
              <div
                key={rec.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                  result?.recordId === rec.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
                }`}
                onClick={() => viewRecord(rec)}
              >
                <span className="font-mono text-gray-500">{rec.created_at}</span>
                <span className="text-gray-400">库存 {rec.inventory_count} · 失效 {rec.expired_count} · 手记 {rec.notes_count}</span>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(rec.id); }}
                  disabled={deletingId === rec.id}
                  className="ml-auto text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                  title="删除这条记录"
                >
                  {deletingId === rec.id ? '…' : '🗑️'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 结果 */}
      {result && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 rounded-t-xl bg-blue-50/60">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              🧭 AI 购房决策分析
              {result.isHistory
                ? <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 text-xs font-normal">历史记录</span>
                : <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-600 text-xs font-normal">新分析</span>}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {result.createdAt && `生成于 ${result.createdAt} · `}基准日 {result.baseDate} · 库存 {result.inventoryCount} 套 · 失效 {result.expiredCount} 套 · 手记 {result.notesCount} 条
              </span>
              {result.isHistory && (
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="px-2.5 py-1 text-xs text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50 disabled:opacity-50 transition-colors whitespace-nowrap"
                  title="基于最新数据重新生成分析"
                >
                  🔄 重新分析
                </button>
              )}
            </div>
          </div>
          <div className="px-5 py-4">
            <MarkdownView text={result.summary} />
          </div>
        </div>
      )}

      {/* 空状态 */}
      {!result && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-300">
          <span className="text-6xl mb-4">🤖</span>
          <p className="text-sm text-gray-400">选择小区后自动展示最近一次分析；点击「生成购房分析」获取最新报告</p>
        </div>
      )}
    </div>
  );
}
