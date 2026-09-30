import type { ConflictStatus, RecordSource } from './source';

/** 生境类型 */
export type Habitat = '芦苇湿地' | '滩涂' | '次生林' | '农田' | '城市绿地';

/** 鸟点 */
export interface BirdSite {
  id: string;
  /** 点位编号 */
  siteNo: string;
  /** 点位名称 */
  name: string;
  /** 经度 */
  lng: number;
  /** 纬度 */
  lat: number;
  /** 生境 */
  habitat: Habitat;
  /** 网位数 */
  netCount: number;
  /** 备注 */
  note?: string;
  /** 来源：本站录入 / 摘录合并 */
  source: RecordSource;
  /** 摘录包 id（source='merge' 时） */
  mergeId?: string;
  /** 待确认：合并来的新鸟点在鸟点台账无对应点位时挂起，不进正式统计 */
  pending?: boolean;
  /** 冲突组 id（同一点位两版共用） */
  conflictGroup?: string;
  /** 冲突裁决状态：有效 / 待裁决 / 已废弃 */
  conflictStatus?: ConflictStatus;
}

export const HABITATS: Habitat[] = ['芦苇湿地', '滩涂', '次生林', '农田', '城市绿地'];

/** 生境配色（地图标记与 SVG 网格共用） */
export const HABITAT_COLOR: Record<Habitat, string> = {
  芦苇湿地: '#2f7d6f',
  滩涂: '#c8a165',
  次生林: '#3f6b3a',
  农田: '#a3b565',
  城市绿地: '#7f8fa6',
};

/** 地图/网格模式 */
export type MapMode = 'amap' | 'grid';

/** 默认经纬度范围（渤海湾南岸环志区），用于 SVG 网格视图 */
export const DEFAULT_BOUNDS = {
  minLng: 117.4,
  maxLng: 118.4,
  minLat: 38.6,
  maxLat: 39.4,
};

/** SVG 网格行列数 */
export const GRID_COLS = 8;
export const GRID_ROWS = 6;
