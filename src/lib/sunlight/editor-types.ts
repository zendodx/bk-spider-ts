/**
 * 采光分析 - 编辑器内部使用的楼栋数据结构
 * 与最终导出的 BuildingData 略有不同：points 用像素坐标（相对底图），且带自增 id 便于编辑态引用
 */

import type { Point2D } from '@/types/sunlight';

export interface EditingBuilding {
  id: string;
  name: string;
  floors: number;
  floorHeight: number;
  units: number;
  isThisCommunity: boolean;
  unitSplitAngleDeg: number;
  unitNumberingStartSide: 'A' | 'B';
  /**
   * 每层各户宽度占比（可视化分户编辑结果）。
   * 长度为 1 表示所有楼层复用同一套比例；否则长度等于 floors，逐层配置。
   * 未配置（undefined/null）时按户数等分。
   */
  unitRatiosPerFloor?: (number[] | null)[];
  /** 楼栋轮廓，像素坐标（相对底图左上角） */
  points: Point2D[];
}

export function createEditingBuildingId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
