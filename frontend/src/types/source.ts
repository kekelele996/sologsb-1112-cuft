/** 数据来源：站里主台账录入 / 野外小组离线摘录包合并 */
export type RecordSource = 'station' | 'field';

/** 鸟点确认状态：合并来的陌生点位先挂「待确认」，确认后才进正式统计 */
export type SiteStatus = 'confirmed' | 'pending';

export const SOURCE_LABEL: Record<RecordSource, string> = {
  station: '站里',
  field: '野外',
};

export const SITE_STATUS_LABEL: Record<SiteStatus, string> = {
  confirmed: '已确认',
  pending: '待确认',
};

/** 合并日志（一次摘录包合并一条，用于导入幂等：已并进去的包不能重复记两次） */
export interface MergeLog {
  /** 摘录包 id（包内自带，同一包重复导入据此拦截） */
  packageId: string;
  /** 野外小组 / 设备名 */
  origin: string;
  exportedAt: string;
  mergedAt: string;
  /** 该包新增环志 / 冲突留版 / 新鸟点（含待确认）/ 新批次数量 */
  ringsAdded: number;
  conflicts: number;
  sitesAdded: number;
  sitesPending: number;
  sessionsAdded: number;
  /** 该包写入的全部环志 id，供同包重试点位核对 */
  ringIds: string[];
}

/** 摘录包（野外小组离线登记后导出，回站合并进主台账） */
export interface ExtractPackage {
  app: 'gbbirdring-extract';
  packageId: string;
  /** 导出小组 / 设备名，作为来源标记写进每条记录 */
  origin: string;
  exportedAt: string;
  rings: unknown[];
  morphs: unknown[];
  sites: unknown[];
  sessions: unknown[];
}
