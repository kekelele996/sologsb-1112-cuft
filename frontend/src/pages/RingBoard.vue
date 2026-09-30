<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import StatBadge from '../components/common/StatBadge.vue';
import SiteMap from '../components/common/SiteMap.vue';
import FilterBar from '../components/common/FilterBar.vue';
import { useSiteFilter } from '../hooks/useSiteFilter';
import { useRingStore } from '../stores/ringStore';
import { useSiteStore } from '../stores/siteStore';
import { useMeasureStore } from '../stores/measureStore';
import { useSessionStore } from '../stores/sessionStore';
import { HABITATS, type BirdSite } from '../types/bird-site';
import { recaptureRate, speciesCount, statusBreakdown } from '../utils/stats';
import { sitesByHabitat } from '../utils/geo';

const router = useRouter();
const ringStore = useRingStore();
const siteStore = useSiteStore();
const measureStore = useMeasureStore();
const sessionStore = useSessionStore();
const filter = useSiteFilter();

const visibleSites = computed(() => filter.apply(siteStore.sites, sessionStore.sessions));
const breakdown = computed(() => statusBreakdown(ringStore.rings));
const speciesList = computed(() => speciesCount(ringStore.rings));
const habitatStats = computed(() => sitesByHabitat(siteStore.sites));
const recent = computed(() => ringStore.rings.slice(0, 6));
const siteNameOf = (siteId: string) => siteStore.siteName(siteId);

/** SiteMap 选中点位（emit 回传点位 id）→ 用点位编号过滤鸟点列表与地图 */
function selectSite(siteId: string) {
  const site = siteStore.sites.find((item) => item.id === siteId);
  filter.setFilter('kw', site ? site.siteNo : '');
}
</script>

<template>
  <div>
    <h2 class="page-title">鸟类环志统计台</h2>
    <p class="page-desc">
      登记环志编号、鸟种与量度，查看鸟点分布（高德地图 JS API，未配置 VITE_AMAP_KEY 时自动退化为本地 SVG 网格视图）。数据保存在浏览器
      IndexedDB（gbbirdring-db）。
    </p>

    <el-row :gutter="12" class="stat-row">
      <el-col :xs="12" :md="6">
        <StatBadge label="环志记录" :value="ringStore.rings.length" unit="条" />
      </el-col>
      <el-col :xs="12" :md="6">
        <StatBadge label="鸟种数" :value="speciesList.length" unit="种" status="success" />
      </el-col>
      <el-col :xs="12" :md="6">
        <StatBadge label="初捕 / 重捕 / 回收" :value="`${breakdown.初捕} / ${breakdown.重捕} / ${breakdown.回收}`" />
      </el-col>
      <el-col :xs="12" :md="6">
        <StatBadge label="重捕率" :value="recaptureRate(ringStore.rings)" unit="%" status="warning" hint="重捕 / (初捕 + 重捕)" />
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="16">
        <el-card shadow="never" class="block">
          <template #header>
            <div class="card-head">
              <span>鸟点分布</span>
              <span class="card-note">点位 {{ visibleSites.length }} / {{ siteStore.sites.length }} · 网位合计 {{ siteStore.totalNets }}</span>
            </div>
          </template>
          <FilterBar
            :fields="[
              { key: 'habitat', label: '生境', options: HABITATS, width: 120 },
              { key: 'session', label: '作业时段', options: sessionStore.sessions.map((s) => s.sessionNo), width: 130 },
            ]"
            keyword-placeholder="搜索点位编号 / 名称"
            :result-count="visibleSites.length"
            :total-count="siteStore.sites.length"
          />
          <SiteMap :sites="visibleSites" @select="selectSite" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="block">
          <template #header>
            <div class="card-head">
              <span>鸟种计数</span>
              <el-button link type="primary" @click="router.push('/rings')">去环志记录</el-button>
            </div>
          </template>
          <el-table :data="speciesList" size="small" border max-height="280">
            <el-table-column prop="speciesCn" label="鸟种" width="110" />
            <el-table-column prop="speciesSci" label="学名" show-overflow-tooltip />
            <el-table-column prop="count" label="记录数" width="80" align="right" />
          </el-table>
        </el-card>

        <el-card shadow="never" class="block">
          <template #header>生境分布</template>
          <div v-for="item in habitatStats" :key="item.habitat" class="habitat-row">
            <el-tag size="small" effect="plain">{{ item.habitat }}</el-tag>
            <span>{{ item.count }} 个点位 · {{ item.netCount }} 网位</span>
          </div>
        </el-card>

        <el-card shadow="never" class="block">
          <template #header>
            <div class="card-head">
              <span>最近环志</span>
              <span class="card-note">已量度 {{ measureStore.measuredRingCount }} 只</span>
            </div>
          </template>
          <div v-for="record in recent" :key="record.id" class="recent-row">
            <el-tag size="small" :type="record.status === '初捕' ? 'success' : record.status === '重捕' ? 'warning' : 'danger'" effect="plain">
              {{ record.status }}
            </el-tag>
            <span class="recent-ring">{{ record.ringNo }}</span>
            <span class="recent-species">{{ record.speciesCn }}</span>
            <span class="recent-site">{{ siteNameOf(record.siteId) }}</span>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  color: #1f4a44;
}
.page-desc {
  margin: 0 0 14px;
  color: #6f8480;
  font-size: 13px;
}
.stat-row {
  margin-bottom: 12px;
}
.stat-row .el-col {
  margin-bottom: 12px;
}
.block {
  margin-bottom: 16px;
  border-radius: 8px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-note {
  font-size: 12px;
  color: #8a99a5;
}
.habitat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  padding: 4px 0;
  color: #2f4a44;
}
.recent-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 4px 0;
  color: #2f4a44;
}
.recent-ring {
  font-weight: 600;
}
.recent-species {
  color: #2f7d6f;
}
.recent-site {
  margin-left: auto;
  color: #8a99a5;
  font-size: 12px;
}
</style>
