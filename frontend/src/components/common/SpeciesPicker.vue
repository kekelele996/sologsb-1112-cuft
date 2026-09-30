<script setup lang="ts">
import { computed } from 'vue';
import { SPECIES_CATALOG } from '../../utils/stats';

const props = withDefaults(
  defineProps<{
    speciesCn: string;
    speciesSci: string;
    allowCustom?: boolean;
    label?: string;
  }>(),
  { allowCustom: true, label: '鸟种' },
);

const emit = defineEmits<{
  (e: 'update:speciesCn', value: string): void;
  (e: 'update:speciesSci', value: string): void;
}>();

const options = computed(() => SPECIES_CATALOG.map((item) => ({ label: `${item.cn} · ${item.sci}`, value: item.cn })));

function onSpeciesChange(value: string) {
  emit('update:speciesCn', value || '');
  const matched = SPECIES_CATALOG.find((item) => item.cn === value);
  emit('update:speciesSci', matched?.sci ?? '');
}

const known = computed(() => SPECIES_CATALOG.some((item) => item.cn === props.speciesCn));
</script>

<template>
  <div class="species-picker">
    <div class="species-row">
      <span class="species-label">{{ label }}（中文名）</span>
      <el-select
        :model-value="speciesCn"
        filterable
        :allow-create="allowCustom"
        default-first-option
        placeholder="选择或输入鸟种中文名"
        style="width: 260px"
        @update:model-value="onSpeciesChange"
      >
        <el-option v-for="item in options" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-tag v-if="speciesCn" :type="known ? 'success' : 'warning'" size="small" effect="plain">
        {{ known ? '名录内鸟种' : '自定义补充鸟种' }}
      </el-tag>
    </div>
    <div class="species-row">
      <span class="species-label">学名</span>
      <el-input
        :model-value="speciesSci"
        placeholder="随中文名自动带出，可手工修正"
        maxlength="60"
        style="width: 260px"
        @update:model-value="(value: string) => emit('update:speciesSci', value)"
      />
      <span class="species-hint">名录共 {{ SPECIES_CATALOG.length }} 种常见环志鸟种</span>
    </div>
  </div>
</template>

<style scoped>
.species-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.species-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.species-label {
  width: 130px;
  font-size: 13px;
  color: #2f4a44;
}
.species-hint {
  font-size: 12px;
  color: #8a99a5;
}
</style>
