import { defineStore } from 'pinia';
import { db } from '../utils/db';
import {
  buildExcerpt,
  confirmSite,
  discardSite,
  importExcerpt,
  resolveConflict,
  type MergeResult,
} from '../utils/merge';
import { downloadText } from '../utils/export';
import type { BirdSite } from '../types/bird-site';
import type { RingRecord } from '../types/ring-record';
import type { SurveySession } from '../types/session';
import type { ConflictStatus } from '../types/source';

export type ConflictType = 'ring' | 'site' | 'session';

export interface ConflictVersion {
  id: string;
  source: 'local' | 'merge';
  mergeId?: string;
  conflictStatus: ConflictStatus;
  record: RingRecord | BirdSite | SurveySession;
}

export interface ConflictGroupView {
  groupId: string;
  type: ConflictType;
  /** 自然键：环号 / 点位号 / 批次号 */
  naturalKey: string;
  versions: ConflictVersion[];
}

interface MergeState {
  importing: boolean;
  exporting: boolean;
  lastResult: MergeResult | null;
  conflictGroups: ConflictGroupView[];
  pendingSites: BirdSite[];
  hydrated: boolean;
}

/** 摘录包导入 / 导出、冲突裁决与待确认鸟点 */
export const useMergeStore = defineStore('merge', {
  state: (): MergeState => ({
    importing: false,
    exporting: false,
    lastResult: null,
    conflictGroups: [],
    pendingSites: [],
    hydrated: false,
  }),

  getters: {
    /** 待处理事项数：待裁决冲突组 + 待确认新鸟点（不含冲突组内的点位） */
    badgeCount(state): number {
      const pendingSiteIds = new Set(
        state.pendingSites.filter((s) => !s.conflictGroup).map((s) => s.id),
      );
      return state.conflictGroups.length + pendingSiteIds.size;
    },
  },

  actions: {
    /** 从本地库装载待裁决冲突组与待确认鸟点 */
    async refresh() {
      const [rings, sites, sessions] = await Promise.all([
        db.rings.toArray(),
        db.sites.toArray(),
        db.sessions.toArray(),
      ]);

      const groups = new Map<string, ConflictGroupView>();
      const collect = (
        type: ConflictType,
        naturalKey: string,
        record: {
          id: string;
          source: 'local' | 'merge';
          mergeId?: string;
          conflictGroup?: string;
          conflictStatus?: ConflictStatus;
        },
      ) => {
        if (!record.conflictGroup) return;
        const groupId = record.conflictGroup;
        let view = groups.get(groupId);
        if (!view) {
          view = { groupId, type, naturalKey, versions: [] };
          groups.set(groupId, view);
        }
        view.versions.push({
          id: record.id,
          source: record.source,
          mergeId: record.mergeId,
          conflictStatus: record.conflictStatus ?? 'active',
          record: record as RingRecord | BirdSite | SurveySession,
        });
      };

      rings.forEach((r) => collect('ring', r.ringNo, r));
      sites.forEach((s) => collect('site', s.siteNo, s));
      sessions.forEach((s) => collect('session', s.sessionNo, s));

      // 每版按来源排序：本站版在前，野外版在后
      groups.forEach((g) =>
        g.versions.sort((a, b) => (a.source === b.source ? 0 : a.source === 'local' ? -1 : 1)),
      );
      this.conflictGroups = Array.from(groups.values());
      this.pendingSites = sites.filter((s) => s.pending);
      this.hydrated = true;
    },

    /** 导出摘录包 JSON */
    async exportExcerpt(device: string) {
      this.exporting = true;
      try {
        const pkg = await buildExcerpt(device);
        downloadText(`gbbirdring-excerpt-${pkg.packageId}.json`, JSON.stringify(pkg, null, 2));
      } finally {
        this.exporting = false;
      }
    },

    /** 导入摘录包并合并（事务原子，失败可重试） */
    async importPackage(text: string): Promise<MergeResult> {
      this.importing = true;
      try {
        const result = await importExcerpt(text);
        this.lastResult = result;
        await this.refresh();
        return result;
      } finally {
        this.importing = false;
      }
    },

    /** 裁决冲突：选用某一版 */
    async resolve(groupId: string, chosenId: string) {
      await resolveConflict(groupId, chosenId);
      await this.refresh();
    },

    /** 确认待确认鸟点 */
    async confirm(siteId: string) {
      await confirmSite(siteId);
      await this.refresh();
    },

    /** 删除待确认鸟点 */
    async discard(siteId: string) {
      await discardSite(siteId);
      await this.refresh();
    },
  },
});
