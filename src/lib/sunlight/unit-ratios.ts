/**
 * 采光分析 - 户型（分户）比例计算工具
 * 迁移自 building-sunlight-simulator/js/editor.js 中「可视化分户编辑」相关的纯函数部分
 *
 * 数据模型说明：
 * - unitRatiosPerFloor: 每层各户宽度占比数组的数组。若只有 1 行，表示所有楼层复用同一套比例；
 *   否则数组长度必须等于楼层数，逐层配置。
 * - 每行的占比数组长度必须等于该层户数，且各值之和为 1（保存前会做归一化）。
 */

export const MIN_VISUAL_UNIT_RATIO = 0.01;
export const MAX_VISUAL_UNIT_RATIO = 0.98;

/** 生成 count 户等分的比例数组 */
export function buildEqualUnitRatios(units: number): number[] {
  const count = Math.max(1, Math.trunc(units || 1));
  return new Array(count).fill(1 / count);
}

/** 获取楼栋每层户数数组（当前版本每层户数统一为 units，保留 unitsOrCounts 以兼容后续逐层配置扩展） */
export function normalizeUnitCounts(floors: number, unitsOrCounts: number | number[]): number[] {
  const totalFloors = Math.max(1, Math.trunc(floors || 1));
  if (Array.isArray(unitsOrCounts)) {
    return new Array(totalFloors)
      .fill(1)
      .map((_, floorIndex) => Math.max(1, Math.trunc(unitsOrCounts[Math.min(floorIndex, unitsOrCounts.length - 1)] || 1)));
  }
  return new Array(totalFloors).fill(Math.max(1, Math.trunc(unitsOrCounts || 1)));
}

/** 校验并归一化一组比例：长度必须等于 units，值需为非负数字且总和 > 0，返回归一化（总和为 1）后的数组 */
export function normalizeUnitRatios(ratios: unknown, units: number): number[] | null {
  const count = Math.max(1, Math.trunc(units || 1));
  if (!Array.isArray(ratios) || ratios.length !== count) return null;

  const cleaned = ratios.map(value => {
    const num = Number(value);
    return Number.isFinite(num) ? num : NaN;
  });
  if (cleaned.some(value => !Number.isFinite(value) || value < 0)) return null;

  const sum = cleaned.reduce((acc, value) => acc + value, 0);
  if (sum <= 1e-9) return null;

  return cleaned.map(value => value / sum);
}

/** 可视化拖拽时单户占比允许的上下限（避免某一户被拖到 0 或占满全部） */
export function getVisualUnitRatioBounds(units: number): { min: number; max: number } {
  const count = Math.max(1, Math.trunc(units || 1));
  if (count === 1) return { min: 1, max: 1 };
  return {
    min: MIN_VISUAL_UNIT_RATIO,
    max: Math.min(MAX_VISUAL_UNIT_RATIO, 1 - MIN_VISUAL_UNIT_RATIO * (count - 1)),
  };
}

/** 将任意比例数组约束到可视化编辑允许的范围内（用于打开编辑器时的初始化） */
export function constrainVisualUnitRatios(ratios: unknown, units: number): number[] {
  const count = Math.max(1, Math.trunc(units || 1));
  const normalized = normalizeUnitRatios(ratios, count) || buildEqualUnitRatios(count);
  if (count === 1) return [1];

  const { min } = getVisualUnitRatioBounds(count);
  const available = 1 - min * count;
  const weights = normalized.map(value => Math.max(0, value - min));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  if (weightTotal <= 1e-9) return buildEqualUnitRatios(count);
  return weights.map(weight => min + (available * weight) / weightTotal);
}

/** 拖动第 index 户的分隔条到 nextValue 占比时，按权重重新分配其余各户的占比 */
export function redistributeVisualUnitRatio(ratios: number[], index: number, nextValue: number): number[] {
  const count = ratios.length;
  if (count <= 1) return [1];

  const constrained = constrainVisualUnitRatios(ratios, count);
  const { min, max } = getVisualUnitRatioBounds(count);
  const numericValue = Number(nextValue);
  const target = Math.min(max, Math.max(min, Number.isFinite(numericValue) ? numericValue : min));
  const availableForOthers = 1 - target - min * (count - 1);
  const weights = constrained.map((value, ratioIndex) => (ratioIndex === index ? 0 : Math.max(0, value - min)));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const result = constrained.map((value, ratioIndex) => {
    if (ratioIndex === index) return target;
    const share = weightTotal > 1e-9 ? weights[ratioIndex] / weightTotal : 1 / (count - 1);
    return min + availableForOthers * share;
  });
  return constrainVisualUnitRatios(result, count);
}

/** 拖动第 boundaryIndex / boundaryIndex+1 户之间的分界线，两户按 delta 此消彼长（用于条形图上直接拖拽分界线） */
export function adjustVisualSplitBoundary(ratios: number[], boundaryIndex: number, delta: number): number[] {
  const next = ratios.slice();
  const pairTotal = next[boundaryIndex] + next[boundaryIndex + 1];
  const minimum = MIN_VISUAL_UNIT_RATIO;
  const left = Math.min(pairTotal - minimum, Math.max(minimum, next[boundaryIndex] + delta));
  next[boundaryIndex] = left;
  next[boundaryIndex + 1] = pairTotal - left;
  return next;
}

function unitRatiosMatch(a: number[] | null, b: number[] | null, eps = 1e-6): boolean {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs((Number(a[i]) || 0) - (Number(b[i]) || 0)) > eps) return false;
  }
  return true;
}

/** 若所有楼层的比例配置其实相同，返回该共用比例（用于导出时精简为单行配置） */
function getSharedFirstFloorUnitRatios(
  unitRatiosPerFloor: (number[] | null)[],
  floors: number,
  unitsOrCounts: number | number[]
): number[] | null {
  const totalFloors = Math.max(1, Math.trunc(floors || 1));
  const unitCounts = normalizeUnitCounts(totalFloors, unitsOrCounts);
  if (unitCounts.some(count => count !== unitCounts[0])) return null;
  if (!Array.isArray(unitRatiosPerFloor) || unitRatiosPerFloor.length === 0) return null;

  const first = normalizeUnitRatios(unitRatiosPerFloor[0], unitCounts[0]);
  if (!first) return null;

  for (let i = 1; i < totalFloors; i++) {
    const next = unitRatiosPerFloor[i];
    if (next == null) continue;
    const normalized = normalizeUnitRatios(next, unitCounts[i]);
    if (!normalized || !unitRatiosMatch(normalized, first)) return null;
  }

  return first;
}

/**
 * 将编辑态的逐层比例数组序列化为导出协议格式：
 * - 若所有楼层比例一致，压缩为长度为 1 的数组（整栋复用）
 * - 否则按楼层逐一输出（某层缺失/无效则该行为 null）
 * - 若全部楼层都没有配置（即使用默认等分），返回 null（表示不写入该字段，使用默认等分）
 */
export function serializeUnitRatiosPerFloor(
  unitRatiosPerFloor: (number[] | null | undefined)[] | null | undefined,
  floors: number,
  unitsOrCounts: number | number[]
): (number[] | null)[] | null {
  const totalFloors = Math.max(1, Math.trunc(floors || 1));
  const unitCounts = normalizeUnitCounts(totalFloors, unitsOrCounts);
  const perFloor: (number[] | null)[] = [];
  let hasAny = false;

  for (let floorIndex = 0; floorIndex < totalFloors; floorIndex++) {
    const normalized = normalizeUnitRatios(unitRatiosPerFloor?.[floorIndex], unitCounts[floorIndex]);
    perFloor.push(normalized);
    if (normalized) hasAny = true;
  }

  if (!hasAny) return null;

  const sharedFirst = getSharedFirstFloorUnitRatios(perFloor, totalFloors, unitCounts);
  if (sharedFirst) return [sharedFirst.slice()];
  return perFloor;
}

/**
 * 根据楼栋当前的 floors/units 及已保存的 unitRatiosPerFloor，
 * 生成用于「可视化编辑」弹窗的逐层比例数组（每层都补全为合法的可视化比例）。
 */
export function getVisualSplitRatiosFromBuilding(
  unitRatiosPerFloor: (number[] | null | undefined)[] | null | undefined,
  floors: number,
  unitsOrCounts: number | number[]
): number[][] {
  const totalFloors = Math.max(1, Math.trunc(floors || 1));
  const unitCounts = normalizeUnitCounts(totalFloors, unitsOrCounts);
  const source = Array.isArray(unitRatiosPerFloor) ? unitRatiosPerFloor : null;

  return new Array(totalFloors).fill(null).map((_, floorIndex) => {
    const units = unitCounts[floorIndex];
    const row = source?.[source.length === 1 ? 0 : floorIndex];
    return constrainVisualUnitRatios(row, units);
  });
}

/**
 * 当楼栋的 floors 或 units 发生变化时，把旧的 unitRatiosPerFloor 平滑迁移到新的层数/户数下：
 * - 楼层增加：新增楼层复用最后一层的比例（若楼层减少则截断）
 * - 户数变化：按原比例重新归一化到新户数（多退少补，采用等分兜底）
 */
export function resizeUnitRatiosPerFloor(
  unitRatiosPerFloor: (number[] | null | undefined)[] | null | undefined,
  previousFloors: number,
  previousUnitsOrCounts: number | number[],
  nextFloors: number,
  nextUnitsOrCounts: number | number[]
): (number[] | null)[] | null {
  if (!Array.isArray(unitRatiosPerFloor) || unitRatiosPerFloor.length === 0) return null;

  const previousUnitCounts = normalizeUnitCounts(previousFloors, previousUnitsOrCounts);
  const nextUnitCounts = normalizeUnitCounts(nextFloors, nextUnitsOrCounts);
  const totalPreviousFloors = Math.max(1, Math.trunc(previousFloors || 1));
  const totalNextFloors = Math.max(1, Math.trunc(nextFloors || 1));

  const expandedPrevious = new Array(totalPreviousFloors).fill(null).map((_, floorIndex) => {
    const row = unitRatiosPerFloor[unitRatiosPerFloor.length === 1 ? 0 : floorIndex];
    return normalizeUnitRatios(row, previousUnitCounts[floorIndex]) || buildEqualUnitRatios(previousUnitCounts[floorIndex]);
  });

  const resized = new Array(totalNextFloors).fill(null).map((_, floorIndex) => {
    const source = expandedPrevious[Math.min(floorIndex, expandedPrevious.length - 1)];
    return normalizeUnitRatios(source, nextUnitCounts[floorIndex]) || buildEqualUnitRatios(nextUnitCounts[floorIndex]);
  });

  return serializeUnitRatiosPerFloor(resized, totalNextFloors, nextUnitCounts);
}
