import { defineStore } from 'pinia';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import { toPlain } from '../utils/plain';
import { effectiveSites } from '../utils/stats';
import type { BirdSite, Habitat, MapMode } from '../types/bird-site';

export interface SiteInput {
  siteNo: string;
  name: string;
  lng: number;
  lat: number;
  habitat: Habitat;
  netCount: number;
  note?: string;
}

interface SiteState {
  sites: BirdSite[];
  /** 地图模式：amap（有 key 时）/ grid（退化 SVG 网格） */
  mapMode: MapMode;
  hydrated: boolean;
}

/** 鸟点与地图/网格模式 */
export const useSiteStore = defineStore('site', {
  state: (): SiteState => ({ sites: [], mapMode: 'grid', hydrated: false }),

  getters: {
    /** 有效鸟点（不含待确认 / 冲突待裁决点位） */
    effective(): BirdSite[] {
      return effectiveSites(this.sites);
    },
    /** 待确认鸟点（合并来、台账无对应点位） */
    pending(): BirdSite[] {
      return this.sites.filter((site) => site.pending);
    },
    siteName(state) {
      return (siteId: string): string => state.sites.find((site) => site.id === siteId)?.name ?? '未知鸟点';
    },
    siteOptions(state): Array<{ label: string; value: string }> {
      // 新建表单只选有效点位，待确认点位不参与选择
      return effectiveSites(state.sites).map((site) => ({ label: `${site.siteNo} · ${site.name}`, value: site.id }));
    },
    totalNets(state): number {
      return effectiveSites(state.sites).reduce((sum, site) => sum + site.netCount, 0);
    },
  },

  actions: {
    async hydrate() {
      this.sites = await db.sites.orderBy('siteNo').toArray();
      this.hydrated = true;
    },

    setMapMode(mode: MapMode) {
      this.mapMode = mode;
    },

    async addSite(input: SiteInput): Promise<BirdSite> {
      const site: BirdSite = {
        id: uid('site'),
        siteNo: input.siteNo.trim(),
        name: input.name.trim(),
        lng: Number(input.lng) || 0,
        lat: Number(input.lat) || 0,
        habitat: input.habitat,
        netCount: Number(input.netCount) || 0,
        note: input.note?.trim() || undefined,
        source: 'local',
        pending: false,
        conflictStatus: 'active',
      };
      await db.sites.put(toPlain(site));
      this.sites = [...this.sites, site].sort((a, b) => a.siteNo.localeCompare(b.siteNo));
      return site;
    },

    async updateSite(id: string, patch: Partial<SiteInput>) {
      const current = this.sites.find((site) => site.id === id);
      if (!current) return;
      const next: BirdSite = { ...current, ...patch };
      await db.sites.put(toPlain(next));
      this.sites = this.sites.map((site) => (site.id === id ? next : site));
    },

    async removeSite(id: string) {
      await db.sites.delete(id);
      this.sites = this.sites.filter((site) => site.id !== id);
    },
  },
});
