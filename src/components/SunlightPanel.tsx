'use client';

/**
 * 采光分析 - 容器面板
 * 负责小区选择（可从 CommunityPanel 联动跳转）+ 二级子 Tab 切换（编辑标注 / 3D 分析）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BuildingPlanData, SunlightAnalysisResult } from '@/types/sunlight';
import type { SunlightTarget } from '@/components/CommunityPanel';
import SunlightEditorPanel from '@/components/SunlightEditorPanel';
import SunlightViewerPanel from '@/components/SunlightViewerPanel';

interface CommunityOption {
  community: string;
  city: string;
  district: string;
  community_url: string | null;
}

interface SunlightPanelProps {
  /** 从「小区信息」页跳转过来时携带的目标小区（跳转后应被消费一次） */
  pendingTarget: SunlightTarget | null;
  onConsumePendingTarget: () => void;
}

type SubTab = 'editor' | 'viewer';

interface PlanApiResponse {
  communityUrl: string;
  community: string;
  city: string;
  district: string;
  hasBaseImage: boolean;
  planJson: BuildingPlanData;
  analysisJson: SunlightAnalysisResult | null;
  planFingerprint: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function SunlightPanel({ pendingTarget, onConsumePendingTarget }: SunlightPanelProps) {
  const [target, setTarget] = useState<SunlightTarget | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('editor');

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [plan, setPlan] = useState<PlanApiResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // 小区名称下拉搜索选择（未从小区页跳转时的入口，与房源列表等页面保持一致的交互）
  const [communityKeyword, setCommunityKeyword] = useState('');
  const [communityOptions, setCommunityOptions] = useState<CommunityOption[]>([]);
  const [communityDropdownOpen, setCommunityDropdownOpen] = useState(false);
  const [communityLoading, setCommunityLoading] = useState(false);
  const communityRef = useRef<HTMLDivElement>(null);

  // 接收从 CommunityPanel 跳转过来的目标
  useEffect(() => {
    if (pendingTarget) {
      setTarget(pendingTarget);
      setSubTab('editor');
      onConsumePendingTarget();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTarget]);

  // 加载指定小区的方案
  useEffect(() => {
    if (!target) {
      setPlan(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    fetch(`/api/sunlight/plan?communityUrl=${encodeURIComponent(target.communityUrl)}`)
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        if (!json.success) {
          setLoadError(json.error || '加载失败');
          setPlan(null);
          return;
        }
        setPlan(json.data);
        // 若已有方案且已标注楼栋，默认进入 3D 分析页；否则进入编辑页
        if (json.data && json.data.planJson?.buildings?.length > 0) {
          setSubTab(prev => prev);
        }
      })
      .catch(e => {
        if (!cancelled) setLoadError(`请求异常: ${e}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target, reloadToken]);

  const handleSaved = useCallback(() => {
    setReloadToken(v => v + 1);
    setSubTab('viewer');
  }, []);

  // 防抖查询小区候选（复用 /api/community/stats 以获取 community_url，用于唯一定位小区方案）
  useEffect(() => {
    const timer = setTimeout(async () => {
      setCommunityLoading(true);
      try {
        const url = communityKeyword
          ? `/api/community/stats?keyword=${encodeURIComponent(communityKeyword)}&limit=30`
          : `/api/community/stats?limit=30`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.success) {
          setCommunityOptions(
            (json.data ?? []).map((row: { community: string; city: string; district: string; community_url: string | null }) => ({
              community: row.community,
              city: row.city,
              district: row.district,
              community_url: row.community_url,
            }))
          );
        }
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

  const handleSelectCommunity = useCallback((option: CommunityOption) => {
    if (!option.community_url) return;
    setTarget({ communityUrl: option.community_url, community: option.community, city: option.city, district: option.district });
    setCommunityKeyword('');
    setCommunityDropdownOpen(false);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* 顶部：当前小区信息条 */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-white">
        <span className="text-lg">☀️</span>
        <span className="font-semibold text-gray-700">采光分析</span>

        {target ? (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-600">
              {target.community}
              {target.city || target.district ? `（${[target.city, target.district].filter(Boolean).join(' ')}）` : ''}
            </span>
            <button onClick={() => setTarget(null)} className="text-xs text-gray-400 hover:text-red-500 ml-1">
              ✕ 切换小区
            </button>
          </>
        ) : (
          <div ref={communityRef} className="relative ml-2" style={{ minWidth: 260 }}>
            <div className="relative">
              <input
                type="text"
                value={communityKeyword}
                onChange={e => {
                  setCommunityKeyword(e.target.value);
                  setCommunityDropdownOpen(true);
                }}
                onFocus={() => setCommunityDropdownOpen(true)}
                placeholder="输入关键词搜索小区..."
                className="w-72 px-2 py-1 border rounded text-xs pr-7"
              />
              {communityLoading && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2">
                  <svg className="animate-spin h-3.5 w-3.5 text-gray-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </span>
              )}
            </div>
            {communityDropdownOpen && communityOptions.length > 0 && (
              <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
                {communityOptions.map(option => (
                  <li
                    key={`${option.community}-${option.community_url ?? ''}`}
                    onMouseDown={() => handleSelectCommunity(option)}
                    className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between gap-2 ${
                      option.community_url ? 'text-gray-700 hover:bg-amber-50 hover:text-amber-700' : 'text-gray-300 cursor-not-allowed'
                    }`}
                    title={option.community_url ? '' : '该小区缺少链接，暂不支持采光分析'}
                  >
                    <span className="truncate">{option.community}</span>
                    <span className="text-gray-400 whitespace-nowrap">{[option.city, option.district].filter(Boolean).join(' ')}</span>
                  </li>
                ))}
              </ul>
            )}
            {communityDropdownOpen && !communityLoading && communityOptions.length === 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-xs text-gray-400">
                {communityKeyword ? '暂无匹配小区' : '数据库暂无小区数据'}
              </div>
            )}
          </div>
        )}

        {target && (
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => setSubTab('editor')}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={subTab === 'editor' ? { background: '#eef6ff', color: '#3b82f6' } : { color: '#6b7280' }}
            >
              ✏️ 编辑标注
            </button>
            <button
              onClick={() => setSubTab('viewer')}
              disabled={!plan || plan.planJson.buildings.length === 0}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40"
              style={subTab === 'viewer' ? { background: '#eef6ff', color: '#3b82f6' } : { color: '#6b7280' }}
            >
              🌇 3D 分析
            </button>
          </div>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-hidden">
        {!target && (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <span className="text-6xl mb-4">☀️</span>
            <p className="text-lg font-medium text-gray-600">请先选择一个小区</p>
            <p className="text-sm mt-1">前往「小区信息」页，点击目标小区的「采光分析」按钮</p>
          </div>
        )}

        {target && loading && (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">加载中...</div>
        )}

        {target && !loading && loadError && (
          <div className="h-full flex items-center justify-center text-red-500 text-sm">{loadError}</div>
        )}

        {target && !loading && !loadError && (
          <>
            <div className="h-full" style={{ display: subTab === 'editor' ? 'block' : 'none' }}>
              <SunlightEditorPanel
                communityUrl={target.communityUrl}
                community={target.community}
                city={target.city}
                district={target.district}
                initialPlan={plan?.planJson ?? null}
                initialHasBaseImage={plan?.hasBaseImage ?? false}
                onSaved={handleSaved}
              />
            </div>
            {plan && plan.planJson.buildings.length > 0 && (
              <div className="h-full" style={{ display: subTab === 'viewer' ? 'block' : 'none' }}>
                <SunlightViewerPanel communityUrl={target.communityUrl} planData={plan.planJson} cachedAnalysis={plan.analysisJson} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
