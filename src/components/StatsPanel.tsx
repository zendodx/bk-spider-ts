'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface StatRow {
  stat_date: string;
  unique_listings: number;
  min_unit_price: number | null;
  avg_unit_price: number | null;
  max_unit_price: number | null;
  median_unit_price: number | null;
  min_price: number | null;
  avg_price: number | null;
  max_price: number | null;
  median_price: number | null;
}

const HOUSE_TYPE_OPTIONS = [
  { value: '', label: '全部户型' },
  { value: '1室', label: '1室' },
  { value: '2室', label: '2室' },
  { value: '3室', label: '3室' },
  { value: '4室', label: '4室' },
  { value: '5室', label: '5室' },
];

export default function StatsPanel() {
  const [community, setCommunity] = useState('');
  const [houseType, setHouseType] = useState('');
  const [excludeBasement, setExcludeBasement] = useState(true);
  const [excludeLowFloor, setExcludeLowFloor] = useState(true);
  const [limit, setLimit] = useState(100);

  const [rows, setRows] = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [queried, setQueried] = useState(false);

  // 小区搜索 combobox
  const [communityKeyword, setCommunityKeyword] = useState('');
  const [communityOptions, setCommunityOptions] = useState<string[]>([]);
  const [communityDropdownOpen, setCommunityDropdownOpen] = useState(false);
  const [communityLoading, setCommunityLoading] = useState(false);
  const communityRef = useRef<HTMLDivElement>(null);

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

    try {
      const params = new URLSearchParams({
        community: community.trim(),
        excludeBasement: String(excludeBasement),
        excludeLowFloor: String(excludeLowFloor),
        limit: String(limit),
      });
      if (houseType) params.set('houseType', houseType);

      const res = await fetch(`/api/stats/community?${params}`);
      const json = await res.json();
      if (json.success) {
        setRows(json.data ?? []);
      } else {
        setError(json.error ?? '查询失败');
        setRows([]);
      }
    } catch (e) {
      setError(`请求异常: ${e}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [community, houseType, excludeBasement, excludeLowFloor, limit]);

  // 万/平 → 元/平 显示
  const fmtUnitPrice = (v: number | null) => {
    if (v == null) return '-';
    const n = Number(v);
    if (isNaN(n)) return '-';
    return `${(n * 10000).toFixed(0)}`;
  };

  const fmtPrice = (v: number | null) => {
    if (v == null) return '-';
    const n = Number(v);
    if (isNaN(n)) return '-';
    return n.toFixed(2);
  };

  // 趋势箭头
  const trend = (rows: StatRow[], idx: number, field: keyof StatRow) => {
    if (idx >= rows.length - 1) return null;
    const cur = Number(rows[idx][field]);
    const prev = Number(rows[idx + 1][field]);
    if (isNaN(cur) || isNaN(prev)) return null;
    if (cur > prev) return <span className="text-red-500 ml-1">↑</span>;
    if (cur < prev) return <span className="text-green-500 ml-1">↓</span>;
    return <span className="text-gray-400 ml-1">→</span>;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 筛选条件区 */}
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
            {communityDropdownOpen && !communityLoading && communityOptions.length === 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-sm text-gray-400">
                {communityKeyword ? '暂无匹配小区' : '数据库暂无小区数据'}
              </div>
            )}
          </div>

          {/* 户型 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">户型筛选</label>
            <select
              value={houseType}
              onChange={e => setHouseType(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {HOUSE_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* 过滤选项 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">过滤条件</label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeBasement}
                onChange={e => setExcludeBasement(e.target.checked)}
                className="text-blue-500"
              />
              <span className="text-sm text-gray-700">排除地下室</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeLowFloor}
                onChange={e => setExcludeLowFloor(e.target.checked)}
                className="text-blue-500"
              />
              <span className="text-sm text-gray-700">排除共3层楼</span>
            </label>
          </div>

          {/* 条数限制 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">最多显示条数</label>
            <select
              value={limit}
              onChange={e => setLimit(parseInt(e.target.value))}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[30, 60, 100, 200, 500].map(n => (
                <option key={n} value={n}>{n} 条</option>
              ))}
            </select>
          </div>

          {/* 查询按钮 */}
          <button
            onClick={handleQuery}
            disabled={loading}
            className="px-6 py-2 bg-blue-500 text-white text-sm font-semibold rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                查询中...
              </>
            ) : '🔍 查询统计'}
          </button>
        </div>
      </div>

      {/* 结果区 */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {error && (
          <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            ❌ {error}
          </div>
        )}

        {!queried && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <span className="text-5xl mb-4">📊</span>
            <p className="text-sm">输入小区名称后点击「查询统计」</p>
          </div>
        )}

        {queried && !loading && rows.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <span className="text-5xl mb-4">🔍</span>
            <p className="text-sm">暂无数据，请检查小区名称或采集数据是否存在</p>
          </div>
        )}

        {rows.length > 0 && (
          <>
            {/* 摘要卡片 */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              {[
                { label: '统计天数', value: `${rows.length} 天` },
                { label: '总样本量', value: `${rows.reduce((s, r) => s + r.unique_listings, 0)} 套` },
                {
                  label: '最新平均单价',
                  value: rows[0]?.avg_unit_price != null
                    ? `${fmtUnitPrice(rows[0].avg_unit_price)} 元/平`
                    : '-',
                },
                {
                  label: '最新平均总价',
                  value: rows[0]?.avg_price != null ? `${fmtPrice(rows[0].avg_price)} 万` : '-',
                },
              ].map(card => (
                <div key={card.label} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                  <p className="text-xs text-gray-500 mb-1">{card.label}</p>
                  <p className="text-lg font-bold text-gray-800">{card.value}</p>
                </div>
              ))}
            </div>

            {/* 数据表格 */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">
                  按日期统计 — {community}
                  {houseType && <span className="ml-2 text-blue-500">({houseType})</span>}
                </span>
                <span className="text-xs text-gray-400">共 {rows.length} 条，最新数据在前</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">日期</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">样本数</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap bg-orange-50">最低价<br /><span className="font-normal text-gray-400">(元/平)</span></th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap bg-orange-50">均价<br /><span className="font-normal text-gray-400">(元/平)</span></th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap bg-orange-50">最高价<br /><span className="font-normal text-gray-400">(元/平)</span></th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap bg-orange-50">中位价<br /><span className="font-normal text-gray-400">(元/平)</span></th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap bg-blue-50">最低价<br /><span className="font-normal text-gray-400">(万)</span></th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap bg-blue-50">均价<br /><span className="font-normal text-gray-400">(万)</span></th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap bg-blue-50">最高价<br /><span className="font-normal text-gray-400">(万)</span></th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap bg-blue-50">中位价<br /><span className="font-normal text-gray-400">(万)</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row, idx) => (
                      <tr key={row.stat_date} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">{row.stat_date}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{row.unique_listings}</td>
                        {/* 单价列（橙色背景组） */}
                        <td className="px-3 py-2 text-right text-gray-700 bg-orange-50/40">
                          {fmtUnitPrice(row.min_unit_price)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-800 bg-orange-50/40">
                          {fmtUnitPrice(row.avg_unit_price)}
                          {trend(rows, idx, 'avg_unit_price')}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 bg-orange-50/40">
                          {fmtUnitPrice(row.max_unit_price)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 bg-orange-50/40">
                          {fmtUnitPrice(row.median_unit_price)}
                          {trend(rows, idx, 'median_unit_price')}
                        </td>
                        {/* 总价列（蓝色背景组） */}
                        <td className="px-3 py-2 text-right text-gray-700 bg-blue-50/40">
                          {fmtPrice(row.min_price)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-800 bg-blue-50/40">
                          {fmtPrice(row.avg_price)}
                          {trend(rows, idx, 'avg_price')}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 bg-blue-50/40">
                          {fmtPrice(row.max_price)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 bg-blue-50/40">
                          {fmtPrice(row.median_price)}
                          {trend(rows, idx, 'median_price')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
