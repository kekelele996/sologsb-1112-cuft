<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <el-result icon="warning" title="页面不存在" sub-title="请从左侧菜单进入鸟类环志记录与鸟点地图的各功能页">
    <template #extra>
      <el-button type="primary" @click="router.push('/')">返回统计台</el-button>
    </template>
  </el-result>
</template>
