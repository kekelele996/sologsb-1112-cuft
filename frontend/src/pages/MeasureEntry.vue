<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import MeasureInput from '../components/common/MeasureInput.vue';
import SpeciesPicker from '../components/common/SpeciesPicker.vue';
import EmptyPanel from '../components/common/EmptyPanel.vue';
import { useRingStore } from '../stores/ringStore';
import { useMeasureStore } from '../stores/measureStore';
import { MEASURE_FIELDS, type MeasureKey, type Morphometrics } from '../types/morphometrics';
import { deviationsOf, measureMeans } from '../utils/stats';
import { formatDateTime } from '../utils/format';

const ringStore = useRingStore();
const measureStore = useMeasureStore();

const selectedRingId = ref(ringStore.rings[0]?.id ?? '');
const speciesCn = ref(ringStore.rings[0]?.speciesCn ?? '红喉歌鸲');
const speciesSci = ref(ringStore.rings[0]?.speciesSci ?? 'Calliope calliope');
const dialogVisible = ref(false);
const editingId = ref('');
const formRef = ref<FormInstance>();

interface MorphForm extends Record<MeasureKey, number> {
  fatScore: number;
  measuredBy: string;
  measuredAt: string;
}

const form = ref<MorphForm>({
  billLength: 12,
  billWidth: 4,
  wingLength: 70,
  tailLength: 55,
  tarsusLength: 20,
  weight: 20,
  fatScore: 2,
  measuredBy: '韩雪',
  measuredAt: new Date().toISOString().slice(0, 10),
});

const rules: FormRules = {
  measuredBy: [{ required: true, message: '请输入测量人', trigger: 'blur' }],
};

const ringOptions = computed(() =>
  ringStore.rings.map((record) => ({ label: `${record.ringNo} · ${record.speciesCn} · ${record.netNo}`, value: record.id })),
);

const selectedRing = computed(() => ringStore.rings.find((record) => record.id === selectedRingId.value));

const meansBySpecies = computed(() => measureMeans(ringStore.rings, measureStore.morphs));
const currentMeans = computed(() => meansBySpecies.value[speciesCn.value]);
const measuredSpeciesCount = computed(() =>
  new Set(
    measureStore.morphs
      .map((morph) => ringStore.rings.find((record) => record.id === morph.ringId)?.speciesCn)
      .filter(Boolean) as string[],
  ).size,
);

const liveDeviations = computed(() =>
  deviationsOf(
    MEASURE_FIELDS.reduce((acc, field) => {
      acc[field.key] = Number(form.value[field.key]) || 0;
      return acc;
    }, {} as Record<MeasureKey, number>),
    speciesCn.value,
    currentMeans.value,
  ),
);

const deviationMap = computed(() => new Map(liveDeviations.value.map((item) => [item.key, item])));

const morphRows = computed(() =>
  measureStore.morphs.map((morph) => {
    const ring = ringStore.rings.find((record) => record.id === morph.ringId);
    const species = ring?.speciesCn ?? '';
    const deviations = deviationsOf(
      MEASURE_FIELDS.reduce((acc, field) => {
        acc[field.key] = Number(morph[field.key]) || 0;
        return acc;
      }, {} as Record<MeasureKey, number>),
      species,
      meansBySpecies.value[species],
    );
    return {
      morph,
      ringNo: ring?.ringNo ?? '未知环号',
      species,
      warnings: deviations.filter((item) => item.level !== '正常'),
    };
  }),
);

const meanRows = computed(() =>
  MEASURE_FIELDS.map((field) => ({
    key: field.key,
    label: `${field.label}(${field.unit})`,
    mean: currentMeans.value?.[field.key] ?? 0,
  })),
);

watch(selectedRing, (ring) => {
  if (ring) {
    speciesCn.value = ring.speciesCn;
    speciesSci.value = ring.speciesSci;
  }
});

function openCreate() {
  if (!selectedRing.value) {
    ElMessage.warning('请先选择一条环志记录');
    return;
  }
  editingId.value = '';
  formRef.value?.clearValidate();
  const means = currentMeans.value;
  form.value = {
    billLength: means?.billLength || 12,
    billWidth: means?.billWidth || 4,
    wingLength: means?.wingLength || 70,
    tailLength: means?.tailLength || 55,
    tarsusLength: means?.tarsusLength || 20,
    weight: means?.weight || 20,
    fatScore: 2,
    measuredBy: '韩雪',
    measuredAt: new Date().toISOString().slice(0, 10),
  };
  dialogVisible.value = true;
}

function openEdit(morph: Morphometrics) {
  editingId.value = morph.id;
  form.value = {
    billLength: morph.billLength,
    billWidth: morph.billWidth,
    wingLength: morph.wingLength,
    tailLength: morph.tailLength,
    tarsusLength: morph.tarsusLength,
    weight: morph.weight,
    fatScore: morph.fatScore,
    measuredBy: morph.measuredBy,
    measuredAt: morph.measuredAt.slice(0, 10),
  };
  dialogVisible.value = true;
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  if (!selectedRing.value) {
    ElMessage.warning('请先选择一条环志记录');
    return;
  }
  const payload = {
    ringId: selectedRing.value.id,
    billLength: Number(form.value.billLength) || 0,
    billWidth: Number(form.value.billWidth) || 0,
    wingLength: Number(form.value.wingLength) || 0,
    tailLength: Number(form.value.tailLength) || 0,
    tarsusLength: Number(form.value.tarsusLength) || 0,
    weight: Number(form.value.weight) || 0,
    fatScore: Number(form.value.fatScore) || 0,
    measuredBy: form.value.measuredBy,
    measuredAt: new Date(`${form.value.measuredAt}T09:00:00`).toISOString(),
  };
  const warnings = liveDeviations.value.filter((item) => item.level !== '正常');
  if (editingId.value) {
    await measureStore.updateMorph(editingId.value, payload);
    ElMessage.success(`已更新 ${selectedRing.value.ringNo} 的量度记录`);
  } else {
    await measureStore.addMorph(payload);
    ElMessage.success(
      warnings.length
        ? `已录入 ${selectedRing.value.ringNo} 量度，${warnings.length} 项偏离同鸟种常见区间，请复核`
        : `已录入 ${selectedRing.value.ringNo} 量度，各项均在常见区间内`,
    );
  }
  dialogVisible.value = false;
}

async function remove(morph: Morphometrics) {
  const confirmed = await ElMessageBox.confirm('确认删除该量度记录？', '删除确认', { type: 'warning' })
    .then(() => true)
    .catch(() => false);
  if (!confirmed) return;
  await measureStore.removeMorph(morph.id);
  ElMessage.success('已删除');
}
</script>

<template>
  <div>
    <h2 class="page-title">量度测量录入</h2>
    <p class="page-desc">喙长 / 喙宽 / 翅长（自然弦长）/ 尾长 / 跗跖长 / 体重带单位与范围校验，并与同鸟种历史均值比对给出偏离提示。</p>

    <el-card shadow="never" class="block">
      <div class="head-row">
        <span class="head-label">选择环志记录</span>
        <el-select v-model="selectedRingId" filterable placeholder="按环号 / 鸟种搜索" style="width: 320px">
          <el-option v-for="item in ringOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" :disabled="!selectedRing" @click="openCreate">录入量度</el-button>
        <el-tag v-if="selectedRing" type="success" effect="plain">
          已选 {{ selectedRing.ringNo }} · {{ selectedRing.speciesCn }} · {{ selectedRing.age }}
        </el-tag>
      </div>
      <SpeciesPicker v-model:species-cn="speciesCn" v-model:species-sci="speciesSci" label="比对鸟种" />
    </el-card>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="block">
          <template #header>
            <div class="card-head">
              <span>同鸟种历史均值</span>
              <span class="card-note">{{ speciesCn }} · 已量度 {{ measuredSpeciesCount }} 种</span>
            </div>
          </template>
          <div v-for="row in meanRows" :key="row.key" class="mean-row">
            <span>{{ row.label }}</span>
            <span class="mean-value">{{ row.mean || '—' }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="16">
        <el-card shadow="never" class="block">
          <template #header>
            <div class="card-head">
              <span>量度记录（{{ morphRows.length }} 条）</span>
              <span class="card-note">偏离项会标出与均值的偏差百分比</span>
            </div>
          </template>
          <EmptyPanel v-if="morphRows.length === 0" description="暂无量度记录" action-text="录入量度" @action="openCreate" />
          <el-table v-else :data="morphRows" size="small" border>
            <el-table-column label="环号" width="110">
              <template #default="scope">{{ scope.row.ringNo }}</template>
            </el-table-column>
            <el-table-column label="鸟种" width="110">
              <template #default="scope">{{ scope.row.species }}</template>
            </el-table-column>
            <el-table-column label="喙长×喙宽(mm)" width="140">
              <template #default="scope">{{ scope.row.morph.billLength }} × {{ scope.row.morph.billWidth }}</template>
            </el-table-column>
            <el-table-column label="翅长(mm)" width="100">
              <template #default="scope">{{ scope.row.morph.wingLength }}</template>
            </el-table-column>
            <el-table-column label="尾长(mm)" width="100">
              <template #default="scope">{{ scope.row.morph.tailLength }}</template>
            </el-table-column>
            <el-table-column label="跗跖(mm)" width="100">
              <template #default="scope">{{ scope.row.morph.tarsusLength }}</template>
            </el-table-column>
            <el-table-column label="体重(g)" width="100">
              <template #default="scope">{{ scope.row.morph.weight }}</template>
            </el-table-column>
            <el-table-column label="肥满度" width="90">
              <template #default="scope">{{ scope.row.morph.fatScore }}</template>
            </el-table-column>
            <el-table-column label="偏离提示" min-width="200">
              <template #default="scope">
                <el-tag v-if="scope.row.warnings.length === 0" type="success" size="small">正常</el-tag>
                <el-tag v-for="warn in scope.row.warnings" :key="warn.key" :type="warn.level === '超出常见区间' ? 'danger' : 'warning'" size="small" class="warn-tag">
                  {{ warn.message }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="测量人 / 时间" width="170">
              <template #default="scope">{{ scope.row.morph.measuredBy }} · {{ formatDateTime(scope.row.morph.measuredAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="130" fixed="right">
              <template #default="scope">
                <el-button link type="primary" @click="openEdit(scope.row.morph)">编辑</el-button>
                <el-button link type="danger" @click="remove(scope.row.morph)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑量度记录' : `录入量度 · ${selectedRing?.ringNo ?? ''}`" width="760px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-row :gutter="16">
          <el-col v-for="field in MEASURE_FIELDS" :key="field.key" :xs="24" :md="12">
            <MeasureInput
              :field="field"
              :model-value="form[field.key]"
              :deviation="deviationMap.get(field.key)"
              @update:model-value="(value: number) => (form[field.key] = value)"
            />
          </el-col>
        </el-row>
        <el-form-item label="肥满度(0~4)">
          <el-input-number v-model="form.fatScore" :min="0" :max="4" placeholder="肥满度" />
        </el-form-item>
        <el-form-item label="测量人" prop="measuredBy">
          <el-input v-model="form.measuredBy" style="width: 160px" maxlength="16" placeholder="测量人" />
        </el-form-item>
        <el-form-item label="测量日期">
          <el-date-picker v-model="form.measuredAt" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
      </el-form>
      <el-alert
        v-if="liveDeviations.filter((item) => item.level !== '正常').length"
        type="warning"
        show-icon
        :closable="false"
        :title="`${liveDeviations.filter((item) => item.level !== '正常').length} 项偏离同鸟种常见区间或均值`"
        :description="liveDeviations.filter((item) => item.level !== '正常').map((item) => item.message).join('；')"
      />
      <el-alert v-else type="success" show-icon :closable="false" title="各项量度均在常见区间内" />
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
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
.block {
  margin-bottom: 16px;
  border-radius: 8px;
}
.head-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.head-label {
  font-size: 13px;
  color: #2f4a44;
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
.mean-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 4px 0;
  color: #2f4a44;
}
.mean-value {
  font-weight: 600;
  color: #2f7d6f;
}
.warn-tag {
  margin: 0 4px 2px 0;
}
</style>
