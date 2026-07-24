/**
 * 采光分析 - 工具函数模块
 * 迁移自 building-sunlight-simulator/js/utils.js
 */

import type { BuildingData, BuildingPlanData, Point2D } from '@/types/sunlight';

export function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointsEqual(a: Point2D, b: Point2D, epsilon = 0): boolean {
  if (!a || !b) return false;
  if (epsilon > 0) return distance(a, b) <= epsilon;
  return a.x === b.x && a.y === b.y;
}

export function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (Number.isNaN(value)) return fallback;
  return Math.min(Math.max(Math.round(value), min), max);
}

export function clampFloat(value: number, min: number, max: number, fallback: number): number {
  if (Number.isNaN(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

export function roundTo(value: number, decimals = 2): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

function stableSerialize(value: unknown): string {
  const ancestors = new Set<unknown>();

  function serialize(item: unknown): string {
    if (item === null) return 'null';
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError('Cannot serialize a non-finite number');
      return Object.is(item, -0) ? '0' : JSON.stringify(item);
    }
    if (typeof item === 'boolean' || typeof item === 'string') return JSON.stringify(item);
    if (Array.isArray(item)) {
      if (ancestors.has(item)) throw new TypeError('Cannot serialize a circular value');
      ancestors.add(item);
      const result = `[${item.map(entry => serialize(entry === undefined ? null : entry)).join(',')}]`;
      ancestors.delete(item);
      return result;
    }
    if (typeof item === 'object') {
      if (ancestors.has(item)) throw new TypeError('Cannot serialize a circular value');
      ancestors.add(item);
      const obj = item as Record<string, unknown>;
      const entries = Object.keys(obj)
        .filter(key => obj[key] !== undefined && typeof obj[key] !== 'function')
        .sort()
        .map(key => `${JSON.stringify(key)}:${serialize(obj[key])}`);
      ancestors.delete(item);
      return `{${entries.join(',')}}`;
    }
    throw new TypeError(`Cannot serialize value of type ${typeof item}`);
  }

  return serialize(value);
}

export function hashString(value: unknown): string {
  const source = String(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code;
    second = Math.imul(second, 0x85ebca6b);
    second ^= second >>> 13;
  }
  first ^= first >>> 16;
  second ^= second >>> 16;
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

export function createFingerprint(value: unknown): string {
  return hashString(stableSerialize(value));
}

export function normalizeAngle(angle: number): number {
  if (Number.isNaN(angle) || !Number.isFinite(angle)) return 0;
  let normalized = angle % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return roundTo(normalized, 2);
}

export function formatTime(hour: number): string {
  const totalMinutes = Math.round(Number(hour) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = ((totalMinutes % 60) + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function createTimeSamples(startHour: number, endHour: number, interval: number): number[] {
  const start = Number(startHour);
  const end = Number(endHour);
  const step = Number(interval);
  if (![start, end, step].every(Number.isFinite) || step <= 0 || end <= start) return [];

  const count = Math.floor((end - start) / step + 1e-9);
  const samples: number[] = [];
  for (let index = 0; index < count; index++) {
    samples.push(roundTo(start + (index + 0.5) * step, 10));
  }
  return samples;
}

export function estimateOcclusionWork(raySteps: number, triangleCounts: number[], referenceTriangles = 12): number {
  const rays = Number(raySteps);
  const reference = Number(referenceTriangles);
  if (
    !Number.isFinite(rays) ||
    rays < 0 ||
    !Number.isFinite(reference) ||
    reference <= 0 ||
    !Array.isArray(triangleCounts)
  ) {
    return Infinity;
  }
  const meshEquivalents = triangleCounts.reduce((total, count) => {
    const triangles = Number(count);
    if (!Number.isFinite(triangles) || triangles < 0) return Infinity;
    return total + Math.max(1, triangles / reference);
  }, 0);
  return rays * meshEquivalents;
}

export function debounce<T extends (...args: never[]) => void>(
  func: T,
  wait = 300
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return function executedFunction(...args: Parameters<T>) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: never[]) => void>(
  func: T,
  limit = 300
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return function (this: unknown, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
  if (Array.isArray(obj)) return obj.map(item => deepClone(item)) as unknown as T;
  const clonedObj = {} as Record<string, unknown>;
  for (const key in obj as Record<string, unknown>) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clonedObj[key] = deepClone((obj as Record<string, unknown>)[key]);
    }
  }
  return clonedObj as unknown as T;
}

export function getPolygonCenter(points: Point2D[]): Point2D {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  points.forEach(p => {
    x += p.x;
    y += p.y;
  });
  return { x: x / points.length, y: y / points.length };
}

export function getPolygonArea(points: Point2D[]): number {
  if (!points || points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}

function pointsNearlyEqual(a: Point2D, b: Point2D, epsilon = 1e-9): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

function orientation(a: Point2D, b: Point2D, c: Point2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(a: Point2D, b: Point2D, point: Point2D, epsilon = 1e-9): boolean {
  return (
    Math.abs(orientation(a, b, point)) <= epsilon &&
    point.x >= Math.min(a.x, b.x) - epsilon &&
    point.x <= Math.max(a.x, b.x) + epsilon &&
    point.y >= Math.min(a.y, b.y) - epsilon &&
    point.y <= Math.max(a.y, b.y) + epsilon
  );
}

function segmentsIntersect(a: Point2D, b: Point2D, c: Point2D, d: Point2D, epsilon = 1e-9): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (
    ((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon)) &&
    ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))
  ) {
    return true;
  }

  return (
    (Math.abs(o1) <= epsilon && pointOnSegment(a, b, c, epsilon)) ||
    (Math.abs(o2) <= epsilon && pointOnSegment(a, b, d, epsilon)) ||
    (Math.abs(o3) <= epsilon && pointOnSegment(c, d, a, epsilon)) ||
    (Math.abs(o4) <= epsilon && pointOnSegment(c, d, b, epsilon))
  );
}

export function polygonSelfIntersects(points: Point2D[]): boolean {
  if (!Array.isArray(points) || points.length < 4) return false;
  const count = points.length;

  for (let i = 0; i < count; i++) {
    const nextI = (i + 1) % count;
    for (let j = i + 1; j < count; j++) {
      const nextJ = (j + 1) % count;
      const adjacent = i === j || nextI === j || nextJ === i;
      if (adjacent) continue;
      if (segmentsIntersect(points[i], points[nextI], points[j], points[nextJ])) return true;
    }
  }
  return false;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timeZone.trim() }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function rotatePlanPoint(point: Point2D, angleDeg: number): Point2D {
  const radians = (Number(angleDeg) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

export function transformProjectData(data: BuildingPlanData, northAngle: number): BuildingPlanData | null {
  if (!data) return null;
  const normalizedAngle = normalizeAngle(Number(northAngle));
  const rotationAngle = -normalizedAngle;
  const transformed = deepClone(data);
  transformed.northAngle = normalizedAngle;
  if (!Array.isArray(transformed.buildings)) return transformed;

  transformed.buildings = transformed.buildings.map(building => {
    const nextBuilding: BuildingData = { ...building };
    if (Array.isArray(building.shape)) {
      nextBuilding.shape = building.shape.map(point => rotatePlanPoint(point, rotationAngle));
    }
    if (building.center && Number.isFinite(building.center.x) && Number.isFinite(building.center.y)) {
      nextBuilding.center = rotatePlanPoint(building.center, rotationAngle);
    }
    nextBuilding.unitSplitAngleDeg = normalizeAngle((Number(building.unitSplitAngleDeg) || 0) + rotationAngle);
    return nextBuilding;
  });
  return transformed;
}

/**
 * 净化多边形顶点：去除重复点、过短边、共线点
 */
export function sanitizePolygon(rawPoints: Point2D[], epsPx = 0.75): Point2D[] {
  if (!Array.isArray(rawPoints)) return [];
  const eps = Math.max(1e-6, epsPx);
  const pts = rawPoints.slice();

  if (pts.length >= 2 && pointsEqual(pts[0], pts[pts.length - 1], eps)) {
    pts.pop();
  }
  if (pts.length < 3) return pts;

  const dedup: Point2D[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = dedup[dedup.length - 1];
    if (!q || !pointsEqual(p, q, eps)) {
      dedup.push({ x: p.x, y: p.y });
    }
  }

  if (dedup.length >= 2 && pointsEqual(dedup[0], dedup[dedup.length - 1], eps)) {
    dedup.pop();
  }
  if (dedup.length < 3) return dedup;

  const shortThresh = eps;
  let clean = dedup.slice();
  let changed = true;

  const mod = (n: number, m: number) => ((n % m) + m) % m;
  const edgeLen = (arr: Point2D[], i: number, j: number) => distance(arr[i], arr[j]);

  while (changed && clean.length > 3) {
    changed = false;
    for (let i = 0; i < clean.length; i++) {
      const j = mod(i + 1, clean.length);
      if (edgeLen(clean, i, j) < shortThresh) {
        clean = clean.slice(0, j).concat(clean.slice(j + 1));
        changed = true;
        if (clean.length <= 3) break;
      }
    }
  }

  if (clean.length < 3) return clean;

  const result: Point2D[] = [];
  const n = clean.length;
  for (let i = 0; i < n; i++) {
    const p0 = clean[mod(i - 1, n)];
    const p1 = clean[i];
    const p2 = clean[mod(i + 1, n)];
    const v1x = p1.x - p0.x;
    const v1y = p1.y - p0.y;
    const v2x = p2.x - p1.x;
    const v2y = p2.y - p1.y;
    const cross = Math.abs(v1x * v2y - v1y * v2x);
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (cross > eps * (len1 + len2)) result.push(p1);
  }

  if (result.length < 3) return clean;
  return result;
}

export function escapeHtml(str: unknown): string {
  const s = String(str ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
