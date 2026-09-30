/**
 * 记录来源标记。
 * - local：本站（主台账所在电脑）录入
 * - merge：野外小组离线登记后，随摘录包合并进来
 */
export type RecordSource = 'local' | 'merge';

/** 冲突裁决状态：有效 / 待裁决 / 已废弃（同一只鸟两版时，站里裁定用哪版） */
export type ConflictStatus = 'active' | 'pending' | 'superseded';

/** 带来源标记的记录（升级时为历史数据回填 source='local'） */
export interface SourceMarked {
  /** 来源：本站录入 / 摘录合并 */
  source: RecordSource;
  /** 摘录包 id（source='merge' 时记录来自哪个包） */
  mergeId?: string;
}

/** 带冲突裁决标记的记录 */
export interface ConflictMarked extends SourceMarked {
  /** 冲突组 id：同一只鸟（自然键相同）的两版共用同一个组 */
  conflictGroup?: string;
  /** 裁决状态：有效 / 待裁决 / 已废弃 */
  conflictStatus?: ConflictStatus;
}
