import type { ConflictStatus, RecordSource } from './source';

/** 年龄 */
export type BirdAge = '幼' | '亚成' | '成';
/** 环志状态 */
export type RingStatus = '初捕' | '重捕' | '回收';

/** 环志记录 */
export interface RingRecord {
  id: string;
  /** 金属环号 */
  ringNo: string;
  /** 彩环组合（可空） */
  colorRing: string;
  /** 鸟种中文名 */
  speciesCn: string;
  /** 学名 */
  speciesSci: string;
  /** 年龄 */
  age: BirdAge;
  /** 环志日期 ISO */
  ringDate: string;
  /** 网号 */
  netNo: string;
  /** 网次 */
  netRound: number;
  /** 状态：初捕 / 重捕 / 回收 */
  status: RingStatus;
  /** 环志人 */
  ringer: string;
  /** 鸟点 id */
  siteId: string;
  /** 调查批次 id */
  sessionId: string;
  /** 备注 */
  remark?: string;
  /** 来源：本站录入 / 摘录合并 */
  source: RecordSource;
  /** 摘录包 id（source='merge' 时） */
  mergeId?: string;
  /** 冲突组 id（同一只鸟两版共用） */
  conflictGroup?: string;
  /** 冲突裁决状态：有效 / 待裁决 / 已废弃 */
  conflictStatus?: ConflictStatus;
}

/** 金属环号格式：一般为「环前缀-序号」，如 A-12345 */
export const RING_PREFIXES: string[] = ['A', 'B', 'C', 'D', 'E'];

/** 彩环颜色组合可选值 */
export const COLOR_RING_PRESETS: string[] = ['无', '红-黄', '蓝-白', '绿-橙', '黑-红', '黄-蓝-白'];

export const BIRD_AGES: BirdAge[] = ['幼', '亚成', '成'];
export const RING_STATUSES: RingStatus[] = ['初捕', '重捕', '回收'];

export const STATUS_COLOR: Record<RingStatus, string> = {
  初捕: 'success',
  重捕: 'warning',
  回收: 'danger',
};
