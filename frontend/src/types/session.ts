import type { ConflictStatus, RecordSource } from './source';

/** 调查批次 */
export interface SurveySession {
  id: string;
  /** 批次号 */
  sessionNo: string;
  /** 调查日期（YYYY-MM-DD） */
  date: string;
  /** 鸟点 id */
  siteId: string;
  /** 开始时间 HH:mm */
  startedAt: string;
  /** 结束时间 HH:mm */
  endedAt: string;
  /** 计划网次 */
  netRounds: number;
  /** 云量（成，0~10） */
  cloudCover: number;
  /** 风力（级） */
  windForce: number;
  /** 是否已关闭（关闭后出统计） */
  closed: boolean;
  /** 主调查人 */
  leader: string;
  /** 备注 */
  remark?: string;
  /** 来源：本站录入 / 摘录合并 */
  source: RecordSource;
  /** 摘录包 id（source='merge' 时） */
  mergeId?: string;
  /** 冲突组 id（同一批次两版共用） */
  conflictGroup?: string;
  /** 冲突裁决状态：有效 / 待裁决 / 已废弃 */
  conflictStatus?: ConflictStatus;
}

/** 批次统计派生值 */
export interface SessionStats {
  session: SurveySession;
  siteName: string;
  /** 该批鸟种数 */
  speciesCount: number;
  /** 初捕数 */
  firstCount: number;
  /** 重捕数 */
  recaptureCount: number;
  /** 回收数 */
  recoveryCount: number;
  /** 重捕率（%，重捕 / (初捕 + 重捕)） */
  recaptureRate: number;
}

/** 观测条件：云量描述 */
export function cloudText(cover: number): string {
  if (cover <= 2) return '晴';
  if (cover <= 5) return '少云';
  if (cover <= 8) return '多云';
  return '阴';
}
