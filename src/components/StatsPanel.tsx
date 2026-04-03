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

// ─────────────────────────────────────────────
// 纯 SVG 折线图（无第三方依赖）
// ─────────────────────────────────────────────
interface LineChartProps {
  /** 数据点，按时间 **升序** 排列 */
  data: { x: string; min: number | null; avg: number | null; max: number | null; median: number | null }[];
  title: string;
  yLabel: string;
  /** 纵轴数值格式化函数 */
  fmt: (v: number) => string;
  colors?: { min: string; avg: string; max: string; median: string };
}

// 单条折线图（用于挂牌量等单值趋势）
interface SingleLineChartProps {
  /** 数据点，按时间 **升序** 排列 */
  data: { x: string; value: number | null }[];
  title: string;
  yLabel: string;
  fmt: (v: number) => string;
  color?: string;
  lineLabel?: string;
}

function SingleLineChart({ data, title, yLabel, fmt, color = '#6366f1', lineLabel = '挂牌量' }: SingleLineChartProps) {
  const W = 780, H = 260;
  const PAD = { top: 28, right: 24, bottom: 56, left: 72 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allVals = data.map(d => d.value).filter((v): v is number => v != null);
  if (allVals.length === 0) return <p className="text-gray-400 text-sm text-center py-8">暂无数据</p>;

  const yMin = Math.min(...allVals);
  const yMax = Math.max(...allVals);
  const yRange = yMax - yMin || 1;
  const yPad = yRange * 0.15;
  const yLo = Math.max(0, yMin - yPad);
  const yHi = yMax + yPad;

  const n = data.length;
  const xStep = n > 1 ? chartW / (n - 1) : chartW / 2;

  const toX = (i: number) => PAD.left + (n > 1 ? i * xStep : chartW / 2);
  const toY = (v: number) => PAD.top + chartH - ((v - yLo) / (yHi - yLo)) * chartH;

  const pts = data
    .map((d, i) => (d.value != null ? `${toX(i)},${toY(d.value)}` : null))
    .filter(Boolean)
    .join(' ');

  // 面积填充路径
  const firstValid = data.findIndex(d => d.value != null);
  const lastValid = data.length - 1 - [...data].reverse().findIndex(d => d.value != null);
  const areaPath = firstValid >= 0
    ? [
        `M ${toX(firstValid)},${PAD.top + chartH}`,
        ...data.slice(firstValid, lastValid + 1).map((d, i) =>
          d.value != null ? `L ${toX(firstValid + i)},${toY(d.value)}` : ''
        ).filter(Boolean),
        `L ${toX(lastValid)},${PAD.top + chartH}`,
        'Z',
      ].join(' ')
    : '';

  const yTicks = Array.from({ length: 5 }, (_, i) => yLo + (yHi - yLo) * (i / 4));
  const xLabelStep = Math.ceil(n / 10);
  const xLabels = data.filter((_, i) => i % xLabelStep === 0 || i === n - 1);

  const [tip, setTip] = useState<{ x: number; d: typeof data[0] } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = (e.clientX - rect.left) * (W / rect.width);
    let nearest = 0, minDist = Infinity;
    data.forEach((_, i) => {
      const dx = Math.abs(toX(i) - mx);
      if (dx < minDist) { minDist = dx; nearest = i; }
    });
    setTip({ x: toX(nearest), d: data[nearest] });
  };

  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-2 text-center">{title}</p>
      <div className="flex justify-center gap-4 mb-2">
        <span className="flex items-center gap-1 text-xs text-gray-600">
          <span className="inline-block w-5 rounded" style={{ backgroundColor: color, height: 2 }} />
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          {lineLabel}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ fontFamily: 'sans-serif' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTip(null)}
      >
        {/* 背景网格 */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={toY(v)} x2={PAD.left + chartW} y2={toY(v)} stroke="#e5e7eb" strokeWidth="1" />
            <text x={PAD.left - 6} y={toY(v) + 4} textAnchor="end" fontSize="11" fill="#9ca3af">
              {fmt(v)}
            </text>
          </g>
        ))}

        {/* Y 轴标签 */}
        <text
          x={14} y={PAD.top + chartH / 2}
          textAnchor="middle" fontSize="11" fill="#6b7280"
          transform={`rotate(-90, 14, ${PAD.top + chartH / 2})`}
        >
          {yLabel}
        </text>

        {/* X 轴刻度 */}
        {xLabels.map(d => {
          const i = data.indexOf(d);
          return (
            <text key={d.x} x={toX(i)} y={PAD.top + chartH + 16} textAnchor="middle" fontSize="10" fill="#9ca3af">
              {d.x.slice(5)}
            </text>
          );
        })}

        {/* 面积填充 */}
        {areaPath && (
          <path d={areaPath} fill={color} fillOpacity="0.12" />
        )}

        {/* 折线 */}
        {pts && (
          <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* 数据点圆点 */}
        {data.map((d, i) =>
          d.value != null ? (
            <circle key={i} cx={toX(i)} cy={toY(d.value)} r={3} fill={color} stroke="white" strokeWidth="1" />
          ) : null
        )}

        {/* Tooltip 竖线 */}
        {tip && (
          <line x1={tip.x} y1={PAD.top} x2={tip.x} y2={PAD.top + chartH}
            stroke="#6b7280" strokeWidth="1" strokeDasharray="4 2" />
        )}
      </svg>

      {/* Tooltip 数值卡片 */}
      {tip && (
        <div className="mt-1 flex justify-center">
          <div className="inline-flex gap-4 bg-gray-800/90 text-white text-xs rounded-lg px-4 py-2">
            <span className="font-medium">{tip.d.x}</span>
            <span style={{ color }}>{lineLabel}: {tip.d.value != null ? fmt(tip.d.value) : '—'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function LineChart({ data, title, yLabel, fmt, colors }: LineChartProps) {
  const W = 780, H = 320;
  const PAD = { top: 28, right: 24, bottom: 56, left: 72 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const c = colors ?? { min: '#6ee7b7', avg: '#3b82f6', max: '#f87171', median: '#f59e0b' };

  // 收集所有有效数值，计算 Y 轴范围
  const allVals: number[] = [];
  data.forEach(d => {
    [d.min, d.avg, d.max, d.median].forEach(v => { if (v != null) allVals.push(v); });
  });
  if (allVals.length === 0) return <p className="text-gray-400 text-sm text-center py-8">暂无数据</p>;

  const yMin = Math.min(...allVals);
  const yMax = Math.max(...allVals);
  const yRange = yMax - yMin || 1;
  const yPad = yRange * 0.1;
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;

  const n = data.length;
  const xStep = n > 1 ? chartW / (n - 1) : chartW / 2;

  const toX = (i: number) => PAD.left + (n > 1 ? i * xStep : chartW / 2);
  const toY = (v: number) => PAD.top + chartH - ((v - yLo) / (yHi - yLo)) * chartH;

  // 生成折线 polyline points
  const makeLine = (key: 'min' | 'avg' | 'max' | 'median') =>
    data
      .map((d, i) => (d[key] != null ? `${toX(i)},${toY(d[key] as number)}` : null))
      .filter(Boolean)
      .join(' ');

  // Y 轴刻度（5条）
  const yTicks = Array.from({ length: 5 }, (_, i) => yLo + (yHi - yLo) * (i / 4));

  // X 轴日期标签（最多显示 10 个，均匀抽样）
  const xLabelStep = Math.ceil(n / 10);
  const xLabels = data.filter((_, i) => i % xLabelStep === 0 || i === n - 1);

  const lines: { key: 'min' | 'avg' | 'max' | 'median'; label: string; color: string }[] = [
    { key: 'min', label: '最低', color: c.min },
    { key: 'avg', label: '均价', color: c.avg },
    { key: 'max', label: '最高', color: c.max },
    { key: 'median', label: '中位', color: c.median },
  ];

  // Tooltip state
  const [tip, setTip] = useState<{ x: number; y: number; d: typeof data[0]; i: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = (e.clientX - rect.left) * (W / rect.width);
    // 找最近数据点
    let nearest = 0;
    let minDist = Infinity;
    data.forEach((_, i) => {
      const dx = Math.abs(toX(i) - mx);
      if (dx < minDist) { minDist = dx; nearest = i; }
    });
    setTip({ x: toX(nearest), y: PAD.top, d: data[nearest], i: nearest });
  };

  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-2 text-center">{title}</p>
      {/* 图例 */}
      <div className="flex justify-center gap-4 mb-2">
        {lines.map(l => (
          <span key={l.key} className="flex items-center gap-1 text-xs text-gray-600">
            <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: l.color, height: 2 }} />
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ fontFamily: 'sans-serif' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTip(null)}
      >
        {/* 背景网格 */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={toY(v)}
              x2={PAD.left + chartW} y2={toY(v)}
              stroke="#e5e7eb" strokeWidth="1"
            />
            <text x={PAD.left - 6} y={toY(v) + 4} textAnchor="end" fontSize="11" fill="#9ca3af">
              {fmt(v)}
            </text>
          </g>
        ))}

        {/* Y 轴标签 */}
        <text
          x={14} y={PAD.top + chartH / 2}
          textAnchor="middle" fontSize="11" fill="#6b7280"
          transform={`rotate(-90, 14, ${PAD.top + chartH / 2})`}
        >
          {yLabel}
        </text>

        {/* X 轴刻度 */}
        {xLabels.map(d => {
          const i = data.indexOf(d);
          return (
            <text
              key={d.x}
              x={toX(i)}
              y={PAD.top + chartH + 16}
              textAnchor="middle"
              fontSize="10"
              fill="#9ca3af"
            >
              {d.x.slice(5)} {/* MM-DD */}
            </text>
          );
        })}

        {/* 折线 */}
        {lines.map(l => {
          const pts = makeLine(l.key);
          if (!pts) return null;
          return (
            <polyline
              key={l.key}
              points={pts}
              fill="none"
              stroke={l.color}
              strokeWidth={l.key === 'avg' ? 2.5 : 1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {/* 数据点圆点 */}
        {lines.map(l =>
          data.map((d, i) =>
            d[l.key] != null ? (
              <circle
                key={`${l.key}-${i}`}
                cx={toX(i)} cy={toY(d[l.key] as number)}
                r={l.key === 'avg' ? 3.5 : 2.5}
                fill={l.color}
                stroke="white" strokeWidth="1"
              />
            ) : null
          )
        )}

        {/* Tooltip 竖线 */}
        {tip && (
          <line
            x1={tip.x} y1={PAD.top}
            x2={tip.x} y2={PAD.top + chartH}
            stroke="#6b7280" strokeWidth="1" strokeDasharray="4 2"
          />
        )}
      </svg>

      {/* Tooltip 数值卡片 */}
      {tip && (
        <div className="mt-1 flex justify-center">
          <div className="inline-flex gap-4 bg-gray-800/90 text-white text-xs rounded-lg px-4 py-2">
            <span className="font-medium">{tip.d.x}</span>
            {lines.map(l => (
              <span key={l.key} style={{ color: l.color }}>
                {l.label}: {tip.d[l.key] != null ? fmt(tip.d[l.key] as number) : '—'}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 图表弹窗
// ─────────────────────────────────────────────
function ChartModal({ rows, community, onClose }: {
  rows: StatRow[];
  community: string;
  onClose: () => void;
}) {
  // API 返回的是降序（最新在前），图表需要升序（最旧在前）
  const sorted = [...rows].reverse();

  const listingsData = sorted.map(r => ({
    x: r.stat_date,
    value: r.unique_listings,
  }));

  const unitData = sorted.map(r => ({
    x: r.stat_date,
    min:    r.min_unit_price    != null ? Number(r.min_unit_price) * 10000    : null,
    avg:    r.avg_unit_price    != null ? Number(r.avg_unit_price) * 10000    : null,
    max:    r.max_unit_price    != null ? Number(r.max_unit_price) * 10000    : null,
    median: r.median_unit_price != null ? Number(r.median_unit_price) * 10000 : null,
  }));

  const priceData = sorted.map(r => ({
    x: r.stat_date,
    min:    r.min_price    != null ? Number(r.min_price)    : null,
    avg:    r.avg_price    != null ? Number(r.avg_price)    : null,
    max:    r.max_price    != null ? Number(r.max_price)    : null,
    median: r.median_price != null ? Number(r.median_price) : null,
  }));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-base font-bold text-gray-800">📈 价格 & 挂牌量趋势图表</h2>
            <p className="text-xs text-gray-400 mt-0.5">{community} · 共 {rows.length} 天数据</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* 图表内容 */}
        <div className="px-6 py-5 space-y-8">
          {/* 单价图表 */}
          <div className="bg-orange-50/50 rounded-xl p-4 border border-orange-100">
            <LineChart
              data={unitData}
              title="单价趋势（元/平）"
              yLabel="元/平"
              fmt={v => `${Math.round(v).toLocaleString()}`}
              colors={{ min: '#6ee7b7', avg: '#f97316', max: '#ef4444', median: '#f59e0b' }}
            />
          </div>

          {/* 总价图表 */}
          <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100">
            <LineChart
              data={priceData}
              title="总价趋势（万元）"
              yLabel="万元"
              fmt={v => `${v.toFixed(1)}`}
              colors={{ min: '#6ee7b7', avg: '#3b82f6', max: '#ef4444', median: '#8b5cf6' }}
            />
          </div>

          {/* 挂牌量图表 */}
          <div className="bg-violet-50/50 rounded-xl p-4 border border-violet-100">
            <SingleLineChart
              data={listingsData}
              title="挂牌量趋势（套）"
              yLabel="套"
              fmt={v => `${Math.round(v)}`}
              color="#7c3aed"
              lineLabel="挂牌量"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────
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

  // 图表弹窗
  const [showChart, setShowChart] = useState(false);

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
  const trend = (data: StatRow[], idx: number, field: keyof StatRow) => {
    if (idx >= data.length - 1) return null;
    const cur = Number(data[idx][field]);
    const prev = Number(data[idx + 1][field]);
    if (isNaN(cur) || isNaN(prev)) return null;
    if (cur > prev) return <span className="text-red-500 ml-1">↑</span>;
    if (cur < prev) return <span className="text-green-500 ml-1">↓</span>;
    return <span className="text-gray-400 ml-1">→</span>;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 图表弹窗 */}
      {showChart && rows.length > 0 && (
        <ChartModal rows={rows} community={community} onClose={() => setShowChart(false)} />
      )}

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

          {/* 图表展示按钮（有数据才激活） */}
          <button
            onClick={() => setShowChart(true)}
            disabled={rows.length === 0}
            className="px-5 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-md hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            title={rows.length === 0 ? '请先查询统计数据' : '查看价格趋势图表'}
          >
            📈 图表展示
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
                { label: '总挂牌量', value: `${rows.reduce((s, r) => s + r.unique_listings, 0)} 套` },
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
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">共 {rows.length} 条，最新数据在前</span>
                  <button
                    onClick={() => setShowChart(true)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-600 text-xs font-medium rounded-md border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    📈 图表
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">日期</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">挂牌量</th>
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
                        <td className="px-3 py-2 text-right text-gray-600">
                          {row.unique_listings}
                          {trend(rows, idx, 'unique_listings')}
                        </td>
                        {/* 单价列（橙色背景组） */}
                        <td className="px-3 py-2 text-right text-gray-700 bg-orange-50/40">
                          {fmtUnitPrice(row.min_unit_price)}
                          {trend(rows, idx, 'min_unit_price')}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-800 bg-orange-50/40">
                          {fmtUnitPrice(row.avg_unit_price)}
                          {trend(rows, idx, 'avg_unit_price')}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 bg-orange-50/40">
                          {fmtUnitPrice(row.max_unit_price)}
                          {trend(rows, idx, 'max_unit_price')}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 bg-orange-50/40">
                          {fmtUnitPrice(row.median_unit_price)}
                          {trend(rows, idx, 'median_unit_price')}
                        </td>
                        {/* 总价列（蓝色背景组） */}
                        <td className="px-3 py-2 text-right text-gray-700 bg-blue-50/40">
                          {fmtPrice(row.min_price)}
                          {trend(rows, idx, 'min_price')}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-800 bg-blue-50/40">
                          {fmtPrice(row.avg_price)}
                          {trend(rows, idx, 'avg_price')}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 bg-blue-50/40">
                          {fmtPrice(row.max_price)}
                          {trend(rows, idx, 'max_price')}
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
