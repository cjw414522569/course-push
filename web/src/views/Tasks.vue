<template>
  <div>
    <div class="page-card">
      <div class="toolbar">
        <span class="page-title" style="margin-bottom: 0">推送任务</span>
        <el-button type="primary" :icon="Plus" @click="openEdit()">新建任务</el-button>
      </div>

      <el-table :data="tasks" v-loading="loading">
        <el-table-column prop="name" label="任务名称" min-width="140" />
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-tag :type="typeMap[row.type]?.tag" effect="plain">{{ typeMap[row.type]?.label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="推送时间" width="170">
          <template #default="{ row }">
            {{ row.time }}
            <span class="muted">{{ daysText(row.days) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Cron" width="120">
          <template #default="{ row }"><code class="cron">{{ row.cron_expr }}</code></template>
        </el-table-column>
        <el-table-column label="无课也推" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.send_empty" type="info" size="small">是</el-tag>
            <el-tag v-else type="success" size="small">否</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="80" align="center">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled" @change="toggle(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190" align="center">
          <template #default="{ row }">
            <el-button size="small" type="success" plain :icon="VideoPlay" @click="run(row)">立即执行</el-button>
            <el-button size="small" :icon="Edit" @click="openEdit(row)" />
            <el-button size="small" type="danger" plain :icon="Delete" @click="remove(row)" />
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="editVisible" :title="form.id ? '编辑任务' : '新建任务'" width="480px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="任务名称" prop="name">
          <el-input v-model="form.name" maxlength="20" placeholder="如：今日课表推送" />
        </el-form-item>
        <el-form-item label="推送内容" prop="type">
          <el-radio-group v-model="form.type">
            <el-radio value="today">今日课表</el-radio>
            <el-radio value="tomorrow">明日课表</el-radio>
            <el-radio value="week">本周课表</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="推送时间" prop="time">
          <el-time-select v-model="form.time" start="00:00" step="00:05" end="23:55" style="width: 140px" />
        </el-form-item>
        <el-form-item label="推送日">
          <el-checkbox-group v-model="form.days">
            <el-checkbox v-for="(n, i) in DAY_NAMES" :key="i" :value="i + 1" :label="n" style="margin-right: 4px" />
          </el-checkbox-group>
          <div class="muted">不勾选 = 每天</div>
        </el-form-item>
        <el-form-item label="无课时">
          <el-switch v-model="form.send_empty" active-text="仍然推送" inactive-text="跳过" />
        </el-form-item>
      </el-form>
      <div class="preview-box">
        <div class="pb-head">
          <span>推送内容预览</span>
          <div class="pb-actions">
            <el-radio-group v-model="previewTemplate" size="small" @change="loadPreview">
              <el-radio-button value="markdown">文字</el-radio-button>
              <el-radio-button value="html">表格</el-radio-button>
            </el-radio-group>
            <el-button size="small" text type="primary" :loading="previewing" @click="loadPreview">刷新</el-button>
          </div>
        </div>
        <!-- 表格形式用 iframe 渲染真实 html 效果；文字形式直接显示 markdown 源 -->
        <iframe
          v-if="previewTemplate === 'html'"
          class="pb-frame"
          :srcdoc="preview"
          sandbox=""
        />
        <pre v-else class="pb-content">{{ preview || '加载中…' }}</pre>
      </div>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Edit, Delete, VideoPlay } from '@element-plus/icons-vue'
import { api } from '../api'
import type { PushTask } from '../types'

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日']
const typeMap: Record<string, { tag: 'primary' | 'warning' | 'success'; label: string }> = {
  today: { tag: 'primary', label: '今日课表' },
  tomorrow: { tag: 'warning', label: '明日课表' },
  week: { tag: 'success', label: '本周课表' },
}

const loading = ref(true)
const saving = ref(false)
const tasks = ref<PushTask[]>([])

function daysText(days: number[]): string {
  if (!days || days.length === 0 || days.length === 7) return '每天'
  return '周' + days.map((d) => DAY_NAMES[d - 1]).join('/')
}

async function load() {
  loading.value = true
  try { tasks.value = await api.tasks() } finally { loading.value = false }
}

async function toggle(row: PushTask) {
  const res = await api.toggleTask(row.id)
  row.enabled = res.enabled
  ElMessage.success(res.enabled ? '已启用' : '已停用')
}

async function run(row: PushTask) {
  await api.runTask(row.id)
  ElMessage.success('已触发，稍后可在推送日志查看结果')
}

async function remove(row: PushTask) {
  await ElMessageBox.confirm(`确定删除任务「${row.name}」？`, '删除确认', { type: 'warning' })
  await api.deleteTask(row.id)
  ElMessage.success('已删除')
  load()
}

// ---------- 编辑 ----------
const editVisible = ref(false)
const formRef = ref<FormInstance>()
const form = reactive<Partial<PushTask>>({ name: '', type: 'today', time: '07:30', days: [], send_empty: false })

const rules: FormRules = {
  name: [{ required: true, message: '请输入任务名称', trigger: 'blur' }],
  type: [{ required: true, message: '必选', trigger: 'change' }],
  time: [{ required: true, message: '必选', trigger: 'change' }],
}

const preview = ref('')
const previewing = ref(false)
/** 预览形式：文字(markdown 源) / 表格(html iframe 渲染) */
const previewTemplate = ref<'markdown' | 'html'>('markdown')

async function loadPreview() {
  previewing.value = true
  try {
    const res = await api.preview(form.type || 'today', previewTemplate.value)
    preview.value = previewTemplate.value === 'html'
      ? `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;margin:10px;font-size:13px;color:#303133}</style></head><body><h3 style="margin:0 0 8px">${res.title}</h3>${res.content}</body></html>`
      : `${res.title}\n${'─'.repeat(24)}\n${res.content}`
  } finally {
    previewing.value = false
  }
}

function openEdit(t?: PushTask) {
  Object.assign(form, t ? { ...t } : { id: undefined, name: '', type: 'today', time: '07:30', days: [], send_empty: false })
  editVisible.value = true
  loadPreview()
}

async function save() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (form.id) await api.updateTask(form.id, form)
    else await api.createTask(form)
    ElMessage.success('已保存')
    editVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.cron { font-size: 12px; background: #f4f4f5; padding: 2px 6px; border-radius: 4px; color: #606266; }
.preview-box { border: 1px solid #ebeef5; border-radius: 6px; margin-top: 6px; }
.pb-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 12px; background: #f5f7fa; font-size: 13px; color: #606266;
}
.pb-content {
  padding: 10px 12px; font-size: 12px; color: #303133;
  max-height: 200px; overflow-y: auto; font-family: inherit; white-space: pre-wrap;
}
.pb-frame { width: 100%; height: 220px; border: none; }
.pb-actions { display: flex; align-items: center; gap: 8px; }
</style>
