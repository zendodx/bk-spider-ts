'use client';

/**
 * 采光分析 - 容器面板
 * 负责小区选择（可从 CommunityPanel 联动跳转）+ 二级子 Tab 切换（编辑标注 / 3D 分析）
 */

import { useCallback, useEffect, useState } from 'react';
import type { BuildingPlanData, SunlightAnalysisResult } from '@/types/sunlight';
import type { SunlightTarget } from '@/components/CommunityPanel';
import SunlightEditorPanel from '@/components/SunlightEditorPanel';
import SunlightViewerPanel from '@/components/SunlightViewerPanel';

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

  // 手动输入小区链接查询（未从小区页跳转时的兜底入口）
  const [manualUrl, setManualUrl] = useState('');

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

  const handleManualSubmit = useCallback(() => {
    const url = manualUrl.trim();
    if (!url) return;
    setTarget({ communityUrl: url, community: '（手动输入）', city: '', district: '' });
  }, [manualUrl]);

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
          <div className="flex items-center gap-2 ml-2">
            <input
              type="text"
              value={manualUrl}
              onChange={e => setManualUrl(e.target.value)}
              placeholder="请从「小区信息」页点击进入，或手动粘贴小区链接"
              className="w-96 px-2 py-1 border rounded text-xs"
              onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
            />
            <button onClick={handleManualSubmit} className="px-2.5 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600">
              打开
            </button>
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
