import { defineStore } from 'pinia';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import { toPlain } from '../utils/plain';
import { useSiteStore } from './siteStore';
import type { BirdAge, RingRecord, RingStatus } from '../types/ring-record';

export interface RingInput {
  ringNo: string;
  colorRing: string;
  speciesCn: string;
  speciesSci: string;
  age: BirdAge;
  ringDate?: string;
  netNo: string;
  netRound: number;
  status: RingStatus;
  ringer: string;
  siteId: string;
  sessionId: string;
  remark?: string;
}

interface RingState {
  rings: RingRecord[];
  /** 环号重复时命中的历史记录 id */
  duplicateId: string;
  hydrated: boolean;
}

/** 环志记录与查重结果 */
export const useRingStore = defineStore('ring', {
  state: (): RingState => ({ rings: [], duplicateId: '', hydrated: false }),

  getters: {
    findByRingNo(state) {
      return (ringNo: string): RingRecord | undefined =>
        state.rings.find((record) => record.ringNo.toLowerCase() === ringNo.trim().toLowerCase());
    },
    /** 同一环号的全部历史记录（含重捕 / 回收） */
    historyOf(state) {
      return (ringNo: string): RingRecord[] =>
        state.rings
          .filter((record) => record.ringNo.toLowerCase() === ringNo.trim().toLowerCase())
          .sort((a, b) => a.ringDate.localeCompare(b.ringDate));
    },
    duplicate(state): RingRecord | undefined {
      return state.rings.find((record) => record.id === state.duplicateId);
    },
    /**
     * 合并后的正式环志记录：剔除冲突留档版（未采用）与待确认鸟点上的记录。
     * 环志记录、调查批次统计和导出表统一以它为准。
     */
    officialRings(state): RingRecord[] {
      const siteStore = useSiteStore();
      const confirmedSites = new Set(siteStore.sites.filter((site) => site.status === 'confirmed').map((site) => site.id));
      return state.rings.filter((record) => !record.superseded && confirmedSites.has(record.siteId));
    },
    /** 待站里定版的冲突组（按 conflictGroup 聚合） */
    conflictGroups(state): Array<{ groupId: string; ringNo: string; versions: RingRecord[] }> {
      const map = new Map<string, RingRecord[]>();
      state.rings.forEach((record) => {
        if (!record.conflictGroup) return;
        const list = map.get(record.conflictGroup) ?? [];
        list.push(record);
        map.set(record.conflictGroup, list);
      });
      return Array.from(map.entries())
        .filter(([, versions]) => versions.length > 1)
        .map(([groupId, versions]) => ({
          groupId,
          ringNo: versions[0]?.ringNo ?? '',
          versions: [...versions].sort((a, b) => a.ringDate.localeCompare(b.ringDate)),
        }));
    },
  },

  actions: {
    async hydrate() {
      await this.reload();
      this.hydrated = true;
    },

    async reload() {
      this.rings = await db.rings.orderBy('ringDate').reverse().toArray();
    },

    setDuplicate(id: string) {
      this.duplicateId = id;
    },

    /** 新增环志记录：环号已存在时返回命中的历史记录，由页面提示并跳转 */
    async addRing(input: RingInput): Promise<{ record?: RingRecord; duplicate?: RingRecord }> {
      const existed = this.findByRingNo(input.ringNo);
      if (existed) {
        this.duplicateId = existed.id;
        return { duplicate: existed };
      }
      const record: RingRecord = {
        id: uid('ring'),
        ringNo: input.ringNo.trim(),
        colorRing: input.colorRing || '无',
        speciesCn: input.speciesCn.trim(),
        speciesSci: input.speciesSci.trim(),
        age: input.age,
        ringDate: input.ringDate ?? new Date().toISOString(),
        netNo: input.netNo.trim(),
        netRound: Number(input.netRound) || 1,
        status: input.status,
        ringer: input.ringer.trim(),
        siteId: input.siteId,
        sessionId: input.sessionId,
        remark: input.remark?.trim() || undefined,
        source: 'station',
        origin: '站里',
        conflictGroup: '',
        superseded: false,
      };
      await db.rings.put(toPlain(record));
      this.rings = [record, ...this.rings];
      this.duplicateId = '';
      return { record };
    },

    async updateRing(id: string, patch: Partial<RingInput>) {
      const current = this.rings.find((record) => record.id === id);
      if (!current) return;
      const next: RingRecord = { ...current, ...patch };
      await db.rings.put(toPlain(next));
      this.rings = this.rings.map((record) => (record.id === id ? next : record));
    },

    async removeRing(id: string) {
      await db.rings.delete(id);
      this.rings = this.rings.filter((record) => record.id !== id);
    },
  },
});
