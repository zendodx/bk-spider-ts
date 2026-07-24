/**
 * 采光分析 - 建筑规划数据校验与规范化
 * 迁移自 building-sunlight-simulator/js/utils.js 中的 normalizeBuildingData / validateBuildingData
 */

import type { BuildingData, BuildingPlanData, Point2D } from '@/types/sunlight';
import { getPolygonArea, getPolygonCenter, isValidTimeZone, normalizeAngle, polygonSelfIntersects } from './utils';

function pointsNearlyEqual(a: Point2D, b: Point2D, epsilon = 1e-9): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

export interface NormalizeOptions {
  defaults?: Partial<{
    latitude: number;
    longitude: number;
    timeZone: string;
    northAngle: number;
    scaleRatio: number;
  }>;
}

export interface NormalizeResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  data: BuildingPlanData | null;
}

const LIMITS = {
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 },
  northAngle: { min: -180, max: 180 },
  floors: { min: 1, max: 300 },
  floorHeight: { min: 1, max: 20 },
  units: { min: 1, max: 50 },
  buildings: { min: 1, max: 500 },
  polygonPoints: { min: 3, max: 200 },
  minPolygonArea: 0.0001,
};

/**
 * 验证并规范化建筑规划 JSON 数据格式。
 */
export function normalizeBuildingData(data: unknown, options: NormalizeOptions = {}): NormalizeResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const defaults = {
    latitude: 36.65,
    longitude: 117.12,
    timeZone: 'Asia/Shanghai',
    northAngle: 0,
    scaleRatio: 1,
    ...options.defaults,
  };

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['Data must be an object'], warnings, data: null };
  }
  const input = data as Record<string, unknown>;

  function readNumber(
    value: unknown,
    path: string,
    range: { min: number; max: number } | null,
    fallback: number,
    integer = false
  ): number {
    if (value == null) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${path} must be a finite number`);
      return fallback;
    }
    if (integer && !Number.isInteger(value)) {
      errors.push(`${path} must be an integer`);
      return fallback;
    }
    if (range && (value < range.min || value > range.max)) {
      errors.push(`${path} must be between ${range.min} and ${range.max}`);
      return fallback;
    }
    return value;
  }

  const latitude = readNumber(input.latitude, 'latitude', LIMITS.latitude, defaults.latitude);
  const longitude = readNumber(input.longitude, 'longitude', LIMITS.longitude, defaults.longitude);
  const northAngle = normalizeAngle(readNumber(input.northAngle, 'northAngle', LIMITS.northAngle, defaults.northAngle));
  const scaleRatio = readNumber(
    input.scaleRatio,
    'scaleRatio',
    { min: Number.EPSILON, max: Number.MAX_VALUE },
    defaults.scaleRatio
  );
  const timeZone = input.timeZone == null ? defaults.timeZone : String(input.timeZone).trim();

  if (input.latitude == null) warnings.push('latitude missing; current/default latitude was used');
  if (input.longitude == null) warnings.push('longitude missing; current/default longitude was used');
  if (input.timeZone == null) warnings.push('timeZone missing; current/default time zone was used');
  if (!isValidTimeZone(timeZone)) errors.push('timeZone must be a valid IANA time zone');

  let origin: Point2D = { x: 0, y: 0 };
  if (input.origin != null) {
    const o = input.origin as Point2D;
    if (!o || typeof o !== 'object' || !Number.isFinite(o.x) || !Number.isFinite(o.y)) {
      errors.push('origin must contain finite x and y values');
    } else {
      origin = { x: o.x, y: o.y };
    }
  }

  // originPixel：origin 在底图上的绝对像素坐标，用于重新打开编辑器时精确复原标注框位置。
  // 可选字段（旧版本数据没有），不合法时忽略而不是报错，避免影响整体保存。
  let originPixel: Point2D | undefined;
  if (input.originPixel != null) {
    const op = input.originPixel as Point2D;
    if (op && typeof op === 'object' && Number.isFinite(op.x) && Number.isFinite(op.y)) {
      originPixel = { x: op.x, y: op.y };
    }
  }

  if (!Array.isArray(input.buildings)) {
    errors.push('buildings must be an array');
    return { valid: false, errors, warnings, data: null };
  }
  if (input.buildings.length < LIMITS.buildings.min || input.buildings.length > LIMITS.buildings.max) {
    errors.push(`buildings must contain between ${LIMITS.buildings.min} and ${LIMITS.buildings.max} items`);
  }

  const buildings: BuildingData[] = [];
  (input.buildings as unknown[]).forEach((buildingRaw, index) => {
    const path = `buildings[${index}]`;
    if (!buildingRaw || typeof buildingRaw !== 'object' || Array.isArray(buildingRaw)) {
      errors.push(`${path} must be an object`);
      return;
    }
    const building = buildingRaw as Record<string, unknown>;

    const floors = readNumber(building.floors, `${path}.floors`, LIMITS.floors, 1, true);
    const floorHeight = readNumber(building.floorHeight, `${path}.floorHeight`, LIMITS.floorHeight, 3);
    const units = readNumber(building.units, `${path}.units`, LIMITS.units, 1, true);
    const maximumHeight = LIMITS.floors.max * LIMITS.floorHeight.max;
    const calculatedHeight = floors * floorHeight;
    const suppliedHeight = readNumber(
      building.totalHeight,
      `${path}.totalHeight`,
      { min: Number.EPSILON, max: maximumHeight },
      calculatedHeight
    );
    if (
      building.totalHeight != null &&
      Math.abs(suppliedHeight - calculatedHeight) > Math.max(1e-6, calculatedHeight * 1e-6)
    ) {
      errors.push(`${path}.totalHeight must equal floors * floorHeight`);
    }
    const totalHeight = calculatedHeight;

    let isThisCommunity = true;
    if (building.isThisCommunity != null) {
      if (typeof building.isThisCommunity !== 'boolean') {
        errors.push(`${path}.isThisCommunity must be a boolean`);
      } else {
        isThisCommunity = building.isThisCommunity;
      }
    }

    let shape: Point2D[] = [];
    if (!Array.isArray(building.shape)) {
      errors.push(`${path}.shape must be an array`);
    } else {
      shape = (building.shape as unknown[])
        .map((pointRaw, pointIndex) => {
          const point = pointRaw as Point2D;
          if (!point || typeof point !== 'object' || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            errors.push(`${path}.shape[${pointIndex}] must contain finite x and y values`);
            return null;
          }
          return { x: point.x, y: point.y };
        })
        .filter((p): p is Point2D => p !== null);

      if (shape.length > 3 && pointsNearlyEqual(shape[0], shape[shape.length - 1])) shape.pop();
      if (shape.length < LIMITS.polygonPoints.min || shape.length > LIMITS.polygonPoints.max) {
        errors.push(`${path}.shape must contain between ${LIMITS.polygonPoints.min} and ${LIMITS.polygonPoints.max} points`);
      }
      for (let pointIndex = 0; pointIndex < shape.length; pointIndex++) {
        if (pointsNearlyEqual(shape[pointIndex], shape[(pointIndex + 1) % shape.length])) {
          errors.push(`${path}.shape contains a zero-length edge`);
          break;
        }
      }
      if (getPolygonArea(shape) < LIMITS.minPolygonArea) {
        errors.push(`${path}.shape area is too small`);
      }
      if (polygonSelfIntersects(shape)) {
        errors.push(`${path}.shape must not self-intersect`);
      }
    }

    let center = getPolygonCenter(shape);
    if (building.center != null) {
      const c = building.center as Point2D;
      if (!c || typeof c !== 'object' || !Number.isFinite(c.x) || !Number.isFinite(c.y)) {
        errors.push(`${path}.center must contain finite x and y values`);
      } else {
        center = { x: c.x, y: c.y };
      }
    }

    let unitsPerFloor: number[] | undefined;
    const effectiveUnitsPerFloor: number[] = new Array(floors).fill(units);
    if (building.unitsPerFloor != null) {
      const raw = building.unitsPerFloor;
      if (
        !Array.isArray(raw) ||
        raw.length === 0 ||
        raw.length > floors ||
        raw.some((value: number) => !Number.isInteger(value) || value < LIMITS.units.min || value > LIMITS.units.max)
      ) {
        errors.push(`${path}.unitsPerFloor is invalid`);
      } else {
        for (let floorIndex = 0; floorIndex < floors; floorIndex++) {
          effectiveUnitsPerFloor[floorIndex] = raw[Math.min(floorIndex, raw.length - 1)];
        }
        unitsPerFloor = effectiveUnitsPerFloor.slice();
      }
    }

    let unitRatiosPerFloor: (number[] | null)[] | undefined;
    if (building.unitRatiosPerFloor != null) {
      const raw = building.unitRatiosPerFloor as unknown[];
      if (!Array.isArray(raw) || ![1, floors].includes(raw.length)) {
        errors.push(`${path}.unitRatiosPerFloor must contain one row or one row per floor`);
      } else {
        const sharedRow = raw.length === 1;
        if (sharedRow && effectiveUnitsPerFloor.some((value: number) => value !== effectiveUnitsPerFloor[0])) {
          errors.push(`${path}.unitRatiosPerFloor cannot reuse one row when unitsPerFloor varies`);
        }
        unitRatiosPerFloor = raw.map((rowRaw, rowIndex) => {
          const row = rowRaw as number[] | null;
          if (row == null && raw.length === floors) return null;
          const expectedUnits = sharedRow ? effectiveUnitsPerFloor[0] : effectiveUnitsPerFloor[rowIndex];
          if (
            !Array.isArray(row) ||
            row.length !== expectedUnits ||
            row.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)
          ) {
            errors.push(`${path}.unitRatiosPerFloor[${rowIndex}] is invalid`);
            return null;
          }
          const sum = row.reduce((total, value) => total + value, 0);
          if (sum <= 1e-9) {
            errors.push(`${path}.unitRatiosPerFloor[${rowIndex}] must have a positive sum`);
            return null;
          }
          return row.map(value => value / sum);
        });
      }
    }

    const splitAngle = readNumber(building.unitSplitAngleDeg, `${path}.unitSplitAngleDeg`, LIMITS.northAngle, 0);
    const numberingSide =
      building.unitNumberingStartSide == null ? 'A' : String(building.unitNumberingStartSide).toUpperCase();
    if (!['A', 'B'].includes(numberingSide)) {
      errors.push(`${path}.unitNumberingStartSide must be A or B`);
    }

    buildings.push({
      name: typeof building.name === 'string' && building.name.trim() ? building.name.trim() : `楼栋 ${index + 1}`,
      floors,
      floorHeight,
      units,
      totalHeight,
      isThisCommunity,
      shape,
      center,
      ...(unitRatiosPerFloor ? { unitRatiosPerFloor } : {}),
      ...(unitsPerFloor ? { unitsPerFloor } : {}),
      ...(Math.abs(splitAngle) > 1e-9 ? { unitSplitAngleDeg: normalizeAngle(splitAngle) } : {}),
      ...(numberingSide === 'B' ? { unitNumberingStartSide: 'B' as const } : {}),
    });
  });

  const normalized: BuildingPlanData = {
    version: (input.version as number | string) ?? '3.2.0',
    latitude,
    longitude,
    timeZone,
    northAngle,
    scaleRatio,
    origin,
    ...(originPixel ? { originPixel } : {}),
    buildings,
  };

  return { valid: errors.length === 0, errors, warnings, data: errors.length === 0 ? normalized : null };
}

export function validateBuildingData(
  data: unknown,
  options: NormalizeOptions = {}
): { valid: boolean; errors: string[]; warnings: string[] } {
  const result = normalizeBuildingData(data, options);
  return { valid: result.valid, errors: result.errors, warnings: result.warnings };
}
