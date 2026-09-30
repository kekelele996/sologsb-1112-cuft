import { computed, ref, type ComputedRef, type Ref } from 'vue';
import type { MapMode } from '../types/bird-site';

/** 高德 JS API 由本 hook 动态注入，构建与运行均不依赖该 key 是否存在 */
declare global {
  interface Window {
    AMap?: any;
  }
}

const SCRIPT_ID = 'amap-js-api';

export type AmapStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface AmapApi {
  /** 构建时注入的 key（未配置为空串） */
  key: string;
  keyPresent: boolean;
  status: Ref<AmapStatus>;
  error: Ref<string>;
  /** 有 key 且加载未失败时为 amap，否则 grid */
  mode: ComputedRef<MapMode>;
  /** 按需加载高德 JS API；无 key 时直接返回 null（不发任何网络请求） */
  load: () => Promise<any | null>;
}

/**
 * 检测 VITE_AMAP_KEY、按需加载高德 JS API 与标记图层；
 * 无 key（或加载失败）时返回网格模式标识，页面退化为本地 SVG 网格视图。
 */
export function useAmap(): AmapApi {
  const key = String(import.meta.env.VITE_AMAP_KEY ?? '').trim();
  const keyPresent = key.length > 0;
  const status = ref<AmapStatus>('idle');
  const error = ref('');
  let pending: Promise<any | null> | null = null;

  const mode = computed<MapMode>(() => (keyPresent && status.value !== 'failed' ? 'amap' : 'grid'));

  const load = async (): Promise<any | null> => {
    if (!keyPresent) {
      status.value = 'failed';
      error.value = '未配置 VITE_AMAP_KEY，已退化为本地 SVG 网格视图';
      return null;
    }
    if (typeof window !== 'undefined' && window.AMap) {
      status.value = 'ready';
      return window.AMap;
    }
    if (pending) {
      return pending;
    }
    status.value = 'loading';
    pending = new Promise<any | null>((resolve) => {
      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      const onLoad = () => {
        if (window.AMap) {
          status.value = 'ready';
          error.value = '';
          resolve(window.AMap);
        } else {
          status.value = 'failed';
          error.value = '高德 JS API 已加载但未挂载到 window.AMap';
          resolve(null);
        }
      };
      const onError = () => {
        status.value = 'failed';
        error.value = '高德 JS API 加载失败（请检查 key、域名白名单与网络），已退化为本地 SVG 网格视图';
        resolve(null);
      };
      if (existing) {
        existing.addEventListener('load', onLoad, { once: true });
        existing.addEventListener('error', onError, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });
      document.head.appendChild(script);
    });
    return pending;
  };

  return { key, keyPresent, status, error, mode, load };
}
