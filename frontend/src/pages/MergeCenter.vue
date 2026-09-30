<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Upload, Download } from '@element-plus/icons-vue';
import { useMergeStore } from '../stores/mergeStore';
import { useRingStore } from '../stores/ringStore';
import { useSiteStore } from '../stores/siteStore';
import { useSessionStore } from '../stores/sessionStore';
import { useMeasureStore } from '../stores/measureStore';
import { formatDate } from '../utils/format';
import type { ConflictGroupView, ConflictType } from '../stores/mergeStore';
import type { RingRecord } from '../types/ring-record';
import type { BirdSite } from '../types/bird-site';
import type { SurveySession } from '../types/session';

const mergeStore = useMergeStore();
const ringStore = useRingStore();
const siteStore = useSiteStore();
const sessionStore = useSessionStore();
const measureStore = useMeasureStore();

const device = ref('野外小组');
const fileInput = ref<HTMLInputElement | null>(null);
const resultVisible = ref(false);

onMounted(async () => {
  await mergeStore.refresh();
});

/** 待确认新鸟点（不在冲突组内） */
const standalonePendingSites = computed(() => mergeStore.pendingSites.filter((s) => !s.conflictGroup));

/** 合并结果汇总行 */
const resultRows = computed(() => {
  const r = mergeStore.lastResult?.counts;
  if (!r) return [];
  return [
    { type: '环志记录', added: r.rings.added, conflicts: r.rings.conflicts, skipped: r.rings.skipped, pending: '' },
    { type: '量度记录', added: r.morphs.added, conflicts: '', skipped: r.morphs.skipped, pending: '' },
    { type: '鸟点', added: r.sites.added, conflicts: r.sites.conflicts, skipped: r.sites.skipped, pending: r.sites.pending },
    { type: '调查批次', added: r.sessions.added, conflicts: r.sessions.conflicts, skipped: r.sessions.skipped, pending: '' },
  ];
});

const typeLabel: Record<ConflictType, string> = { ring: '环志记录', site: '鸟点', session: '调查批次' };

function sourceTag(source: 'local' | 'merge', mergeId?: string): string {
  return source === 'local' ? '本站录入' : `野外摘录${mergeId ? ` · ${mergeId}` : ''}`;
}

function statusTagType(status: string): 'success' | 'warning' | 'info' {
  if (status === 'active') return 'success';
  if (status === 'pending') return 'warning';
  return 'info';
}

function versionSummary(type: ConflictType, record: RingRecord | BirdSite | SurveySession): string {
  if (type === 'ring') {
    const r = record as RingRecord;
    return `${r.ringNo} · ${r.speciesCn} · ${r.age} · ${formatDate(r.ringDate)} · ${r.status} · ${r.ringer}`;
  }
  if (type === 'site') {
    const s = record as BirdSite;
    return `${s.siteNo} · ${s.name} · ${s.habitat} · ${s.lng.toFixed(3)}°E,${s.lat.toFixed(3)}°N · ${s.netCount} 网位`;
  }
  const s = record as SurveySession;
  return `${s.sessionNo} · ${s.date} · ${s.startedAt}~${s.endedAt} · ${s.leader}`;
}

async function handleExport() {
  await mergeStore.exportExcerpt(device.value);
  ElMessage.success('已导出摘录包 JSON，可在站里「导入摘录包」合并');
}

function triggerImport() {
  fileInput.value?.click();
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    await mergeStore.importPackage(text);
    // 合并后刷新各业务 store，统计 / 列表按合并后的有效版本重算
    await Promise.all([
      ringStore.hydrate(),
      siteStore.hydrate(),
      sessionStore.hydrate(),
      measureStore.hydrate(),
    ]);
    resultVisible.value = true;
  } catch (error) {
    ElMessage.error(`摘录包导入失败：${(error as Error).message}。可修正后重试，已并入的记录不会重复计入。`);
  } finally {
    input.value = '';
  }
}

async function resolveGroup(group: ConflictGroupView, chosenId: string) {
  const chosen = group.versions.find((v) => v.id === chosenId);
  const summary = chosen ? versionSummary(group.type, chosen.record) : '';
  await mergeStore.resolve(group.groupId, chosenId);
  ElMessage.success(`已采用${chosen?.source === 'local' ? '本站' : '野外摘录'}版：${summary}`);
}

async function confirmSite(site: BirdSite) {
  await mergeStore.confirm(site.id);
  ElMessage.success(`已确认鸟点 ${site.siteNo} · ${site.name}，纳入正式统计`);
}

async function discardSite(site: BirdSite) {
  const confirmed = await ElMessageBox.confirm(`确认删除待确认鸟点 ${site.siteNo} · ${site.name}？`, '删除确认', {
    type: 'warning',
  })
    .then(() => true)
    .catch(() => false);
  if (!confirmed) return;
  await mergeStore.discard(site.id);
  ElMessage.success('已删除待确认鸟点');
}
</script>

<template>
  <div>
    <h2 class="page-title">摘录包合并</h2>
    <p class="page-desc">
      野外小组在无网点位离线登记，回站后把摘录包合并进主台账。同一只鸟两边都改过时保留两版并标来源，由站里裁定用哪版；合并来的新鸟点先挂待确认，不进正式统计。导入失败可重试，已并入的不会重复记两次。
    </p>

    <div class="toolbar">
      <el-input v-model="device" style="width: 180px" placeholder="来源设备 / 小组" maxlength="20" />
      <el-button :icon="Download" :loading="mergeStore.exporting" @click="handleExport">导出摘录包</el-button>
      <el-button type="primary" :icon="Upload" :loading="mergeStore.importing" @click="triggerImport">导入摘录包</el-button>
      <input ref="fileInput" type="file" accept="application/json,.json" style="display: none" @change="handleFileChange" />
      <el-tag type="info" effect="plain">待处理 {{ mergeStore.badgeCount }} 项</el-tag>
    </div>

    <el-alert
      type="info"
      show-icon
      :closable="false"
      title="合并规则"
      description="同环号 / 点位号 / 批次号业务字段完全一致视为已并入（跳过）；内容不一致则保留两版并标来源，待站里裁定；新鸟点挂「待确认」，确认后才进正式统计。全部写入在一个事务内，失败整体回滚，可安全重试。"
      class="rule-alert"
    />

    <!-- 待裁决冲突 -->
    <el-card shadow="never" class="block">
      <template #header>
        <div class="card-head">
          <span>待裁决冲突（{{ mergeStore.conflictGroups.length }} 组）</span>
          <span class="card-note">同一只鸟 / 点位 / 批次两边都改过，保留两版并标来源，站里定用哪版</span>
        </div>
      </template>
      <EmptyPanel v-if="mergeStore.conflictGroups.length === 0" description="没有待裁决的冲突" />
      <div v-for="group in mergeStore.conflictGroups" :key="group.groupId" class="conflict-group">
        <div class="group-head">
          <el-tag size="small" type="danger" effect="plain">{{ typeLabel[group.type] }}</el-tag>
          <span class="group-key">{{ group.naturalKey }}</span>
          <span class="group-id">冲突组 {{ group.groupId }}</span>
        </div>
        <el-table :data="group.versions" size="small" border>
          <el-table-column label="来源" width="200">
            <template #default="scope">
              <el-tag size="small" :type="scope.row.source === 'local' ? 'primary' : 'warning'" effect="plain">
                {{ sourceTag(scope.row.source, scope.row.mergeId) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="内容" min-width="320">
            <template #default="scope">{{ versionSummary(group.type, scope.row.record) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="scope">
              <el-tag size="small" :type="statusTagType(scope.row.conflictStatus)">
                {{ scope.row.conflictStatus === 'active' ? '有效' : scope.row.conflictStatus === 'pending' ? '待裁决' : '已废弃' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130">
            <template #default="scope">
              <el-button
                link
                type="primary"
                :disabled="scope.row.conflictStatus === 'active'"
                @click="resolveGroup(group, scope.row.id)"
              >
                采用此版
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <!-- 待确认鸟点 -->
    <el-card shadow="never" class="block">
      <template #header>
        <div class="card-head">
          <span>待确认鸟点（{{ standalonePendingSites.length }} 个）</span>
          <span class="card-note">合并来的新点位，鸟点台账无对应点位，暂不进正式统计</span>
        </div>
      </template>
      <EmptyPanel v-if="standalonePendingSites.length === 0" description="没有待确认的鸟点" />
      <el-table v-else :data="standalonePendingSites" size="small" border>
        <el-table-column prop="siteNo" label="点位编号" width="100" />
        <el-table-column prop="name" label="点位名称" min-width="140" />
        <el-table-column prop="habitat" label="生境" width="110" />
        <el-table-column label="坐标" width="180">
          <template #default="scope">{{ scope.row.lng.toFixed(3) }}°E, {{ scope.row.lat.toFixed(3) }}°N</template>
        </el-table-column>
        <el-table-column prop="netCount" label="网位" width="70" align="right" />
        <el-table-column prop="note" label="备注" show-overflow-tooltip />
        <el-table-column label="来源" width="160">
          <template #default="scope">
            <el-tag size="small" type="warning" effect="plain">{{ sourceTag(scope.row.source, scope.row.mergeId) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="scope">
            <el-button link type="success" @click="confirmSite(scope.row)">确认纳入</el-button>
            <el-button link type="danger" @click="discardSite(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 导入结果 -->
    <el-dialog v-model="resultVisible" title="摘录包合并结果" width="560px">
      <template v-if="mergeStore.lastResult">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="来源设备">{{ mergeStore.lastResult.device }}</el-descriptions-item>
          <el-descriptions-item label="摘录包编号">{{ mergeStore.lastResult.packageId }}</el-descriptions-item>
          <el-descriptions-item label="导出时间">{{ formatDate(mergeStore.lastResult.exportedAt) || '—' }}</el-descriptions-item>
          <el-descriptions-item label="导入时间">{{ formatDate(mergeStore.lastResult.importedAt) }}</el-descriptions-item>
        </el-descriptions>
        <el-table :data="resultRows" size="small" border class="result-table">
          <el-table-column label="类型" prop="type" width="120" />
          <el-table-column label="新增" prop="added" width="80" align="right" />
          <el-table-column label="待确认" prop="pending" width="80" align="right" />
          <el-table-column label="冲突" prop="conflicts" width="80" align="right" />
          <el-table-column label="已跳过(重复)" prop="skipped" width="110" align="right" />
        </el-table>
        <el-alert
          type="warning"
          show-icon
          :closable="false"
          title="合并后请处理待裁决冲突与待确认鸟点"
          description="冲突两版均已保留并标来源，站里裁定用哪版；待确认鸟点确认后才进正式统计。"
          class="result-alert"
        />
      </template>
      <template #footer>
        <el-button type="primary" @click="resultVisible = false">知道了</el-button>
      </template>
    </el-dialog>
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
.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.rule-alert {
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
.conflict-group {
  margin-bottom: 14px;
  border: 1px solid #e3eeea;
  border-radius: 6px;
  padding: 10px;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.group-key {
  font-weight: 600;
  color: #1f4a44;
}
.group-id {
  font-size: 12px;
  color: #8a99a5;
}
.result-table {
  margin: 12px 0;
}
.result-alert {
  margin-top: 4px;
}
</style>
