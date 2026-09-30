/** 年龄 */
import type { RecordSource } from './source';

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
  /** 数据来源：站里录入 / 野外离线合并（老数据升级时补 station） */
  source: RecordSource;
  /** 来源标记：野外小组 / 设备名（站里录入为录入人所在站，默认「站里」） */
  origin: string;
  /**
   * 冲突组 id：同一只鸟（同环号）两边都改过时，两版归入同一组。
   * 未冲突的记录为空。
   */
  conflictGroup?: string;
  /** 该记录是否为冲突组里未被采用的留档版本（采用版参与统计/导出，留档版不参与） */
  superseded?: boolean;
  /** 合并写入时间（非合并记录为空） */
  mergedAt?: string;
  /** 所属摘录包 id（非合并记录为空） */
  packageId?: string;
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
