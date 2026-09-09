<template>
  <div>
    <div class="page-card">
      <div class="toolbar">
        <div class="toolbar-left">
          <span class="page-title" style="margin-bottom: 0">用户管理</span>
          <el-tag type="success" size="small" v-if="regEnabled">注册开放中</el-tag>
          <el-tag type="danger" size="small" v-else>注册已关闭</el-tag>
        </div>
        <div class="toolbar-right">
          <el-switch
            v-model="regEnabled"
            :loading="regSaving"
            active-text="开放注册"
            inactive-text="关闭注册"
            inline-prompt
            @change="toggleReg"
          />
        </div>
      </div>

      <el-table :data="users" v-loading="loading">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="username" label="用户名" min-width="120" />
        <el-table-column prop="nickname" label="昵称" min-width="110" />
        <el-table-column label="角色" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small">{{ row.role === 'admin' ? '管理员' : '用户' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.disabled ? 'warning' : 'success'" size="small">{{ row.disabled ? '已停用' : '正常' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="年级" width="80" align="center">
          <template #default="{ row }">{{ ['', '大一', '大二', '大三', '大四'][row.grade] || '-' }}</template>
        </el-table-column>
        <el-table-column label="毕业注销日" width="110">
          <template #default="{ row }">
            <span class="muted">{{ row.graduate_date || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="课程" prop="course_count" width="70" align="center" />
        <el-table-column label="任务" prop="task_count" width="70" align="center" />
        <el-table-column label="密钥" prop="key_count" width="70" align="center" />
        <el-table-column label="注册时间" width="160">
          <template #default="{ row }">{{ row.created_at.slice(0, 16).replace('T', ' ') }}</template>
        </el-table-column>
        <el-table-column label="操作" width="270" align="center">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="warning" plain @click="resetPwd(row)">重置密码</el-button>
            <el-button size="small" :type="row.disabled ? 'success' : 'warning'" plain @click="toggleDisabled(row)">
              {{ row.disabled ? '启用' : '停用' }}
            </el-button>
            <el-button size="small" type="danger" plain @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 编辑用户 -->
    <el-dialog v-model="editVisible" :title="`编辑用户：${editing?.username}`" width="420px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="昵称">
          <el-input v-model="editForm.nickname" maxlength="20" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="editForm.role" :disabled="editing?.id === meId">
            <el-option value="admin" label="管理员" />
            <el-option value="user" label="普通用户" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import type { AdminUser } from '../types'

const loading = ref(true)
const saving = ref(false)
const users = ref<AdminUser[]>([])
const regEnabled = ref(true)
const regSaving = ref(false)
const meId = Number(JSON.parse(localStorage.getItem('kb_user') || '{"id":1}').id ?? 1)

async function load() {
  loading.value = true
  try {
    users.value = await api.adminUsers()
    regEnabled.value = (await api.adminGetRegistration()).enabled
  } finally {
    loading.value = false
  }
}

async function toggleReg() {
  regSaving.value = true
  try {
    const res = await api.adminSetRegistration(regEnabled.value)
    regEnabled.value = res.enabled
    ElMessage.success(res.enabled ? '已开放注册' : '已关闭注册')
  } catch {
    regEnabled.value = !regEnabled.value
  } finally {
    regSaving.value = false
  }
}

const editVisible = ref(false)
const editing = ref<AdminUser | null>(null)
const editForm = reactive({ nickname: '', role: 'user' })

function openEdit(row: AdminUser) {
  editing.value = row
  editForm.nickname = row.nickname
  editForm.role = row.role
  editVisible.value = true
}

async function saveEdit() {
  if (!editing.value) return
  saving.value = true
  try {
    await api.adminUpdateUser(editing.value.id, { nickname: editForm.nickname, role: editForm.role })
    ElMessage.success('已保存')
    editVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function resetPwd(row: AdminUser) {
  const { value } = await ElMessageBox.prompt(`为「${row.username}」设置新密码（至少 6 位）`, '重置密码', {
    inputPattern: /^.{6,}$/,
    inputErrorMessage: '至少 6 位',
    inputType: 'password',
  })
  await api.adminResetPassword(row.id, value)
  ElMessage.success(`已重置「${row.username}」的密码`)
}

async function toggleDisabled(row: AdminUser) {
  await api.adminUpdateUser(row.id, { disabled: !row.disabled })
  ElMessage.success(row.disabled ? `已启用「${row.username}」` : `已停用「${row.username}」`)
  load()
}

async function remove(row: AdminUser) {
  await ElMessageBox.confirm(
    `确定删除用户「${row.username}」？其全部课程（${row.course_count}）、任务（${row.task_count}）、日志与 API 密钥将被一并删除，不可恢复。`,
    '删除确认',
    { type: 'warning', confirmButtonText: '永久删除', confirmButtonClass: 'el-button--danger' },
  )
  await api.adminDeleteUser(row.id)
  ElMessage.success(`已删除「${row.username}」`)
  load()
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.toolbar-left { display: flex; align-items: center; gap: 10px; }
</style>
