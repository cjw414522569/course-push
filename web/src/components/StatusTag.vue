<template>
  <el-tag :type="info?.type ?? 'info'" size="small">{{ info?.label || '未知' }}</el-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ status: number }>()

const MAP: Record<number, { type: 'success' | 'info' | 'danger'; label: string }> = {
  1: { type: 'success', label: '成功' },
  2: { type: 'info', label: '跳过' },
  3: { type: 'danger', label: '失败' },
}

const info = computed(() => MAP[props.status])
</script>
