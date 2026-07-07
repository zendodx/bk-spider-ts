'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ===== 失效房源数据类型 =====
interface ExpiredListingRow {
  id: number;
  title: string;
  header_image: string | null;
  province: string;
  city: string;
  district: string;
  community: string;
  floor_info: string | null;
  build_year: number | null;
  house_type: string | null;
  area: number | null;
  orientation: string | null;
  total_price: number | null;
  unit_price: number | null;
  tags: string | null;
  detail_url: string | null;
  follow_count: number;
  publish_time: string | null;
  /** 最后一次出现的采集日期 YYYY-MM-DD */
  last_seen_date: string;
  /** 最后一次出现的采集时间 YYYY-MM-DD HH:mm */
  last_crawl_time: string;
  /** 首次出现的采集日期 YYYY-MM-DD */
  first_seen_date: string;
  /** 历史上出现的总天数（去重按采集日） */
  appear_count: number;
}

const HOUSE_TYPE_OPTIONS = [
  { value: '', label: '全部户型' },
  { value: '1室', label: '1室' },
  { value: '2室', label: '2室' },
  { value: '3室', label: '3室' },
  { value: '4室', label: '4室' },
  { value: '5室', label: '5室' },
];

const ORDER_OPTIONS = [
  { value: 'last_seen_date|desc', label: '最后出现 ↓ 最新' },
  { value: 'last_seen_date|asc',  label: '最后出现 ↑ 最早' },
  { value: 'unit_price|asc',      label: '单价 ↑ 升序' },
  { value: 'unit_price|desc',     label: '单价 ↓ 降序' },
  { value: 'total_price|asc',     label: '总价 ↑ 升序' },
  { value: 'total_price|desc',    label: '总价 ↓ 降序' },
  { value: 'area|asc',            label: '面积 ↑ 升序' },
  { value: 'area|desc',           label: '面积 ↓ 降序' },
];

function today(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10);
}

// ===== 图片预览弹窗 =====
function ImageModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <p className="text-sm font-medium text-gray-700 truncate pr-4" title={title}>{title || '房源缩略图'}</p>
          <button onClick={onClose} className="flex-shrink-0 text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="flex items-center justify-center bg-gray-100 p-4 min-h-[240px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/proxy/image?url=${encodeURIComponent(url)}`}
            alt={title}
            className="max-w-full max-h-[60vh] object-contain rounded"
            onError={e => {
              (e.currentTarget as HTMLImageElement).src =
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150' viewBox='0 0 200 150'%3E%3Crect fill='%23f3f4f6' width='200' height='150'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-size='14'%3E%E5%9B%BE%E7%89%87%E5%8A%A0%E8%BD%BD%E5%A4%B1%E8%B4%A5%3C/text%3E%3C/svg%3E";
            }}
          />
        </div>
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline break-all">{url}</a>
        </div>
      </div>
    </div>
  );
}

// ===== 自定义日历选择器（带绿点标记）=====
function DatePickerWithDots({
  value,
  onChange,
  activeDates,
  label,
}: {
  value: string;
  onChange: (date: string) => void;
  activeDates: Set<string>;
  label?: string;
}) {
  const [viewYear, setViewYear]   = useState(() => {
    const d = value ? new Date(value + 'T00:00:00') : new Date();
    return d.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const d = value ? new Date(value + 'T00:00:00') : new Date();
    return d.getMonth();
  });
  const [open, setOpen]           = useState(false);
  const containerRef              = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const buildCalendar = () => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const startOffset = (firstDay + 6) % 7;
    const cells: (number | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10);
  const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); };
  const cells = buildCalendar();
  const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
  const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white flex items-center gap-2 min-w-[136px]"
      >
        <span className="text-gray-700 font-mono">{value || label || '选择日期'}</span>
        <svg className="ml-auto h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 w-64 select-none">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-gray-100 text-gray-500">‹</button>
            <span className="text-sm font-semibold text-gray-700">{viewYear} 年 {MONTH_NAMES[viewMonth]}</span>
            <button
              type="button"
              onClick={nextMonth}
              disabled={`${viewYear}-${pad(viewMonth + 1)}` >= todayStr.slice(0, 7)}
              className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
            >›</button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {WEEK_LABELS.map(l => <div key={l} className="text-center text-xs text-gray-400 py-0.5">{l}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, idx) => {
              if (day === null) return <div key={idx} />;
              const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
              const isSelected = dateStr === value;
              const isToday    = dateStr === todayStr;
              const isFuture   = dateStr > todayStr;
              const hasDot     = activeDates.has(dateStr);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isFuture}
                  onClick={() => { onChange(dateStr); setOpen(false); }}
                  className={`relative flex flex-col items-center justify-center rounded-md py-1 text-xs transition-colors
                    ${isSelected ? 'bg-blue-500 text-white font-semibold'
                      : isToday   ? 'bg-blue-50 text-blue-600 font-semibold'
                      : isFuture  ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-gray-100'}
                  `}
                >
                  <span>{day}</span>
                  {hasDot && (
                    <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isSelected ? 'bg-green-200' : 'bg-green-500'}`} />
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100 flex justify-end">
            <button type="button" onClick={() => { onChange(todayStr); setOpen(false); }} className="text-xs text-blue-500 hover:underline">今天</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 失效天数徽章 =====
function DaysAgoBadge({ lastSeenDate }: { lastSeenDate: string }) {
  const todayStr = today();
  const last = new Date(lastSeenDate + 'T00:00:00');
  const now  = new Date(todayStr + 'T00:00:00');
  const days = Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

  if (days <= 0) return <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">今天</span>;
  if (days <= 7)  return <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">{days}天前</span>;
  if (days <= 30) return <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{days}天前</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">{days}天前</span>;
}

export default function ExpiredListingsPanel() {
  // 筛选条件
  const [community, setCommunity]     = useState('');
  const [baseDate, setBaseDate]       = useState(today());
  const [houseType, setHouseType]     = useState('');
  const [excludeBasement, setExcludeBasement] = useState(true);
  const [excludeLowFloor, setExcludeLowFloor] = useState(true);
  const [excludeTwoFloor, setExcludeTwoFloor] = useState(false);
  const [excludeOneFloor, setExcludeOneFloor] = useState(false);
  const [areaEnabled, setAreaEnabled] = useState(false);
  const [areaMin, setAreaMin]         = useState('');
  const [areaMax, setAreaMax]         = useState('');
  const [sortKey, setSortKey]         = useState('last_seen_date|desc');
  const [limit, setLimit]             = useState(500);

  // 小区搜索
  const [communityKeyword, setCommunityKeyword] = useState('');
  const [communityOptions, setCommunityOptions] = useState<string[]>([]);
  const [communityDropdownOpen, setCommunityDropdownOpen] = useState(false);
  const [communityLoading, setCommunityLoading] = useState(false);
  const communityRef = useRef<HTMLDivElement>(null);

  // 结果
  const [rows, setRows]       = useState<ExpiredListingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [queried, setQueried] = useState(false);
  const [actualBaseDate, setActualBaseDate] = useState('');
  const [latestCount, setLatestCount] = useState(0);

  // 有数据的日期集合（用于日历绿点）
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());

  // 图片弹窗
  const [imgModal, setImgModal] = useState<{ url: string; title: string } | null>(null);

  // 展开图片的行
  const [expandedImgRows, setExpandedImgRows] = useState<Set<number>>(new Set());

  // 当 community 变化时拉取有数据的日期
  useEffect(() => {
    const c = community.trim();
    if (!c) { setActiveDates(new Set()); return; }
    let cancelled = false;
    fetch(`/api/listings/dates?community=${encodeURIComponent(c)}`)
      .then(r => r.json())
      .then(json => {
        if (!cancelled && json.success) setActiveDates(new Set(json.dates as string[]));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [community]);

  // 防抖查询小区候选
  useEffect(() => {
    const timer = setTimeout(async () => {
      setCommunityLoading(true);
      try {
        const url = communityKeyword
          ? `/api/community/search?keyword=${encodeURIComponent(communityKeyword)}&limit=30`
          : `/api/community/search?limit=30`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.success) setCommunityOptions(json.data ?? []);
      } catch {
        setCommunityOptions([]);
      } finally {
        setCommunityLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [communityKeyword]);

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

  const handleQuery = useCallback(async () => {
    if (!community.trim()) {
      setError('请输入或选择小区名称');
      return;
    }
    setLoading(true);
    setError('');
    setQueried(true);
    setRows([]);
    setActualBaseDate('');
    setLatestCount(0);

    try {
      const [orderBy, order] = sortKey.split('|');
      const params = new URLSearchParams({
        community: community.trim(),
        excludeBasement: String(excludeBasement),
        excludeLowFloor: String(excludeLowFloor),
        excludeTwoFloor: String(excludeTwoFloor),
        excludeOneFloor: String(excludeOneFloor),
        orderBy,
        order,
        limit: String(limit),
      });
      if (baseDate) params.set('baseDate', baseDate);
      if (houseType) params.set('houseType', houseType);
      if (areaEnabled) {
        const mn = parseFloat(areaMin);
        const mx = parseFloat(areaMax);
        if (!isNaN(mn)) params.set('areaMin', String(mn));
        if (!isNaN(mx)) params.set('areaMax', String(mx));
      }

      const res  = await fetch(`/api/listings/expired?${params}`);
      const json = await res.json();
      if (json.success) {
        setRows(json.data ?? []);
        setActualBaseDate(json.baseDate ?? '');
        setLatestCount(json.latestCount ?? 0);
      } else {
        setError(json.error ?? '查询失败');
      }
    } catch (e) {
      setError(`请求异常: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [community, baseDate, houseType, excludeBasement, excludeLowFloor, excludeTwoFloor, excludeOneFloor, sortKey, limit, areaEnabled, areaMin, areaMax]);

  // 格式化
  const fmtUnit  = (v: number | null) => {
    if (v == null) return '-';
    const n = Number(v);
    return isNaN(n) ? '-' : `${(n * 10000).toFixed(0)}`;
  };
  const fmtPrice = (v: number | null) => {
    if (v == null) return '-';
    const n = Number(v);
    return isNaN(n) ? '-' : n.toFixed(2);
  };
  const fmtArea  = (v: number | null) => {
    if (v == null) return '-';
    const n = Number(v);
    return isNaN(n) ? '-' : n.toFixed(1);
  };

  // 按最后出现时间分组
  const groupedRows = (() => {
    const groups: Record<string, ExpiredListingRow[]> = {};
    rows.forEach(row => {
      const key = row.last_seen_date;
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });
    // 按日期排序（倒序：最近的在前）
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  })();

  const showGrouped = sortKey.startsWith('last_seen_date');

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ===== 图片弹窗 ===== */}
      {imgModal && (
        <ImageModal url={imgModal.url} title={imgModal.title} onClose={() => setImgModal(null)} />
      )}

      {/* ===== 筛选条件区 ===== */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex flex-wrap items-end gap-4">

          {/* 小区搜索 */}
          <div ref={communityRef} className="relative" style={{ minWidth: 240 }}>
            <label className="block text-xs font-medium text-gray-600 mb-1">小区名称 *</label>
            <div className="relative">
              <input
                type="text"
                value={communityKeyword}
                onChange={e => {
                  setCommunityKeyword(e.target.value);
                  setCommunity(e.target.value);
                  setCommunityDropdownOpen(true);
                }}
                onFocus={() => setCommunityDropdownOpen(true)}
                placeholder="输入关键词搜索小区..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
              />
              {communityLoading && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2">
                  <svg className="animate-spin h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </span>
              )}
            </div>
            {communityDropdownOpen && communityOptions.length > 0 && (
              <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                {communityOptions.map(name => (
                  <li
                    key={name}
                    onMouseDown={() => {
                      setCommunityKeyword(name);
                      setCommunity(name);
                      setCommunityDropdownOpen(false);
                    }}
                    className="px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 基准日期（最新采集日） */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">基准日期（最新采集日）</label>
            <DatePickerWithDots
              value={baseDate}
              onChange={setBaseDate}
              activeDates={activeDates}
              label="自动最新"
            />
            <p className="text-xs text-gray-400 mt-0.5">以此日期在售房源为基准，历史上出现但此日期不存在的即为失效</p>
          </div>

          {/* 户型 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">户型</label>
            <select
              value={houseType}
              onChange={e => setHouseType(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {HOUSE_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 过滤选项 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">过滤选项</label>
            <div className="flex flex-wrap gap-3 items-center">
              {[
                { label: '排除地下室', value: excludeBasement, setter: setExcludeBasement },
                { label: '排除共3层楼', value: excludeLowFloor, setter: setExcludeLowFloor },
                { label: '排除共2层楼', value: excludeTwoFloor, setter: setExcludeTwoFloor },
                { label: '排除共1层楼', value: excludeOneFloor, setter: setExcludeOneFloor },
              ].map(item => (
                <label key={item.label} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={item.value}
                    onChange={e => item.setter(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 accent-blue-500"
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          {/* 面积区间 */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1 cursor-pointer">
              <input
                type="checkbox"
                checked={areaEnabled}
                onChange={e => setAreaEnabled(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 accent-blue-500"
              />
              面积区间 (㎡)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={areaMin}
                onChange={e => setAreaMin(e.target.value)}
                disabled={!areaEnabled}
                placeholder="最小"
                className="w-20 px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
              />
              <span className="text-gray-400 text-sm">-</span>
              <input
                type="number"
                value={areaMax}
                onChange={e => setAreaMax(e.target.value)}
                disabled={!areaEnabled}
                placeholder="最大"
                className="w-20 px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
              />
            </div>
          </div>

          {/* 排序 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">排序方式</label>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {ORDER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 数量限制 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">最多条数</label>
            <select
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {[100, 200, 500, 1000, 2000].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* 查询按钮 */}
          <div className="flex items-end">
            <button
              onClick={handleQuery}
              disabled={loading}
              className="px-6 py-2 bg-orange-500 text-white text-sm font-semibold rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  查询中...
                </>
              ) : '🔍 查询失效房源'}
            </button>
          </div>
        </div>
      </div>

      {/* ===== 结果区 ===== */}
      <div className="flex-1 overflow-auto px-6 py-4">

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">❌ {error}</div>
        )}

        {/* 空状态 */}
        {!loading && !error && queried && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-6xl mb-4">🎉</span>
            <p className="text-lg font-medium text-gray-600">没有发现失效房源！</p>
            <p className="text-sm mt-1">
              {actualBaseDate
                ? `以 ${actualBaseDate} 为基准，该小区所有历史房源均在当天仍有挂牌`
                : '该小区暂无历史数据'}
            </p>
          </div>
        )}

        {/* 初始状态 */}
        {!queried && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-6xl mb-4">🏚️</span>
            <p className="text-lg font-medium text-gray-600">失效房源查询</p>
            <p className="text-sm mt-2 text-center max-w-md">
              汇总某小区的所有历史房源，与最新采集日的房源对比，<br />
              筛选出最新采集中不再出现的房源，标记其最后一次出现时间。
            </p>
          </div>
        )}

        {/* 加载中 */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <svg className="animate-spin h-6 w-6 mr-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">正在查询失效房源...</span>
          </div>
        )}

        {/* 结果汇总 */}
        {!loading && rows.length > 0 && (
          <>
            {/* 摘要信息 */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="px-4 py-2 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2">
                <span className="text-xl">🏚️</span>
                <div>
                  <div className="text-sm font-semibold text-orange-800">失效房源</div>
                  <div className="text-lg font-bold text-orange-600">{rows.length} 套</div>
                </div>
              </div>
              {actualBaseDate && (
                <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
                  <span className="text-xl">📅</span>
                  <div>
                    <div className="text-sm font-semibold text-blue-800">基准日期（最新采集）</div>
                    <div className="text-base font-bold text-blue-600">{actualBaseDate}</div>
                  </div>
                </div>
              )}
              {latestCount > 0 && (
                <div className="px-4 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <span className="text-xl">🏘️</span>
                  <div>
                    <div className="text-sm font-semibold text-green-800">当日在售</div>
                    <div className="text-base font-bold text-green-600">{latestCount} 套</div>
                  </div>
                </div>
              )}
              <div className="text-xs text-gray-400 flex-1 text-right">
                💡 失效率：{latestCount > 0 ? ((rows.length / (rows.length + latestCount)) * 100).toFixed(1) : '—'}%
                （失效 / 历史总量）
              </div>
            </div>

            {/* 表格 */}
            {showGrouped ? (
              // 分组视图（按最后出现日期）
              <div className="space-y-4">
                {groupedRows.map(([date, groupRows]) => (
                  <div key={date} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    {/* 分组标题 */}
                    <div className="px-4 py-2.5 bg-orange-50 border-b border-orange-100 flex items-center gap-3">
                      <span className="text-sm font-semibold text-orange-700">最后出现：{date}</span>
                      <DaysAgoBadge lastSeenDate={date} />
                      <span className="text-xs text-gray-400">{groupRows.length} 套</span>
                    </div>
                    {/* 该组的房源表格 */}
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-3 py-2 text-left font-semibold text-gray-500 w-8">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-500">图</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-500 min-w-[160px]">房源信息</th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-500 whitespace-nowrap bg-orange-50">
                            单价<br /><span className="font-normal text-gray-400">(元/平)</span>
                          </th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-500 whitespace-nowrap bg-blue-50">
                            总价<br /><span className="font-normal text-gray-400">(万)</span>
                          </th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-500 whitespace-nowrap">面积(㎡)</th>
                          <th className="px-3 py-2 text-center font-semibold text-gray-500 whitespace-nowrap">楼层</th>
                          <th className="px-3 py-2 text-center font-semibold text-gray-500 whitespace-nowrap">首次出现</th>
                          <th className="px-3 py-2 text-center font-semibold text-gray-500 whitespace-nowrap">出现天数</th>
                          <th className="px-3 py-2 text-center font-semibold text-gray-500 whitespace-nowrap">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {groupRows.map((row, idx) => (
                          <ListingTableRow
                            key={row.id}
                            row={row}
                            idx={idx}
                            fmtUnit={fmtUnit}
                            fmtPrice={fmtPrice}
                            fmtArea={fmtArea}
                            expandedImgRows={expandedImgRows}
                            setExpandedImgRows={setExpandedImgRows}
                            onOpenImg={(url, title) => setImgModal({ url, title })}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ) : (
              // 普通表格视图
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500 w-8">#</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500">图</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500 min-w-[160px]">房源信息</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 whitespace-nowrap bg-orange-50">
                        单价<br /><span className="font-normal text-gray-400">(元/平)</span>
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 whitespace-nowrap bg-blue-50">
                        总价<br /><span className="font-normal text-gray-400">(万)</span>
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 whitespace-nowrap">面积(㎡)</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-gray-500 whitespace-nowrap">楼层</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-gray-500 whitespace-nowrap">最后出现</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-gray-500 whitespace-nowrap">首次出现</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-gray-500 whitespace-nowrap">出现天数</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-gray-500 whitespace-nowrap">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((row, idx) => (
                      <ListingTableRow
                        key={row.id}
                        row={row}
                        idx={idx}
                        fmtUnit={fmtUnit}
                        fmtPrice={fmtPrice}
                        fmtArea={fmtArea}
                        expandedImgRows={expandedImgRows}
                        setExpandedImgRows={setExpandedImgRows}
                        onOpenImg={(url, title) => setImgModal({ url, title })}
                        showLastSeen
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ===== 单行房源组件（抽离以复用）=====
function ListingTableRow({
  row,
  idx,
  fmtUnit,
  fmtPrice,
  fmtArea,
  expandedImgRows,
  setExpandedImgRows,
  onOpenImg,
  showLastSeen = false,
}: {
  row: ExpiredListingRow;
  idx: number;
  fmtUnit: (v: number | null) => string;
  fmtPrice: (v: number | null) => string;
  fmtArea: (v: number | null) => string;
  expandedImgRows: Set<number>;
  setExpandedImgRows: React.Dispatch<React.SetStateAction<Set<number>>>;
  onOpenImg: (url: string, title: string) => void;
  showLastSeen?: boolean;
}) {
  const hasImg = !!row.header_image;
  const imgExpanded = expandedImgRows.has(row.id);

  return (
    <>
      <tr className="hover:bg-orange-50/30 transition-colors">
        {/* 序号 */}
        <td className="px-3 py-2.5 text-gray-400 text-right">{idx + 1}</td>

        {/* 缩略图列 */}
        <td className="px-3 py-2.5">
          {hasImg ? (
            <button
              onClick={() => setExpandedImgRows(prev => {
                const s = new Set(prev);
                if (s.has(row.id)) s.delete(row.id); else s.add(row.id);
                return s;
              })}
              title={imgExpanded ? '收起图片' : '展开图片'}
              className="w-8 h-8 rounded-md bg-gray-100 hover:bg-blue-100 flex items-center justify-center transition-colors"
            >
              <span className="text-sm">{imgExpanded ? '🔼' : '🖼️'}</span>
            </button>
          ) : (
            <span className="w-8 h-8 flex items-center justify-center text-gray-300 text-sm">—</span>
          )}
        </td>

        {/* 房源信息 */}
        <td className="px-3 py-2.5">
          <div className="font-medium text-gray-800 leading-snug line-clamp-1" title={row.title || row.community}>
            {row.title || row.community}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
            {row.house_type && <span className="text-gray-500">{row.house_type}</span>}
            {row.orientation && <span className="text-gray-400">{row.orientation}</span>}
            {row.build_year && <span className="text-gray-400">{row.build_year}年建</span>}
            {row.tags && (
              <span className="text-blue-400 truncate max-w-[140px]" title={row.tags}>
                {row.tags.split(',').slice(0, 2).join(' ')}
              </span>
            )}
          </div>
        </td>

        {/* 单价 */}
        <td className="px-3 py-2.5 text-right font-semibold text-orange-700 bg-orange-50/30 whitespace-nowrap">
          {fmtUnit(row.unit_price)}
        </td>

        {/* 总价 */}
        <td className="px-3 py-2.5 text-right font-semibold text-blue-700 bg-blue-50/30 whitespace-nowrap">
          {fmtPrice(row.total_price)}
        </td>

        {/* 面积 */}
        <td className="px-3 py-2.5 text-right text-gray-600 whitespace-nowrap">
          {fmtArea(row.area)}
        </td>

        {/* 楼层 */}
        <td className="px-3 py-2.5 text-center text-gray-500 whitespace-nowrap max-w-[100px] truncate" title={row.floor_info ?? ''}>
          {row.floor_info || '—'}
        </td>

        {/* 最后出现（非分组视图才显示） */}
        {showLastSeen && (
          <td className="px-3 py-2.5 text-center whitespace-nowrap">
            <div className="font-mono text-gray-700">{row.last_seen_date}</div>
            <DaysAgoBadge lastSeenDate={row.last_seen_date} />
          </td>
        )}

        {/* 首次出现 */}
        <td className="px-3 py-2.5 text-center font-mono text-gray-500 whitespace-nowrap">
          {row.first_seen_date}
        </td>

        {/* 出现天数 */}
        <td className="px-3 py-2.5 text-center whitespace-nowrap">
          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold">
            {row.appear_count} 天
          </span>
        </td>

        {/* 操作 */}
        <td className="px-3 py-2.5 text-center whitespace-nowrap">
          <div className="flex items-center justify-center gap-1">
            {/* 查看详情链接 */}
            {row.detail_url && (
              <a
                href={row.detail_url}
                target="_blank"
                rel="noopener noreferrer"
                title="打开贝壳详情页"
                className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors text-sm"
              >
                🔗
              </a>
            )}
            {/* 查看图片 */}
            {hasImg && (
              <button
                onClick={() => onOpenImg(row.header_image!, row.title || row.community)}
                title="查看房源图片"
                className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-50 hover:bg-gray-100 text-gray-500 transition-colors text-sm"
              >
                🖼️
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* 展开的图片行 */}
      {imgExpanded && row.header_image && (
        <tr>
          <td colSpan={showLastSeen ? 11 : 10} className="px-3 pb-3 pt-1 bg-gray-50/60">
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/proxy/image?url=${encodeURIComponent(row.header_image)}`}
                alt={row.title || row.community}
                className="h-28 w-auto object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
                onClick={() => onOpenImg(row.header_image!, row.title || row.community)}
                onError={e => {
                  (e.currentTarget as HTMLImageElement).src =
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150' viewBox='0 0 200 150'%3E%3Crect fill='%23f3f4f6' width='200' height='150'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-size='14'%3E%E5%9B%BE%E7%89%87%E5%8A%A0%E8%BD%BD%E5%A4%B1%E8%B4%A5%3C/text%3E%3C/svg%3E";
                }}
              />
              <div className="text-xs text-gray-500 space-y-1 pt-1">
                <p><span className="font-medium text-gray-600">标题：</span>{row.title || row.community}</p>
                {row.detail_url && (
                  <p>
                    <span className="font-medium text-gray-600">链接：</span>
                    <a
                      href={row.detail_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline break-all"
                    >
                      {row.detail_url}
                    </a>
                  </p>
                )}
                <p><span className="font-medium text-gray-600">最后采集：</span>{row.last_crawl_time}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
