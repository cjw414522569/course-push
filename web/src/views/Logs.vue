<template>
  <div>
    <div class="page-card">
      <div class="toolbar">
        <span class="page-title" style="margin-bottom: 0">推送日志</span>
        <el-button type="danger" plain :icon="Delete" @click="clear">清空日志</el-button>
      </div>

      <el-table :data="list" v-loading="loading">
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }"><StatusTag :status="row.status" /></template>
        </el-table-column>
        <el-table-column prop="task_name" label="任务" min-width="120" />
        <el-table-column label="标题" min-width="180">
          <template #default="{ row }">{{ row.title || '-' }}</template>
        </el-table-column>
        <el-table-column label="说明" min-width="200">
          <template #default="{ row }">
            <span :class="{ 'err-text': row.status === 3 }">{{ row.error || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="流水号" width="150">
          <template #default="{ row }">
            <span v-if="row.short_code" class="muted mono">{{ row.short_code.slice(0, 12) }}…</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="" width="70" align="center">
          <template #default="{ row }">
            <el-button v-if="row.response" size="small" text type="primary" @click="showDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        class="pager"
        layout="total, prev, pager, next, sizes"
        :total="total"
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[20, 50, 100]"
        @change="load"
      />
    </div>

    <el-dialog v-model="detailVisible" title="推送详情" width="560px">
      <div v-if="detail">
        <p class="muted">任务：{{ detail.task_name }}（#{{ detail.task_id ?? '-' }}）</p>
        <p class="muted">流水号：{{ detail.short_code || '-' }}</p>
        <pre class="detail-pre">{{ prettyResponse }}</pre>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import { api } from '../api'
import type { PushLog } from '../types'
import StatusTag from '../components/StatusTag.vue'

const loading = ref(true)
const list = ref<PushLog[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

async function load() {
  loading.value = true
  try {
    const res = await api.logs(page.value, pageSize.value)
    list.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

watch(pageSize, () => { page.value = 1 })

function formatTime(iso: string): string {
  return iso.replace('T', ' ').slice(0, 19).replace('Z', '')
}

const detailVisible = ref(false)
const detail = ref<PushLog | null>(null)
const prettyResponse = computed(() => {
  if (!detail.value?.response) return ''
  try { return JSON.stringify(JSON.parse(detail.value.response), null, 2) } catch { return detail.value.response }
})

function showDetail(row: PushLog) {
  detail.value = row
  detailVisible.value = true
}

async function clear() {
  await ElMessageBox.confirm('确定清空全部推送日志？此操作不可恢复。', '清空确认', { type: 'warning' })
  await api.clearLogs()
  ElMessage.success('已清空')
  load()
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.pager { margin-top: 14px; justify-content: flex-end; }
.err-text { color: #F56C6C; }
.mono { font-family: Consolas, Monaco, monospace; font-size: 12px; }
.detail-pre {
  margin-top: 10px; padding: 12px; background: #f4f4f5; border-radius: 6px;
  font-size: 12px; max-height: 300px; overflow: auto; white-space: pre-wrap; word-break: break-all;
}
</style>
