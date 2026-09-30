<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Upload, Download, RefreshLeft, Check } from '@element-plus/icons-vue';
import { useRingStore } from '../stores/ringStore';
import { useSiteStore } from '../stores/siteStore';
import { useSessionStore } from '../stores/sessionStore';
import { useMeasureStore } from '../stores/measureStore';
import { importExtractPackage, adoptRingVersion, confirmSite, listMergeLogs, buildExtractPackage } from '../utils/merge';
import { downloadText } from '../utils/export';
import { SOURCE_LABEL, SITE_STATUS_LABEL, type MergeLog } from '../types/source';
import { formatDate, formatDateTime } from '../utils/format';

const ringStore = useRingStore();
const siteStore = useSiteStore();
const sessionStore = useSessionStore();
const measureStore = useMeasureStore();

const fileInput = ref<HTMLInputElement | null>(null);
const importing = ref(false);
const exportOrigin = ref('野外一组');
const logs = ref<MergeLog[]>([]);

const pendingSites = computed(() => siteStore.pendingSites);
const conflictGroups = computed(() => ringStore.conflictGroups);

const siteNameOf = (siteId: string) => siteStore.sites.find((site) => site.id === siteId)?.name ?? '未知鸟点';

async function refreshAll() {
  await Promise.all([ringStore.reload(), siteStore.reload(), sessionStore.reload(), measureStore.reload()]);
  logs.value = await listMergeLogs();
}

onMounted(refreshAll);

/** 选择摘录包 → 合并。整包一个事务：失败不写入任何数据，可直接重试；重复包自动拦截。 */
async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  importing.value = true;
  try {
    const text = await file.text();
    const result = await importExtractPackage(text);
    await refreshAll();
    if (result.duplicate) {
      ElMessage.warning(`摘录包 ${result.log.packageId} 此前已合并过，已跳过（不会重复记账）`);
    } else {
      const { log } = result;
      ElMessage.success(
        `合并完成：新增环志 ${log.ringsAdded} 条、冲突留版 ${log.conflicts} 组、新鸟点 ${log.sitesAdded} 个（待确认 ${log.sitesPending}）、新批次 ${log.sessionsAdded} 个`,
      );
    }
  } catch (error) {
    // 事务已整体回滚，未写入任何记录；用户修正文件后可直接重试
    ElMessage.error(`导入失败（未写入任何数据，可重试）：${(error as Error).message}`);
  } finally {
    importing.value = false;
  }
}

/** 站里定版：采用某个版本，同组其余版本留档 */
async function adopt(groupId: string, versionId: string) {
  await adoptRingVersion(groupId, versionId);
  await ringStore.reload();
  ElMessage.success('已定版，统计与导出将使用所选版本');
}

async function confirm(siteId: string) {
  await confirmSite(siteId);
  await refreshAll();
  ElMessage.success('鸟点已确认，关联环志进入正式统计');
}

async function exportExtract() {
  const pkg = await buildExtractPackage(exportOrigin.value);
  downloadText(`gbbirdring-extract-${pkg.packageId}.json`, JSON.stringify(pkg, null, 2));
  ElMessage.success(`已按来源「${pkg.origin}」生成离线摘录包（${pkg.rings.length} 条环志），回站后在此合并`);
}
</script>

<template>
  <div>
    <h2 class="page-title">离线摘录包合并</h2>
    <p class="page-desc">
      野外小组在无网点位离线登记，回站后把摘录包合并进主台账。同一只鸟两边都改过时两版都保留并标注来源，由站里定版；
      陌生鸟点先挂「待确认」不进正式统计。合并为单事务，失败可安全重试，同一摘录包不会被重复记两次。
    </p>

    <el-card shadow="never" class="block">
      <div class="merge-actions">
        <el-button type="primary" :icon="Upload" :loading="importing" @click="fileInput?.click()">
          选择摘录包合并
        </el-button>
        <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onFileChange" />
        <el-divider direction="vertical" />
        <span class="field-label">导出本机离线摘录包，来源：</span>
        <el-input v-model="exportOrigin" style="width: 160px" maxlength="20" placeholder="如：野外一组" />
        <el-button :icon="Download" @click="exportExtract">生成摘录包</el-button>
      </div>
    </el-card>

    <el-row :gutter="12" class="stat-row">
      <el-col :xs="12" :md="8">
        <el-alert
          :title="`待站里定版冲突 ${conflictGroups.length} 组`"
          :type="conflictGroups.length ? 'warning' : 'success'"
          :closable="false"
          show-icon
        />
      </el-col>
      <el-col :xs="12" :md="8">
        <el-alert
          :title="`待确认鸟点 ${pendingSites.length} 个`"
          :type="pendingSites.length ? 'warning' : 'success'"
          :closable="false"
          show-icon
        />
      </el-col>
      <el-col :xs="12" :md="8">
        <el-alert :title="`累计合并摘录包 ${logs.length} 个`" type="info" :closable="false" show-icon />
      </el-col>
    </el-row>

    <el-card shadow="never" class="block">
      <template #header>
        <div class="card-head">
          <span>冲突留版 · 站里定版</span>
          <span class="card-note">同一只鸟两边都改过：两版都保留，选定版本进入统计/导出，另一版留档</span>
        </div>
      </template>
      <el-empty v-if="conflictGroups.length === 0" description="暂无待处理冲突" :image-size="60" />
      <div v-for="group in conflictGroups" :key="group.groupId" class="conflict-group">
        <div class="conflict-title">环号 {{ group.ringNo }} · {{ group.versions.length }} 个版本</div>
        <el-table :data="group.versions" size="small" border>
          <el-table-column label="来源" width="120">
            <template #default="scope">
              <el-tag :type="scope.row.source === 'field' ? 'warning' : 'success'" size="small">
                {{ SOURCE_LABEL[scope.row.source as 'station' | 'field'] }}·{{ scope.row.origin }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="scope">
              <el-tag :type="scope.row.superseded ? 'info' : 'primary'" size="small">
                {{ scope.row.superseded ? '留档' : '采用中' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="speciesCn" label="鸟种" width="100" />
          <el-table-column label="环志日期" width="110">
            <template #default="scope">{{ formatDate(scope.row.ringDate) }}</template>
          </el-table-column>
          <el-table-column prop="netNo" label="网号" width="90" />
          <el-table-column prop="netRound" label="网次" width="60" align="right" />
          <el-table-column prop="ringer" label="环志人" width="80" />
          <el-table-column label="鸟点" width="120">
            <template #default="scope">{{ siteNameOf(scope.row.siteId) }}</template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" show-overflow-tooltip />
          <el-table-column label="操作" width="110" fixed="right">
            <template #default="scope">
              <el-button
                link
                type="primary"
                :icon="Check"
                :disabled="!scope.row.superseded"
                @click="adopt(group.groupId, scope.row.id)"
              >
                采用此版
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>
        <div class="card-head">
          <span>待确认鸟点</span>
          <span class="card-note">合并来的陌生点位先挂待确认，确认前不进正式统计与地图正式分布</span>
        </div>
      </template>
      <el-empty v-if="pendingSites.length === 0" description="暂无待确认鸟点" :image-size="60" />
      <el-table v-else :data="pendingSites" size="small" border>
        <el-table-column prop="siteNo" label="编号" width="90" />
        <el-table-column prop="name" label="名称" min-width="120" />
        <el-table-column label="坐标" width="180">
          <template #default="scope">{{ scope.row.lng }}°E, {{ scope.row.lat }}°N</template>
        </el-table-column>
        <el-table-column label="来源" width="130">
          <template #default="scope">
            <el-tag type="warning" size="small">野外·{{ scope.row.origin }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default>
            <el-tag type="info" size="small">{{ SITE_STATUS_LABEL.pending }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click="confirm(scope.row.id)">确认点位</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>
        <div class="card-head">
          <span>合并历史</span>
          <el-button link type="primary" :icon="RefreshLeft" @click="refreshAll">刷新</el-button>
        </div>
      </template>
      <el-table :data="logs" size="small" border>
        <el-table-column prop="packageId" label="摘录包 ID" min-width="160" show-overflow-tooltip />
        <el-table-column prop="origin" label="来源小组" width="100" />
        <el-table-column label="导出时间" width="150">
          <template #default="scope">{{ formatDateTime(scope.row.exportedAt) }}</template>
        </el-table-column>
        <el-table-column label="合并时间" width="150">
          <template #default="scope">{{ formatDateTime(scope.row.mergedAt) }}</template>
        </el-table-column>
        <el-table-column prop="ringsAdded" label="新增环志" width="80" align="right" />
        <el-table-column prop="conflicts" label="冲突组" width="70" align="right" />
        <el-table-column label="新鸟点(待确认)" width="120" align="right">
          <template #default="scope">{{ scope.row.sitesAdded }}（{{ scope.row.sitesPending }}）</template>
        </el-table-column>
        <el-table-column prop="sessionsAdded" label="新批次" width="70" align="right" />
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  color: #1f4a44;
}
.page-desc {
  margin: 0 0 12px;
  color: #6f8480;
  font-size: 13px;
}
.block {
  margin-bottom: 16px;
  border-radius: 8px;
}
.merge-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.field-label {
  font-size: 13px;
  color: #2f4a44;
}
.stat-row {
  margin-bottom: 12px;
}
.stat-row .el-col {
  margin-bottom: 12px;
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
.conflict-group {
  margin-bottom: 16px;
}
.conflict-title {
  font-size: 13px;
  font-weight: 600;
  color: #1f4a44;
  margin-bottom: 6px;
}
</style>
