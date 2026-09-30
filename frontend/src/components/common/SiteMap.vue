<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAmap } from '../../hooks/useAmap';
import { useSiteStore } from '../../stores/siteStore';
import { buildGridCells, gridToLonLat, habitatColor, lonLatToGrid } from '../../utils/geo';
import { DEFAULT_BOUNDS, GRID_COLS, GRID_ROWS, HABITATS, type BirdSite } from '../../types/bird-site';

const props = withDefaults(
  defineProps<{
    sites: BirdSite[];
    selectedId?: string;
    height?: number;
    /** 可拾取坐标：点击地图或网格格位回传经纬度 */
    pickable?: boolean;
  }>(),
  { selectedId: '', height: 380, pickable: false },
);

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'pick', value: { lng: number; lat: number }): void;
}>();

const siteStore = useSiteStore();
const amap = useAmap();
const container = ref<HTMLDivElement | null>(null);
let map: any = null;
let markers: any[] = [];
const renderError = ref('');

/** 有 key 且加载未失败且用户选择地图模式时才用高德，否则退化为本地 SVG 网格 */
const effectiveMode = computed(() =>
  amap.keyPresent && siteStore.mapMode === 'amap' && amap.status.value !== 'failed' ? 'amap' : 'grid',
);

const CELL_W = 96;
const CELL_H = 62;
const cells = computed(() => buildGridCells(DEFAULT_BOUNDS, GRID_COLS, GRID_ROWS));
const placed = computed(() => props.sites.map((site) => ({ site, cell: lonLatToGrid(site.lng, site.lat, DEFAULT_BOUNDS, GRID_COLS, GRID_ROWS) })));
const gridWidth = GRID_COLS * CELL_W;
const gridHeight = GRID_ROWS * CELL_H;
const center = computed(() => {
  if (props.sites.length === 0) {
    return { lng: (DEFAULT_BOUNDS.minLng + DEFAULT_BOUNDS.maxLng) / 2, lat: (DEFAULT_BOUNDS.minLat + DEFAULT_BOUNDS.maxLat) / 2 };
  }
  const lng = props.sites.reduce((sum, site) => sum + site.lng, 0) / props.sites.length;
  const lat = props.sites.reduce((sum, site) => sum + site.lat, 0) / props.sites.length;
  return { lng, lat };
});

/** 标记文字横向夹取，避免最左 / 最右列的标签超出视图被裁切 */
function labelX(col: number): number {
  const min = 46;
  const max = gridWidth - 46;
  return Math.min(Math.max((col + 0.5) * CELL_W, min), max);
}

function markerContent(site: BirdSite): string {
  const color = habitatColor(site.habitat);
  const selected = props.selectedId === site.id;
  return `<div style="transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;cursor:pointer">
    <div style="width:${selected ? 20 : 14}px;height:${selected ? 20 : 14}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 2px ${selected ? '#c62828' : 'rgba(0,0,0,.18)'}"></div>
    <div style="margin-top:2px;font-size:11px;color:#33414d;background:rgba(255,255,255,.86);padding:0 3px;border-radius:3px;white-space:nowrap">${site.siteNo} ${site.name}</div>
  </div>`;
}

async function renderAmap() {
  const sdk = await amap.load();
  if (!sdk || !container.value) {
    return;
  }
  try {
    if (!map) {
      map = new sdk.Map(container.value, {
        zoom: 10,
        center: [center.value.lng, center.value.lat],
        viewMode: '2D',
      });
      if (props.pickable) {
        map.on('click', (event: any) => {
          emit('pick', { lng: Number(event.lnglat.getLng().toFixed(5)), lat: Number(event.lnglat.getLat().toFixed(5)) });
        });
      }
    }
    map.remove(markers);
    markers = props.sites.map((site) => {
      const marker = new sdk.Marker({
        position: [site.lng, site.lat],
        content: markerContent(site),
        offset: new sdk.Pixel(0, 0),
      });
      marker.on('click', () => emit('select', site.id));
      marker.setMap(map);
      return marker;
    });
    if (props.sites.length > 0) {
      map.setCenter([center.value.lng, center.value.lat]);
    }
  } catch (error) {
    renderError.value = `地图渲染失败：${(error as Error).message}`;
    siteStore.setMapMode('grid');
  }
}

function renderGridCell(col: number, row: number) {
  if (!props.pickable) return;
  const point = gridToLonLat(col, row, DEFAULT_BOUNDS, GRID_COLS, GRID_ROWS);
  emit('pick', point);
}

function destroyMap() {
  if (map) {
    try {
      map.clearMap();
      map.destroy();
    } catch {
      /* 忽略销毁异常 */
    }
    map = null;
    markers = [];
  }
}

onMounted(() => {
  if (effectiveMode.value === 'amap') {
    void renderAmap();
  }
});

watch(effectiveMode, (mode) => {
  if (mode === 'amap') {
    void renderAmap();
  } else {
    destroyMap();
  }
});

watch(
  () => props.sites.map((site) => `${site.id}:${site.lng}:${site.lat}:${site.habitat}`).join('|') + `#${props.selectedId}`,
  () => {
    if (effectiveMode.value === 'amap') {
      void renderAmap();
    }
  },
);

onBeforeUnmount(() => {
  destroyMap();
});
</script>

<template>
  <div class="site-map">
    <div class="map-head">
      <span class="map-title">
        地图 / 网格视图
        <el-tag size="small" :type="effectiveMode === 'amap' ? 'success' : 'info'" effect="plain">
          {{ effectiveMode === 'amap' ? '高德地图 JS API' : '本地 SVG 网格视图（未配置 VITE_AMAP_KEY）' }}
        </el-tag>
      </span>
      <span v-if="amap.keyPresent" class="map-switch">
        <el-radio-group :model-value="siteStore.mapMode" size="small" @change="(value: string) => siteStore.setMapMode(value as 'amap' | 'grid')">
          <el-radio-button value="amap">地图模式</el-radio-button>
          <el-radio-button value="grid">网格模式</el-radio-button>
        </el-radio-group>
      </span>
    </div>

    <el-alert
      v-if="!amap.keyPresent"
      class="map-alert"
      type="info"
      show-icon
      :closable="false"
      title="未配置 VITE_AMAP_KEY：地图能力自动退化为本地 SVG 网格视图"
      description="构建与运行均不依赖该 key；如需地图模式，请在 .env 中配置 VITE_AMAP_KEY（须在高德控制台为该域名开启 JS API）后重新构建镜像。"
    />
    <el-alert v-else-if="amap.error.value" class="map-alert" type="warning" show-icon :closable="false" :title="amap.error.value" />
    <el-alert v-if="renderError" class="map-alert" type="error" show-icon :closable="false" :title="renderError" />

    <div v-if="effectiveMode === 'amap'" ref="container" class="amap-container" :style="{ height: `${height}px` }" />

    <div v-else class="grid-wrap" :style="{ minHeight: `${height}px` }">
      <svg :viewBox="`0 0 ${gridWidth} ${gridHeight}`" class="grid-svg" :style="{ height: `${height}px` }" role="img" aria-label="鸟点 SVG 网格视图">
        <rect :width="gridWidth" :height="gridHeight" fill="#f2f7f5" />
        <g v-for="cell in cells" :key="`${cell.col}-${cell.row}`">
          <rect
            :x="cell.col * CELL_W"
            :y="cell.row * CELL_H"
            :width="CELL_W"
            :height="CELL_H"
            fill="#fff"
            stroke="#d7e3de"
            :style="{ cursor: pickable ? 'crosshair' : 'default' }"
            @click="renderGridCell(cell.col, cell.row)"
          />
        </g>
        <!-- 经纬度刻度 -->
        <text v-for="col in GRID_COLS" :key="`lx-${col}`" :x="(col - 0.5) * CELL_W" :y="gridHeight - 4" font-size="10" fill="#8a99a5" text-anchor="middle">
          {{ (DEFAULT_BOUNDS.minLng + (col / GRID_COLS) * (DEFAULT_BOUNDS.maxLng - DEFAULT_BOUNDS.minLng)).toFixed(2) }}°E
        </text>
        <!-- 鸟点标记 -->
        <g v-for="item in placed" :key="item.site.id" :style="{ cursor: 'pointer' }" @click="emit('select', item.site.id)">
          <circle
            :cx="(item.cell.col + 0.5) * CELL_W"
            :cy="(item.cell.row + 0.5) * CELL_H"
            :r="selectedId === item.site.id ? 11 : 8"
            :fill="habitatColor(item.site.habitat)"
            stroke="#fff"
            stroke-width="2"
          />
          <text
            :x="labelX(item.cell.col)"
            :y="(item.cell.row + 0.5) * CELL_H - 14"
            font-size="11"
            fill="#33414d"
            text-anchor="middle"
          >
            {{ item.site.siteNo }} {{ item.site.name }}
          </text>
          <text :x="(item.cell.col + 0.5) * CELL_W" :y="(item.cell.row + 0.5) * CELL_H + 4" font-size="10" fill="#fff" text-anchor="middle">
            {{ item.site.netCount }}
          </text>
        </g>
      </svg>
      <div class="legend">
        <span v-for="habitat in HABITATS" :key="habitat" class="legend-item">
          <i :style="{ background: habitatColor(habitat) }" />{{ habitat }}
        </span>
        <span class="legend-hint">{{ pickable ? '点击格位可拾取该格中心坐标' : '标记内数字为网位数' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.site-map {
  background: #fff;
  border: 1px solid #dbe7e2;
  border-radius: 8px;
  padding: 10px 12px;
}
.map-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  color: #2f4a44;
}
.map-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.map-alert {
  margin-bottom: 8px;
}
.amap-container {
  width: 100%;
  border-radius: 6px;
  overflow: hidden;
}
.grid-wrap {
  width: 100%;
}
.grid-svg {
  width: 100%;
  display: block;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: #5d6f6a;
  margin-top: 6px;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.legend-item i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.legend-hint {
  color: #8a99a5;
}
</style>
