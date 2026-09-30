<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import StatBadge from '../components/common/StatBadge.vue';
import FilterBar from '../components/common/FilterBar.vue';
import EmptyPanel from '../components/common/EmptyPanel.vue';
import { useSessionStore } from '../stores/sessionStore';
import { useSiteStore } from '../stores/siteStore';
import { useRingStore } from '../stores/ringStore';
import { cloudText, type SessionStats, type SurveySession } from '../types/session';
import { buildSessionStats } from '../utils/stats';

const route = useRoute();
const sessionStore = useSessionStore();
const siteStore = useSiteStore();
const ringStore = useRingStore();

const dialogVisible = ref(false);
const editingId = ref('');
// 批次统计弹窗的开关：仅在选中记录时为字符串 id，关闭时为 null。
// 注意不要用空字符串占位——el-dialog 的 v-model 期望布尔值，非空字符串会被判定为打开。
const detailId = ref<string | null>(null);
const formRef = ref<FormInstance>();

interface SessionForm {
  sessionNo: string;
  date: string;
  siteId: string;
  startedAt: string;
  endedAt: string;
  netRounds: number;
  cloudCover: number;
  windForce: number;
  leader: string;
  remark: string;
}

const form = ref<SessionForm>({
  sessionNo: '',
  date: new Date().toISOString().slice(0, 10),
  siteId: '',
  startedAt: '05:00',
  endedAt: '11:00',
  netRounds: 6,
  cloudCover: 2,
  windForce: 2,
  leader: '',
  remark: '',
});

const rules: FormRules = {
  sessionNo: [{ required: true, message: '请输入批次号', trigger: 'blur' }],
  leader: [{ required: true, message: '请输入主调查人', trigger: 'blur' }],
};

const siteParam = computed(() => (typeof route.query.site === 'string' ? route.query.site : ''));
const closedParam = computed(() => (typeof route.query.closed === 'string' ? route.query.closed : ''));

const statsList = computed<SessionStats[]>(() =>
  sessionStore.sessions
    .map((session) => buildSessionStats(session, ringStore.rings, siteStore.siteName(session.siteId)))
    .filter((item) => {
      if (siteParam.value && siteStore.siteName(item.session.siteId) !== siteParam.value) return false;
      if (closedParam.value === '已关闭' && !item.session.closed) return false;
      if (closedParam.value === '进行中' && item.session.closed) return false;
      return true;
    }),
);

const closedCount = computed(() => sessionStore.sessions.filter((session) => session.closed).length);
const averageRecapture = computed(() => {
  const list = statsList.value;
  if (list.length === 0) return 0;
  return Number((list.reduce((sum, item) => sum + item.recaptureRate, 0) / list.length).toFixed(1));
});
const totalSpecies = computed(() => new Set(ringStore.rings.map((record) => record.speciesCn)).size);

const detail = computed(() => statsList.value.find((item) => item.session.id === detailId.value));

function openCreate() {
  editingId.value = '';
  formRef.value?.clearValidate();
  form.value = {
    sessionNo: `2024-${String.fromCharCode(65 + Math.floor(sessionStore.sessions.length / 9))}${String((sessionStore.sessions.length % 9) + 1).padStart(2, '0')}`,
    date: new Date().toISOString().slice(0, 10),
    siteId: siteStore.sites[0]?.id ?? '',
    startedAt: '05:00',
    endedAt: '11:00',
    netRounds: 6,
    cloudCover: 2,
    windForce: 2,
    leader: '韩雪',
    remark: '',
  };
  dialogVisible.value = true;
}

function openEdit(session: SurveySession) {
  editingId.value = session.id;
  form.value = {
    sessionNo: session.sessionNo,
    date: session.date,
    siteId: session.siteId,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    netRounds: session.netRounds,
    cloudCover: session.cloudCover,
    windForce: session.windForce,
    leader: session.leader,
    remark: session.remark ?? '',
  };
  dialogVisible.value = true;
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  const payload = {
    sessionNo: form.value.sessionNo,
    date: form.value.date,
    siteId: form.value.siteId,
    startedAt: form.value.startedAt,
    endedAt: form.value.endedAt,
    netRounds: Number(form.value.netRounds) || 0,
    cloudCover: Number(form.value.cloudCover) || 0,
    windForce: Number(form.value.windForce) || 0,
    leader: form.value.leader,
    remark: form.value.remark,
  };
  if (editingId.value) {
    await sessionStore.updateSession(editingId.value, payload);
    ElMessage.success(`已更新批次 ${payload.sessionNo}`);
  } else {
    await sessionStore.addSession(payload);
    ElMessage.success(`已新建批次 ${payload.sessionNo}`);
  }
  dialogVisible.value = false;
}

async function close(session: SurveySession) {
  const stats = buildSessionStats(session, ringStore.rings, siteStore.siteName(session.siteId));
  const confirmed = await ElMessageBox.confirm(
    `关闭批次 ${session.sessionNo} 后出统计：鸟种 ${stats.speciesCount} 种、初捕 ${stats.firstCount}、重捕 ${stats.recaptureCount}。确认关闭？`,
    '关闭批次',
    { type: 'warning' },
  )
    .then(() => true)
    .catch(() => false);
  if (!confirmed) return;
  await sessionStore.closeSession(session.id);
  ElMessage.success(`批次 ${session.sessionNo} 已关闭`);
}

async function remove(session: SurveySession) {
  const confirmed = await ElMessageBox.confirm(`确认删除批次 ${session.sessionNo}？`, '删除确认', { type: 'warning' })
    .then(() => true)
    .catch(() => false);
  if (!confirmed) return;
  await sessionStore.removeSession(session.id);
  ElMessage.success('已删除');
}
</script>

<template>
  <div>
    <h2 class="page-title">调查批次与观测条件</h2>
    <p class="page-desc">登记批次号、鸟点、起止时间与云量风力；批次关闭后统计该批鸟种数、初捕数与重捕数。</p>

    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新建批次</el-button>
      <el-tag type="info" effect="plain">批次 {{ sessionStore.sessions.length }} 个 · 已关闭 {{ closedCount }} 个</el-tag>
    </div>

    <el-row :gutter="12" class="stat-row">
      <el-col :xs="12" :md="6">
        <StatBadge label="调查批次" :value="sessionStore.sessions.length" unit="批" />
      </el-col>
      <el-col :xs="12" :md="6">
        <StatBadge label="进行中" :value="sessionStore.sessions.length - closedCount" unit="批" status="warning" />
      </el-col>
      <el-col :xs="12" :md="6">
        <StatBadge label="平均重捕率" :value="averageRecapture" unit="%" status="success" />
      </el-col>
      <el-col :xs="12" :md="6">
        <StatBadge label="累计鸟种" :value="totalSpecies" unit="种" />
      </el-col>
    </el-row>

    <FilterBar
      :fields="[
        { key: 'site', label: '鸟点', options: siteStore.sites.map((s) => s.name), width: 150 },
        { key: 'closed', label: '状态', options: ['已关闭', '进行中'], width: 110 },
      ]"
      keyword-placeholder="搜索批次号 / 主调查人"
      :result-count="statsList.length"
      :total-count="sessionStore.sessions.length"
    />

    <EmptyPanel v-if="statsList.length === 0" description="没有符合条件的调查批次" action-text="新建批次" @action="openCreate" />

    <el-card v-else shadow="never" class="block">
      <el-table :data="statsList" size="small" border>
        <el-table-column label="批次号" width="120">
          <template #default="scope">{{ scope.row.session.sessionNo }}</template>
        </el-table-column>
        <el-table-column label="日期" width="110">
          <template #default="scope">{{ scope.row.session.date }}</template>
        </el-table-column>
        <el-table-column label="鸟点" width="150">
          <template #default="scope">{{ scope.row.siteName }}</template>
        </el-table-column>
        <el-table-column label="起止时间" width="120">
          <template #default="scope">{{ scope.row.session.startedAt }}~{{ scope.row.session.endedAt }}</template>
        </el-table-column>
        <el-table-column label="网次" width="80" align="right">
          <template #default="scope">{{ scope.row.session.netRounds }}</template>
        </el-table-column>
        <el-table-column label="观测条件" width="140">
          <template #default="scope">
            {{ cloudText(scope.row.session.cloudCover) }}（云量 {{ scope.row.session.cloudCover }}）· {{ scope.row.session.windForce }} 级风
          </template>
        </el-table-column>
        <el-table-column label="鸟种数" width="90" align="right">
          <template #default="scope">{{ scope.row.speciesCount }}</template>
        </el-table-column>
        <el-table-column label="初捕 / 重捕 / 回收" width="160">
          <template #default="scope">{{ scope.row.firstCount }} / {{ scope.row.recaptureCount }} / {{ scope.row.recoveryCount }}</template>
        </el-table-column>
        <el-table-column label="重捕率" width="100" align="right">
          <template #default="scope">{{ scope.row.recaptureRate }}%</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.session.closed ? 'success' : 'warning'" size="small">
              {{ scope.row.session.closed ? '已关闭' : '进行中' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click="detailId = scope.row.session.id">统计</el-button>
            <el-button v-if="!scope.row.session.closed" link type="warning" @click="close(scope.row.session)">关闭批次</el-button>
            <el-button link type="primary" @click="openEdit(scope.row.session)">编辑</el-button>
            <el-button link type="danger" @click="remove(scope.row.session)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑调查批次' : '新建调查批次'" width="620px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="批次号" prop="sessionNo">
          <el-input v-model="form.sessionNo" placeholder="如：2024-A05" maxlength="20" />
        </el-form-item>
        <el-form-item label="调查日期">
          <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
        <el-form-item label="鸟点">
          <el-select v-model="form.siteId" style="width: 260px">
            <el-option v-for="site in siteStore.sites" :key="site.id" :label="`${site.siteNo} · ${site.name}`" :value="site.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="开始 / 结束">
          <el-time-picker v-model="form.startedAt" value-format="HH:mm" placeholder="开始时间" style="width: 130px" />
          <span style="margin: 0 8px">~</span>
          <el-time-picker v-model="form.endedAt" value-format="HH:mm" placeholder="结束时间" style="width: 130px" />
        </el-form-item>
        <el-form-item label="计划网次">
          <el-input-number v-model="form.netRounds" :min="1" :max="20" placeholder="网次" />
        </el-form-item>
        <el-form-item label="云量(0~10)">
          <el-input-number v-model="form.cloudCover" :min="0" :max="10" placeholder="云量" />
        </el-form-item>
        <el-form-item label="风力(级)">
          <el-input-number v-model="form.windForce" :min="0" :max="12" placeholder="风力" />
        </el-form-item>
        <el-form-item label="主调查人" prop="leader">
          <el-input v-model="form.leader" style="width: 160px" maxlength="16" placeholder="如：韩雪" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="60" placeholder="观测条件变化、网次调整等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-if="detailId" :model-value="true" :title="`批次统计 · ${detail?.session.sessionNo ?? ''}`" width="560px" @close="detailId = null">
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="鸟点">{{ detail.siteName }}</el-descriptions-item>
          <el-descriptions-item label="日期">{{ detail.session.date }}</el-descriptions-item>
          <el-descriptions-item label="起止">{{ detail.session.startedAt }}~{{ detail.session.endedAt }}</el-descriptions-item>
          <el-descriptions-item label="观测条件">
            {{ cloudText(detail.session.cloudCover) }} · {{ detail.session.windForce }} 级风
          </el-descriptions-item>
          <el-descriptions-item label="鸟种数">{{ detail.speciesCount }} 种</el-descriptions-item>
          <el-descriptions-item label="初捕">{{ detail.firstCount }} 只</el-descriptions-item>
          <el-descriptions-item label="重捕">{{ detail.recaptureCount }} 只</el-descriptions-item>
          <el-descriptions-item label="回收">{{ detail.recoveryCount }} 只</el-descriptions-item>
          <el-descriptions-item label="重捕率">{{ detail.recaptureRate }}%</el-descriptions-item>
          <el-descriptions-item label="主调查人">{{ detail.session.leader }}</el-descriptions-item>
        </el-descriptions>
      </template>
      <template #footer>
        <el-button type="primary" @click="detailId = null">关闭</el-button>
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
.stat-row {
  margin-bottom: 12px;
}
.stat-row .el-col {
  margin-bottom: 12px;
}
.block {
  border-radius: 8px;
}
</style>
