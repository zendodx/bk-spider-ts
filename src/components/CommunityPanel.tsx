'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useCityContext } from '@/lib/CityContext';

interface CommunityStatRow {
  community: string;
  province: string;
  city: string;
  district: string;
  community_url: string | null;
  /** 所属板块（用户手工维护，未维护为 null） */
  bizcircle: string | null;
  latest_date: string;
  first_date: string;
  crawl_days: number;
  listing_count: number;
  total_unique: number;
  avg_unit_price: number | null;
  median_unit_price: number | null;
  min_unit_price: number | null;
  max_unit_price: number | null;
  avg_total_price: number | null;
  min_total_price: number | null;
  max_total_price: number | null;
}

type OrderBy = 'listing_count' | 'total_unique' | 'avg_unit_price' | 'latest_date' | 'community' | 'crawl_days';

export interface SunlightTarget {
  communityUrl: string;
  community: string;
  city: string;
  district: string;
}

/** 跳转到其他面板时携带的小区信息 */
export interface CommunityActionTarget {
  community: string;
  /** 该小区最新采集日期（房源列表用） */
  crawlDate?: string;
}

interface CommunityPanelProps {
  onOpenSunlightAnalysis?: (target: SunlightTarget) => void;
  onOpenListings?: (target: CommunityActionTarget) => void;
  onOpenStats?: (target: CommunityActionTarget) => void;
  onOpenFavorites?: (target: CommunityActionTarget) => void;
  onOpenSpider?: (target: CommunityActionTarget) => void;
  onOpenExpired?: (target: CommunityActionTarget) => void;
}

const ORDER_OPTIONS: { value: `${OrderBy}|${'asc' | 'desc'}`; label: string }[] = [
  { value: 'listing_count|desc',  label: '挂牌数 ↓ 最多' },
  { value: 'listing_count|asc',   label: '挂牌数 ↑ 最少' },
  { value: 'avg_unit_price|desc', label: '均价 ↓ 最高' },
  { value: 'avg_unit_price|asc',  label: '均价 ↑ 最低' },
  { value: 'total_unique|desc',   label: '历史房源 ↓ 最多' },
  { value: 'latest_date|desc',    label: '最新采集 ↓ 最近' },
  { value: 'latest_date|asc',     label: '最新采集 ↑ 最早' },
  { value: 'crawl_days|desc',     label: '采集天数 ↓ 最多' },
  { value: 'community|asc',       label: '小区名 A→Z' },
];

function today(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10);
}

// 最新采集日距今徽章
function LatestBadge({ latestDate }: { latestDate: string }) {
  const todayStr = today();
  const diff = Math.round(
    (new Date(todayStr + 'T00:00:00').getTime() - new Date(latestDate + 'T00:00:00').getTime())
    / (1000 * 60 * 60 * 24)
  );
  if (diff === 0) return <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">今天</span>;
  if (diff <= 3)  return <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{diff}天前</span>;
  if (diff <= 14) return <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">{diff}天前</span>;
  return <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500 font-medium">{diff}天前</span>;
}

// 可排序列头
function SortTh({
  label,
  col,
  currentCol,
  currentOrder,
  onClick,
  className = '',
}: {
  label: string;
  col: OrderBy;
  currentCol: OrderBy;
  currentOrder: 'asc' | 'desc';
  onClick: (col: OrderBy) => void;
  className?: string;
}) {
  const active = currentCol === col;
  return (
    <th
      className={`px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${className}`}
      onClick={() => onClick(col)}
    >
      <span className="flex items-center gap-0.5 justify-inherit">
        {label}
        <span className={`ml-0.5 text-xs ${active ? 'text-blue-500' : 'text-gray-300'}`}>
          {active ? (currentOrder === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </span>
    </th>
  );
}

// ===== 编辑小区基本信息弹窗 =====
interface CommunityInfoForm {
  bizcircle: string;
  address: string;
  build_year: string;
  developer: string;
  property_company: string;
  note: string;
}

const EMPTY_INFO_FORM: CommunityInfoForm = {
  bizcircle: '', address: '', build_year: '', developer: '', property_company: '', note: '',
};

function EditCommunityModal({
  row,
  onClose,
  onSaved,
}: {
  row: CommunityStatRow;
  onClose: () => void;
  onSaved: (bizcircle: string) => void;
}) {
  const [form, setForm]       = useState<CommunityInfoForm>(EMPTY_INFO_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  // 打开时加载已维护的小区信息
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/community/info?community=${encodeURIComponent(row.community)}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        if (json.success && json.data) {
          const d = json.data;
          setForm({
            bizcircle:        d.bizcircle ?? '',
            address:          d.address ?? '',
            build_year:       d.build_year ?? '',
            developer:        d.developer ?? '',
            property_company: d.property_company ?? '',
            note:             d.note ?? '',
          });
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [row.community]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/community/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ community: row.community, ...form }),
      });
      const json = await res.json();
      if (json.success) {
        onSaved(form.bizcircle.trim());
      } else {
        setError(json.error ?? '保存失败');
      }
    } catch (e) {
      setError(`请求异常: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const fields: { key: keyof Omit<CommunityInfoForm, 'note'>; label: string; placeholder: string }[] = [
    { key: 'bizcircle',        label: '所属板块', placeholder: '如：汉峪板块' },
    { key: 'address',          label: '小区地址', placeholder: '如：历下区经十路 12345 号' },
    { key: 'build_year',       label: '建筑年代', placeholder: '如：2005 或 1998-2005' },
    { key: 'developer',        label: '开发商',   placeholder: '如：中海地产' },
    { key: 'property_company', label: '物业公司', placeholder: '如：中海物业' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 flex-shrink-0">
          <div>
            <span className="text-base font-semibold text-gray-700">✏️ 编辑小区信息</span>
            <p className="text-xs text-gray-400 mt-0.5">
              {row.community}（{[row.city, row.district].filter(Boolean).join(' / ') || '未知地区'}）
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          >✕</button>
        </div>

        {/* 内容区 */}
        <div className="px-5 py-4 overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center text-sm text-gray-400">加载中...</div>
          ) : (
            <div className="space-y-3">
              {fields.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                  <input
                    type="text"
                    value={form[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">备注</label>
                <textarea
                  value={form.note}
                  onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="其他需要记录的信息..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >取消</button>
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="px-4 py-1.5 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >{saving ? '保存中...' : '💾 保存'}</button>
        </div>
      </div>
    </div>
  );
}

export default function CommunityPanel({ onOpenSunlightAnalysis, onOpenListings, onOpenStats, onOpenFavorites, onOpenSpider, onOpenExpired }: CommunityPanelProps) {
  const { selectedCityFilter } = useCityContext();
  const [keyword, setKeyword]     = useState('');
  const [inputKeyword, setInputKeyword] = useState('');
  const [sortKey, setSortKey]     = useState<`${OrderBy}|${'asc'|'desc'}`>('listing_count|desc');
  const [limit, setLimit]         = useState(200);

  const [rows, setRows]           = useState<CommunityStatRow[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [total, setTotal]         = useState(0);
  const [queried, setQueried]     = useState(false);

  // 编辑小区基本信息弹窗
  const [editingCommunity, setEditingCommunity] = useState<CommunityStatRow | null>(null);

  // 所属板块筛选
  const [bizcircle, setBizcircle] = useState('');
  const [bizcircleOptions, setBizcircleOptions] = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [orderBy, order] = sortKey.split('|') as [OrderBy, 'asc' | 'desc'];

  const fetchData = useCallback(async (kw: string, ob: OrderBy, od: string, lim: number, bc: string, cityFilter?: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ orderBy: ob, order: od, limit: String(lim) });
      if (kw) params.set('keyword', kw);
      if (bc) params.set('bizcircle', bc);
      const cf = cityFilter ?? selectedCityFilter;
      if (cf) params.set('city', cf);
      const res  = await fetch(`/api/community/stats?${params}`);
      const json = await res.json();
      if (json.success) {
        setRows(json.data ?? []);
        setTotal(json.total ?? 0);
        setBizcircleOptions(json.bizcircles ?? []);
        setQueried(true);
      } else {
        setError(json.error ?? '查询失败');
      }
    } catch (e) {
      setError(`请求异常: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [selectedCityFilter]);

  // 首次加载
  useEffect(() => {
    fetchData('', 'listing_count', 'desc', 200, '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  // 排序/limit/板块筛选 变化时重新查询
  useEffect(() => {
    if (!queried) return;
    fetchData(keyword, orderBy, order, limit, bizcircle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, limit, bizcircle, selectedCityFilter]);

  // 关键词防抖查询
  const handleKeywordChange = (val: string) => {
    setInputKeyword(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setKeyword(val);
      fetchData(val, orderBy, order, limit, bizcircle);
    }, 400);
  };

  const handleSortClick = (col: OrderBy) => {
    const newOrder = orderBy === col && order === 'desc' ? 'asc' : 'desc';
    setSortKey(`${col}|${newOrder}`);
  };

  // 格式化
  const fmtUnit  = (v: number | null) => v == null ? '—' : Math.round(Number(v) * 10000).toLocaleString();
  const fmtPrice = (v: number | null) => v == null ? '—' : Number(v).toFixed(1);

  // 汇总统计
  const totalListings  = rows.reduce((s, r) => s + r.listing_count, 0);
  const totalHistorical = rows.reduce((s, r) => s + r.total_unique, 0);
  const validPrices    = rows.map(r => r.avg_unit_price).filter((v): v is number => v != null);
  const overallAvgUnit = validPrices.length
    ? Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length * 10000)
    : null;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ===== 筛选栏 ===== */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex flex-wrap items-end gap-4">
          {/* 关键词搜索 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">小区关键词</label>
            <div className="relative">
              <input
                type="text"
                value={inputKeyword}
                onChange={e => handleKeywordChange(e.target.value)}
                placeholder="模糊搜索小区名..."
                className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-52 pr-8"
              />
              {inputKeyword && (
                <button
                  onClick={() => handleKeywordChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                >✕</button>
              )}
            </div>
          </div>

          {/* 排序 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">排序方式</label>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as typeof sortKey)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {ORDER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 所属板块筛选 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">所属板块</label>
            <select
              value={bizcircle}
              onChange={e => setBizcircle(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">全部板块</option>
              {bizcircleOptions.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* 条数限制 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">最多显示</label>
            <select
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {[50, 100, 200, 500, 1000].map(n => (
                <option key={n} value={n}>{n} 条</option>
              ))}
            </select>
          </div>

          {/* 刷新 */}
          <div className="flex items-end">
            <button
              onClick={() => fetchData(keyword, orderBy, order, limit, bizcircle)}
              disabled={loading}
              className="px-5 py-2 bg-blue-500 text-white text-sm font-semibold rounded-md hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  加载中...
                </>
              ) : '🔄 刷新'}
            </button>
          </div>
        </div>
      </div>

      {/* ===== 内容区 ===== */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {/* 错误 */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">❌ {error}</div>
        )}

        {/* 加载中 */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <svg className="animate-spin h-6 w-6 mr-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">加载小区数据...</span>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <>
            {/* 汇总卡片 */}
            <div className="mb-4 flex flex-wrap gap-3">
              <div className="px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2.5">
                <span className="text-xl">🏘️</span>
                <div>
                  <div className="text-xs font-semibold text-blue-700">小区总数</div>
                  <div className="text-lg font-bold text-blue-600">{total}</div>
                </div>
              </div>
              <div className="px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2.5">
                <span className="text-xl">📋</span>
                <div>
                  <div className="text-xs font-semibold text-green-700">当前挂牌（合计）</div>
                  <div className="text-lg font-bold text-green-600">{totalListings.toLocaleString()} 套</div>
                </div>
              </div>
              <div className="px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center gap-2.5">
                <span className="text-xl">📚</span>
                <div>
                  <div className="text-xs font-semibold text-indigo-700">历史房源（合计）</div>
                  <div className="text-lg font-bold text-indigo-600">{totalHistorical.toLocaleString()} 套</div>
                </div>
              </div>
              {overallAvgUnit != null && (
                <div className="px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2.5">
                  <span className="text-xl">💰</span>
                  <div>
                    <div className="text-xs font-semibold text-orange-700">均价均值（跨小区）</div>
                    <div className="text-lg font-bold text-orange-600">{overallAvgUnit.toLocaleString()} 元/平</div>
                  </div>
                </div>
              )}
              {rows.length < total && (
                <div className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 flex items-center">
                  显示前 {rows.length} 条，共 {total} 个小区
                </div>
              )}
            </div>

            {/* 表格 */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-xs table-fixed">
                <colgroup>
                  <col className="w-8" />           {/* # */}
                  <col className="w-40" />           {/* 小区 */}
                  <col className="w-28" />           {/* 地区 */}
                  <col className="w-24" />           {/* 所属板块 */}
                  <col className="w-24" />           {/* 最新采集 */}
                  <col className="w-20" />           {/* 采集天数 */}
                  <col className="w-20" />           {/* 挂牌数 */}
                  <col className="w-20" />           {/* 历史房源 */}
                  <col className="w-24" />           {/* 均价 */}
                  <col className="w-24" />           {/* 中位价 */}
                  <col className="w-24" />           {/* 均总价 */}
                  <col className="w-32" />           {/* 总价区间 */}
                  <col className="w-72" />           {/* 操作 */}
                </colgroup>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-500">#</th>
                    <SortTh label="小区" col="community" currentCol={orderBy} currentOrder={order} onClick={handleSortClick} className="text-left" />
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">地区</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">所属板块</th>
                    <SortTh label="最新采集" col="latest_date" currentCol={orderBy} currentOrder={order} onClick={handleSortClick} className="text-center" />
                    <SortTh label="采集天数" col="crawl_days" currentCol={orderBy} currentOrder={order} onClick={handleSortClick} className="text-center" />
                    <SortTh label="当前挂牌" col="listing_count" currentCol={orderBy} currentOrder={order} onClick={handleSortClick} className="text-center" />
                    <SortTh label="历史房源" col="total_unique" currentCol={orderBy} currentOrder={order} onClick={handleSortClick} className="text-center" />
                    <SortTh label={`均价\n(元/平)`} col="avg_unit_price" currentCol={orderBy} currentOrder={order} onClick={handleSortClick} className="text-right bg-orange-50" />
                    <th className="px-3 py-2.5 text-right font-semibold text-gray-500 whitespace-nowrap bg-orange-50">
                      中位价<br /><span className="font-normal text-gray-400">(元/平)</span>
                    </th>
                    <th className="px-3 py-2.5 text-right font-semibold text-gray-500 whitespace-nowrap bg-blue-50">
                      均总价<br /><span className="font-normal text-gray-400">(万)</span>
                    </th>
                    <th className="px-3 py-2.5 text-right font-semibold text-gray-500 whitespace-nowrap bg-blue-50">
                      总价区间<br /><span className="font-normal text-gray-400">(万)</span>
                    </th>
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-500 whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row, idx) => (
                    <tr key={row.community} className="hover:bg-blue-50/20 transition-colors">
                      {/* 序号 */}
                      <td className="px-3 py-2.5 text-gray-400 text-right">{idx + 1}</td>

                      {/* 小区名 */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {row.community_url ? (
                            <a
                              href={row.community_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-blue-600 hover:underline truncate"
                              title={row.community}
                            >
                              {row.community}
                            </a>
                          ) : (
                            <span className="font-medium text-gray-800 truncate" title={row.community}>
                              {row.community}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 地区 */}
                      <td className="px-3 py-2.5 text-gray-500 truncate" title={[row.city, row.district].filter(Boolean).join(' ')}>
                        {row.district || row.city || '—'}
                      </td>

                      {/* 所属板块 */}
                      <td className="px-3 py-2.5 text-gray-500 truncate" title={row.bizcircle ?? ''}>
                        {row.bizcircle || '—'}
                      </td>

                      {/* 最新采集 */}
                      <td className="px-3 py-2.5 text-center">
                        <div className="font-mono text-gray-700 text-xs">{row.latest_date}</div>
                        <LatestBadge latestDate={row.latest_date} />
                      </td>

                      {/* 采集天数 */}
                      <td className="px-3 py-2.5 text-center">
                        <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                          {row.crawl_days} 天
                        </span>
                      </td>

                      {/* 当前挂牌数 */}
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold ${
                          row.listing_count >= 100 ? 'bg-green-100 text-green-700'
                          : row.listing_count >= 30 ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                        }`}>
                          {row.listing_count}
                        </span>
                      </td>

                      {/* 历史房源数 */}
                      <td className="px-3 py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">
                          {row.total_unique}
                        </span>
                      </td>

                      {/* 均价 */}
                      <td className="px-3 py-2.5 text-right font-semibold text-orange-700 bg-orange-50/30 whitespace-nowrap">
                        {fmtUnit(row.avg_unit_price)}
                      </td>

                      {/* 中位价 */}
                      <td className="px-3 py-2.5 text-right text-orange-600 bg-orange-50/20 whitespace-nowrap">
                        {fmtUnit(row.median_unit_price)}
                      </td>

                      {/* 均总价 */}
                      <td className="px-3 py-2.5 text-right font-semibold text-blue-700 bg-blue-50/30 whitespace-nowrap">
                        {fmtPrice(row.avg_total_price)}
                      </td>

                      {/* 总价区间 */}
                      <td className="px-3 py-2.5 text-right text-gray-500 bg-blue-50/20 whitespace-nowrap">
                        {row.min_total_price != null && row.max_total_price != null
                          ? `${fmtPrice(row.min_total_price)} ~ ${fmtPrice(row.max_total_price)}`
                          : '—'}
                      </td>

                      {/* 操作：房源列表 / 价格统计 / 房源收藏 / 爬虫采集 / 采光分析 */}
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          <button
                            onClick={() => onOpenListings?.({ community: row.community, crawlDate: row.latest_date })}
                            className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium whitespace-nowrap transition-colors"
                            title="查看该小区的房源列表"
                          >
                            🏘️ 房源
                          </button>
                          <button
                            onClick={() => onOpenExpired?.({ community: row.community })}
                            className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 font-medium whitespace-nowrap transition-colors"
                            title="查看该小区的失效房源"
                          >
                            🏚️ 失效
                          </button>
                          <button
                            onClick={() => onOpenStats?.({ community: row.community })}
                            className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 hover:bg-green-100 font-medium whitespace-nowrap transition-colors"
                            title="查看该小区的价格统计"
                          >
                            📊 统计
                          </button>
                          <button
                            onClick={() => onOpenFavorites?.({ community: row.community })}
                            className="px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100 font-medium whitespace-nowrap transition-colors"
                            title="查看该小区的收藏房源"
                          >
                            ⭐ 收藏
                          </button>
                          <button
                            onClick={() => onOpenSpider?.({ community: row.community })}
                            className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium whitespace-nowrap transition-colors"
                            title="跳转爬虫采集，自动填入该小区"
                          >
                            🕷️ 采集
                          </button>
                          {row.community_url ? (
                            <button
                              onClick={() => onOpenSunlightAnalysis?.({
                                communityUrl: row.community_url as string,
                                community: row.community,
                                city: row.city,
                                district: row.district,
                              })}
                              className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium whitespace-nowrap transition-colors"
                              title="进入采光分析"
                            >
                              ☀️ 采光
                            </button>
                          ) : (
                            <span className="px-1.5 py-0.5 text-gray-300" title="该小区缺少链接，暂不支持采光分析">☀️ —</span>
                          )}
                          <button
                            onClick={() => setEditingCommunity(row)}
                            className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium whitespace-nowrap transition-colors"
                            title="编辑该小区的基本信息（板块/地址/建筑年代等）"
                          >
                            ✏️ 编辑
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 空状态 */}
        {!loading && queried && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-6xl mb-4">🔍</span>
            <p className="text-lg font-medium text-gray-600">未找到匹配的小区</p>
            <p className="text-sm mt-1">尝试修改关键词或先运行爬虫采集数据</p>
          </div>
        )}

        {/* 编辑小区基本信息弹窗 */}
        {editingCommunity && (
          <EditCommunityModal
            row={editingCommunity}
            onClose={() => setEditingCommunity(null)}
            onSaved={(bizcircle) => {
              setRows(prev => prev.map(r =>
                r.community === editingCommunity.community ? { ...r, bizcircle: bizcircle || null } : r
              ));
              setEditingCommunity(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
