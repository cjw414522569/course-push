<template>
  <el-container class="layout">
    <el-aside :width="collapsed ? '64px' : '210px'" class="aside">
      <div class="brand" @click="$router.push('/')">
        <span class="brand-logo">📅</span>
        <span v-show="!collapsed" class="brand-name">课表推送平台</span>
      </div>
      <el-menu
        :default-active="route.path"
        :collapse="collapsed"
        :collapse-transition="false"
        router
        background-color="#1f2d3d"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
      >
        <el-menu-item index="/">
          <el-icon><Odometer /></el-icon><template #title>仪表盘</template>
        </el-menu-item>
        <el-menu-item index="/schedule">
          <el-icon><Calendar /></el-icon><template #title>课表管理</template>
        </el-menu-item>
        <el-menu-item index="/tasks">
          <el-icon><Bell /></el-icon><template #title>推送任务</template>
        </el-menu-item>
        <el-menu-item index="/logs">
          <el-icon><Document /></el-icon><template #title>推送日志</template>
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon><template #title>系统设置</template>
        </el-menu-item>
        <el-menu-item v-if="isAdmin" index="/admin/users">
          <el-icon><UserFilled /></el-icon><template #title>用户管理</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <el-icon class="collapse-btn" @click="collapsed = !collapsed">
          <Expand v-if="collapsed" /><Fold v-else />
        </el-icon>
        <div class="header-right">
          <el-dropdown @command="onCommand">
            <span class="user-info">
              <el-avatar :size="30" class="user-avatar">{{ nickname.slice(0, 1) }}</el-avatar>
              <span class="user-name">{{ nickname }}</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="password">修改密码</el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>

    <el-dialog v-model="pwdVisible" title="修改密码" width="420px">
      <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-width="80px">
        <el-form-item label="原密码" prop="oldPassword">
          <el-input v-model="pwdForm.oldPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="pwdForm.newPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirm">
          <el-input v-model="pwdForm.confirm" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdLoading" @click="changePwd">确定</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { api } from '../api'

const route = useRoute()
const router = useRouter()
const collapsed = ref(false)
const nickname = computed(() => {
  try { return JSON.parse(localStorage.getItem('kb_user') || '{}').nickname || '用户' } catch { return '用户' }
})

const isAdmin = computed(() => {
  try { return JSON.parse(localStorage.getItem('kb_user') || '{}').role === 'admin' } catch { return false }
})

function onCommand(cmd: string) {
  if (cmd === 'logout') {
    localStorage.removeItem('kb_token')
    localStorage.removeItem('kb_user')
    router.push('/login')
  } else if (cmd === 'password') {
    pwdVisible.value = true
  }
}

const pwdVisible = ref(false)
const pwdLoading = ref(false)
const pwdFormRef = ref<FormInstance>()
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const pwdRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '至少 6 位', trigger: 'blur' },
  ],
  confirm: [{
    validator: (_r, v: string, cb) => (v === pwdForm.newPassword ? cb() : cb(new Error('两次输入不一致'))),
    trigger: 'blur',
  }],
}

async function changePwd() {
  const valid = await pwdFormRef.value?.validate().catch(() => false)
  if (!valid) return
  pwdLoading.value = true
  try {
    await api.changePassword(pwdForm.oldPassword, pwdForm.newPassword)
    ElMessage.success('密码已修改，请重新登录')
    pwdVisible.value = false
    localStorage.removeItem('kb_token')
    localStorage.removeItem('kb_user')
    router.push('/login')
  } finally {
    pwdLoading.value = false
  }
}
</script>

<style scoped>
.layout { height: 100%; }
.aside { background: #1f2d3d; transition: width 0.2s; overflow-x: hidden; }
.aside :deep(.el-menu) { border-right: none; }
.brand {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  cursor: pointer;
  color: #fff;
  white-space: nowrap;
}
.brand-logo { font-size: 22px; }
.brand-name { font-size: 16px; font-weight: 600; }
.header {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  z-index: 1;
}
.collapse-btn { font-size: 20px; cursor: pointer; color: #5a5e66; }
.user-info { display: flex; align-items: center; gap: 8px; cursor: pointer; outline: none; }
.user-avatar { background: #409EFF; }
.user-name { color: #303133; font-size: 14px; }
.main { background: #f5f7fa; padding: 16px; }
</style>
