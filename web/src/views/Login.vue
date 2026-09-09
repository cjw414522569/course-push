<template>
  <div class="login-wrap">
    <div class="login-box">
      <div class="login-head">
        <span class="logo">📅</span>
        <h1>课表推送平台</h1>
        <p>基于 pushplus 的微信课表定时推送系统</p>
      </div>
      <el-tabs v-model="tab">
        <el-tab-pane label="登录" name="login" />
        <el-tab-pane label="注册" name="register" />
      </el-tabs>
      <el-form ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="submit">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名（3-20 位字母数字下划线）" :prefix-icon="User" autocomplete="username" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="密码" :prefix-icon="Lock" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item v-if="tab === 'register'" prop="nickname">
          <el-input v-model="form.nickname" placeholder="昵称（选填）" :prefix-icon="Postcard" />
        </el-form-item>
        <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="submit">
          {{ tab === 'login' ? '登 录' : '注 册' }}
        </el-button>
      </el-form>
      <p v-if="tab === 'login'" class="tip">每个账号的数据相互独立，注册即可使用</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { User, Lock, Postcard } from '@element-plus/icons-vue'
import { api } from '../api'

const router = useRouter()
const tab = ref<'login' | 'register'>('login')
const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({ username: '', password: '', nickname: '' })

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]{3,20}$/, message: '3-20 位字母数字下划线', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '至少 6 位', trigger: 'blur' },
  ],
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    const res = tab.value === 'login'
      ? await api.login(form.username, form.password)
      : await api.register(form.username, form.password, form.nickname)
    localStorage.setItem('kb_token', res.token)
    localStorage.setItem('kb_user', JSON.stringify({ nickname: res.nickname, username: res.username, role: res.role }))
    ElMessage.success(tab.value === 'login' ? '登录成功' : '注册成功')
    router.push('/')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-wrap {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1f3a5f 0%, #2c5f8a 55%, #3a7ca5 100%);
}
.login-box {
  width: 400px;
  padding: 40px 36px 28px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.login-head { text-align: center; margin-bottom: 28px; }
.login-head .logo { font-size: 44px; }
.login-head h1 { font-size: 22px; color: #303133; margin: 8px 0 6px; }
.login-head p { color: #909399; font-size: 13px; }
.tip { margin-top: 16px; text-align: center; color: #c0c4cc; font-size: 12px; }
</style>
