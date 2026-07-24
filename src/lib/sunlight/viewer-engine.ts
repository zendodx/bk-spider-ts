/**
 * 采光分析 - 3D 场景引擎（Three.js）
 * 迁移自 building-sunlight-simulator/js/viewer.js，剥离 DOM 依赖，
 * 改造为可被 React 组件调用的类 + 纯函数集合。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { BuildingData, BuildingPlanData, Point2D } from '@/types/sunlight';
import { SUNLIGHT_CONFIG } from './config';
import { createSunlightAnalysisWorker } from './sunlight-worker';
import { createFingerprint, roundTo } from './utils';

// ─── 太阳位置计算 ────────────────────────────────────────────────

export interface SunPosition {
  altitude: number;
  direction: THREE.Vector3;
}

export function calculateSunPosition(
  civilHour: number,
  latitude: number,
  declination: number,
  solarTimeOffset = 0
): SunPosition {
  const rad = Math.PI / 180;
  const solarHour = civilHour + solarTimeOffset;
  const hAngle = (solarHour - 12) * 15 * rad;
  const lat = latitude * rad;
  const dec = declination * rad;

  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hAngle);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const cosAz = (sinAlt * Math.sin(lat) - Math.sin(dec)) / (Math.cos(alt) * Math.cos(lat));
  let az = Math.acos(Math.min(1, Math.max(-1, cosAz)));
  if (solarHour >= 12) az = -az;

  const y = Math.sin(alt);
  const r = Math.cos(alt);
  const x = r * Math.sin(az);
  const z = r * Math.cos(az);

  return { altitude: alt, direction: new THREE.Vector3(x, y, z).normalize() };
}

export function calculateSunDirection(
  hour: number,
  latitude: number,
  declination: number,
  solarTimeOffset = 0
): THREE.Vector3 | null {
  const position = calculateSunPosition(hour, latitude, declination, solarTimeOffset);
  if (!position || position.altitude <= 0.01) return null;
  return position.direction;
}

// ─── 楼栋建模辅助 ────────────────────────────────────────────────

function dot2(point: Point2D, axis: Point2D): number {
  return (point?.x || 0) * (axis?.x || 0) + (point?.y || 0) * (axis?.y || 0);
}

export function axisFromAngleDeg(angleDeg: number): Point2D {
  const rad = ((Number(angleDeg) || 0) * Math.PI) / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

export function normalizeUnitsPerFloor(building: Pick<BuildingData, 'floors' | 'units' | 'unitsPerFloor'>): number[] {
  const floors = Math.max(1, Math.trunc(building.floors || 1));
  if (Array.isArray(building.unitsPerFloor) && building.unitsPerFloor.length > 0) {
    const arr: number[] = [];
    for (let i = 0; i < floors; i++) {
      const v = building.unitsPerFloor[i] !== undefined ? building.unitsPerFloor[i] : building.unitsPerFloor[building.unitsPerFloor.length - 1];
      arr.push(Math.max(1, Math.trunc(v || 1)));
    }
    return arr;
  }
  const n = Math.max(1, Math.trunc(building.units || 1));
  return new Array(floors).fill(n);
}

function normalizeUnitRatios(ratios: number[] | null | undefined, units: number): number[] | null {
  if (!Array.isArray(ratios) || ratios.length !== units) return null;
  const cleaned = ratios.map(v => Math.max(0, Number(v) || 0));
  const sum = cleaned.reduce((acc, v) => acc + v, 0);
  if (sum <= 1e-9) return null;
  return cleaned.map(v => v / sum);
}

function getSharedFirstFloorUnitRatios(
  unitRatiosPerFloor: (number[] | null)[] | undefined,
  floors: number,
  units: number
): number[] | null {
  if (!Array.isArray(unitRatiosPerFloor) || unitRatiosPerFloor.length === 0) return null;
  const first = normalizeUnitRatios(unitRatiosPerFloor[0], units);
  if (!first) return null;
  for (let i = 1; i < floors; i++) {
    const next = unitRatiosPerFloor[i];
    if (next == null) continue;
    const normalized = normalizeUnitRatios(next, units);
    if (!normalized) return null;
    for (let j = 0; j < units; j++) {
      if (Math.abs(normalized[j] - first[j]) > 1e-6) return null;
    }
  }
  return first;
}

function getUnitRatiosForFloor(
  unitRatiosPerFloor: (number[] | null)[] | undefined,
  floorIndex: number,
  floors: number,
  units: number
): number[] | null {
  const direct = normalizeUnitRatios(unitRatiosPerFloor?.[floorIndex], units);
  if (direct) return direct;
  if (floorIndex > 0) {
    const sharedFirst = getSharedFirstFloorUnitRatios(unitRatiosPerFloor, floors, units);
    if (sharedFirst) return sharedFirst.slice();
  }
  return null;
}

function normalizeUnitNumberingStartSide(value: unknown): 'A' | 'B' {
  return value === 'B' ? 'B' : 'A';
}

function getDisplayUnitNumber(building: BuildingData, physicalUnitIndex: number, units: number): number {
  return normalizeUnitNumberingStartSide(building.unitNumberingStartSide) === 'B' ? units - physicalUnitIndex : physicalUnitIndex + 1;
}

function getHeatmapCellWidth(subLen: number): number {
  const sideInset = 0.12;
  return Math.max(0.06, subLen - sideInset * 2);
}

function getBuildingSplitAxis(building: BuildingData): Point2D {
  return axisFromAngleDeg(building.unitSplitAngleDeg || 0);
}

/** 侧墙纹理 UV 生成器（用于分户线贴图） */
function makeUVGenerator(shape: Point2D[], totalHeight: number, axis: Point2D) {
  let minProj = Infinity;
  let maxProj = -Infinity;
  for (const p of shape) {
    const proj = dot2(p, axis);
    if (proj < minProj) minProj = proj;
    if (proj > maxProj) maxProj = proj;
  }
  const spanProj = Math.max(1e-6, maxProj - minProj);
  const invDepth = totalHeight > 0 ? 1 / totalHeight : 1;

  return {
    generateTopUV: () => [new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(0, 1)],
    generateSideWallUV: (
      _geometry: THREE.ExtrudeGeometry,
      vertices: number[],
      a: number,
      b: number,
      c: number,
      d: number
    ) => {
      const ax = vertices[a * 3];
      const ay = vertices[a * 3 + 1];
      const az = vertices[a * 3 + 2];
      const bx = vertices[b * 3];
      const by = vertices[b * 3 + 1];
      const bz = vertices[b * 3 + 2];
      const cx = vertices[c * 3];
      const cy = vertices[c * 3 + 1];
      const cz = vertices[c * 3 + 2];
      const dx = vertices[d * 3];
      const dy = vertices[d * 3 + 1];
      const dz = vertices[d * 3 + 2];

      const projA = dot2({ x: ax, y: -ay }, axis);
      const projB = dot2({ x: bx, y: -by }, axis);
      const projC = dot2({ x: cx, y: -cy }, axis);
      const projD = dot2({ x: dx, y: -dy }, axis);

      const uA = (maxProj - projA) / spanProj;
      const uB = (maxProj - projB) / spanProj;
      const uC = (maxProj - projC) / spanProj;
      const uD = (maxProj - projD) / spanProj;

      return [
        new THREE.Vector2(uA, az * invDepth),
        new THREE.Vector2(uB, bz * invDepth),
        new THREE.Vector2(uC, cz * invDepth),
        new THREE.Vector2(uD, dz * invDepth),
      ];
    },
  };
}

function createFacadeTexture(floors: number, unitsPerFloor: number[], unitRatiosPerFloor?: (number[] | null)[]): THREE.CanvasTexture {
  const width = 512;
  const height = Math.max(4, Math.min(4096, floors * 28));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const grd = ctx.createLinearGradient(0, 0, 0, height);
  grd.addColorStop(0, '#b1bfd1');
  grd.addColorStop(1, '#a2b2c7');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);

  for (let canvasFloor = 0; canvasFloor < floors; canvasFloor++) {
    const floorIndex = floors - canvasFloor - 1;
    const y0 = Math.floor((canvasFloor * height) / floors);
    const y1 = Math.floor(((canvasFloor + 1) * height) / floors);
    const bandH = y1 - y0;
    const nUnits = Math.max(1, unitsPerFloor[floorIndex] || 1);

    if (nUnits > 1) {
      const ratios = getUnitRatiosForFloor(unitRatiosPerFloor, floorIndex, floors, nUnits);
      let acc = 0;
      for (let i = 0; i < nUnits - 1; i++) {
        const ratio = ratios ? ratios[i] : 1 / nUnits;
        acc += ratio;
        const x = Math.round(acc * width);
        ctx.fillStyle = 'rgba(35,45,60,0.6)';
        ctx.fillRect(x - 1, y0, 2, bandH);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(x + 1, y0, 1, bandH);
      }
    }
    if (canvasFloor < floors - 1) {
      ctx.fillStyle = 'rgba(35,45,60,0.55)';
      ctx.fillRect(0, y1 - 1, width, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(0, y1 + 1, width, 1);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = true;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ─── 采光采样点计算 ──────────────────────────────────────────────

export interface SamplingPoint {
  buildingIndex: number;
  buildingName: string;
  floor: number;
  unit: number;
  x: number;
  y: number;
  z: number;
  wallDataX: number;
  wallDataY: number;
  outward: Point2D;
  tangent: Point2D;
  cellWidth: number;
  sunlightHours: number;
  unitMaxHours?: number;
}

export class AnalysisComplexityError extends Error {
  constructor() {
    super('Sunlight analysis complexity limit exceeded');
    this.name = 'AnalysisComplexityError';
  }
}

/** 计算所有外墙片段上的采光检测点 */
export function calculateSamplingPoints(building: BuildingData, buildingIndex: number, maxPoints = Infinity): SamplingPoint[] {
  const points: SamplingPoint[] = [];
  const floors = Math.max(1, Math.trunc(building.floors || 1));
  const floorHeight = building.floorHeight || 3;
  const unitsPerFloor = normalizeUnitsPerFloor(building);
  const axis = getBuildingSplitAxis(building);

  if (!Array.isArray(building.shape) || building.shape.length < 3) return points;

  let signedArea = 0;
  for (let i = 0; i < building.shape.length; i++) {
    const p1 = building.shape[i];
    const p2 = building.shape[(i + 1) % building.shape.length];
    signedArea += p1.x * p2.y - p2.x * p1.y;
  }
  const isCCW = signedArea > 0;

  interface Segment {
    start: Point2D;
    end: Point2D;
    len: number;
    outward: Point2D;
    pA: number;
    pB: number;
  }
  const segments: Segment[] = [];
  let minProj = Infinity;
  let maxProj = -Infinity;

  for (let i = 0; i < building.shape.length; i++) {
    const start = building.shape[i];
    const end = building.shape[(i + 1) % building.shape.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-6) continue;
    const leftNormal = { x: -dy / len, y: dx / len };
    const rightNormal = { x: dy / len, y: -dx / len };
    const outward = isCCW ? rightNormal : leftNormal;
    const pA = dot2(start, axis);
    const pB = dot2(end, axis);
    minProj = Math.min(minProj, pA, pB);
    maxProj = Math.max(maxProj, pA, pB);
    segments.push({ start, end, len, outward, pA, pB });
  }

  const spanProj = maxProj - minProj;
  if (!isFinite(spanProj) || segments.length === 0) return points;

  for (let floor = 0; floor < floors; floor++) {
    const units = unitsPerFloor[floor];
    const requestedWindowOffset = floorHeight * SUNLIGHT_CONFIG.SUNLIGHT_ANALYSIS.FLOOR_HEIGHT_RATIO + SUNLIGHT_CONFIG.SUNLIGHT_ANALYSIS.WINDOW_HEIGHT_OFFSET;
    const windowOffset = Math.min(floorHeight - 0.05, Math.max(0.05, requestedWindowOffset));
    const windowHeight = floor * floorHeight + windowOffset;
    const ratios = getUnitRatiosForFloor(building.unitRatiosPerFloor, floor, floors, units);
    const boundaries = [maxProj + 1e-4];

    let cumulative = 0;
    for (let unit = 0; unit < units; unit++) {
      const ratio = ratios ? ratios[unit] : 1 / units;
      cumulative += ratio;
      boundaries.push(maxProj - cumulative * spanProj);
    }
    boundaries[units] -= 1e-4;

    for (const segment of segments) {
      const ts = [0, 1];
      if (spanProj > 1e-6 && Math.abs(segment.pB - segment.pA) > 1e-6) {
        for (const boundary of boundaries) {
          const t = (boundary - segment.pA) / (segment.pB - segment.pA);
          if (t > 0 && t < 1) ts.push(t);
        }
      }
      ts.sort((a, b) => a - b);
      const uniqueTs: number[] = [];
      for (let i = 0; i < ts.length; i++) {
        if (i === 0 || ts[i] - uniqueTs[uniqueTs.length - 1] > 1e-6) uniqueTs.push(ts[i]);
      }

      for (let i = 0; i < uniqueTs.length - 1; i++) {
        const tStart = uniqueTs[i];
        const tEnd = uniqueTs[i + 1];
        const tMid = (tStart + tEnd) / 2;
        const projMid = segment.pA + tMid * (segment.pB - segment.pA);

        let unitIdx = units - 1;
        for (let unit = 0; unit < units; unit++) {
          if (projMid <= boundaries[unit] + 1e-5 && projMid >= boundaries[unit + 1] - 1e-5) {
            unitIdx = unit;
            break;
          }
        }

        const subLen = (tEnd - tStart) * segment.len;
        if (subLen < 0.1) continue;

        const midX = segment.start.x + tMid * (segment.end.x - segment.start.x);
        const midY = segment.start.y + tMid * (segment.end.y - segment.start.y);
        const dx = segment.end.x - segment.start.x;
        const dy = segment.end.y - segment.start.y;
        const tangent = segment.len > 1e-6 ? { x: dx / segment.len, y: dy / segment.len } : { x: 1, y: 0 };

        if (points.length >= maxPoints) throw new AnalysisComplexityError();
        points.push({
          buildingIndex,
          buildingName: building.name || `建筑${buildingIndex + 1}`,
          floor: floor + 1,
          unit: getDisplayUnitNumber(building, unitIdx, units),
          x: midX + segment.outward.x * 0.5,
          y: midY + segment.outward.y * 0.5,
          z: windowHeight,
          wallDataX: midX,
          wallDataY: midY,
          outward: segment.outward,
          tangent,
          cellWidth: getHeatmapCellWidth(subLen),
          sunlightHours: 0,
        });
      }
    }
  }

  return points;
}

export function collectAnalysisPoints(data: BuildingPlanData, maxPoints = SUNLIGHT_CONFIG.SUNLIGHT_ANALYSIS.MAX_SAMPLE_POINTS): SamplingPoint[] {
  const points: SamplingPoint[] = [];
  data.buildings.forEach((building, index) => {
    if (building.isThisCommunity === false) return;
    const remaining = maxPoints - points.length;
    points.push(...calculateSamplingPoints(building, index, remaining));
  });
  return points;
}

// ─── 分析结果聚合 ────────────────────────────────────────────────

export interface BuildingSunlightSummary {
  name: string;
  units: SamplingPoint[];
  minHours: number;
  maxHours: number;
  avgHours: number;
  totalUnits: number;
  belowReference: number;
}

export interface SunlightComputationResult {
  points: SamplingPoint[];
  totalUnits: number;
  minHours: number;
  maxHours: number;
  avgHours: number;
  belowReference: number;
  buildings: Record<string, BuildingSunlightSummary>;
}

export function buildSunlightResultsFromPoints(allPoints: SamplingPoint[], referenceHours: number): SunlightComputationResult {
  const buildings: Record<string, BuildingSunlightSummary & { unitsMap?: Map<string, SamplingPoint[]> }> = {};
  let sumUnitHours = 0;
  let totalUnits = 0;
  let globalMin = Infinity;
  let globalMax = 0;

  allPoints.forEach(point => {
    const buildingKey = String(point.buildingIndex);
    if (!buildings[buildingKey]) {
      buildings[buildingKey] = {
        name: point.buildingName,
        units: [],
        unitsMap: new Map(),
        minHours: Infinity,
        maxHours: 0,
        avgHours: 0,
        totalUnits: 0,
        belowReference: 0,
      };
    }
    const unitKey = `${point.floor}-${point.unit}`;
    const map = buildings[buildingKey].unitsMap!;
    if (!map.has(unitKey)) map.set(unitKey, []);
    map.get(unitKey)!.push(point);
  });

  for (const key of Object.keys(buildings)) {
    const buildingResult = buildings[key];
    let buildingSum = 0;
    let buildingBelowReference = 0;
    for (const unitPoints of buildingResult.unitsMap!.values()) {
      let unitMaxHours = 0;
      unitPoints.forEach(point => {
        unitMaxHours = Math.max(unitMaxHours, Number(point.sunlightHours) || 0);
      });
      unitPoints.forEach(point => {
        point.unitMaxHours = unitMaxHours;
      });
      buildingResult.units.push(...unitPoints);
      buildingResult.minHours = Math.min(buildingResult.minHours, unitMaxHours);
      buildingResult.maxHours = Math.max(buildingResult.maxHours, unitMaxHours);
      buildingResult.totalUnits++;
      buildingSum += unitMaxHours;
      sumUnitHours += unitMaxHours;
      totalUnits++;
      if (unitMaxHours < referenceHours) buildingBelowReference++;
      globalMin = Math.min(globalMin, unitMaxHours);
      globalMax = Math.max(globalMax, unitMaxHours);
    }
    buildingResult.avgHours = buildingResult.totalUnits > 0 ? buildingSum / buildingResult.totalUnits : 0;
    buildingResult.belowReference = buildingBelowReference;
    delete buildingResult.unitsMap;
  }

  const belowReferenceSet = new Set<string>();
  allPoints.forEach(point => {
    if ((point.unitMaxHours ?? 0) < referenceHours) belowReferenceSet.add(`${point.buildingIndex}-${point.floor}-${point.unit}`);
  });

  return {
    points: allPoints,
    totalUnits,
    minHours: globalMin === Infinity ? 0 : globalMin,
    maxHours: globalMax,
    avgHours: totalUnits > 0 ? sumUnitHours / totalUnits : 0,
    belowReference: totalUnits === 0 ? 0 : belowReferenceSet.size,
    buildings: buildings as Record<string, BuildingSunlightSummary>,
  };
}

// ─── Worker 调度 ─────────────────────────────────────────────────

interface SerializedOccluderMesh {
  positions: Float32Array;
  indices: Uint32Array | null;
  matrixWorld: number[];
}

function serializeOccluderMeshes(buildingMeshes: THREE.Mesh[]): SerializedOccluderMesh[] {
  const result: SerializedOccluderMesh[] = [];
  for (const mesh of buildingMeshes) {
    const position = mesh.geometry?.getAttribute('position');
    if (!position) continue;
    const positions = new Float32Array(position.array as ArrayLike<number>);
    const sourceIndex = mesh.geometry.getIndex();
    const indices = sourceIndex ? new Uint32Array(sourceIndex.array as ArrayLike<number>) : null;
    result.push({ positions, indices, matrixWorld: mesh.matrixWorld.elements.slice() });
  }
  return result;
}

function buildWorkerPayload(allPoints: SamplingPoint[], sunDirections: (THREE.Vector3 | null)[], buildingMeshes: THREE.Mesh[], timeStep: number) {
  const origins = new Float32Array(allPoints.length * 3);
  const outwardNormals = new Float32Array(allPoints.length * 2);
  allPoints.forEach((point, index) => {
    origins[index * 3] = point.x;
    origins[index * 3 + 1] = point.z;
    origins[index * 3 + 2] = point.y;
    outwardNormals[index * 2] = point.outward?.x || 0;
    outwardNormals[index * 2 + 1] = point.outward?.y || 0;
  });

  const directions = new Float32Array(sunDirections.length * 3);
  sunDirections.forEach((direction, index) => {
    if (!direction) return;
    directions[index * 3] = direction.x;
    directions[index * 3 + 1] = direction.y;
    directions[index * 3 + 2] = direction.z;
  });

  return {
    origins,
    outwardNormals,
    directions,
    meshes: serializeOccluderMeshes(buildingMeshes),
    timeStep,
    near: 0.1,
    far: Infinity,
  };
}

function runWorkerAnalysis(
  payload: ReturnType<typeof buildWorkerPayload>,
  onProgress: (value: number) => void,
  signal: { cancelled: boolean }
): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = createSunlightAnalysisWorker();
    } catch (error) {
      reject(error);
      return;
    }

    const transfer: Transferable[] = [payload.origins.buffer, payload.outwardNormals.buffer, payload.directions.buffer];
    payload.meshes.forEach(mesh => {
      transfer.push(mesh.positions.buffer);
      if (mesh.indices) transfer.push(mesh.indices.buffer);
    });

    const cleanup = () => worker.terminate();

    worker.onmessage = event => {
      if (signal.cancelled) {
        cleanup();
        return;
      }
      const message = event.data || {};
      if (message.type === 'progress') {
        onProgress(message.value);
        return;
      }
      if (message.type === 'complete') {
        cleanup();
        resolve(new Float32Array(message.hours));
        return;
      }
      if (message.type === 'error') {
        cleanup();
        reject(new Error(message.message || 'Worker analysis failed'));
      }
    };
    worker.onerror = event => {
      cleanup();
      reject(new Error(event.message || 'Worker analysis failed'));
    };
    worker.postMessage({ type: 'start', payload }, transfer);
  });
}

export interface SunlightAnalysisOptions {
  latitude: number;
  declination: number;
  solarTimeOffset: number;
  referenceHours: number;
  startHour?: number;
  endHour?: number;
  timeStep?: number;
  onProgress?: (value: number) => void;
}

/**
 * 执行完整的日照时长分析：采样点计算 → 太阳方向序列 → Worker 射线遮挡计算 → 结果聚合
 */
export async function runSunlightAnalysis(
  planData: BuildingPlanData,
  buildingMeshes: THREE.Mesh[],
  options: SunlightAnalysisOptions
): Promise<SunlightComputationResult> {
  const startHour = options.startHour ?? SUNLIGHT_CONFIG.TIME.MIN_HOUR;
  const endHour = options.endHour ?? SUNLIGHT_CONFIG.TIME.MAX_HOUR;
  const timeStep = options.timeStep ?? SUNLIGHT_CONFIG.SUNLIGHT_ANALYSIS.TIME_INTERVAL;

  const timePoints: number[] = [];
  {
    const count = Math.floor((endHour - startHour) / timeStep + 1e-9);
    for (let i = 0; i < count; i++) timePoints.push(roundTo(startHour + (i + 0.5) * timeStep, 10));
  }

  const sunDirections = timePoints.map(hour => calculateSunDirection(hour, options.latitude, options.declination, options.solarTimeOffset));
  const allPoints = collectAnalysisPoints(planData);
  if (allPoints.length === 0) {
    throw new Error('没有可分析的楼栋外墙面（请检查是否存在"本小区"楼栋）');
  }

  const raySteps = allPoints.length * timePoints.length;
  if (raySteps > SUNLIGHT_CONFIG.SUNLIGHT_ANALYSIS.MAX_RAY_STEPS) {
    throw new AnalysisComplexityError();
  }

  const signal = { cancelled: false };
  try {
    const payload = buildWorkerPayload(allPoints, sunDirections, buildingMeshes, timeStep);
    const hours = await runWorkerAnalysis(payload, options.onProgress ?? (() => {}), signal);
    hours.forEach((hoursValue, index) => {
      allPoints[index].sunlightHours = roundTo(hoursValue, 6);
    });
  } catch (error) {
    console.warn('Sunlight Worker unavailable, using main-thread fallback:', error);
    await runMainThreadAnalysis(allPoints, sunDirections, buildingMeshes, timeStep, options.onProgress);
  }

  return buildSunlightResultsFromPoints(allPoints, options.referenceHours);
}

function isFacadeFacingSun(point: SamplingPoint, sunDirection: THREE.Vector3): boolean {
  if (!point?.outward || !sunDirection) return true;
  return (point.outward.x || 0) * sunDirection.x + (point.outward.y || 0) * sunDirection.z > 1e-6;
}

function checkSunlight(point: SamplingPoint, sunDirection: THREE.Vector3 | null, buildingMeshes: THREE.Mesh[], raycaster: THREE.Raycaster): boolean {
  if (!sunDirection) return false;
  if (!isFacadeFacingSun(point, sunDirection)) return false;
  const origin = new THREE.Vector3(point.x, point.z, point.y);
  raycaster.set(origin, sunDirection);
  raycaster.near = 0.1;
  raycaster.far = Infinity;
  const intersects = raycaster.intersectObjects(buildingMeshes, false);
  return intersects.length === 0;
}

async function runMainThreadAnalysis(
  allPoints: SamplingPoint[],
  sunDirections: (THREE.Vector3 | null)[],
  buildingMeshes: THREE.Mesh[],
  timeStep: number,
  onProgress?: (value: number) => void
) {
  const raycaster = new THREE.Raycaster();
  const totalSteps = allPoints.length * sunDirections.length;
  const batchSize = SUNLIGHT_CONFIG.SUNLIGHT_ANALYSIS.MAIN_THREAD_BATCH_SIZE || 240;
  let completedSteps = 0;
  let batchSteps = 0;

  for (const point of allPoints) {
    for (const sunDirection of sunDirections) {
      if (sunDirection && checkSunlight(point, sunDirection, buildingMeshes, raycaster)) {
        point.sunlightHours += timeStep;
      }
      completedSteps++;
      batchSteps++;
      if (batchSteps >= batchSize) {
        onProgress?.(completedSteps / totalSteps);
        batchSteps = 0;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  }
  onProgress?.(1);
}

// ─── 日照时长配色 ────────────────────────────────────────────────

export function getSunlightColor(hours: number, maxHours = 8): THREE.Color {
  const clampedHours = Math.min(hours, maxHours);
  const t = clampedHours / maxHours;
  const colors = [
    { pos: 0, r: 255, g: 250, b: 205 },
    { pos: 0.2, r: 255, g: 239, b: 170 },
    { pos: 0.35, r: 255, g: 223, b: 130 },
    { pos: 0.5, r: 255, g: 200, b: 90 },
    { pos: 0.65, r: 255, g: 170, b: 60 },
    { pos: 0.8, r: 245, g: 140, b: 40 },
    { pos: 1, r: 220, g: 100, b: 20 },
  ];
  let lower = colors[0];
  let upper = colors[colors.length - 1];
  for (let i = 0; i < colors.length - 1; i++) {
    if (t >= colors[i].pos && t <= colors[i + 1].pos) {
      lower = colors[i];
      upper = colors[i + 1];
      break;
    }
  }
  const range = upper.pos - lower.pos;
  const localT = range > 0 ? (t - lower.pos) / range : 0;
  const r = Math.round(lower.r + (upper.r - lower.r) * localT);
  const g = Math.round(lower.g + (upper.g - lower.g) * localT);
  const b = Math.round(lower.b + (upper.b - lower.b) * localT);
  return new THREE.Color(r / 255, g / 255, b / 255);
}

// ─── 场景搭建 ────────────────────────────────────────────────────

export interface SunlightSceneHandles {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  buildingsGroup: THREE.Group;
  heatmapGroup: THREE.Group;
  sunLight: THREE.DirectionalLight;
  requestRender: (updateShadows?: boolean) => void;
  dispose: () => void;
}

/** 创建 Three.js 场景、相机、渲染器、控制器、灯光、地面等基础设施 */
export function createSunlightScene(container: HTMLDivElement): SunlightSceneHandles {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SUNLIGHT_CONFIG.SCENE.BACKGROUND_COLOR);
  scene.fog = new THREE.Fog(SUNLIGHT_CONFIG.SCENE.FOG_COLOR, SUNLIGHT_CONFIG.SCENE.FOG_NEAR, SUNLIGHT_CONFIG.SCENE.FOG_FAR);

  const camera = new THREE.PerspectiveCamera(SUNLIGHT_CONFIG.SCENE.CAMERA_FOV, container.clientWidth / container.clientHeight, SUNLIGHT_CONFIG.SCENE.CAMERA_NEAR, SUNLIGHT_CONFIG.SCENE.CAMERA_FAR);
  camera.position.set(SUNLIGHT_CONFIG.SCENE.CAMERA_POSITION.x, SUNLIGHT_CONFIG.SCENE.CAMERA_POSITION.y, SUNLIGHT_CONFIG.SCENE.CAMERA_POSITION.z);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.1;

  let renderFrameRequested = false;
  function requestRender(updateShadows = false) {
    if (updateShadows) renderer.shadowMap.needsUpdate = true;
    if (renderFrameRequested) return;
    renderFrameRequested = true;
    requestAnimationFrame(() => {
      renderFrameRequested = false;
      const controlsChanged = controls.update();
      renderer.render(scene, camera);
      if (controlsChanged) requestRender();
    });
  }
  controls.addEventListener('change', () => requestRender());

  const planeGeometry = new THREE.PlaneGeometry(4000, 4000);
  const planeMaterial = new THREE.MeshStandardMaterial({ color: SUNLIGHT_CONFIG.MATERIALS.GROUND_COLOR, roughness: 0.95, metalness: 0.0 });
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  scene.add(plane);

  const gridHelper = new THREE.GridHelper(2000, 100, 0xcfd8e3, 0xe9eff5);
  gridHelper.position.y = 0.02;
  scene.add(gridHelper);

  const buildingsGroup = new THREE.Group();
  scene.add(buildingsGroup);

  const heatmapGroup = new THREE.Group();
  heatmapGroup.visible = false;
  scene.add(heatmapGroup);

  const sunLight = new THREE.DirectionalLight(0xffffff, SUNLIGHT_CONFIG.LIGHTING.SUN_INTENSITY);
  sunLight.castShadow = true;
  const shadowMapSize = Math.min(SUNLIGHT_CONFIG.LIGHTING.SHADOW_MAP_SIZE, renderer.capabilities.maxTextureSize || SUNLIGHT_CONFIG.LIGHTING.SHADOW_MAP_SIZE);
  sunLight.shadow.mapSize.width = shadowMapSize;
  sunLight.shadow.mapSize.height = shadowMapSize;
  sunLight.shadow.bias = SUNLIGHT_CONFIG.LIGHTING.SHADOW_BIAS;
  const d = 500;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 2000;
  scene.add(sunLight);

  const ambientLight = new THREE.AmbientLight(SUNLIGHT_CONFIG.LIGHTING.AMBIENT_COLOR, SUNLIGHT_CONFIG.LIGHTING.AMBIENT_INTENSITY);
  scene.add(ambientLight);

  function dispose() {
    controls.dispose();
    renderer.dispose();
    disposeHeatmapLayer(heatmapGroup);
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement);
    }
  }

  return { scene, camera, renderer, controls, buildingsGroup, heatmapGroup, sunLight, requestRender, dispose };
}

const roofMaterial = new THREE.MeshStandardMaterial({ color: SUNLIGHT_CONFIG.MATERIALS.ROOF_COLOR, roughness: 0.9, metalness: 0.0 });

function createEdgeLines(geometry: THREE.BufferGeometry, color = 0x435061, opacity = 0.5): THREE.LineSegments {
  const edges = new THREE.EdgesGeometry(geometry, 15);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.LineSegments(edges, material);
}

/** 根据标注方案重建楼栋 3D 模型 */
export function loadBuildingsIntoScene(buildingsGroup: THREE.Group, data: BuildingPlanData): void {
  while (buildingsGroup.children.length > 0) {
    const child = buildingsGroup.children[0];
    buildingsGroup.remove(child);
  }

  if (!data || !Array.isArray(data.buildings) || data.buildings.length === 0) return;

  const facadeTextureCache = new Map<string, THREE.CanvasTexture>();

  data.buildings.forEach((b, index) => {
    if (!b.shape || b.shape.length < 3) return;

    const shape = new THREE.Shape();
    shape.moveTo(b.shape[0].x, -b.shape[0].y);
    for (let i = 1; i < b.shape.length; i++) shape.lineTo(b.shape[i].x, -b.shape[i].y);
    shape.closePath();

    const floors = Math.max(1, Math.trunc(b.floors || 1));
    const totalHeight = floors * (b.floorHeight || 3);
    const unitsPerFloor = normalizeUnitsPerFloor({ floors, units: b.units, unitsPerFloor: b.unitsPerFloor });
    const splitAxis = axisFromAngleDeg(b.unitSplitAngleDeg || 0);

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: totalHeight,
      bevelEnabled: false,
      UVGenerator: makeUVGenerator(b.shape, totalHeight, splitAxis) as unknown as THREE.ExtrudeGeometryOptions['UVGenerator'],
    };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.computeVertexNormals();

    const own = typeof b.isThisCommunity === 'boolean' ? b.isThisCommunity : true;
    const node = new THREE.Group();
    node.userData = { own, name: b.name || '', buildingIndex: index };
    buildingsGroup.add(node);

    let mesh: THREE.Mesh;
    if (own) {
      const key = JSON.stringify([floors, unitsPerFloor, b.unitRatiosPerFloor || null]);
      if (!facadeTextureCache.has(key)) facadeTextureCache.set(key, createFacadeTexture(floors, unitsPerFloor, b.unitRatiosPerFloor));
      const sideTexture = facadeTextureCache.get(key)!;
      const sideMaterial = new THREE.MeshStandardMaterial({
        map: sideTexture,
        color: SUNLIGHT_CONFIG.MATERIALS.BUILDING_COLOR,
        roughness: SUNLIGHT_CONFIG.MATERIALS.BUILDING_ROUGHNESS,
        metalness: 0.05,
      });
      mesh = new THREE.Mesh(geometry, [roofMaterial, sideMaterial]);
    } else {
      const neighborMaterial = new THREE.MeshStandardMaterial({
        color: SUNLIGHT_CONFIG.MATERIALS.NEIGHBOR_COLOR,
        roughness: 0.95,
        metalness: 0.0,
        transparent: true,
        opacity: SUNLIGHT_CONFIG.MATERIALS.NEIGHBOR_OPACITY,
      });
      mesh = new THREE.Mesh(geometry, neighborMaterial);
    }
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.buildingIndex = index;
    node.add(mesh);

    const edgesColor = own ? 0x435061 : 0x7c8896;
    const edgesOpacity = own ? 0.5 : 0.28;
    const edges = createEdgeLines(geometry, edgesColor, edgesOpacity);
    edges.rotation.x = -Math.PI / 2;
    node.add(edges);
  });
}

export function collectBuildingMeshes(buildingsGroup: THREE.Group): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  buildingsGroup.traverse(obj => {
    if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).geometry) meshes.push(obj as THREE.Mesh);
  });
  return meshes;
}

/** 调整相机以适配当前楼栋整体范围 */
export function fitViewToBuildings(handles: SunlightSceneHandles, padding = 1.3): void {
  const { camera, controls, buildingsGroup, sunLight, scene, requestRender } = handles;
  const nodes = buildingsGroup.children.filter(n => n.visible);
  if (nodes.length === 0) return;

  const box = new THREE.Box3();
  nodes.forEach(node => box.expandByObject(node));
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const maxSize = Math.max(size.x, size.z, 30);
  const fov = (camera.fov * Math.PI) / 180;
  let dist = ((maxSize / 2) / Math.tan(fov / 2)) * padding;
  dist = Math.min(Math.max(dist, 150), 1200);

  const elev = (35 * Math.PI) / 180;
  const azim = (-30 * Math.PI) / 180;
  const dx = dist * Math.cos(elev) * Math.sin(azim);
  const dy = dist * Math.sin(elev);
  const dz = dist * Math.cos(elev) * Math.cos(azim);

  camera.position.set(center.x + dx, Math.max(dy, size.y * 0.8, 60), center.z + dz);
  controls.target.set(center.x, 0, center.z);
  controls.minDistance = Math.max(40, dist * 0.2);
  controls.maxDistance = dist * 2.5;
  controls.update();

  const sd = Math.max(maxSize * 1.5, 200);
  sunLight.shadow.camera.left = -sd;
  sunLight.shadow.camera.right = sd;
  sunLight.shadow.camera.top = sd;
  sunLight.shadow.camera.bottom = -sd;
  sunLight.shadow.camera.far = Math.max(1500, sd * 5);

  if (scene.fog instanceof THREE.Fog) {
    scene.fog.near = Math.max(120, maxSize * 0.8);
    scene.fog.far = Math.max(900, maxSize * 6);
  }
  requestRender(true);
}

/** 根据当前时间更新太阳位置与光照强度 */
export function updateSunLight(
  handles: Pick<SunlightSceneHandles, 'sunLight' | 'requestRender'>,
  hour: number,
  latitude: number,
  declination: number,
  solarTimeOffset: number
): number {
  const sunPosition = calculateSunPosition(hour, latitude, declination, solarTimeOffset);
  const alt = sunPosition.altitude;
  const direction = sunPosition.direction;
  const dist = 800;
  handles.sunLight.position.set(direction.x * dist, direction.y * dist, direction.z * dist);

  if (alt > 0) {
    const altDeg = (alt * 180) / Math.PI;
    const altNorm = Math.min(altDeg / 90, 1);
    handles.sunLight.intensity = SUNLIGHT_CONFIG.LIGHTING.MIN_SUN_INTENSITY + (SUNLIGHT_CONFIG.LIGHTING.MAX_SUN_INTENSITY - SUNLIGHT_CONFIG.LIGHTING.MIN_SUN_INTENSITY) * altNorm;
    handles.sunLight.visible = true;
  } else {
    handles.sunLight.visible = false;
  }
  handles.requestRender(true);
  return alt;
}

export function createPlanFingerprint(data: BuildingPlanData): string {
  return createFingerprint({ buildings: data.buildings });
}

// ─── 采光热力图 ──────────────────────────────────────────────────
// 迁移自 building-sunlight-simulator/js/viewer.js 的 createHeatmapLayer / onCanvasClick /
// onCanvasMouseMove / filterHeatHitsByOcclusion 等逻辑。

const HEATMAP_BASE_OPACITY = 0.85;
const HEATMAP_HOVER_LIGHTEN = 0.18;
const HEATMAP_SELECTED_LIGHTEN = 0.34;
/** 允许的遮挡命中容差（米）：热力格本身沿外法线偏移 0.3 米，需要一定余量避免误判为被遮挡 */
const HEATMAP_OCCLUSION_EPS = 0.8;

export interface HeatmapCellUserData {
  apartmentKey: string;
  buildingIndex: number;
  buildingName: string;
  floor: number;
  unit: number;
  sunlightHours: number;
  unitMaxHours: number;
}

interface HeatmapCellDescriptor {
  mesh: THREE.InstancedMesh;
  instanceId: number;
  userData: HeatmapCellUserData;
  baseColor: THREE.Color;
  cellWidth: number;
}

/** 热力图交互状态与查表结构，建议由调用方以 useRef 持有，跨渲染帧复用 */
export interface HeatmapState {
  instanceData: HeatmapCellDescriptor[];
  cellsByApartmentKey: Map<string, HeatmapCellDescriptor[]>;
  resultsSource: SunlightComputationResult | null;
  hoveredApartmentKey: string | null;
  selectedApartmentKey: string | null;
  occluderMeshes: THREE.Mesh[];
}

export function createHeatmapState(): HeatmapState {
  return {
    instanceData: [],
    cellsByApartmentKey: new Map(),
    resultsSource: null,
    hoveredApartmentKey: null,
    selectedApartmentKey: null,
    occluderMeshes: [],
  };
}

export function makeApartmentKey(buildingIndex: number, floor: number, unit: number): string {
  return `${buildingIndex}::${floor}::${unit}`;
}

/** 建筑场景重建后需要调用，刷新用于热力图射线遮挡判断的实体楼栋网格缓存 */
export function refreshHeatmapOccluderMeshes(state: HeatmapState, buildingsGroup: THREE.Group): void {
  state.occluderMeshes = collectBuildingMeshes(buildingsGroup);
}

function disposeHeatmapLayer(heatmapGroup: THREE.Group): void {
  heatmapGroup.children.forEach(child => {
    const mesh = child as THREE.InstancedMesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach(m => m.dispose());
    else material?.dispose();
  });
  while (heatmapGroup.children.length > 0) heatmapGroup.remove(heatmapGroup.children[0]);
}

/**
 * 依据分析结果构建热力图图层（InstancedMesh，每个实例对应一个外墙采样片段）。
 * 仅在分析结果变化时需要重新调用；开关显隐请直接切换 `heatmapGroup.visible`。
 */
export function createHeatmapLayer(heatmapGroup: THREE.Group, state: HeatmapState, results: SunlightComputationResult): void {
  disposeHeatmapLayer(heatmapGroup);
  state.instanceData = [];
  state.cellsByApartmentKey = new Map();
  state.resultsSource = results;
  state.hoveredApartmentKey = null;
  state.selectedApartmentKey = null;

  const points = results.points;
  if (!points || points.length === 0) return;

  const maxHours = SUNLIGHT_CONFIG.SUNLIGHT_ANALYSIS.MAX_HOURS;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: HEATMAP_BASE_OPACITY,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, points.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);

  points.forEach((point, instanceId) => {
    const floorHeight = 3; // 各点已含世界坐标，层高仅用于格高估算，采用统一近似值
    const cellHeight = floorHeight * 0.9;
    const cellWidth = Math.max(0.06, Number(point.cellWidth) || 0.6);
    const hours = point.sunlightHours || 0;
    const color = getSunlightColor(hours, maxHours);
    const normalX = point.outward?.x || 0;
    const normalZ = point.outward?.y || 0;
    const offset = 0.3;

    position.set(point.wallDataX + normalX * offset, point.z, point.wallDataY + normalZ * offset);
    const normal = new THREE.Vector3(normalX, 0, normalZ);
    if (normal.lengthSq() < 1e-9) normal.set(0, 0, 1);
    normal.normalize();
    const lookTarget = position.clone().add(normal);
    const lookMatrix = new THREE.Matrix4().lookAt(position, lookTarget, up);
    quaternion.setFromRotationMatrix(lookMatrix);
    scale.set(cellWidth, cellHeight, 1);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(instanceId, matrix);
    mesh.setColorAt(instanceId, color);

    const apartmentKey = makeApartmentKey(point.buildingIndex, point.floor, point.unit);
    const descriptor: HeatmapCellDescriptor = {
      mesh,
      instanceId,
      userData: {
        apartmentKey,
        buildingIndex: point.buildingIndex,
        buildingName: point.buildingName,
        floor: point.floor,
        unit: point.unit,
        sunlightHours: hours,
        unitMaxHours: point.unitMaxHours ?? hours,
      },
      baseColor: color.clone(),
      cellWidth,
    };
    state.instanceData[instanceId] = descriptor;
    const list = state.cellsByApartmentKey.get(apartmentKey);
    if (list) list.push(descriptor);
    else state.cellsByApartmentKey.set(apartmentKey, [descriptor]);
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  heatmapGroup.add(mesh);
}

function applyHeatmapCellVisual(cell: HeatmapCellDescriptor, options: { selected?: boolean; hovered?: boolean } = {}): void {
  const targetColor = cell.baseColor.clone();
  const lighten = options.selected ? HEATMAP_SELECTED_LIGHTEN : options.hovered ? HEATMAP_HOVER_LIGHTEN : 0;
  if (lighten > 0) targetColor.lerp(new THREE.Color(1, 1, 1), lighten);
  cell.mesh.setColorAt(cell.instanceId, targetColor);
  if (cell.mesh.instanceColor) cell.mesh.instanceColor.needsUpdate = true;
}

function updateApartmentHighlight(state: HeatmapState, apartmentKey: string | null): void {
  if (!apartmentKey) return;
  const cells = state.cellsByApartmentKey.get(apartmentKey);
  if (!cells) return;
  const isSelected = apartmentKey === state.selectedApartmentKey;
  const isHovered = apartmentKey === state.hoveredApartmentKey;
  cells.forEach(cell => applyHeatmapCellVisual(cell, { selected: isSelected, hovered: isHovered }));
}

/** 过滤掉被真实建筑物遮挡、事实上不可见的热力格命中（射线穿透楼体从背面命中的情况） */
function filterHeatHitsByOcclusion(
  raycaster: THREE.Raycaster,
  heatHits: THREE.Intersection[],
  occluderMeshes: THREE.Mesh[]
): THREE.Intersection[] {
  if (!heatHits || heatHits.length === 0) return [];
  if (!occluderMeshes || occluderMeshes.length === 0) return heatHits;

  const buildingHits = raycaster.intersectObjects(occluderMeshes, true);
  const nearestBuildingHit = buildingHits.find(hit => hit && hit.distance > 1e-6);
  if (!nearestBuildingHit) return heatHits;

  const maxAcceptedDistance = nearestBuildingHit.distance + HEATMAP_OCCLUSION_EPS;
  return heatHits.filter(hit => hit && hit.distance <= maxAcceptedDistance);
}

export interface HeatmapPickResult {
  apartmentKey: string;
  userData: HeatmapCellUserData;
}

/**
 * 依据屏幕坐标（NDC，[-1,1]）在热力图层上做拾取，返回命中的户信息（若有）。
 * 用于 click / mousemove 事件处理。
 */
export function pickHeatmapApartment(
  ndcX: number,
  ndcY: number,
  camera: THREE.Camera,
  heatmapGroup: THREE.Group,
  state: HeatmapState,
  raycaster: THREE.Raycaster
): HeatmapPickResult | null {
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const intersects = raycaster.intersectObjects(heatmapGroup.children, false);
  const heatHits = filterHeatHitsByOcclusion(raycaster, intersects, state.occluderMeshes);
  const hit = heatHits.find(h => Number.isInteger(h.instanceId));
  if (!hit || !Number.isInteger(hit.instanceId)) return null;
  const descriptor = state.instanceData[hit.instanceId as number];
  if (!descriptor) return null;
  return { apartmentKey: descriptor.userData.apartmentKey, userData: descriptor.userData };
}

/** 设置当前悬浮的户，更新高亮着色；传 null 清除悬浮态 */
export function setHeatmapHover(state: HeatmapState, apartmentKey: string | null): void {
  if (state.hoveredApartmentKey === apartmentKey) return;
  const prev = state.hoveredApartmentKey;
  state.hoveredApartmentKey = apartmentKey;
  if (prev) updateApartmentHighlight(state, prev);
  if (apartmentKey) updateApartmentHighlight(state, apartmentKey);
}

/** 设置当前选中的户，更新高亮着色；传 null 清除选中态 */
export function setHeatmapSelection(state: HeatmapState, apartmentKey: string | null): void {
  if (state.selectedApartmentKey === apartmentKey) return;
  const prev = state.selectedApartmentKey;
  state.selectedApartmentKey = apartmentKey;
  if (prev) updateApartmentHighlight(state, prev);
  if (apartmentKey) updateApartmentHighlight(state, apartmentKey);
}

/** 清空热力图交互状态（关闭热力图或场景卸载时调用） */
export function clearHeatmapInteractionState(state: HeatmapState): void {
  const prevHover = state.hoveredApartmentKey;
  const prevSelected = state.selectedApartmentKey;
  state.hoveredApartmentKey = null;
  state.selectedApartmentKey = null;
  if (prevHover) updateApartmentHighlight(state, prevHover);
  if (prevSelected) updateApartmentHighlight(state, prevSelected);
}
