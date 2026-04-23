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

// ===== 房源备注弹窗组件 =====
const NOTE_TEMPLATE = (_floorInfo?: string | null) =>
  `- 基本：\n- 装修：\n- 抵押：\n- 学区：\n- 价格：\n- 缺点：\n- 优点：`;

function NoteModal({
  row,
  onClose,
  onSaved,
}: {
  row: ListingRow;
  onClose: () => void;
  onSaved: (detailUrl: string, note: string) => void;
}) {
  const [note, setNote]       = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');

  // 加载已有备注
  useEffect(() => {
    if (!row.detail_url) { setLoading(false); return; }
    fetch(`/api/listings/note?detailUrl=${encodeURIComponent(row.detail_url)}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setNote(json.note ?? NOTE_TEMPLATE(row.floor_info));
        } else {
          setNote(NOTE_TEMPLATE(row.floor_info));
        }
      })
      .catch(() => setNote(NOTE_TEMPLATE(row.floor_info)))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = async () => {
    if (!row.detail_url) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/listings/note', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detailUrl: row.detail_url, note }),
      });
      const json = await res.json();
      if (json.success) {
        setSaved(true);
        onSaved(row.detail_url, note);
        setTimeout(() => onClose(), 600);
      } else {
        setError(json.error ?? '保存失败');
      }
    } catch (e) {
      setError(`请求异常: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const fmtUnit  = (v: number | null) => v == null ? '-' : `${(Number(v) * 10000).toFixed(0)} 元/平`;
  const fmtPrice = (v: number | null) => v == null ? '-' : `${Number(v).toFixed(2)} 万`;
  const fmtArea  = (v: number | null) => v == null ? '-' : `${Number(v).toFixed(1)} ㎡`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[88vh]">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-700">📝 房源备注</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">✕</button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {/* 房源基本信息卡 */}
          <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-1.5">
            <p className="text-sm font-medium text-gray-800 leading-snug">{row.title || row.community}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>🏘️ {row.community}</span>
              {row.house_type && <span>🏠 {row.house_type}</span>}
              {row.area != null && <span>📐 {fmtArea(row.area)}</span>}
              {row.floor_info && <span>🏢 {row.floor_info}</span>}
              {row.orientation && <span>🧭 {row.orientation}</span>}
              {row.build_year && <span>📅 {row.build_year}年建</span>}
            </div>
            <div className="flex gap-4 text-xs mt-1">
              <span className="text-orange-600 font-semibold">{fmtUnit(row.unit_price)}</span>
              <span className="text-blue-600 font-semibold">{fmtPrice(row.total_price)}</span>
              {row.detail_url && (
                <a href={row.detail_url} target="_blank" rel="noopener noreferrer"
                  className="text-blue-400 hover:underline truncate max-w-[200px]">
                  🔗 查看详情
                </a>
              )}
            </div>
          </div>

          {/* 备注输入区 */}
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              加载备注中...
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-600">备注内容</label>
                <button
                  type="button"
                  onClick={() => setNote(NOTE_TEMPLATE(row.floor_info))}
                  className="text-xs text-gray-400 hover:text-blue-500 transition-colors"
                >
                  重置模板
                </button>
              </div>
              <textarea
                value={note}
                onChange={e => { setNote(e.target.value); setSaved(false); }}
                rows={10}
                maxLength={2000}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y font-mono leading-relaxed"
                placeholder="填写备注信息..."
              />
              <div className="text-right text-xs text-gray-400 mt-0.5">{note.length}/2000</div>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">❌ {error}</div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved || loading}
            className={`px-6 py-2 text-sm font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              saved
                ? 'bg-green-500 text-white cursor-default'
                : 'bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {saved ? '✓ 已保存' : saving ? '保存中...' : '💾 保存备注'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 取消收藏确认弹窗组件 =====
function UnfavoriteConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-xs mx-4 flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <span className="text-base font-semibold text-gray-700">💔 取消收藏</span>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          >✕</button>
        </div>

        {/* 内容 */}
        <div className="px-5 py-5 text-sm text-gray-600 text-center">
          确定要取消收藏该房源吗？
        </div>

        {/* 底部按钮 */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 text-sm font-semibold rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            确认取消收藏
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 收藏弹窗组件 =====
function FavoriteModal({
  row,
  existingNote,
  onClose,
  onSaved,
}: {
  row: ListingRow;
  existingNote?: string;
  onClose: () => void;
  onSaved?: (id: number, detailUrl: string) => void;
}) {
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
        body: JSON.stringify({ listing: row, note: existingNote ?? null }),
      });
      const json = await res.json();
      if (json.success) {
        setSaved(true);
        onSaved?.(Number(json.id), row.detail_url ?? '');
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

          {/* 备注预览（只读，来自备注表） */}
          {existingNote ? (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">备注（将一并保存）</label>
              <pre className="w-full px-3 py-2.5 text-xs bg-amber-50 border border-amber-200 rounded-md whitespace-pre-wrap font-mono leading-relaxed text-gray-700 max-h-40 overflow-auto">{existingNote}</pre>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md text-xs text-gray-400">
              <span>📄</span>
              <span>暂无备注，可收藏后通过备注按钮（📄）补充</span>
            </div>
          )}

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

// ===== 挂牌房源分析 Prompt 弹窗 =====
function ListingsPromptModal({ prompt, onClose }: { prompt: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = prompt;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-bold text-gray-800">🤖 挂牌房源分析 Prompt</h2>
            <p className="text-xs text-gray-400 mt-0.5">已包含真实房源数据，可直接粘贴到 AI 对话框</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                copied ? 'bg-green-500 text-white' : 'bg-indigo-500 hover:bg-indigo-600 text-white'
              }`}
            >
              {copied ? '✓ 已复制' : '📋 复制全文'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none ml-1">
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono leading-relaxed bg-gray-50 rounded-xl border border-gray-200 p-4">
            {prompt}
          </pre>
        </div>
      </div>
    </div>
  );
}

interface ListingsPromptOptions {
  community: string;
  crawlDate: string;
  houseType: string;
  areaEnabled: boolean;
  areaMin: string;
  areaMax: string;
  excludeBasement: boolean;
  excludeLowFloor: boolean;
  excludeTwoFloor: boolean;
  excludeOneFloor: boolean;
  sortKey: string;
}

function buildListingsPrompt(
  rows: ListingRow[],
  opts: ListingsPromptOptions,
  fmtUnit: (v: number | null) => string,
  fmtPrice: (v: number | null) => string,
  fmtArea: (v: number | null) => string,
): string {
  if (rows.length === 0) return '';

  const { community, crawlDate, houseType, areaEnabled, areaMin, areaMax,
    excludeBasement, excludeLowFloor, excludeTwoFloor, excludeOneFloor } = opts;

  // ── 基础统计 ──
  const unitPrices  = rows.map(r => r.unit_price  != null ? Number(r.unit_price)  * 10000 : null).filter((v): v is number => v != null);
  const totalPrices = rows.map(r => r.total_price != null ? Number(r.total_price) : null).filter((v): v is number => v != null);
  const areas       = rows.map(r => r.area        != null ? Number(r.area)        : null).filter((v): v is number => v != null);

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const median = (arr: number[]) => {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  const avgUnit    = avg(unitPrices);
  const medUnit    = median(unitPrices);
  const minUnit    = unitPrices.length ? Math.min(...unitPrices) : null;
  const maxUnit    = unitPrices.length ? Math.max(...unitPrices) : null;
  const avgPrice   = avg(totalPrices);
  const medPrice   = median(totalPrices);
  const minPrice   = totalPrices.length ? Math.min(...totalPrices) : null;
  const maxPrice   = totalPrices.length ? Math.max(...totalPrices) : null;
  const avgAreaVal = avg(areas);

  const fmt = (v: number | null, fn: (x: number) => string) => v != null ? fn(v) : '-';

  // ── 户型分布 ──
  const typeCount: Record<string, number> = {};
  rows.forEach(r => {
    const t = r.house_type || '未知';
    typeCount[t] = (typeCount[t] ?? 0) + 1;
  });
  const typeDist = Object.entries(typeCount)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t}(${n}套)`)
    .join('、');

  // ── 朝向分布 ──
  const orCount: Record<string, number> = {};
  rows.forEach(r => {
    const o = r.orientation || '未知';
    orCount[o] = (orCount[o] ?? 0) + 1;
  });
  const orDist = Object.entries(orCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([o, n]) => `${o}(${n}套)`)
    .join('、');

  // ── 楼龄分布 ──
  const years = rows.map(r => r.build_year).filter((y): y is number => y != null);
  const minYear = years.length ? Math.min(...years) : null;
  const maxYear = years.length ? Math.max(...years) : null;
  const avgYear = years.length ? Math.round(years.reduce((a, b) => a + b, 0) / years.length) : null;

  // ── 价格段分布 ──
  const priceBuckets: Record<string, number> = {};
  totalPrices.forEach(p => {
    const bucket = p < 100 ? '100万以下'
      : p < 150 ? '100-150万'
      : p < 200 ? '150-200万'
      : p < 300 ? '200-300万'
      : p < 500 ? '300-500万'
      : '500万以上';
    priceBuckets[bucket] = (priceBuckets[bucket] ?? 0) + 1;
  });
  const priceDist = ['100万以下', '100-150万', '150-200万', '200-300万', '300-500万', '500万以上']
    .filter(k => priceBuckets[k])
    .map(k => `${k}:${priceBuckets[k]}套`)
    .join('、');

  // ── 关注度 top5 ──
  const top5 = [...rows]
    .filter(r => r.follow_count > 0)
    .sort((a, b) => b.follow_count - a.follow_count)
    .slice(0, 5);
  const top5Table = top5.length
    ? top5.map(r => [
        `  标题: ${r.title || r.community}`,
        `  单价:${fmtUnit(r.unit_price)}元/平  总价:${fmtPrice(r.total_price)}万  面积:${fmtArea(r.area)}㎡  关注:${r.follow_count}`,
        r.header_image ? `  缩略图: ${r.header_image}` : null,
      ].filter(Boolean).join('\n')
      ).join('\n\n')
    : '  暂无';

  // ── 所有房源明细（最多 100 条）──
  const detailRows = rows.slice(0, 100).map((r, i) => [
    `  ${String(i + 1).padStart(3)}. [${r.house_type || '?'}] ${r.title || r.community}`,
    `       面积:${fmtArea(r.area)}㎡  楼层:${r.floor_info || '?'}  朝向:${r.orientation || '?'}  ${r.build_year || '?'}年建`,
    `       单价:${fmtUnit(r.unit_price)}元/平  总价:${fmtPrice(r.total_price)}万  关注:${r.follow_count}`,
    r.header_image ? `       缩略图: ${r.header_image}` : null,
  ].filter(Boolean).join('\n')).join('\n');
  const detailNote = rows.length > 100 ? `（仅展示前100条，实际共 ${rows.length} 条）` : `（共 ${rows.length} 条）`;

  // ── 筛选条件描述 ──
  const areaNote = (() => {
    if (!areaEnabled) return '不限';
    const mn = parseFloat(areaMin), mx = parseFloat(areaMax);
    if (!isNaN(mn) && !isNaN(mx)) return `${mn}~${mx}㎡`;
    if (!isNaN(mn)) return `≥${mn}㎡`;
    if (!isNaN(mx)) return `≤${mx}㎡`;
    return '不限';
  })();
  const filterNotes: string[] = [];
  if (excludeBasement) filterNotes.push('排除地下室');
  if (excludeLowFloor) filterNotes.push('排除共3层楼');
  if (excludeTwoFloor) filterNotes.push('排除共2层楼');
  if (excludeOneFloor) filterNotes.push('排除共1层楼');
  const filterNote = filterNotes.length ? filterNotes.join('、') : '无';

  return `你是一位专业的房产分析师，请根据以下真实的挂牌房源数据，对"${community}"小区的在售房源进行全面分析，帮助潜在买家做出合理决策。

## 查询条件
- 小区名称：${community}
- 采集日期：${crawlDate || '不限'}
- 户型筛选：${houseType || '全部户型'}
- 面积范围：${areaNote}
- 过滤条件：${filterNote}
- 样本总量：${rows.length} 套

## 价格统计摘要
### 单价（元/平）
- 最低：${fmt(minUnit, v => Math.round(v).toLocaleString())}
- 最高：${fmt(maxUnit, v => Math.round(v).toLocaleString())}
- 均价：${fmt(avgUnit, v => Math.round(v).toLocaleString())}
- 中位价：${fmt(medUnit, v => Math.round(v).toLocaleString())}

### 总价（万元）
- 最低：${fmt(minPrice, v => v.toFixed(2))}
- 最高：${fmt(maxPrice, v => v.toFixed(2))}
- 均价：${fmt(avgPrice, v => v.toFixed(2))}
- 中位价：${fmt(medPrice, v => v.toFixed(2))}

### 面积
- 平均面积：${fmt(avgAreaVal, v => v.toFixed(1))} ㎡

## 房源结构分布
- 户型分布：${typeDist || '暂无'}
- 主要朝向：${orDist || '暂无'}
- 楼龄区间：${minYear ?? '?'} ~ ${maxYear ?? '?'} 年（均值约 ${avgYear ?? '?'} 年）
- 总价分布：${priceDist || '暂无'}

## 高关注度 Top 5 房源
${top5Table}

## 全部房源明细 ${detailNote}
${detailRows}

---

请基于以上数据完成以下分析：

1. **市场概况**：当前小区挂牌量、价格区间与均价水平，判断整体市场热度。

2. **价格分布分析**：均价与中位价的差异说明了什么？是否存在高价或低价异常房源？哪些价格段供应最集中？

3. **房源结构分析**：主流户型、面积段、朝向、楼龄对价格的影响，哪类房源性价比最高？

4. **高性价比筛选**：从明细数据中找出 3~5 套价格合理、面积适中、关注度较高的推荐房源，并说明推荐理由。

5. **议价空间评估**：结合挂牌均价与中位价，估算实际成交时的合理议价区间（通常比挂牌价低多少）。

6. **买入建议**：综合以上分析，给出明确的购房建议（立即入手 / 持续观望 / 等待降价），并说明理由。

请以结构化报告格式输出，数据引用要具体，结论要有依据。`;
}

// ===== 自定义日历选择器（带绿点标记）=====
function DatePickerWithDots({
  value,
  onChange,
  activeDates,
}: {
  value: string;           // YYYY-MM-DD
  onChange: (date: string) => void;
  activeDates: Set<string>; // 有数据的日期集合
}) {
  // 当前日历展示的年月
  const [viewYear, setViewYear]   = useState(() => {
    const d = value ? new Date(value + 'T00:00:00') : new Date();
    return d.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const d = value ? new Date(value + 'T00:00:00') : new Date();
    return d.getMonth(); // 0-11
  });
  const [open, setOpen]           = useState(false);
  const containerRef              = useRef<HTMLDivElement>(null);

  // 同步 value 变化时更新视图年月
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // 构建当月日历格子
  const buildCalendar = () => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    // 以周一为起始
    const startOffset = (firstDay + 6) % 7; // Mon=0, Tue=1, ...
    const cells: (number | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // 补齐到 7 的倍数
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const pad = (n: number) => String(n).padStart(2, '0');

  const todayStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const cells = buildCalendar();
  const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
  const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  return (
    <div ref={containerRef} className="relative">
      {/* 触发按钮（模拟 input[type=date] 外观）*/}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white flex items-center gap-2 min-w-[136px]"
      >
        <span className="text-gray-700 font-mono">{value || '选择日期'}</span>
        <svg className="ml-auto h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {/* 日历弹出层 */}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 w-64 select-none">
          {/* 月份导航 */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-gray-700">
              {viewYear} 年 {MONTH_NAMES[viewMonth]}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              disabled={`${viewYear}-${pad(viewMonth + 1)}` >= todayStr.slice(0, 7)}
              className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>

          {/* 星期标题 */}
          <div className="grid grid-cols-7 mb-1">
            {WEEK_LABELS.map(l => (
              <div key={l} className="text-center text-xs text-gray-400 py-0.5">{l}</div>
            ))}
          </div>

          {/* 日期格子 */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={idx} />;
              }
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
                    ${isSelected
                      ? 'bg-blue-500 text-white font-semibold'
                      : isToday
                        ? 'bg-blue-50 text-blue-600 font-semibold'
                        : isFuture
                          ? 'text-gray-300 cursor-not-allowed'
                          : 'text-gray-700 hover:bg-gray-100'}
                  `}
                >
                  <span>{day}</span>
                  {/* 绿色小点：有数据 */}
                  {hasDot && (
                    <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isSelected ? 'bg-green-200' : 'bg-green-500'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* 底部快捷：今天 */}
          <div className="mt-2 pt-2 border-t border-gray-100 flex justify-end">
            <button
              type="button"
              onClick={() => { onChange(todayStr); setOpen(false); }}
              className="text-xs text-blue-500 hover:underline"
            >
              今天
            </button>
          </div>
        </div>
      )}
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

  // Prompt 弹窗
  const [showPrompt, setShowPrompt] = useState(false);

  // 备注弹窗
  const [noteModal, setNoteModal] = useState<ListingRow | null>(null);
  // 有备注的 detail_url -> 备注内容（缓存，用于列表图标显示）
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  // 收藏状态：detail_url -> favorite_id（已收藏才有值）
  const [favoritedMap, setFavoritedMap] = useState<Record<string, number>>({});
  // 正在切换收藏状态的 detail_url 集合（防重复点击）
  const [favoritingUrls, setFavoritingUrls] = useState<Set<string>>(new Set());

  // 有数据的日期集合（用于日历绿点标记）
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());

  // 当 community 变化时拉取有数据的日期列表
  useEffect(() => {
    const c = community.trim();
    if (!c) { setActiveDates(new Set()); return; }
    let cancelled = false;
    fetch(`/api/listings/dates?community=${encodeURIComponent(c)}`)
      .then(r => r.json())
      .then(json => {
        if (!cancelled && json.success) {
          setActiveDates(new Set(json.dates as string[]));
        }
      })
      .catch(() => {/* ignore */});
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
        const data: ListingRow[] = json.data ?? [];
        setRows(data);
        // 批量拉取收藏状态
        const urls = data.map(r => r.detail_url).filter(Boolean) as string[];
        if (urls.length > 0) {
          try {
            const checkRes = await fetch('/api/favorite/check', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ detailUrls: urls }),
            });
            const checkJson = await checkRes.json();
            if (checkJson.success) setFavoritedMap(checkJson.favorited ?? {});
          } catch {
            // 收藏状态拉取失败不影响主流程
          }
        } else {
          setFavoritedMap({});
        }
        // 批量拉取备注（逐条 GET，失败静默）
        const noteResult: Record<string, string> = {};
        await Promise.all(
          urls.map(async (url) => {
            try {
              const r = await fetch(`/api/listings/note?detailUrl=${encodeURIComponent(url)}`);
              const j = await r.json();
              if (j.success && j.note) noteResult[url] = j.note;
            } catch { /* ignore */ }
          })
        );
        setNoteMap(noteResult);
      } else {
        setError(json.error ?? '查询失败');
      }
    } catch (e) {
      setError(`请求异常: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [community, crawlDate, houseType, excludeBasement, excludeLowFloor, excludeTwoFloor, excludeOneFloor, sortKey, limit, areaEnabled, areaMin, areaMax]);

  // 收藏
  const handleFavorite = useCallback(async (row: ListingRow) => {
    if (!row.detail_url) return;
    const { detail_url } = row;
    setFavoritingUrls(prev => new Set(prev).add(detail_url));
    try {
      const res  = await fetch('/api/favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing: row }),
      });
      const json = await res.json();
      if (json.success) {
        setFavoritedMap(prev => ({ ...prev, [detail_url]: Number(json.id) }));
      }
    } catch {
      // ignore
    } finally {
      setFavoritingUrls(prev => { const s = new Set(prev); s.delete(detail_url); return s; });
    }
  }, []);

  // 取消收藏
  const handleUnfavorite = useCallback(async (detailUrl: string, favoriteId: number) => {
    setFavoritingUrls(prev => new Set(prev).add(detailUrl));
    try {
      const res  = await fetch(`/api/favorite/${favoriteId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setFavoritedMap(prev => {
          const next = { ...prev };
          delete next[detailUrl];
          return next;
        });
      }
    } catch {
      // ignore
    } finally {
      setFavoritingUrls(prev => { const s = new Set(prev); s.delete(detailUrl); return s; });
    }
  }, []);

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

      {/* ===== 备注弹窗 ===== */}
      {noteModal && (
        <NoteModal
          row={noteModal}
          onClose={() => setNoteModal(null)}
          onSaved={(detailUrl, note) => {
            setNoteMap(prev => ({ ...prev, [detailUrl]: note }));
          }}
        />
      )}

      {/* ===== Prompt 弹窗 ===== */}
      {showPrompt && rows.length > 0 && (
        <ListingsPromptModal
          prompt={buildListingsPrompt(
            rows,
            { community, crawlDate, houseType, areaEnabled, areaMin, areaMax,
              excludeBasement, excludeLowFloor, excludeTwoFloor, excludeOneFloor, sortKey },
            fmtUnit, fmtPrice, fmtArea
          )}
          onClose={() => setShowPrompt(false)}
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
            <DatePickerWithDots
              value={crawlDate}
              onChange={setCrawlDate}
              activeDates={activeDates}
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

          {/* 生成分析 Prompt 按钮 */}
          <button
            onClick={() => setShowPrompt(true)}
            disabled={rows.length === 0}
            className="px-5 py-2 bg-violet-500 text-white text-sm font-semibold rounded-md hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            title={rows.length === 0 ? '请先查询房源数据' : '生成 AI 挂牌房源分析 Prompt'}
          >
            🤖 生成分析Prompt
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
                      <td className="px-3 py-2.5 text-center">
                        {row.header_image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/proxy/image?url=${encodeURIComponent(row.header_image)}`}
                            alt={row.title || row.community}
                            className="w-16 h-12 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                            style={{ minWidth: 64 }}
                            title="点击查看大图"
                            onClick={() => setImgModal({ url: row.header_image!, title: row.title || row.community })}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
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
                          {row.detail_url && favoritedMap[row.detail_url] !== undefined ? (
                            <button
                              onClick={() => handleUnfavorite(row.detail_url!, favoritedMap[row.detail_url!])}
                              disabled={favoritingUrls.has(row.detail_url)}
                              className="inline-flex items-center px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-50"
                              title="取消收藏"
                            >
                              {favoritingUrls.has(row.detail_url) ? '…' : '💔'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleFavorite(row)}
                              disabled={favoritingUrls.has(row.detail_url ?? '')}
                              className="inline-flex items-center px-2 py-1 bg-yellow-400 text-gray-900 text-xs rounded hover:bg-yellow-500 transition-colors disabled:opacity-50"
                              title="收藏该房源"
                            >
                              {favoritingUrls.has(row.detail_url ?? '') ? '…' : '⭐'}
                            </button>
                          )}
                          {/* 备注按钮 */}
                          <button
                            onClick={() => setNoteModal(row)}
                            className={`inline-flex items-center px-2 py-1 text-xs rounded transition-colors ${
                              row.detail_url && noteMap[row.detail_url]
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-amber-100 hover:text-amber-700'
                            }`}
                            title={row.detail_url && noteMap[row.detail_url] ? '查看/编辑备注' : '添加备注'}
                          >
                            {row.detail_url && noteMap[row.detail_url] ? '📝' : '📄'}
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
