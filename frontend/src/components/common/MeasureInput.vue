<script setup lang="ts">
import { computed } from 'vue';
import type { MeasureDeviation, MeasureField } from '../../types/morphometrics';

const props = withDefaults(
  defineProps<{
    field: MeasureField;
    modelValue: number;
    deviation?: MeasureDeviation;
  }>(),
  { deviation: undefined },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>();

const status = computed(() => {
  if (!props.deviation) return 'normal' as const;
  if (props.deviation.level === '超出常见区间') return 'error' as const;
  if (props.deviation.level === '偏离') return 'warning' as const;
  return 'normal' as const;
});

const hint = computed(() => props.deviation?.message ?? `常见范围 ${props.field.min}~${props.field.max}${props.field.unit}`);
</script>

<template>
  <div class="measure-input">
    <div class="measure-label">
      {{ field.label }}
      <el-tag v-if="deviation && deviation.level !== '正常'" :type="status === 'error' ? 'danger' : 'warning'" size="small" effect="plain">
        {{ deviation.level }}
      </el-tag>
    </div>
    <el-input-number
      :model-value="modelValue"
      :min="field.min"
      :max="field.max"
      :step="field.step"
      :precision="1"
      :placeholder="field.label"
      style="width: 100%"
      @update:model-value="(value: number | undefined) => emit('update:modelValue', Number(value) || 0)"
    >
      <template #suffix>{{ field.unit }}</template>
    </el-input-number>
    <div class="measure-hint" :class="`is-${status}`">{{ hint }}</div>
  </div>
</template>

<style scoped>
.measure-input {
  margin-bottom: 6px;
}
.measure-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #2f4a44;
  margin-bottom: 4px;
}
.measure-hint {
  font-size: 12px;
  color: #8a99a5;
  margin-top: 2px;
}
.measure-hint.is-warning {
  color: #c77700;
}
.measure-hint.is-error {
  color: #c62828;
}
</style>
