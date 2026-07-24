'use client';

/**
 * 采光分析 - 标注编辑器
 * 完全 React 化重写，迁移自 building-sunlight-simulator/editor.html + js/editor.js
 *
 * 功能：上传规划底图 → 标定比例尺 → 绘制楼栋轮廓 → 配置楼栋参数 → 保存到数据库
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BuildingPlanData, Point2D } from '@/types/sunlight';
import { SUNLIGHT_CONFIG } from '@/lib/sunlight/config';
import { CITY_DATA, getLocationByCity } from '@/lib/sunlight/cities';
import {
  clampFloat,
  clampInt,
  createFingerprint,
  deepClone,
  distance,
  getPolygonArea,
  getPolygonCenter,
  isValidTimeZone,
  normalizeAngle,
  sanitizePolygon,
} from '@/lib/sunlight/utils';
import { createEditingBuildingId, type EditingBuilding } from '@/lib/sunlight/editor-types';

type DrawMode = 'idle' | 'scaling' | 'drawing';

interface SunlightEditorPanelProps {
  communityUrl: string;
  community: string;
  city: string;
  district: string;
  /** 已有方案（若存在），加载后自动进入编辑态 */
  initialPlan: BuildingPlanData | null;
  initialHasBaseImage: boolean;
  onSaved: () => void;
}

const MAX_EDIT_HISTORY = 50;

function defaultLocationForCity(): { lat: number; lon: number; timeZone: string } {
  const loc = getLocationByCity(SUNLIGHT_CONFIG.DEFAULTS.CITY);
  return {
    lat: loc?.lat ?? SUNLIGHT_CONFIG.DEFAULTS.LATITUDE,
    lon: loc?.lon ?? SUNLIGHT_CONFIG.DEFAULTS.LONGITUDE,
    timeZone: loc?.timeZone ?? SUNLIGHT_CONFIG.DEFAULTS.TIME_ZONE,
  };
}

export default function SunlightEditorPanel({
  communityUrl,
  community,
  city,
  district,
  initialPlan,
  initialHasBaseImage,
  onSaved,
}: SunlightEditorPanelProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 图像/画布状态 ──────────────────────────────────────────────
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [hasPlanImage, setHasPlanImage] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const viewRef = useRef({ scale: 1, x: 0, y: 0 });
  const [, forceViewUpdate] = useState(0);

  // ── 标注状态 ───────────────────────────────────────────────────
  const [scaleRatio, setScaleRatio] = useState(0);
  const [scaleStatus, setScaleStatus] = useState<'unset' | 'prompting' | 'set'>('unset');
  const scalePointsRef = useRef<Point2D[]>([]);
  const [realDistance, setRealDistance] = useState(50);
  const [showScaleConfirm, setShowScaleConfirm] = useState(false);

  const [mode, setMode] = useState<DrawMode>('idle');
  const currentPolyRef = useRef<Point2D[]>([]);
  const mousePosRef = useRef<Point2D>({ x: 0, y: 0 });
  const [, forceDrawUpdate] = useState(0);

  const [buildings, setBuildings] = useState<EditingBuilding[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const historyRef = useRef<EditingBuilding[][]>([]);
  const [historyLength, setHistoryLength] = useState(0);
  const draggingRef = useRef<{ buildingId: string; lastPoint: Point2D; before: EditingBuilding[]; moved: boolean } | null>(null);
  const panRef = useRef<{ active: boolean; lastX: number; lastY: number }>({ active: false, lastX: 0, lastY: 0 });
  const spacePressedRef = useRef(false);

  // ── 位置/日期配置 ──────────────────────────────────────────────
  const defaultLoc = useMemo(defaultLocationForCity, []);
  const [latitude, setLatitude] = useState(initialPlan?.latitude ?? defaultLoc.lat);
  const [longitude, setLongitude] = useState(initialPlan?.longitude ?? defaultLoc.lon);
  const [timeZone, setTimeZone] = useState(initialPlan?.timeZone ?? defaultLoc.timeZone);
  const [northAngle, setNorthAngle] = useState(initialPlan?.northAngle ?? 0);
  const [selectedCity, setSelectedCity] = useState(initialPlan ? '' : SUNLIGHT_CONFIG.DEFAULTS.CITY);

  // ── 新楼栋默认参数 ─────────────────────────────────────────────
  const [defFloors, setDefFloors] = useState(SUNLIGHT_CONFIG.DEFAULTS.FLOORS);
  const [defFloorHeight, setDefFloorHeight] = useState(SUNLIGHT_CONFIG.DEFAULTS.FLOOR_HEIGHT);
  const [defUnits, setDefUnits] = useState(SUNLIGHT_CONFIG.DEFAULTS.UNITS_PER_FLOOR);
  const [defIsThisCommunity, setDefIsThisCommunity] = useState(true);
  const [useDefaults, setUseDefaults] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── 初始加载已有方案（把米坐标转换回像素坐标以便继续编辑） ─────────
  // 关键原则：像素坐标 = 米坐标 / scaleRatio + origin像素偏移，其中 scaleRatio 必须严格使用
  // 保存时的原始值，不能重新计算——否则会导致标注框与底图比例对不上（见历史 bug）。
  //
  // 精确复原依赖 originPixel（origin 在底图上的绝对像素坐标，保存时写入）：
  // pixelX = meterX / scaleRatio + originPixel.x。
  // 若加载的是旧版本数据（缺少 originPixel），则退化为「bbox 与底图居中对齐」的近似算法，
  // 可能与原始标注位置存在偏差（这是历史数据的已知限制，无法逆向精确还原）。
  useEffect(() => {
    if (!initialPlan) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    initialPlan.buildings.forEach(b => {
      b.shape.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });
    });
    if (!Number.isFinite(minX)) return;

    // 必须原样复用保存时的比例尺，不可重新计算，否则标注框与底图会错位
    const editorScale = initialPlan.scaleRatio > 0 ? initialPlan.scaleRatio : 1;
    const padding = 80;
    const originPixel = initialPlan.originPixel;

    setScaleRatio(editorScale);
    setScaleStatus('set');
    setHasPlanImage(initialHasBaseImage);

    const applyBuildings = (offsetX: number, offsetY: number) => {
      setBuildings(
        initialPlan.buildings.map((b, index) => ({
          id: `imported-${index}-${Date.now().toString(36)}`,
          name: b.name,
          floors: b.floors,
          floorHeight: b.floorHeight,
          units: b.units,
          isThisCommunity: b.isThisCommunity !== false,
          unitSplitAngleDeg: b.unitSplitAngleDeg || 0,
          unitNumberingStartSide: b.unitNumberingStartSide || 'A',
          points: b.shape.map(p => ({
            x: p.x / editorScale + offsetX,
            y: p.y / editorScale + offsetY,
          })),
        }))
      );
    };

    if (initialHasBaseImage) {
      // 有底图：画布尺寸必须等于底图真实像素尺寸。
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        let offsetX: number;
        let offsetY: number;
        if (originPixel) {
          // 精确复原：直接使用保存时记录的像素原点
          offsetX = originPixel.x;
          offsetY = originPixel.y;
        } else {
          // 兼容旧数据：按 bbox 居中对齐底图（近似值，可能有偏差）
          const bboxWidthPx = (maxX - minX) / editorScale;
          const bboxHeightPx = (maxY - minY) / editorScale;
          offsetX = (img.width - bboxWidthPx) / 2 - minX / editorScale;
          offsetY = (img.height - bboxHeightPx) / 2 - minY / editorScale;
        }
        applyBuildings(offsetX, offsetY);
        setCanvasSize({ width: img.width, height: img.height });
        setIsImageLoaded(true);
        scheduleDraw();
      };
      img.src = `/api/sunlight/image?communityUrl=${encodeURIComponent(communityUrl)}`;
    } else {
      // 无底图：画布尺寸按 bbox + 固定 padding 生成即可，不存在错位风险
      const offsetX = originPixel ? originPixel.x : padding - minX / editorScale;
      const offsetY = originPixel ? originPixel.y : padding - minY / editorScale;
      applyBuildings(offsetX, offsetY);
      setCanvasSize({
        width: Math.max(800, Math.ceil((maxX - minX) / editorScale + padding * 2)),
        height: Math.max(600, Math.ceil((maxY - minY) / editorScale + padding * 2)),
      });
      setIsImageLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPlan, initialHasBaseImage, communityUrl]);

  // ── 撤销历史 ───────────────────────────────────────────────────
  const pushHistory = useCallback((before: EditingBuilding[]) => {
    if (createFingerprint(before) === createFingerprint(buildings)) return;
    historyRef.current.push(before);
    if (historyRef.current.length > MAX_EDIT_HISTORY) historyRef.current.shift();
    setHistoryLength(historyRef.current.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildings]);

  const captureState = useCallback(() => deepClone(buildings), [buildings]);

  const undoLastEdit = useCallback(() => {
    const previous = historyRef.current.pop();
    setHistoryLength(historyRef.current.length);
    if (!previous) return;
    setBuildings(previous);
    if (!previous.some(b => b.id === selectedBuildingId)) setSelectedBuildingId(null);
  }, [selectedBuildingId]);

  // ── 绘制 Canvas ────────────────────────────────────────────────
  const scheduleDraw = useCallback(() => forceDrawUpdate(v => v + 1), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!isImageLoaded) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (hasPlanImage && imageRef.current) {
      ctx.drawImage(imageRef.current, 0, 0);
    }

    function drawPoint(p: Point2D, color: string) {
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, 5 / viewRef.current.scale, 0, Math.PI * 2);
      ctx!.fillStyle = color;
      ctx!.fill();
    }

    function drawPolygon(points: Point2D[], fill: string, stroke: string) {
      if (points.length < 2) return;
      ctx!.beginPath();
      ctx!.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx!.lineTo(points[i].x, points[i].y);
      ctx!.closePath();
      ctx!.fillStyle = fill;
      ctx!.fill();
      ctx!.strokeStyle = stroke;
      ctx!.lineWidth = 2 / viewRef.current.scale;
      ctx!.stroke();
    }

    buildings.forEach(b => {
      const selected = b.id === selectedBuildingId;
      drawPolygon(
        b.points,
        selected ? 'rgba(25, 118, 210, 0.38)' : 'rgba(0, 123, 255, 0.24)',
        selected ? '#d94841' : '#007bff'
      );
      if (selected) b.points.forEach(p => drawPoint(p, '#d94841'));
      const center = getPolygonCenter(b.points);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Arial';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(b.name, center.x - 10, center.y);
      ctx.fillText(b.name, center.x - 10, center.y);
    });

    // 比例尺标定点
    const scalePoints = scalePointsRef.current;
    if (scalePoints.length > 0) drawPoint(scalePoints[0], 'red');
    if (scalePoints.length === 2) {
      drawPoint(scalePoints[1], 'red');
      ctx.beginPath();
      ctx.moveTo(scalePoints[0].x, scalePoints[0].y);
      ctx.lineTo(scalePoints[1].x, scalePoints[1].y);
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2 / viewRef.current.scale;
      ctx.stroke();
    }

    // 正在绘制的多边形
    const currentPoly = currentPolyRef.current;
    if (mode === 'drawing' && currentPoly.length > 0) {
      ctx.beginPath();
      ctx.moveTo(currentPoly[0].x, currentPoly[0].y);
      for (let i = 1; i < currentPoly.length; i++) ctx.lineTo(currentPoly[i].x, currentPoly[i].y);
      ctx.lineTo(mousePosRef.current.x, mousePosRef.current.y);
      ctx.strokeStyle = '#28a745';
      ctx.lineWidth = 2 / viewRef.current.scale;
      ctx.stroke();
      currentPoly.forEach(p => drawPoint(p, '#28a745'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  // ── 视图变换（缩放/平移） ──────────────────────────────────────
  const updateTransform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y, scale } = viewRef.current;
    canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    forceViewUpdate(v => v + 1);
  }, []);

  const resetView = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !isImageLoaded) return;
    const padding = 40;
    const wRatio = (wrapper.clientWidth - padding) / canvasSize.width;
    const hRatio = (wrapper.clientHeight - padding) / canvasSize.height;
    const scale = Math.min(wRatio, hRatio, 1);
    viewRef.current = {
      scale,
      x: (wrapper.clientWidth - canvasSize.width * scale) / 2,
      y: (wrapper.clientHeight - canvasSize.height * scale) / 2,
    };
    updateTransform();
  }, [canvasSize, isImageLoaded, updateTransform]);

  useEffect(() => {
    resetView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isImageLoaded, canvasSize.width, canvasSize.height]);

  const getCanvasCoordinates = useCallback((clientX: number, clientY: number): Point2D => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return { x: 0, y: 0 };
    const rect = wrapper.getBoundingClientRect();
    const { x: viewX, y: viewY, scale } = viewRef.current;
    return {
      x: (clientX - rect.left - viewX) / scale,
      y: (clientY - rect.top - viewY) / scale,
    };
  }, []);

  // ── 图片加载 ───────────────────────────────────────────────────
  const hasEditableState = buildings.length > 0 || scaleRatio > 0 || scalePointsRef.current.length > 0;

  const loadImageFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        alert('请上传图片文件（JPG/PNG）');
        return;
      }
      if (hasEditableState && !confirm('替换底图将清空当前已绘制的楼栋，是否继续？')) return;

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          imageRef.current = img;
          resolve();
        };
        img.onerror = reject;
        img.src = dataUrl;
      });

      setImageFile(file);
      setBuildings([]);
      setSelectedBuildingId(null);
      historyRef.current = [];
      setHistoryLength(0);
      setScaleRatio(0);
      setScaleStatus('unset');
      scalePointsRef.current = [];
      currentPolyRef.current = [];
      setMode('idle');
      setHasPlanImage(true);
      setCanvasSize({ width: imageRef.current!.width, height: imageRef.current!.height });
      setIsImageLoaded(true);
    },
    [hasEditableState]
  );

  // ── 比例尺标定 ─────────────────────────────────────────────────
  const startScaling = useCallback(() => {
    scalePointsRef.current = [];
    setMode('scaling');
    setScaleStatus('prompting');
    setShowScaleConfirm(false);
    scheduleDraw();
  }, [scheduleDraw]);

  const confirmScale = useCallback(() => {
    const pts = scalePointsRef.current;
    if (pts.length < 2) {
      alert('请先在图上选取两个标定点');
      return;
    }
    const distPx = distance(pts[0], pts[1]);
    if (!(realDistance > 0) || !(distPx > 0)) {
      alert('请输入有效的实际距离');
      return;
    }
    setScaleRatio(realDistance / distPx);
    setScaleStatus('set');
    setShowScaleConfirm(false);
    setMode('drawing');
  }, [realDistance]);

  // ── 绘制楼栋 ───────────────────────────────────────────────────
  const finishPolygon = useCallback(() => {
    if (scaleRatio === 0) {
      alert('请先标定比例尺');
      currentPolyRef.current = [];
      scheduleDraw();
      return;
    }
    if (currentPolyRef.current.length < 3) {
      alert('至少需要 3 个点才能构成楼栋轮廓');
      currentPolyRef.current = [];
      scheduleDraw();
      return;
    }
    const cleaned = sanitizePolygon(currentPolyRef.current, 0.75);
    if (cleaned.length < 3) {
      alert('轮廓无效，请重新绘制');
      currentPolyRef.current = [];
      scheduleDraw();
      return;
    }

    const before = captureState();
    const idx = buildings.length + 1;
    const next: EditingBuilding = {
      id: createEditingBuildingId(),
      name: `${idx}号楼`,
      floors: useDefaults ? clampInt(defFloors, 1, 300, SUNLIGHT_CONFIG.DEFAULTS.FLOORS) : SUNLIGHT_CONFIG.DEFAULTS.FLOORS,
      floorHeight: useDefaults
        ? clampFloat(defFloorHeight, 1, 20, SUNLIGHT_CONFIG.DEFAULTS.FLOOR_HEIGHT)
        : SUNLIGHT_CONFIG.DEFAULTS.FLOOR_HEIGHT,
      units: useDefaults ? clampInt(defUnits, 1, 50, SUNLIGHT_CONFIG.DEFAULTS.UNITS_PER_FLOOR) : SUNLIGHT_CONFIG.DEFAULTS.UNITS_PER_FLOOR,
      isThisCommunity: useDefaults ? defIsThisCommunity : true,
      unitSplitAngleDeg: 0,
      unitNumberingStartSide: 'A',
      points: cleaned,
    };
    setBuildings(prev => [...prev, next]);
    setSelectedBuildingId(next.id);
    pushHistory(before);
    currentPolyRef.current = [];
    scheduleDraw();
  }, [buildings.length, captureState, defFloorHeight, defFloors, defIsThisCommunity, defUnits, pushHistory, scaleRatio, scheduleDraw, useDefaults]);

  const undoCurrentPoint = useCallback(() => {
    if (mode !== 'drawing' || currentPolyRef.current.length === 0) return;
    currentPolyRef.current.pop();
    scheduleDraw();
  }, [mode, scheduleDraw]);

  const toggleDrawMode = useCallback(
    (active: boolean) => {
      if (active) {
        setMode('drawing');
        setSelectedBuildingId(null);
      } else {
        setMode('idle');
        currentPolyRef.current = [];
      }
      scheduleDraw();
    },
    [scheduleDraw]
  );

  // ── 楼栋选择/拖拽/删除 ─────────────────────────────────────────
  function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
    let inside = false;
    for (let i = 0, prev = polygon.length - 1; i < polygon.length; prev = i++) {
      const a = polygon[i];
      const b = polygon[prev];
      const intersects = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  const findBuildingIndexAtPoint = useCallback(
    (point: Point2D): number => {
      for (let i = buildings.length - 1; i >= 0; i--) {
        if (pointInPolygon(point, buildings[i].points)) return i;
      }
      return -1;
    },
    [buildings]
  );

  const deleteBuildingById = useCallback(
    (id: string) => {
      if (!confirm('确认删除该楼栋？')) return;
      const before = captureState();
      setBuildings(prev => prev.filter(b => b.id !== id));
      setSelectedBuildingId(null);
      pushHistory(before);
    },
    [captureState, pushHistory]
  );

  // ── 鼠标事件 ───────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isImageLoaded) return;
    e.preventDefault();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const zoomSpeed = 0.1;
    const delta = e.deltaY > 0 ? 1 - zoomSpeed : 1 + zoomSpeed;
    const { scale: oldScale, x: viewX, y: viewY } = viewRef.current;
    const newScale = Math.min(Math.max(oldScale * delta, 0.1), 10);
    const rect = wrapper.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const offsetX = mouseX - viewX;
    const offsetY = mouseY - viewY;
    viewRef.current = {
      scale: newScale,
      x: mouseX - offsetX * (newScale / oldScale),
      y: mouseY - offsetY * (newScale / oldScale),
    };
    updateTransform();
  }, [isImageLoaded, updateTransform]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isImageLoaded) return;
      if (e.button === 1 || (spacePressedRef.current && e.button === 0)) {
        panRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
        e.preventDefault();
        return;
      }
      if (e.button === 0) {
        const p = getCanvasCoordinates(e.clientX, e.clientY);
        if (mode === 'idle') {
          const hitIndex = findBuildingIndexAtPoint(p);
          if (hitIndex >= 0) {
            const b = buildings[hitIndex];
            setSelectedBuildingId(b.id);
            draggingRef.current = { buildingId: b.id, lastPoint: p, before: captureState(), moved: false };
          } else {
            setSelectedBuildingId(null);
            panRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
          }
        } else if (mode === 'scaling') {
          const pts = [...scalePointsRef.current, p];
          scalePointsRef.current = pts;
          if (pts.length === 2) {
            setMode('idle');
            setShowScaleConfirm(true);
          }
          scheduleDraw();
        } else if (mode === 'drawing') {
          currentPolyRef.current = [...currentPolyRef.current, p];
          scheduleDraw();
        }
        e.preventDefault();
      }
      if (e.button === 2) {
        undoCurrentPoint();
      }
    },
    [buildings, captureState, findBuildingIndexAtPoint, getCanvasCoordinates, isImageLoaded, mode, scheduleDraw, undoCurrentPoint]
  );

  const handleDoubleClick = useCallback(() => {
    if (!isImageLoaded) return;
    if (mode === 'drawing' && currentPolyRef.current.length >= 3) finishPolygon();
  }, [finishPolygon, isImageLoaded, mode]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggingRef.current) {
        const p = getCanvasCoordinates(e.clientX, e.clientY);
        const drag = draggingRef.current;
        const dx = p.x - drag.lastPoint.x;
        const dy = p.y - drag.lastPoint.y;
        if (dx || dy) {
          drag.lastPoint = p;
          drag.moved = true;
          setBuildings(prev =>
            prev.map(b => (b.id === drag.buildingId ? { ...b, points: b.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy })) } : b))
          );
        }
        return;
      }
      if (panRef.current.active) {
        const dx = e.clientX - panRef.current.lastX;
        const dy = e.clientY - panRef.current.lastY;
        panRef.current.lastX = e.clientX;
        panRef.current.lastY = e.clientY;
        viewRef.current = { ...viewRef.current, x: viewRef.current.x + dx, y: viewRef.current.y + dy };
        updateTransform();
        return;
      }
      if (!isImageLoaded) return;
      mousePosRef.current = getCanvasCoordinates(e.clientX, e.clientY);
      if (mode === 'drawing') scheduleDraw();
    },
    [getCanvasCoordinates, isImageLoaded, mode, scheduleDraw, updateTransform]
  );

  const handleMouseUp = useCallback(() => {
    if (draggingRef.current) {
      const drag = draggingRef.current;
      draggingRef.current = null;
      if (drag.moved) pushHistory(drag.before);
    }
    panRef.current.active = false;
  }, [pushHistory]);

  // 空格键平移快捷键 + 撤销/删除快捷键
  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      const el = target as HTMLElement;
      return el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        undoLastEdit();
        e.preventDefault();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBuildingId) {
        deleteBuildingById(selectedBuildingId);
        e.preventDefault();
        return;
      }
      if (e.code === 'Space') {
        spacePressedRef.current = true;
        e.preventDefault();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') spacePressedRef.current = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [deleteBuildingById, selectedBuildingId, undoLastEdit]);

  // ── 城市选择联动 ───────────────────────────────────────────────
  const handleCityChange = useCallback((cityName: string) => {
    setSelectedCity(cityName);
    const loc = getLocationByCity(cityName);
    if (loc) {
      setLatitude(loc.lat);
      setLongitude(loc.lon);
      setTimeZone(loc.timeZone);
    }
  }, []);

  // ── 楼栋表格编辑 ───────────────────────────────────────────────
  const updateBuilding = useCallback((id: string, patch: Partial<EditingBuilding>) => {
    setBuildings(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
  }, []);

  // ── 保存到数据库 ───────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaveError('');
    setSaveSuccess(false);

    if (buildings.length === 0) {
      setSaveError('请至少绘制一栋楼再保存');
      return;
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      setSaveError('纬度无效');
      return;
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setSaveError('经度无效');
      return;
    }
    if (!isValidTimeZone(timeZone)) {
      setSaveError('时区无效，请输入合法的 IANA 时区（如 Asia/Shanghai）');
      return;
    }

    const cleanedBuildings = buildings.map(b => ({ ...b, points: sanitizePolygon(b.points, 0.75) }));

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    cleanedBuildings.forEach(b => {
      b.points.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });
    });
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const normalizedNorthAngle = normalizeAngle(northAngle);

    const planJson: BuildingPlanData = {
      version: '3.2.0',
      latitude,
      longitude,
      timeZone: timeZone.trim(),
      northAngle: normalizedNorthAngle,
      scaleRatio,
      origin: { x: centerX, y: centerY },
      // 记录 origin 在底图上的绝对像素坐标（即标注时画布坐标系下的 bbox 中心），
      // 重新打开编辑器时据此精确复原标注框位置，避免与底图错位。
      originPixel: { x: centerX, y: centerY },
      buildings: cleanedBuildings.map(b => ({
        name: b.name,
        floors: b.floors,
        floorHeight: b.floorHeight,
        units: b.units,
        totalHeight: b.floors * b.floorHeight,
        isThisCommunity: b.isThisCommunity,
        unitSplitAngleDeg: b.unitSplitAngleDeg || undefined,
        unitNumberingStartSide: b.unitNumberingStartSide === 'B' ? 'B' : undefined,
        shape: b.points.map(p => ({
          x: (p.x - centerX) * scaleRatio,
          y: (p.y - centerY) * scaleRatio,
        })),
        center: { x: 0, y: 0 },
      })),
    };

    // 重新计算每栋楼的 center（相对新 origin 的米坐标中心）
    planJson.buildings.forEach(b => {
      b.center = getPolygonCenter(b.shape);
    });

    if (planJson.buildings.some(b => getPolygonArea(b.shape) <= 0)) {
      setSaveError('存在无效的楼栋轮廓（面积为零），请检查绘制');
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.set('communityUrl', communityUrl);
      formData.set('community', community);
      formData.set('city', city);
      formData.set('district', district);
      formData.set('planJson', JSON.stringify(planJson));
      if (imageFile) formData.set('image', imageFile);

      const res = await fetch('/api/sunlight/plan', { method: 'POST', body: formData });
      const json = await res.json();
      if (!json.success) {
        setSaveError(json.error || '保存失败');
        return;
      }
      setSaveSuccess(true);
      onSaved();
    } catch (e) {
      setSaveError(`请求异常: ${e}`);
    } finally {
      setSaving(false);
    }
  }, [buildings, city, community, communityUrl, district, imageFile, latitude, longitude, northAngle, onSaved, scaleRatio, timeZone]);

  const selectedBuilding = buildings.find(b => b.id === selectedBuildingId) ?? null;

  return (
    <div className="flex h-full">
      {/* 左侧画布区域 */}
      <div
        ref={wrapperRef}
        className="relative flex-1 overflow-hidden bg-gray-100"
        style={{ cursor: mode === 'drawing' || mode === 'scaling' ? 'crosshair' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={e => e.preventDefault()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) void loadImageFile(file);
        }}
      >
        {!isImageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            请在右侧上传规划底图开始标注
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          style={{ display: isImageLoaded ? 'block' : 'none', transformOrigin: '0 0', position: 'absolute' }}
        />
        {isImageLoaded && (
          <div className="absolute bottom-2 left-2 bg-white/90 text-xs px-2 py-1 rounded shadow">
            缩放: {Math.round(viewRef.current.scale * 100)}%
          </div>
        )}
      </div>

      {/* 右侧配置面板 */}
      <div className="w-96 flex-shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-4 space-y-5 text-sm">
        {/* 1. 上传底图 */}
        <div>
          <label className="block font-semibold text-gray-700 mb-1.5">1. 上传规划图/总平图</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="block w-full text-xs"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) void loadImageFile(file);
              e.target.value = '';
            }}
          />
          <p className="text-xs text-gray-400 mt-1">支持拖拽、缩放、绘制多边形表示楼栋轮廓。</p>
        </div>

        {/* 2. 标定比例尺 */}
        <div>
          <label className="block font-semibold text-gray-700 mb-1.5">2. 标定比例尺</label>
          <div className="text-xs text-gray-500 mb-1.5">
            状态：
            {scaleStatus === 'unset' && '未标定'}
            {scaleStatus === 'prompting' && '请在图上点击两点'}
            {scaleStatus === 'set' && `已标定（1像素 = ${scaleRatio.toFixed(4)} 米）`}
          </div>
          <button
            disabled={!isImageLoaded}
            onClick={startScaling}
            className="px-3 py-1.5 rounded-md border border-gray-300 text-xs hover:bg-gray-50 disabled:opacity-40"
          >
            开始标定（点击两点）
          </button>
          {showScaleConfirm && (
            <div className="mt-2 flex items-center gap-2">
              <label className="text-xs text-gray-500">两点实际距离(米):</label>
              <input
                type="number"
                min={0}
                value={realDistance}
                onChange={e => setRealDistance(parseFloat(e.target.value) || 0)}
                className="w-20 px-2 py-1 border rounded text-xs"
              />
              <button onClick={confirmScale} className="px-2 py-1 bg-green-500 text-white rounded text-xs">
                确认
              </button>
            </div>
          )}
        </div>

        {/* 3. 绘制楼栋 */}
        <div>
          <label className="block font-semibold text-gray-700 mb-1.5">3. 绘制楼栋</label>
          <p className="text-xs text-green-600 mb-1">🖱️ 滚轮缩放，按住中键或空格拖拽视图</p>
          <p className="text-xs text-gray-400 mb-2">操作: 左键加点，双击结束；右键撤销上个点。</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={!isImageLoaded}
              onClick={() => toggleDrawMode(mode !== 'drawing')}
              className="px-2 py-1.5 rounded-md border text-xs disabled:opacity-40"
              style={mode === 'drawing' ? { background: '#eef6ff', borderColor: '#3b82f6', color: '#3b82f6' } : {}}
            >
              {mode === 'drawing' ? '✏️ 绘制中' : '✋ 浏览模式'}
            </button>
            <button
              disabled={mode !== 'drawing' || currentPolyRef.current.length === 0}
              onClick={undoCurrentPoint}
              className="px-2 py-1.5 rounded-md border text-xs disabled:opacity-40"
            >
              ↶ 撤销点
            </button>
            <button
              disabled={mode !== 'drawing' || currentPolyRef.current.length < 3}
              onClick={finishPolygon}
              className="px-2 py-1.5 rounded-md border border-green-400 text-green-600 text-xs disabled:opacity-40"
            >
              ✓ 完成轮廓
            </button>
            <button
              disabled={historyLength === 0}
              onClick={undoLastEdit}
              className="px-2 py-1.5 rounded-md border text-xs disabled:opacity-40"
            >
              ↶ 撤销编辑
            </button>
          </div>
          <button onClick={resetView} disabled={!isImageLoaded} className="mt-2 w-full px-2 py-1.5 rounded-md border text-xs disabled:opacity-40">
            ⟲ 重置视角
          </button>
        </div>

        {/* 4. 全局参数 */}
        <div>
          <label className="block font-semibold text-gray-700 mb-1.5">4. 全局参数（用于日照计算）</label>
          <div className="space-y-2">
            <div>
              <span className="text-xs text-gray-500">选择城市</span>
              <select
                value={selectedCity}
                onChange={e => handleCityChange(e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border rounded text-xs"
              >
                <option value="">-- 手动输入经纬度 --</option>
                {Object.values(CITY_DATA).map(group => (
                  <optgroup key={group.label} label={group.label}>
                    {group.cities.map(c => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.lat}°, {c.lon}°)
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-xs text-gray-500">纬度</span>
                <input
                  type="number"
                  step={0.01}
                  value={latitude}
                  onChange={e => {
                    setLatitude(parseFloat(e.target.value));
                    setSelectedCity('');
                  }}
                  className="w-full mt-0.5 px-2 py-1.5 border rounded text-xs"
                />
              </div>
              <div>
                <span className="text-xs text-gray-500">经度</span>
                <input
                  type="number"
                  step={0.01}
                  value={longitude}
                  onChange={e => {
                    setLongitude(parseFloat(e.target.value));
                    setSelectedCity('');
                  }}
                  className="w-full mt-0.5 px-2 py-1.5 border rounded text-xs"
                />
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500">IANA 时区</span>
              <input
                type="text"
                value={timeZone}
                onChange={e => {
                  setTimeZone(e.target.value);
                  setSelectedCity('');
                }}
                className="w-full mt-0.5 px-2 py-1.5 border rounded text-xs"
              />
            </div>
            <div>
              <span className="text-xs text-gray-500">北向角(度，相对图纸向上，顺时针为正)</span>
              <input
                type="number"
                step={0.1}
                value={northAngle}
                onChange={e => setNorthAngle(parseFloat(e.target.value) || 0)}
                className="w-full mt-0.5 px-2 py-1.5 border rounded text-xs"
              />
            </div>
          </div>

          <label className="block text-xs text-gray-500 mt-3 mb-1">新楼栋默认参数：</label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-xs text-gray-400">层数</span>
              <input
                type="number"
                min={1}
                max={300}
                value={defFloors}
                onChange={e => setDefFloors(parseInt(e.target.value) || 1)}
                className="w-full mt-0.5 px-2 py-1 border rounded text-xs"
              />
            </div>
            <div>
              <span className="text-xs text-gray-400">层高(米)</span>
              <input
                type="number"
                min={1}
                max={20}
                step={0.01}
                value={defFloorHeight}
                onChange={e => setDefFloorHeight(parseFloat(e.target.value) || 1)}
                className="w-full mt-0.5 px-2 py-1 border rounded text-xs"
              />
            </div>
            <div>
              <span className="text-xs text-gray-400">户数/层</span>
              <input
                type="number"
                min={1}
                max={50}
                value={defUnits}
                onChange={e => setDefUnits(parseInt(e.target.value) || 1)}
                className="w-full mt-0.5 px-2 py-1 border rounded text-xs"
              />
            </div>
          </div>
          <label className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
            <input type="checkbox" checked={defIsThisCommunity} onChange={e => setDefIsThisCommunity(e.target.checked)} />
            默认标记为本小区
          </label>
          <label className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
            <input type="checkbox" checked={useDefaults} onChange={e => setUseDefaults(e.target.checked)} />
            新楼栋使用默认值
          </label>
        </div>

        {/* 5. 楼栋参数表 */}
        <div>
          <label className="block font-semibold text-gray-700 mb-1.5">5. 楼栋参数表（{buildings.length} 栋）</label>
          <div className="max-h-64 overflow-y-auto border rounded">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-1.5 py-1 text-left">名称</th>
                  <th className="px-1.5 py-1 w-12">层数</th>
                  <th className="px-1.5 py-1 w-14">层高</th>
                  <th className="px-1.5 py-1 w-12">户/层</th>
                  <th className="px-1.5 py-1 w-10">本区</th>
                  <th className="px-1.5 py-1 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {buildings.map(b => (
                  <tr
                    key={b.id}
                    className={`border-t cursor-pointer ${b.id === selectedBuildingId ? 'bg-blue-50' : ''}`}
                    onClick={() => setSelectedBuildingId(b.id)}
                  >
                    <td className="px-1.5 py-1">
                      <input
                        value={b.name}
                        onChange={e => updateBuilding(b.id, { name: e.target.value })}
                        className="w-full px-1 py-0.5 border rounded text-xs"
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        type="number"
                        value={b.floors}
                        onChange={e => updateBuilding(b.id, { floors: clampInt(parseInt(e.target.value), 1, 300, b.floors) })}
                        className="w-full px-1 py-0.5 border rounded text-xs"
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        type="number"
                        step={0.01}
                        value={b.floorHeight}
                        onChange={e => updateBuilding(b.id, { floorHeight: clampFloat(parseFloat(e.target.value), 1, 20, b.floorHeight) })}
                        className="w-full px-1 py-0.5 border rounded text-xs"
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        type="number"
                        value={b.units}
                        onChange={e => updateBuilding(b.id, { units: clampInt(parseInt(e.target.value), 1, 50, b.units) })}
                        className="w-full px-1 py-0.5 border rounded text-xs"
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-1.5 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={b.isThisCommunity}
                        onChange={e => updateBuilding(b.id, { isThisCommunity: e.target.checked })}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-1.5 py-1 text-center">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          deleteBuildingById(b.id);
                        }}
                        className="text-red-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                {buildings.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-400 py-4">
                      暂无楼栋，请先绘制
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {selectedBuilding && (
            <p className="text-xs text-gray-400 mt-1">已选中：{selectedBuilding.name}（可拖动画布中的楼栋移动位置，Delete 键删除）</p>
          )}
        </div>

        {/* 保存 */}
        <div className="pt-2 border-t">
          {saveError && <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{saveError}</div>}
          {saveSuccess && (
            <div className="mb-2 text-xs text-green-600 bg-green-50 border border-green-200 rounded px-2 py-1.5">
              ✓ 保存成功，可切换到「3D 分析」查看效果
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving || buildings.length === 0}
            className="w-full px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md text-sm font-medium disabled:opacity-50"
          >
            {saving ? '保存中...' : '💾 保存标注方案'}
          </button>
        </div>
      </div>
    </div>
  );
}
