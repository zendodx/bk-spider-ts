'use client';

/**
 * 采光分析 - 3D 分析查看器
 * 完全 React 化重写，迁移自 building-sunlight-simulator/viewer.html + js/viewer.js
 *
 * 功能：加载标注方案 → 3D 场景展示 → 时间轴太阳位置模拟 → 日照时长分析（Worker）→ 结果缓存
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { BuildingPlanData } from '@/types/sunlight';
import { SUNLIGHT_CONFIG } from '@/lib/sunlight/config';
import { calculateSolarDeclination, calculateSolarTimeOffset, getSeasonPresetDate, type SeasonPreset } from '@/lib/sunlight/solar-time';
import { formatTime, roundTo, transformProjectData } from '@/lib/sunlight/utils';
import {
  clearHeatmapInteractionState,
  collectBuildingMeshes,
  createHeatmapLayer,
  createHeatmapState,
  createPlanFingerprint,
  createSunlightScene,
  fitViewToBuildings,
  loadBuildingsIntoScene,
  pickHeatmapApartment,
  refreshHeatmapOccluderMeshes,
  runSunlightAnalysis,
  setHeatmapHover,
  setHeatmapSelection,
  updateSunLight,
  type HeatmapCellUserData,
  type HeatmapState,
  type SunlightComputationResult,
  type SunlightSceneHandles,
} from '@/lib/sunlight/viewer-engine';
import type { SunlightAnalysisResult } from '@/types/sunlight';

interface SunlightViewerPanelProps {
  communityUrl: string;
  planData: BuildingPlanData;
  cachedAnalysis: SunlightAnalysisResult | null;
}

const SEASON_OPTIONS: { value: SeasonPreset | 'custom'; label: string }[] = [
  { value: 'december-solstice', label: '冬至（采光最不利）' },
  { value: 'march-equinox', label: '春分' },
  { value: 'september-equinox', label: '秋分' },
  { value: 'june-solstice', label: '夏至' },
  { value: 'custom', label: '自定义日期' },
];

export default function SunlightViewerPanel({ communityUrl, planData, cachedAnalysis }: SunlightViewerPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SunlightSceneHandles | null>(null);
  const analysisResultRef = useRef<SunlightComputationResult | null>(null);
  const heatmapStateRef = useRef<HeatmapState>(createHeatmapState());
  const raycasterRef = useRef(new THREE.Raycaster());

  const [hour, setHour] = useState(12);
  const [seasonPreset, setSeasonPreset] = useState<SeasonPreset | 'custom'>('december-solstice');
  const [customDate, setCustomDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [referenceHours, setReferenceHours] = useState(SUNLIGHT_CONFIG.SUNLIGHT_ANALYSIS.REFERENCE_HOURS);
  const [showOwnOnly, setShowOwnOnly] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState('');
  const [analysisSummary, setAnalysisSummary] = useState<SunlightComputationResult | null>(null);
  const [savingCache, setSavingCache] = useState(false);
  const [sunAltitudeDeg, setSunAltitudeDeg] = useState(0);

  // ── 热力图与点击信息面板 ─────────────────────────────────────────
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapReady, setHeatmapReady] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<HeatmapCellUserData | null>(null);

  const analysisDate = useMemo(() => (seasonPreset === 'custom' ? customDate : getSeasonPresetDate(seasonPreset) || customDate), [seasonPreset, customDate]);

  /**
   * 标注时楼栋轮廓坐标是相对「图纸朝上方向」的，northAngle 记录了图纸朝上方向相对真北的偏转角度
   * （顺时针为正）。3D 场景与太阳位置计算都以世界坐标系正北（Z 轴负方向）为基准，
   * 因此必须先把标注数据按 northAngle 旋转对齐到真北，否则楼栋朝向与太阳方位的相对关系会完全错乱，
   * 导致算出来的采光时长与实际直觉感受不符（此前迁移时遗漏了这一步，是问题的根因）。
   */
  const currentData = useMemo(() => transformProjectData(planData, planData.northAngle) ?? planData, [planData]);

  const solarSettings = useMemo(() => {
    const declination = calculateSolarDeclination(analysisDate);
    const solarTimeOffset = calculateSolarTimeOffset(analysisDate, currentData.longitude, currentData.timeZone);
    return { declination, solarTimeOffset };
  }, [analysisDate, currentData.longitude, currentData.timeZone]);

  // ── 场景初始化 ─────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handles = createSunlightScene(container);
    sceneRef.current = handles;

    const onResize = () => {
      // 容器被父级 Tab 以 display:none 隐藏时宽高为 0，此时不更新渲染尺寸/相机比例，
      // 避免出现除以 0（aspect = NaN）或渲染画布尺寸变为 0 的问题；等切回可见时会再次触发。
      if (container.clientWidth <= 0 || container.clientHeight <= 0) return;
      handles.camera.aspect = container.clientWidth / container.clientHeight;
      handles.camera.updateProjectionMatrix();
      handles.renderer.setSize(container.clientWidth, container.clientHeight);
      handles.requestRender(true);
    };
    window.addEventListener('resize', onResize);

    // 用 ResizeObserver 监听容器自身尺寸变化（含父级 Tab 从 display:none 切回可见的情况），
    // 仅监听 window resize 无法感知这种由 CSS display 切换引起的尺寸变化。
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => onResize());
      observer.observe(container);
    }

    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
      handles.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ── 加载楼栋数据 ───────────────────────────────────────────────
  useEffect(() => {
    const handles = sceneRef.current;
    if (!handles) return;
    loadBuildingsIntoScene(handles.buildingsGroup, currentData);
    fitViewToBuildings(handles);
    // 楼栋几何体重建后，热力图射线遮挡判断所依赖的实体网格缓存需要同步刷新
    refreshHeatmapOccluderMeshes(heatmapStateRef.current, handles.buildingsGroup);
    // 楼栋数据变化后旧的热力图/选中状态不再有效
    clearHeatmapInteractionState(heatmapStateRef.current);
    handles.heatmapGroup.visible = false;
    setShowHeatmap(false);
    setHeatmapReady(false);
    setSelectedUnit(null);
  }, [currentData]);

  // ── 可见性过滤（仅本小区） ─────────────────────────────────────
  useEffect(() => {
    const handles = sceneRef.current;
    if (!handles) return;
    handles.buildingsGroup.children.forEach(node => {
      if (typeof node.userData?.own === 'boolean') {
        node.visible = showOwnOnly ? node.userData.own : true;
      }
    });
    handles.requestRender(true);
  }, [showOwnOnly, currentData]);

  // ── 时间轴驱动太阳位置 ─────────────────────────────────────────
  useEffect(() => {
    const handles = sceneRef.current;
    if (!handles || !Number.isFinite(solarSettings.declination) || !Number.isFinite(solarSettings.solarTimeOffset)) return;
    const alt = updateSunLight(handles, hour, currentData.latitude, solarSettings.declination, solarSettings.solarTimeOffset);
    setSunAltitudeDeg(roundTo((alt * 180) / Math.PI, 1));
  }, [hour, currentData.latitude, solarSettings]);

  // ── 加载已缓存的分析结果 ───────────────────────────────────────
  useEffect(() => {
    if (!cachedAnalysis) {
      setAnalysisSummary(null);
      analysisResultRef.current = null;
      return;
    }
    // 缓存的结果只有汇总统计（apartments），此处仅用于展示概要信息，不含完整采样点热力图
    setAnalysisSummary(null);
  }, [cachedAnalysis]);

  // ── 触发日照分析 ───────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    const handles = sceneRef.current;
    if (!handles) return;
    if (!Number.isFinite(solarSettings.declination) || !Number.isFinite(solarSettings.solarTimeOffset)) {
      setAnalysisError('分析日期或位置参数无效');
      return;
    }

    setAnalyzing(true);
    setAnalysisError('');
    setProgress(0);
    try {
      const buildingMeshes = collectBuildingMeshes(handles.buildingsGroup);
      const result = await runSunlightAnalysis(currentData, buildingMeshes, {
        latitude: currentData.latitude,
        declination: solarSettings.declination,
        solarTimeOffset: solarSettings.solarTimeOffset,
        referenceHours,
        onProgress: setProgress,
      });
      analysisResultRef.current = result;
      setAnalysisSummary(result);

      // 分析完成后自动构建并显示热力图（迁移自原版 presentSunlightResults 的行为）
      createHeatmapLayer(handles.heatmapGroup, heatmapStateRef.current, result);
      handles.heatmapGroup.visible = true;
      setShowHeatmap(true);
      setHeatmapReady(true);
      setSelectedUnit(null);
      handles.requestRender(true);
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }, [currentData, referenceHours, solarSettings]);

  // ── 热力图显隐开关 ─────────────────────────────────────────────
  const toggleHeatmap = useCallback((show: boolean) => {
    const handles = sceneRef.current;
    if (!handles) return;
    setShowHeatmap(show);
    handles.heatmapGroup.visible = show;
    if (!show) {
      clearHeatmapInteractionState(heatmapStateRef.current);
      setSelectedUnit(null);
      handles.renderer.domElement.style.cursor = '';
    }
    handles.requestRender(true);
  }, []);

  // ── 画布指针坐标 → NDC ────────────────────────────────────────
  const getNdcFromEvent = useCallback((e: React.MouseEvent<HTMLDivElement>): { x: number; y: number } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    };
  }, []);

  // ── 悬浮：高亮 + 光标反馈 ─────────────────────────────────────
  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const handles = sceneRef.current;
      if (!handles || !showHeatmap || !heatmapReady) return;
      const ndc = getNdcFromEvent(e);
      if (!ndc) return;
      const pick = pickHeatmapApartment(ndc.x, ndc.y, handles.camera, handles.heatmapGroup, heatmapStateRef.current, raycasterRef.current);
      setHeatmapHover(heatmapStateRef.current, pick?.apartmentKey ?? null);
      handles.renderer.domElement.style.cursor = pick ? 'pointer' : '';
      handles.requestRender(true);
    },
    [showHeatmap, heatmapReady, getNdcFromEvent]
  );

  const handleCanvasMouseLeave = useCallback(() => {
    const handles = sceneRef.current;
    if (!handles) return;
    setHeatmapHover(heatmapStateRef.current, null);
    handles.renderer.domElement.style.cursor = '';
    handles.requestRender(true);
  }, []);

  // ── 点击：选中并展示户型信息面板 ─────────────────────────────
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const handles = sceneRef.current;
      if (!handles || !showHeatmap || !heatmapReady) return;
      const ndc = getNdcFromEvent(e);
      if (!ndc) return;
      const pick = pickHeatmapApartment(ndc.x, ndc.y, handles.camera, handles.heatmapGroup, heatmapStateRef.current, raycasterRef.current);
      setHeatmapSelection(heatmapStateRef.current, pick?.apartmentKey ?? null);
      setSelectedUnit(pick?.userData ?? null);
      handles.requestRender(true);
    },
    [showHeatmap, heatmapReady, getNdcFromEvent]
  );

  // ── 保存分析结果到数据库 ───────────────────────────────────────
  const saveAnalysisResult = useCallback(async () => {
    const result = analysisResultRef.current;
    if (!result) return;
    setSavingCache(true);
    try {
      const apartments = Object.entries(result.buildings).flatMap(([buildingIndex, summary]) => {
        const seen = new Set<string>();
        const list: { key: string; buildingName: string; floor: number; unitNumber: number; hours: number; meetsReference: boolean }[] = [];
        summary.units.forEach(point => {
          const key = `${buildingIndex}-${point.floor}-${point.unit}`;
          if (seen.has(key)) return;
          seen.add(key);
          const hoursValue = point.unitMaxHours ?? point.sunlightHours;
          list.push({
            key,
            buildingName: summary.name,
            floor: point.floor,
            unitNumber: point.unit,
            hours: roundTo(hoursValue, 2),
            meetsReference: hoursValue >= referenceHours,
          });
        });
        return list;
      });

      const analysisJson: SunlightAnalysisResult = {
        schemaVersion: SUNLIGHT_CONFIG.SUNLIGHT_ANALYSIS.PRECOMPUTED_SCHEMA_VERSION,
        algorithmVersion: SUNLIGHT_CONFIG.SUNLIGHT_ANALYSIS.PRECOMPUTED_ALGORITHM_VERSION,
        projectFingerprint: createPlanFingerprint(planData),
        samplingFingerprint: '',
        analysisDate,
        referenceHours,
        apartments,
        computedAt: new Date().toISOString(),
      };

      const res = await fetch('/api/sunlight/plan/analysis', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityUrl, analysisJson }),
      });
      const json = await res.json();
      if (!json.success) {
        setAnalysisError(json.error || '保存分析结果失败');
      }
    } catch (e) {
      setAnalysisError(`保存异常: ${e}`);
    } finally {
      setSavingCache(false);
    }
  }, [analysisDate, communityUrl, planData, referenceHours]);

  return (
    <div className="flex h-full">
      {/* 左侧 3D 视口 */}
      <div className="relative flex-1 bg-gray-100">
        <div
          ref={containerRef}
          className="absolute inset-0"
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
        />

        {/* 热力图图例 + 开关 */}
        {heatmapReady && (
          <div className="absolute top-3 left-3 bg-white/95 shadow-lg rounded-lg px-3 py-2.5 text-xs w-52">
            <label className="flex items-center gap-1.5 font-medium text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={showHeatmap} onChange={e => toggleHeatmap(e.target.checked)} />
              显示日照热力图
            </label>
            {showHeatmap && (
              <div className="mt-2">
                <div
                  className="h-2.5 rounded"
                  style={{ background: 'linear-gradient(to right, #fffacd, #ffefaa, #ffdf82, #ffc85a, #ffaa3c, #f58c28, #dc6414)' }}
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                  <span>0h</span>
                  <span>4h</span>
                  <span>{SUNLIGHT_CONFIG.SUNLIGHT_ANALYSIS.MAX_HOURS}h+</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">点击墙面色块查看该户日照详情</p>
              </div>
            )}
          </div>
        )}

        {/* 点击后的户型采光信息面板 */}
        {selectedUnit && (
          <div className="absolute top-3 right-3 bg-white shadow-lg rounded-lg w-60 text-xs overflow-hidden">
            <div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b">
              <span className="font-semibold text-gray-700">{selectedUnit.buildingName}</span>
              <button
                onClick={() => {
                  setHeatmapSelection(heatmapStateRef.current, null);
                  setSelectedUnit(null);
                  sceneRef.current?.requestRender(true);
                }}
                className="text-gray-400 hover:text-gray-600 text-sm leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-3 space-y-1.5">
              <div className="flex justify-between text-gray-600">
                <span>楼层</span>
                <span>{selectedUnit.floor} 层</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>户号</span>
                <span>第 {selectedUnit.unit} 户</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>该点日照时长</span>
                <span>{roundTo(selectedUnit.sunlightHours, 2)}h</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>该户最大时长</span>
                <span>{roundTo(selectedUnit.unitMaxHours, 2)}h</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t mt-1.5">
                <span className="text-gray-600">达标状态</span>
                <span
                  className={
                    selectedUnit.unitMaxHours >= referenceHours
                      ? 'text-green-600 font-medium'
                      : 'text-red-500 font-medium'
                  }
                >
                  {selectedUnit.unitMaxHours >= referenceHours ? '✓ 达标' : '✗ 不达标'}
                </span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded overflow-hidden mt-1">
                <div
                  className="h-full bg-orange-400"
                  style={{
                    width: `${Math.min((selectedUnit.unitMaxHours / SUNLIGHT_CONFIG.SUNLIGHT_ANALYSIS.MAX_HOURS) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 时间轴悬浮控件 */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/95 shadow-lg rounded-lg px-4 py-2.5 flex items-center gap-3 w-[420px]">
          <span className="text-xs text-gray-500 whitespace-nowrap">☀️ {formatTime(hour)}</span>
          <input
            type="range"
            min={SUNLIGHT_CONFIG.TIME.MIN_HOUR}
            max={SUNLIGHT_CONFIG.TIME.MAX_HOUR}
            step={SUNLIGHT_CONFIG.TIME.STEP}
            value={hour}
            onChange={e => setHour(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="text-xs text-gray-400 whitespace-nowrap">高度角 {sunAltitudeDeg}°</span>
        </div>

        {analyzing && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="bg-white rounded-lg px-6 py-4 text-sm text-gray-700 w-64">
              <div className="mb-2">正在计算日照时长... {Math.round(progress * 100)}%</div>
              <div className="w-full h-2 bg-gray-200 rounded overflow-hidden">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 右侧控制面板 */}
      <div className="w-96 flex-shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-4 space-y-5 text-sm">
        <div>
          <label className="block font-semibold text-gray-700 mb-1.5">分析日期</label>
          <select value={seasonPreset} onChange={e => setSeasonPreset(e.target.value as SeasonPreset | 'custom')} className="w-full px-2 py-1.5 border rounded text-xs">
            {SEASON_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {seasonPreset === 'custom' && (
            <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} className="w-full mt-2 px-2 py-1.5 border rounded text-xs" />
          )}
          <p className="text-xs text-gray-400 mt-1">当前分析日期：{analysisDate}</p>
        </div>

        <div>
          <label className="block font-semibold text-gray-700 mb-1.5">日照达标标准</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0.1}
              max={12}
              step={0.1}
              value={referenceHours}
              onChange={e => setReferenceHours(parseFloat(e.target.value) || SUNLIGHT_CONFIG.SUNLIGHT_ANALYSIS.REFERENCE_HOURS)}
              className="w-20 px-2 py-1.5 border rounded text-xs"
            />
            <span className="text-xs text-gray-400">小时/天为达标（大寒日/冬至日常用标准 ≥2 小时）</span>
          </div>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input type="checkbox" checked={showOwnOnly} onChange={e => setShowOwnOnly(e.target.checked)} />
          仅显示本小区楼栋（隐藏周边遮挡楼）
        </label>

        <button
          onClick={runAnalysis}
          disabled={analyzing}
          className="w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-sm font-medium disabled:opacity-50"
        >
          {analyzing ? '分析中...' : '☀️ 开始日照分析'}
        </button>

        {analysisError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{analysisError}</div>}

        {analysisSummary && (
          <div className="border rounded-md p-3 space-y-2 bg-gray-50">
            <div className="font-semibold text-gray-700 text-xs">分析结果概要</div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div>总户数：{analysisSummary.totalUnits}</div>
              <div>
                不达标户数：<span className="text-red-500">{analysisSummary.belowReference}</span>
              </div>
              <div>平均时长：{roundTo(analysisSummary.avgHours, 2)}h</div>
              <div>
                最短/最长：{roundTo(analysisSummary.minHours, 2)}h / {roundTo(analysisSummary.maxHours, 2)}h
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto border-t pt-2 mt-2 space-y-1">
              {Object.entries(analysisSummary.buildings).map(([idx, b]) => (
                <div key={idx} className="flex justify-between text-xs text-gray-600">
                  <span>{b.name}</span>
                  <span>
                    均{roundTo(b.avgHours, 1)}h · 不达标{b.belowReference}/{b.totalUnits}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={saveAnalysisResult}
              disabled={savingCache}
              className="w-full mt-2 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-md text-xs font-medium disabled:opacity-50"
            >
              {savingCache ? '保存中...' : '💾 保存分析结果到数据库'}
            </button>
          </div>
        )}

        {!analysisSummary && cachedAnalysis && (
          <div className="border rounded-md p-3 space-y-2 bg-blue-50">
            <div className="font-semibold text-gray-700 text-xs">已缓存的分析结果</div>
            <div className="text-xs text-gray-600">分析日期：{cachedAnalysis.analysisDate}</div>
            <div className="text-xs text-gray-600">
              达标标准：{cachedAnalysis.referenceHours}h · 共 {cachedAnalysis.apartments.length} 户
            </div>
            <div className="text-xs text-gray-600">
              不达标：{cachedAnalysis.apartments.filter(a => !a.meetsReference).length} 户
            </div>
            <div className="text-xs text-gray-400">计算于：{new Date(cachedAnalysis.computedAt).toLocaleString('zh-CN')}</div>
            <div className="max-h-40 overflow-y-auto border-t pt-2 mt-2 space-y-0.5">
              {cachedAnalysis.apartments.slice(0, 200).map(a => (
                <div key={a.key} className={`flex justify-between text-xs ${a.meetsReference ? 'text-gray-600' : 'text-red-500'}`}>
                  <span>
                    {a.buildingName} {a.floor}层{a.unitNumber}号
                  </span>
                  <span>{a.hours}h</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 pt-2 border-t">
          🖱️ 左键拖拽旋转视角，滚轮缩放，右键平移。分析基于射线遮挡算法，楼栋越多计算耗时越长。
          <br />
          🔥 分析完成后自动显示日照热力图，点击墙面色块可查看该户楼层/日照时长/达标详情。
        </p>
      </div>
    </div>
  );
}
