<template>
  <div v-loading="loading">
    <el-row :gutter="16">
      <el-col :span="6" v-for="card in statCards" :key="card.label">
        <div class="page-card stat-card">
          <div class="stat-icon" :style="{ background: card.bg }"><el-icon :size="24" color="#fff"><component :is="card.icon" /></el-icon></div>
          <div>
            <div class="stat-value">{{ card.value }}</div>
            <div class="stat-label">{{ card.label }}</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="mt16">
      <el-col :span="14">
        <div class="page-card">
          <div class="card-head">
            <span class="page-title" style="margin-bottom:0">今日课表 · {{ stats?.today.date }}（第 {{ stats?.today.week }} 周 / 星期{{ stats?.today.weekdayCn }}）</span>
            <el-button size="small" @click="$router.push('/schedule')">管理课表</el-button>
          </div>
          <el-empty v-if="stats && stats.today.courses.length === 0" description="今天没有课，好好休息～" :image-size="80" />
          <el-table v-else :data="stats?.today.courses" size="small">
            <el-table-column label="时间" width="110">
              <template #default="{ row }">{{ row.time_range }}</template>
            </el-table-column>
            <el-table-column prop="name" label="课程" min-width="120" />
            <el-table-column prop="location" label="地点" min-width="100" />
            <el-table-column prop="teacher" label="教师" min-width="80" />
          </el-table>
          <div class="muted mt8">明天有 {{ stats?.tomorrow_count }} 节课</div>
        </div>
      </el-col>
      <el-col :span="10">
        <div class="page-card">
          <div class="card-head">
            <span class="page-title" style="margin-bottom:0">推送概览（近 7 天）</span>
            <el-tag v-if="!stats?.token_configured" type="warning" size="small">未配置 token</el-tag>
            <el-tag v-else type="success" size="small">token 已配置</el-tag>
          </div>
          <div class="push-stats">
            <div class="ps-item"><div class="ps-num ok">{{ stats?.push_7d.sent ?? 0 }}</div><div class="ps-label">成功</div></div>
            <div class="ps-item"><div class="ps-num skip">{{ stats?.push_7d.skipped ?? 0 }}</div><div class="ps-label">跳过(无课)</div></div>
            <div class="ps-item"><div class="ps-num bad">{{ stats?.push_7d.failed ?? 0 }}</div><div class="ps-label">失败</div></div>
          </div>
          <el-divider />
          <div class="card-head">
            <span class="page-title" style="margin-bottom:0">最近推送</span>
            <el-button size="small" text type="primary" @click="$router.push('/logs')">全部日志</el-button>
          </div>
          <el-table :data="stats?.recent_logs || []" size="small" :show-header="false">
            <el-table-column width="70">
              <template #default="{ row }"><StatusTag :status="row.status" /></template>
            </el-table-column>
            <el-table-column min-width="150">
              <template #default="{ row }">
                <div class="log-title">{{ row.title || row.task_name || '(无标题)' }}</div>
                <div class="muted">{{ row.error || formatTime(row.created_at) }}</div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import type { Stats } from '../types'
import StatusTag from '../components/StatusTag.vue'

const loading = ref(true)
const stats = ref<Stats | null>(null)

const statCards = computed(() => [
  { label: '课程总数', value: stats.value?.course_total ?? '-', icon: 'Reading', bg: '#409EFF' },
  { label: '推送任务', value: `${stats.value?.task_enabled ?? 0} / ${stats.value?.task_total ?? 0} 启用`, icon: 'Bell', bg: '#67C23A' },
  { label: '运行中任务', value: stats.value?.running_jobs ?? '-', icon: 'Timer', bg: '#E6A23C' },
  { label: '本周第几天', value: stats.value ? `星期${stats.value.today.weekdayCn}` : '-', icon: 'Calendar', bg: '#F56C6C' },
])

function formatTime(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16).replace('Z', '')
}

onMounted(async () => {
  try { stats.value = await api.stats() } finally { loading.value = false }
})
</script>

<style scoped>
.stat-card { display: flex; align-items: center; gap: 14px; }
.stat-icon { width: 48px; height: 48px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
.stat-value { font-size: 22px; font-weight: 600; color: #303133; }
.stat-label { color: #909399; font-size: 13px; margin-top: 2px; }
.mt16 { margin-top: 16px; }
.mt8 { margin-top: 8px; }
.card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.push-stats { display: flex; justify-content: space-around; padding: 8px 0 4px; }
.ps-item { text-align: center; }
.ps-num { font-size: 26px; font-weight: 700; }
.ps-num.ok { color: #67C23A; }
.ps-num.skip { color: #909399; }
.ps-num.bad { color: #F56C6C; }
.ps-label { color: #909399; font-size: 12px; margin-top: 2px; }
.log-title { font-size: 13px; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
