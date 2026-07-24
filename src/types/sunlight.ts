/**
 * 采光分析功能 - 类型定义
 * 对应原 building-sunlight-simulator 项目的 JSON 数据协议
 */

export interface Point2D {
  x: number;
  y: number;
}

/** 单栋楼数据（对应原 data.json 中 buildings[]） */
export interface BuildingData {
  name: string;
  floors: number;
  floorHeight: number;
  units: number;
  totalHeight: number;
  isThisCommunity: boolean;
  shape: Point2D[];
  center: Point2D;
  /** 每层户数（可选，逐层配置） */
  unitsPerFloor?: number[];
  /** 每层各户宽度比例（可选） */
  unitRatiosPerFloor?: (number[] | null)[];
  /** 分户轴角度（相对建筑朝向，度） */
  unitSplitAngleDeg?: number;
  /** 户号编号起始侧 */
  unitNumberingStartSide?: 'A' | 'B';
}

/** 规划标注数据（对应原 editor.html 导出的 data.json，不含分析结果） */
export interface BuildingPlanData {
  version: number | string;
  latitude: number;
  longitude: number;
  timeZone: string;
  northAngle: number;
  scaleRatio: number;
  origin: Point2D;
  buildings: BuildingData[];
}

/** 单户日照分析结果 */
export interface ApartmentSunlightResult {
  key: string;
  buildingName: string;
  floor: number;
  unitNumber: number;
  hours: number;
  meetsReference: boolean;
}

/** 日照分析结果缓存（对应原 precomputedSunlight 字段） */
export interface SunlightAnalysisResult {
  schemaVersion: number;
  algorithmVersion: string;
  /** 计算时使用的项目/采样点指纹，用于判断标注是否已变化 */
  projectFingerprint: string;
  samplingFingerprint: string;
  /** 分析使用的日期 (YYYY-MM-DD) */
  analysisDate: string;
  /** 参考时长（小时） */
  referenceHours: number;
  /** 各户日照时长结果 */
  apartments: ApartmentSunlightResult[];
  computedAt: string;
}

/**
 * 数据库行：小区采光方案（不含图片二进制，用于列表/详情查询）
 * 以 community_url（小区详情页链接）作为唯一键——因为不同城市/区域可能存在同名小区，
 * community 名称本身不具备唯一性，只作为展示冗余字段保留。
 */
export interface CommunitySunlightPlanRow {
  id: number;
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

/** 小区采光方案列表项（用于标记哪些小区已配置） */
export interface CommunitySunlightPlanListItem {
  communityUrl: string;
  community: string;
  city: string;
  district: string;
  hasBaseImage: boolean;
  updatedAt: string;
}
