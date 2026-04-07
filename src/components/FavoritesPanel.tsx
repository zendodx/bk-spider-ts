'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface FavoriteRow {
  id: number;
  title: string;
  header_image: string | null;
  province: string;
  city: string;
  district: string;
  community: string;
  community_url: string | null;
  floor_info: string | null;
  build_year: number | null;
  house_type: string | null;
  area: number | null;
  orientation: string | null;
  total_price: number | null;
  unit_price: number | null;
  detail_url: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

// ===== 编辑备注弹窗 =====
function EditNoteModal({
  row,
  onClose,
  onSaved,
}: {
  row: FavoriteRow;
  onClose: () => void;
  onSaved: (id: number, note: string) => void;
}) {
  const NOTE_TEMPLATE = '- 楼层：\n\n- 装修：\n\n- 楼面：\n\n- 抵押：\n\n- 学区：\n\n- 成交价：';
  const [note, setNote]     = useState(row.note ?? NOTE_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/favorite/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const json = await res.json();
      if (json.success) {
        onSaved(row.id, note);
        onClose();
      } else {
        setError(json.error ?? '保存失败');
      }
    } catch (e) {
      setError(`请求异常: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <span className="text-base font-semibold text-gray-700">📝 编辑备注</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {/* 房源信息 */}
        <div className="px-5 pt-4 pb-1">
          <p className="text-sm font-medium text-gray-700 truncate" title={row.title}>{row.title || row.community}</p>
          <p className="text-xs text-gray-400 mt-0.5">{row.community} · {row.house_type || '—'} · {row.detail_url}</p>
        </div>

        {/* 备注输入 */}
        <div className="px-5 py-3">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="填写备注..."
            rows={10}
            maxLength={1000}
            autoFocus
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
          />
          <div className="text-right text-xs text-gray-400 mt-0.5">{note.length}/1000</div>
          {error && (
            <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">❌ {error}</div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold bg-yellow-400 text-gray-900 rounded-md hover:bg-yellow-500 disabled:opacity-50 transition-colors"
          >
            {saving ? '保存中...' : '💾 保存备注'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 图片预览弹窗（复用样式）=====
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
          <p className="text-sm font-medium text-gray-700 truncate pr-4">{title || '房源缩略图'}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
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

// ===== 主面板 =====
export default function FavoritesPanel() {
  // 筛选条件
  const [filterCommunity, setFilterCommunity] = useState('');
  const [filterDetailUrl, setFilterDetailUrl] = useState('');
  const [communityInput, setCommunityInput]   = useState('');

  // 小区候选下拉
  const [communityOptions, setCommunityOptions]       = useState<string[]>([]);
  const [communityDropdownOpen, setCommunityDropdownOpen] = useState(false);
  const [communityLoading, setCommunityLoading]       = useState(false);
  const communityRef = useRef<HTMLDivElement>(null);

  // 分页
  const [page, setPage]         = useState(1);
  const pageSize                = 50;
  const [total, setTotal]       = useState(0);

  // 数据
  const [rows, setRows]         = useState<FavoriteRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // 弹窗
  const [imgModal, setImgModal]       = useState<{ url: string; title: string } | null>(null);
  const [editModal, setEditModal]     = useState<FavoriteRow | null>(null);
  const [deletingId, setDeletingId]   = useState<number | null>(null);

  // 防抖搜索小区候选
  useEffect(() => {
    const timer = setTimeout(async () => {
      setCommunityLoading(true);
      try {
        const url = communityInput
          ? `/api/community/search?keyword=${encodeURIComponent(communityInput)}&limit=30`
          : `/api/community/search?limit=30`;
        const res  = await fetch(url);
        const json = await res.json();
        if (json.success) setCommunityOptions(json.data ?? []);
      } catch {
        setCommunityOptions([]);
      } finally {
        setCommunityLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [communityInput]);

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

  const fetchFavorites = useCallback(async (p: number = page) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(pageSize),
      });
      if (filterCommunity.trim()) params.set('community', filterCommunity.trim());
      if (filterDetailUrl.trim()) params.set('detailUrl', filterDetailUrl.trim());

      const res  = await fetch(`/api/favorite?${params}`);
      const json = await res.json();
      if (json.success) {
        setRows(json.data ?? []);
        setTotal(json.total ?? 0);
        setPage(p);
      } else {
        setError(json.error ?? '查询失败');
      }
    } catch (e) {
      setError(`请求异常: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterCommunity, filterDetailUrl]);

  // 初次加载
  useEffect(() => {
    fetchFavorites(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => fetchFavorites(1);

  const handleDelete = async (id: number) => {
    if (!confirm('确认取消收藏此房源？')) return;
    setDeletingId(id);
    try {
      const res  = await fetch(`/api/favorite/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setRows(prev => prev.filter(r => r.id !== id));
        setTotal(prev => prev - 1);
      } else {
        alert(json.error ?? '删除失败');
      }
    } catch (e) {
      alert(`请求异常: ${e}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleNoteSaved = (id: number, note: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, note } : r));
  };

  const totalPages = Math.ceil(total / pageSize);

  const fmtUnit  = (v: number | null) => v == null ? '-' : `${(Number(v) * 10000).toFixed(0)}`;
  const fmtPrice = (v: number | null) => v == null ? '-' : Number(v).toFixed(2);
  const fmtArea  = (v: number | null) => v == null ? '-' : Number(v).toFixed(1);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ===== 图片弹窗 ===== */}
      {imgModal && (
        <ImageModal url={imgModal.url} title={imgModal.title} onClose={() => setImgModal(null)} />
      )}

      {/* ===== 编辑备注弹窗 ===== */}
      {editModal && (
        <EditNoteModal
          row={editModal}
          onClose={() => setEditModal(null)}
          onSaved={handleNoteSaved}
        />
      )}

      {/* ===== 筛选区 ===== */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex flex-wrap items-end gap-4">

          {/* 小区搜索 Combobox */}
          <div ref={communityRef} className="relative" style={{ minWidth: 240 }}>
            <label className="block text-xs font-medium text-gray-600 mb-1">小区名称</label>
            <div className="relative">
              <input
                type="text"
                value={communityInput}
                onChange={e => {
                  setCommunityInput(e.target.value);
                  setFilterCommunity(e.target.value);
                  setCommunityDropdownOpen(true);
                }}
                onFocus={() => setCommunityDropdownOpen(true)}
                placeholder="输入关键词搜索小区..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 pr-8"
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
                      setCommunityInput(name);
                      setFilterCommunity(name);
                      setCommunityDropdownOpen(false);
                    }}
                    className="px-3 py-2 text-sm text-gray-700 hover:bg-yellow-50 hover:text-yellow-700 cursor-pointer"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            )}
            {communityDropdownOpen && !communityLoading && communityOptions.length === 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-sm text-gray-400">
                {communityInput ? '暂无匹配小区' : '数据库暂无小区数据'}
              </div>
            )}
          </div>

          {/* 详情链接筛选 */}
          <div style={{ minWidth: 320 }}>
            <label className="block text-xs font-medium text-gray-600 mb-1">详情链接（detail_url）</label>
            <input
              type="text"
              value={filterDetailUrl}
              onChange={e => setFilterDetailUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="输入 URL 关键词筛选..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 font-mono text-xs"
            />
          </div>

          {/* 查询按钮 */}
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-2 bg-yellow-400 text-gray-900 text-sm font-semibold rounded-md hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                查询中...
              </>
            ) : '🔍 查询收藏'}
          </button>

          {/* 刷新 */}
          <button
            onClick={() => fetchFavorites(page)}
            disabled={loading}
            className="px-3 py-2 text-sm text-gray-500 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
            title="刷新"
          >
            🔄
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

        {!loading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <span className="text-5xl mb-4">⭐</span>
            <p className="text-sm">暂无收藏记录</p>
            <p className="text-xs mt-1 text-gray-300">在「房源列表」中点击 ⭐ 按钮即可收藏房源</p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* 表头信息 */}
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">
                ⭐ 我的收藏
                {filterCommunity && <span className="ml-2 text-yellow-600">— {filterCommunity}</span>}
              </span>
              <span className="text-xs text-gray-400">共 {total} 条</span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-max w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                    <th className="px-3 py-3 text-right font-semibold text-gray-600 whitespace-nowrap bg-yellow-50">#</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">省</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">市</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">区</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">小区</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">标题</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">缩略图</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">户型</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">面积(㎡)</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">楼层</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">朝向</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">年份</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap bg-orange-50">
                      单价<br /><span className="font-normal text-gray-400">(元/平)</span>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap bg-blue-50">
                      总价<br /><span className="font-normal text-gray-400">(万)</span>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap" style={{ minWidth: 160 }}>备注</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">收藏时间</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-yellow-50/30 transition-colors border-b border-gray-100 last:border-0">
                      <td className="px-3 py-2.5 text-right text-gray-400 bg-yellow-50/30 whitespace-nowrap">
                        {(page - 1) * pageSize + idx + 1}
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-500 whitespace-nowrap">{row.province || '—'}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500 whitespace-nowrap">{row.city || '—'}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500 whitespace-nowrap">{row.district || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-700 font-medium whitespace-nowrap">{row.community}</td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{row.title || '—'}</td>
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
                      <td className="px-4 py-2.5 text-center text-gray-700 whitespace-nowrap">{row.house_type || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700 whitespace-nowrap">{fmtArea(row.area)}</td>
                      <td className="px-4 py-2.5 text-center text-gray-600 whitespace-nowrap">{row.floor_info || '—'}</td>
                      <td className="px-4 py-2.5 text-center text-gray-600 whitespace-nowrap">{row.orientation || '—'}</td>
                      <td className="px-4 py-2.5 text-center text-gray-600 whitespace-nowrap">{row.build_year || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-orange-700 bg-orange-50/40 whitespace-nowrap">
                        {fmtUnit(row.unit_price)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-blue-700 bg-blue-50/40 whitespace-nowrap">
                        {fmtPrice(row.total_price)}
                      </td>
                      {/* 备注列：可点击编辑 */}
                      <td className="px-4 py-2.5 text-gray-600 max-w-[200px]">
                        <button
                          onClick={() => setEditModal(row)}
                          className="text-left w-full group"
                          title="点击编辑备注"
                        >
                          {row.note ? (
                            <span className="block truncate group-hover:text-yellow-700 transition-colors">{row.note}</span>
                          ) : (
                            <span className="text-gray-300 text-xs group-hover:text-yellow-400 transition-colors italic">点击添加备注...</span>
                          )}
                        </button>
                      </td>
                      {/* 收藏时间 */}
                      <td className="px-4 py-2.5 text-center text-gray-400 whitespace-nowrap">{row.created_at}</td>
                      {/* 操作列 */}
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
                            onClick={() => setEditModal(row)}
                            className="inline-flex items-center px-2 py-1 bg-yellow-400 text-gray-900 text-xs rounded hover:bg-yellow-500 transition-colors"
                            title="编辑备注"
                          >
                            📝
                          </button>
                          <button
                            onClick={() => handleDelete(row.id)}
                            disabled={deletingId === row.id}
                            className="inline-flex items-center px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 disabled:opacity-50 transition-colors"
                            title="取消收藏"
                          >
                            {deletingId === row.id ? '...' : '🗑️'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  第 {page} / {totalPages} 页，共 {total} 条
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => fetchFavorites(1)}
                    disabled={page <= 1 || loading}
                    className="px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-40 transition-colors"
                  >
                    «
                  </button>
                  <button
                    onClick={() => fetchFavorites(page - 1)}
                    disabled={page <= 1 || loading}
                    className="px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-40 transition-colors"
                  >
                    ‹ 上一页
                  </button>
                  <button
                    onClick={() => fetchFavorites(page + 1)}
                    disabled={page >= totalPages || loading}
                    className="px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-40 transition-colors"
                  >
                    下一页 ›
                  </button>
                  <button
                    onClick={() => fetchFavorites(totalPages)}
                    disabled={page >= totalPages || loading}
                    className="px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-40 transition-colors"
                  >
                    »
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
