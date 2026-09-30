<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Download } from '@element-plus/icons-vue';
import { seedIfEmpty } from './utils/seed';
import { downloadText, exportBackupJson } from './utils/export';
import { useRingStore } from './stores/ringStore';
import { useMeasureStore } from './stores/measureStore';
import { useSiteStore } from './stores/siteStore';
import { useSessionStore } from './stores/sessionStore';
import { useAmap } from './hooks/useAmap';

const route = useRoute();
const ringStore = useRingStore();
const measureStore = useMeasureStore();
const siteStore = useSiteStore();
const sessionStore = useSessionStore();
const amap = useAmap();
const ready = ref(false);

onMounted(async () => {
  // 有 key 时才按需加载高德 JS API；无 key 直接进入 SVG 网格模式（不发任何网络请求）
  if (amap.keyPresent) {
    siteStore.setMapMode('amap');
  } else {
    siteStore.setMapMode('grid');
  }
  try {
    await seedIfEmpty();
    await Promise.all([ringStore.hydrate(), measureStore.hydrate(), siteStore.hydrate(), sessionStore.hydrate()]);
  } catch (error) {
    ElMessage.error(`本地数据装载失败：${(error as Error).message}`);
  } finally {
    ready.value = true;
  }
});

async function handleExport() {
  const json = await exportBackupJson();
  downloadText(`gbbirdring-backup-${new Date().toISOString().slice(0, 10)}.json`, json);
  ElMessage.success('已导出 IndexedDB 全量 JSON 备份');
}
</script>

<template>
  <el-container class="app-shell">
    <el-aside width="208px" class="app-aside">
      <div class="brand">
        <div class="brand-title">鸟类环志记录与鸟点地图</div>
        <div class="brand-sub">gbbirdring · 纯前端本地存储</div>
      </div>
      <el-menu :default-active="route.path" router class="app-menu" background-color="#1f5b52" text-color="#e8f3ef" active-text-color="#ffd591">
        <el-menu-item index="/">统计台</el-menu-item>
        <el-menu-item index="/rings">环志记录</el-menu-item>
        <el-menu-item index="/measure">量度测量</el-menu-item>
        <el-menu-item index="/sites">鸟点台账</el-menu-item>
        <el-menu-item index="/sessions">调查批次</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="app-header">
        <span class="header-title">{{ (route.meta?.title as string) ?? '鸟类环志记录与鸟点地图' }}</span>
        <span class="header-right">
          <el-tag size="small" :type="amap.keyPresent ? 'success' : 'info'" effect="plain">
            地图模式：{{ amap.keyPresent ? '高德 JS API' : '本地 SVG 网格' }}
          </el-tag>
          <el-button :icon="Download" @click="handleExport">导出备份</el-button>
        </span>
      </el-header>
      <el-main v-loading="!ready" element-loading-text="正在装载本地环志档案…" class="app-main">
        <router-view />
      </el-main>
      <el-footer class="app-footer">数据保存在浏览器 IndexedDB（gbbirdring-db），不依赖后端服务</el-footer>
    </el-container>
  </el-container>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}
.app-aside {
  background: #1f5b52;
  color: #e8f3ef;
}
.brand {
  padding: 16px 16px 8px;
}
.brand-title {
  font-size: 15px;
  font-weight: 600;
}
.brand-sub {
  font-size: 12px;
  color: #a9cfc4;
}
.app-menu {
  border-right: none;
}
.app-header {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #dbe7e2;
}
.header-title {
  font-weight: 600;
  color: #1f4a44;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.app-main {
  background: #f2f7f5;
  min-height: 60vh;
}
.app-footer {
  text-align: center;
  color: #8a99a5;
  font-size: 12px;
  line-height: 48px;
}
</style>
