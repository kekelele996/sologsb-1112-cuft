import { DEFAULT_BOUNDS, GRID_COLS, GRID_ROWS, HABITAT_COLOR, type BirdSite, type Habitat } from '../types/bird-site';

export interface Bounds {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

/** 经纬度 → SVG 网格行列（无 key 时的退化视图定位） */
export function lonLatToGrid(
  lng: number,
  lat: number,
  bounds: Bounds = DEFAULT_BOUNDS,
  cols = GRID_COLS,
  rows = GRID_ROWS,
): { col: number; row: number; cellLng: number; cellLat: number } {
  const lngSpan = bounds.maxLng - bounds.minLng || 1;
  const latSpan = bounds.maxLat - bounds.minLat || 1;
  const colRatio = Math.min(1, Math.max(0, (lng - bounds.minLng) / lngSpan));
  const rowRatio = Math.min(1, Math.max(0, (bounds.maxLat - lat) / latSpan));
  const col = Math.min(cols - 1, Math.floor(colRatio * cols));
  const row = Math.min(rows - 1, Math.floor(rowRatio * rows));
  const cellLng = Number((bounds.minLng + ((col + 0.5) / cols) * lngSpan).toFixed(5));
  const cellLat = Number((bounds.maxLat - ((row + 0.5) / rows) * latSpan).toFixed(5));
  return { col, row, cellLng, cellLat };
}

/** SVG 网格行列 → 经纬度（网格拾取坐标） */
export function gridToLonLat(col: number, row: number, bounds: Bounds = DEFAULT_BOUNDS, cols = GRID_COLS, rows = GRID_ROWS): { lng: number; lat: number } {
  const lngSpan = bounds.maxLng - bounds.minLng;
  const latSpan = bounds.maxLat - bounds.minLat;
  return {
    lng: Number((bounds.minLng + ((col + 0.5) / cols) * lngSpan).toFixed(5)),
    lat: Number((bounds.maxLat - ((row + 0.5) / rows) * latSpan).toFixed(5)),
  };
}

/** 把坐标夹到默认范围内（网格模式下的拾取约束） */
export function clampToBounds(lng: number, lat: number, bounds: Bounds = DEFAULT_BOUNDS): { lng: number; lat: number } {
  return {
    lng: Number(Math.min(bounds.maxLng, Math.max(bounds.minLng, lng)).toFixed(5)),
    lat: Number(Math.min(bounds.maxLat, Math.max(bounds.minLat, lat)).toFixed(5)),
  };
}

export function habitatColor(habitat: Habitat): string {
  return HABITAT_COLOR[habitat] ?? '#7f8fa6';
}

/** 两点间距离（km，Haversine） */
export function distanceKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Number((2 * R * Math.asin(Math.sqrt(h))).toFixed(2));
}

/** 鸟点按生境分组统计 */
export function sitesByHabitat(sites: BirdSite[]): Array<{ habitat: Habitat; count: number; netCount: number }> {
  const map = new Map<Habitat, { habitat: Habitat; count: number; netCount: number }>();
  sites.forEach((site) => {
    const item = map.get(site.habitat) ?? { habitat: site.habitat, count: 0, netCount: 0 };
    item.count += 1;
    item.netCount += site.netCount;
    map.set(site.habitat, item);
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

/** 生成 SVG 网格视图的格位矩阵 */
export function buildGridCells(bounds: Bounds = DEFAULT_BOUNDS, cols = GRID_COLS, rows = GRID_ROWS) {
  const cells: Array<{ col: number; row: number; center: { lng: number; lat: number } }> = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push({ col, row, center: gridToLonLat(col, row, bounds, cols, rows) });
    }
  }
  return cells;
}
