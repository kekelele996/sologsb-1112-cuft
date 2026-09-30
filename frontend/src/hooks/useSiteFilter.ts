import { computed, type ComputedRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { BirdSite, Habitat } from '../types/bird-site';
import type { SurveySession } from '../types/session';

export interface SiteFilterApi {
  keyword: ComputedRef<string>;
  habitat: ComputedRef<string>;
  sessionId: ComputedRef<string>;
  activeCount: ComputedRef<number>;
  setFilter: (key: string, value: string) => void;
  reset: () => void;
  /** 按名称 / 编号 / 生境 / 作业时段（调查批次）过滤鸟点 */
  apply: (sites: BirdSite[], sessions: SurveySession[], sessionSiteIds?: string[]) => BirdSite[];
}

/**
 * 鸟点、生境与作业时段筛选条件：条件保存在 URL query 中，
 * 刷新与前进后退都能还原，被鸟点台账与统计台共用。
 */
export function useSiteFilter(): SiteFilterApi {
  const route = useRoute();
  const router = useRouter();

  const read = (key: string): string => {
    const value = route.query[key];
    return typeof value === 'string' ? value : '';
  };

  const keyword = computed(() => read('kw'));
  const habitat = computed(() => read('habitat'));
  const sessionId = computed(() => read('session'));

  const setFilter = (key: string, value: string) => {
    const query: Record<string, string> = {};
    Object.entries(route.query).forEach(([k, v]) => {
      if (typeof v === 'string' && v) query[k] = v;
    });
    if (value) query[key] = value;
    else delete query[key];
    void router.replace({ query });
  };

  const reset = () => {
    const query: Record<string, string> = {};
    Object.entries(route.query).forEach(([k, v]) => {
      if (!['kw', 'habitat', 'session'].includes(k) && typeof v === 'string' && v) query[k] = v;
    });
    void router.replace({ query });
  };

  const activeCount = computed(() => [keyword.value, habitat.value, sessionId.value].filter(Boolean).length);

  const apply = (sites: BirdSite[], sessions: SurveySession[], sessionSiteIds?: string[]): BirdSite[] => {
    const kw = keyword.value.trim().toLowerCase();
    const session = sessions.find((item) => item.id === sessionId.value);
    return sites.filter((site) => {
      if (habitat.value && site.habitat !== (habitat.value as Habitat)) return false;
      if (session && site.id !== session.siteId) return false;
      if (!session && sessionSiteIds && sessionSiteIds.length && !sessionSiteIds.includes(site.id)) return false;
      if (kw) {
        const haystack = `${site.siteNo} ${site.name} ${site.habitat} ${site.note ?? ''}`.toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });
  };

  return { keyword, habitat, sessionId, activeCount, setFilter, reset, apply };
}
