'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface ListingRow {
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
  crawl_time: string;
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
  { value: 'unit_price|asc',    label: '单价 ↑ 升序' },
  { value: 'unit_price|desc',   label: '单价 ↓ 降序' },
  { value: 'total_price|asc',   label: '总价 ↑ 升序' },
  { value: 'total_price|desc',  label: '总价 ↓ 降序' },
  { value: 'area|asc',          label: '面积 ↑ 升序' },
  { value: 'area|desc',         label: '面积 ↓ 降序' },
  { value: 'created_at|desc',   label: '采集时间 ↓ 最新' },
  { value: 'created_at|asc',    label: '采集时间 ↑ 最早' },
];

function today(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10);
}

// ===== 价格历史数据类型 =====
interface PriceHistoryRow {
  id: number;
  crawl_date: string;
  crawl_time: string;
  unit_price: number | null;
  total_price: number | null;
  follow_count: number;
}

// ===== 趋势箭头组件 =====
function TrendArrow({ curr, prev }: { curr: number | null; prev: number | null }) {
  if (curr == null || prev == null) return null;
  const diff = Number(curr) - Number(prev);
  if (Math.abs(diff) < 0.0001) return <span className="text-gray-400 ml-1 text-xs">—</span>;
  if (diff > 0) return <span className="text-red-500 ml-1 text-xs font-bold">↑</span>;
  return <span className="text-green-600 ml-1 text-xs font-bold">↓</span>;
}

// ===== 价格历史弹窗组件 =====
function PriceHistoryModal({
  detailUrl,
  title,
  onClose,
}: {
  detailUrl: string;
  title: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<PriceHistoryRow[]>([]);
  const [inputUrl, setInputUrl] = useState(detailUrl);
  const [queriedUrl, setQueriedUrl] = useState('');

  const fmtUnit = (v: number | null) => {
    if (v == null) return '-';
    return `${(Number(v) * 10000).toFixed(0)}`;
  };
  const fmtPrice = (v: number | null) => {
    if (v == null) return '-';
    return Number(v).toFixed(2);
  };

  const handleQuery = useCallback(async (url: string) => {
    const u = url.trim();
    if (!u) return;
    setLoading(true);
    setError('');
    setRows([]);
    setQueriedUrl(u);
    try {
      const res = await fetch(`/api/listings/price-history?detailUrl=${encodeURIComponent(u)}`);
      const json = await res.json();
      if (json.success) {
        setRows(json.data ?? []);
      } else {
        setError(json.error ?? '查询失败');
      }
    } catch (e) {
      setError(`请求异常: ${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次自动查询
  useEffect(() => {
    if (detailUrl) handleQuery(detailUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-700">📈 价格历史</span>
            {title && <span className="text-xs text-gray-400 truncate max-w-xs" title={title}>{title}</span>}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 输入 URL 查询栏 */}
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleQuery(inputUrl); }}
              placeholder="输入 detail_url 查询价格历史..."
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
            />
            <button
              onClick={() => handleQuery(inputUrl)}
              disabled={loading}
              className="px-4 py-1.5 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {loading ? '查询中...' : '🔍 查询'}
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-auto px-4 py-3">
          {error && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">❌ {error}</div>
          )}

          {!loading && !error && rows.length === 0 && queriedUrl && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <span className="text-4xl mb-3">📭</span>
              <p className="text-sm">暂无该房源的价格历史记录</p>
            </div>
          )}

          {!loading && !queriedUrl && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <span className="text-4xl mb-3">🔍</span>
              <p className="text-sm">输入 detail_url 后点击查询</p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">加载中...</span>
            </div>
          )}

          {rows.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-2">共 {rows.length} 条记录，按采集日期倒序排列</div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">#</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">采集日期</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap bg-orange-50">
                      单价<br /><span className="font-normal text-gray-400">(元/平)</span>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap bg-blue-50">
                      总价<br /><span className="font-normal text-gray-400">(万)</span>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">关注</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, idx) => {
                    const nextRow = rows[idx + 1] ?? null; // 下一条（时间更早）
                    return (
                      <tr key={row.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-3 py-2 text-right text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2 text-center text-gray-600 whitespace-nowrap font-mono">{row.crawl_date}</td>
                        {/* 单价 + 趋势 */}
                        <td className="px-3 py-2 text-right font-semibold text-orange-700 bg-orange-50/40 whitespace-nowrap">
                          {fmtUnit(row.unit_price)}
                          <TrendArrow curr={row.unit_price} prev={nextRow?.unit_price ?? null} />
                        </td>
                        {/* 总价 + 趋势 */}
                        <td className="px-3 py-2 text-right font-semibold text-blue-700 bg-blue-50/40 whitespace-nowrap">
                          {fmtPrice(row.total_price)}
                          <TrendArrow curr={row.total_price} prev={nextRow?.total_price ?? null} />
                        </td>
                        {/* 关注 */}
                        <td className="px-3 py-2 text-right text-gray-500">{row.follow_count ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 底部：链接 */}
        {queriedUrl && (
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex-shrink-0">
            <a
              href={queriedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline break-all"
            >
              {queriedUrl}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== 收藏弹窗组件 =====
function FavoriteModal({
  row,
  onClose,
  onSaved,
}: {
  row: ListingRow;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const NOTE_TEMPLATE = '- 楼层：\n\n- 装修：\n\n- 楼面：\n\n- 抵押：\n\n- 学区：\n\n- 成交价：';
  const [note, setNote]       = useState(NOTE_TEMPLATE);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const fmtUnit = (v: number | null) => {
    if (v == null) return '-';
    return `${(Number(v) * 10000).toFixed(0)} 元/平`;
  };
  const fmtPrice = (v: number | null) => {
    if (v == null) return '-';
    return `${Number(v).toFixed(2)} 万`;
  };
  const fmtArea = (v: number | null) => {
    if (v == null) return '-';
    return `${Number(v).toFixed(1)} ㎡`;
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing: row, note }),
      });
      const json = await res.json();
      if (json.success) {
        setSaved(true);
        onSaved?.();
        setTimeout(() => onClose(), 800);
      } else {
        setError(json.error ?? '收藏失败');
      }
    } catch (e) {
      setError(`请求异常: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const infoItems = [
    { label: '小区',   value: row.community || '—' },
    { label: '标题',   value: row.title || '—' },
    { label: '地区',   value: [row.province, row.city, row.district].filter(Boolean).join(' / ') || '—' },
    { label: '户型',   value: row.house_type || '—' },
    { label: '面积',   value: fmtArea(row.area) },
    { label: '楼层',   value: row.floor_info || '—' },
    { label: '朝向',   value: row.orientation || '—' },
    { label: '年份',   value: row.build_year ? String(row.build_year) : '—' },
    { label: '单价',   value: fmtUnit(row.unit_price), highlight: 'orange' as const },
    { label: '总价',   value: fmtPrice(row.total_price), highlight: 'blue' as const },
    { label: '关注',   value: String(row.follow_count ?? 0) },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-700">⭐ 收藏房源</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          >✕</button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {/* 基本信息卡片 */}
          <div className="bg-gray-50 rounded-lg px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2">
            {infoItems.map(item => (
              <div key={item.label} className="flex flex-col">
                <span className="text-xs text-gray-400">{item.label}</span>
                <span className={`text-sm font-medium mt-0.5 ${
                  item.highlight === 'orange' ? 'text-orange-700' :
                  item.highlight === 'blue'   ? 'text-blue-700'   :
                  'text-gray-700'
                }`}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>

          {/* 详情链接 */}
          {row.detail_url && (
            <div className="text-xs text-gray-400 break-all">
              <span className="font-medium text-gray-500">详情链接：</span>
              <a
                href={row.detail_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                {row.detail_url}
              </a>
            </div>
          )}

          {/* 备注输入框 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">备注（可选）</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="填写备注，如：价格合适、位置好..."
              rows={10}
              maxLength={1000}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
            />
            <div className="text-right text-xs text-gray-400 mt-0.5">{note.length}/1000</div>
          </div>

          {/* 错误信息 */}
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
              ❌ {error}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`px-5 py-2 text-sm font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              saved
                ? 'bg-green-500 text-white cursor-default'
                : 'bg-yellow-400 text-gray-900 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {saved ? '✓ 已收藏' : saving ? '收藏中...' : '⭐ 确认收藏'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 图片预览弹窗组件 =====
function ImageModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  // 点击遮罩关闭
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };
  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <p className="text-sm font-medium text-gray-700 truncate pr-4" title={title}>{title || '房源缩略图'}</p>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        {/* 图片区：通过后端代理加载，绕过贝壳 CDN 的 Referer 防盗链 */}
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
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline break-all"
          >
            {url}
          </a>
        </div>
      </div>
    </div>
  );
}

export default function ListingsPanel() {
  // 筛选条件
  const [community, setCommunity]           = useState('');
  const [crawlDate, setCrawlDate]           = useState(today());
  const [houseType, setHouseType]           = useState('');
  const [excludeBasement, setExcludeBasement]   = useState(true);
  const [excludeLowFloor, setExcludeLowFloor]   = useState(true);
  const [excludeTwoFloor, setExcludeTwoFloor]   = useState(false);
  const [excludeOneFloor, setExcludeOneFloor]   = useState(false);
  const [sortKey, setSortKey]               = useState('unit_price|asc');
  const [limit, setLimit]                   = useState(500);

  // 面积区间（可选）
  const [areaEnabled, setAreaEnabled]   = useState(false);
  const [areaMin, setAreaMin]           = useState('');
  const [areaMax, setAreaMax]           = useState('');

  // 小区搜索 combobox
  const [communityKeyword, setCommunityKeyword] = useState('');
  const [communityOptions, setCommunityOptions] = useState<string[]>([]);
  const [communityDropdownOpen, setCommunityDropdownOpen] = useState(false);
  const [communityLoading, setCommunityLoading] = useState(false);
  const communityRef = useRef<HTMLDivElement>(null);

  // 结果
  const [rows, setRows]     = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [queried, setQueried] = useState(false);

  // 图片弹窗
  const [imgModal, setImgModal] = useState<{ url: string; title: string } | null>(null);

  // 价格历史弹窗
  const [priceHistoryModal, setPriceHistoryModal] = useState<{ detailUrl: string; title: string } | null>(null);

  // 收藏弹窗
  const [favoriteModal, setFavoriteModal] = useState<ListingRow | null>(null);

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

    try {
      const [orderBy, order] = sortKey.split('|');
      const params = new URLSearchParams({
        community: community.trim(),
        crawlDate,
        excludeBasement: String(excludeBasement),
        excludeLowFloor: String(excludeLowFloor),
        excludeTwoFloor: String(excludeTwoFloor),
        excludeOneFloor: String(excludeOneFloor),
        orderBy,
        order,
        limit: String(limit),
      });
      if (houseType) params.set('houseType', houseType);
      if (areaEnabled) {
        const mn = parseFloat(areaMin);
        const mx = parseFloat(areaMax);
        if (!isNaN(mn)) params.set('areaMin', String(mn));
        if (!isNaN(mx)) params.set('areaMax', String(mx));
      }

      const res = await fetch(`/api/listings/query?${params}`);
      const json = await res.json();
      if (json.success) {
        setRows(json.data ?? []);
      } else {
        setError(json.error ?? '查询失败');
      }
    } catch (e) {
      setError(`请求异常: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [community, crawlDate, houseType, excludeBasement, excludeLowFloor, excludeTwoFloor, excludeOneFloor, sortKey, limit, areaEnabled, areaMin, areaMax]);

  // 格式化数值
  const fmtUnit = (v: number | null) => {
    if (v == null) return '-';
    const n = Number(v);
    return isNaN(n) ? '-' : `${(n * 10000).toFixed(0)}`;
  };
  const fmtPrice = (v: number | null) => {
    if (v == null) return '-';
    const n = Number(v);
    return isNaN(n) ? '-' : n.toFixed(2);
  };
  const fmtArea = (v: number | null) => {
    if (v == null) return '-';
    const n = Number(v);
    return isNaN(n) ? '-' : n.toFixed(1);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ===== 图片弹窗 ===== */}
      {imgModal && (
        <ImageModal
          url={imgModal.url}
          title={imgModal.title}
          onClose={() => setImgModal(null)}
        />
      )}

      {/* ===== 价格历史弹窗 ===== */}
      {priceHistoryModal && (
        <PriceHistoryModal
          detailUrl={priceHistoryModal.detailUrl}
          title={priceHistoryModal.title}
          onClose={() => setPriceHistoryModal(null)}
        />
      )}

      {/* ===== 收藏弹窗 ===== */}
      {favoriteModal && (
        <FavoriteModal
          row={favoriteModal}
          onClose={() => setFavoriteModal(null)}
        />
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
            {communityDropdownOpen && !communityLoading && communityOptions.length === 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-sm text-gray-400">
                {communityKeyword ? '暂无匹配小区' : '数据库暂无小区数据'}
              </div>
            )}
          </div>

          {/* 采集日期 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">采集日期</label>
            <input
              type="date"
              value={crawlDate}
              max={today()}
              onChange={e => setCrawlDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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

          {/* 排序 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">排序方式</label>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ORDER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* 面积区间 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">面积区间（㎡）</label>
            <label className="flex items-center gap-1.5 cursor-pointer mb-0.5">
              <input
                type="checkbox"
                checked={areaEnabled}
                onChange={e => setAreaEnabled(e.target.checked)}
                className="text-blue-500"
              />
              <span className="text-sm text-gray-700">启用面积筛选</span>
            </label>
            {areaEnabled && (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={areaMin}
                  onChange={e => setAreaMin(e.target.value)}
                  placeholder="最小"
                  min={0}
                  className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-400 text-sm">~</span>
                <input
                  type="number"
                  value={areaMax}
                  onChange={e => setAreaMax(e.target.value)}
                  placeholder="最大"
                  min={0}
                  className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
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
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeTwoFloor}
                onChange={e => setExcludeTwoFloor(e.target.checked)}
                className="text-blue-500"
              />
              <span className="text-sm text-gray-700">排除共2层楼</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeOneFloor}
                onChange={e => setExcludeOneFloor(e.target.checked)}
                className="text-blue-500"
              />
              <span className="text-sm text-gray-700">排除共1层楼</span>
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
              {[100, 200, 500, 1000].map(n => (
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
            ) : '🔍 查询房源'}
          </button>
        </div>
      </div>

      {/* ===== 结果区 ===== */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {error && (
          <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            ❌ {error}
          </div>
        )}

        {!queried && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <span className="text-5xl mb-4">🏘️</span>
            <p className="text-sm">选择小区和日期后点击「查询房源」</p>
          </div>
        )}

        {queried && !loading && rows.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <span className="text-5xl mb-4">🔍</span>
            <p className="text-sm">暂无数据，请检查筛选条件或扩大日期范围</p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">
                房源列表 — {community}
                {houseType && <span className="ml-2 text-blue-500">({houseType})</span>}
                {crawlDate && <span className="ml-2 text-gray-400 font-normal text-xs">采集日期: {crawlDate}</span>}
              </span>
              <span className="text-xs text-gray-400">共 {rows.length} 条</span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-max w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                    {/* 序号 */}
                    <th className="px-3 py-3 text-right font-semibold text-gray-600 whitespace-nowrap bg-orange-50">#</th>
                    {/* 省市区 */}
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">省</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">市</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">区</th>
                    {/* 基础信息 */}
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">小区</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">标题</th>
                    {/* 缩略图 */}
                    <th className="px-3 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">缩略图</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">户型</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">面积(㎡)</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">楼层</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">朝向</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">年份</th>
                    {/* 价格 */}
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap bg-orange-50">
                      单价<br /><span className="font-normal text-gray-400">(元/平)</span>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap bg-blue-50">
                      总价<br /><span className="font-normal text-gray-400">(万)</span>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">关注</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">采集时间</th>
                    {/* 操作列 */}
                    <th className="px-3 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-blue-50/30 transition-colors border-b border-gray-100 last:border-0">
                      {/* 序号 */}
                      <td className="px-3 py-2.5 text-right text-gray-400 bg-orange-50/30 whitespace-nowrap">{idx + 1}</td>
                      {/* 省市区 */}
                      <td className="px-4 py-2.5 text-center text-gray-500 whitespace-nowrap">{row.province || '—'}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500 whitespace-nowrap">{row.city || '—'}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500 whitespace-nowrap">{row.district || '—'}</td>
                      {/* 小区 */}
                      <td className="px-4 py-2.5 text-gray-700 font-medium whitespace-nowrap">
                        {row.community}
                      </td>
                      {/* 标题：完整展示，不截断 */}
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                        {row.title || '—'}
                      </td>
                      {/* 缩略图 */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        {row.header_image ? (
                          <button
                            onClick={() => setImgModal({ url: row.header_image!, title: row.title || row.community })}
                            className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200 transition-colors"
                            title="预览缩略图"
                          >
                            🖼️
                          </button>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      {/* 户型 */}
                      <td className="px-4 py-2.5 text-center text-gray-700 whitespace-nowrap">{row.house_type || '—'}</td>
                      {/* 面积 */}
                      <td className="px-4 py-2.5 text-right text-gray-700 whitespace-nowrap">{fmtArea(row.area)}</td>
                      {/* 楼层：完整展示，不截断 */}
                      <td className="px-4 py-2.5 text-center text-gray-600 whitespace-nowrap">
                        {row.floor_info || '—'}
                      </td>
                      {/* 朝向 */}
                      <td className="px-4 py-2.5 text-center text-gray-600 whitespace-nowrap">{row.orientation || '—'}</td>
                      {/* 年份 */}
                      <td className="px-4 py-2.5 text-center text-gray-600 whitespace-nowrap">{row.build_year || '—'}</td>
                      {/* 单价 */}
                      <td className="px-4 py-2.5 text-right font-semibold text-orange-700 bg-orange-50/40 whitespace-nowrap">
                        {fmtUnit(row.unit_price)}
                      </td>
                      {/* 总价 */}
                      <td className="px-4 py-2.5 text-right font-semibold text-blue-700 bg-blue-50/40 whitespace-nowrap">
                        {fmtPrice(row.total_price)}
                      </td>
                      {/* 关注 */}
                      <td className="px-4 py-2.5 text-right text-gray-500 whitespace-nowrap">{row.follow_count ?? 0}</td>
                      {/* 采集时间 */}
                      <td className="px-4 py-2.5 text-center text-gray-400 whitespace-nowrap">{row.crawl_time}</td>
                      {/* 操作列：详情链接 + 价格历史 + 收藏 */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {row.detail_url ? (
                            <a
                              href={row.detail_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                              title="查看详情"
                            >
                              🔗
                            </a>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                          <button
                            onClick={() => setPriceHistoryModal({ detailUrl: row.detail_url ?? '', title: row.title || row.community })}
                            className="inline-flex items-center px-2 py-1 bg-emerald-500 text-white text-xs rounded hover:bg-emerald-600 transition-colors"
                            title="查看价格历史"
                          >
                            📈
                          </button>
                          <button
                            onClick={() => setFavoriteModal(row)}
                            className="inline-flex items-center px-2 py-1 bg-yellow-400 text-gray-900 text-xs rounded hover:bg-yellow-500 transition-colors"
                            title="收藏该房源"
                          >
                            ⭐
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
