<template>
  <el-row :gutter="16">
    <!-- pushplus 配置 -->
    <el-col :span="12">
      <div class="page-card" v-loading="loading">
        <div class="page-title">pushplus 推送配置</div>
        <el-alert
          v-if="!pp.has_token"
          title="尚未配置 pushplus token，推送任务将无法发送"
          type="warning"
          :closable="false"
          style="margin-bottom: 16px"
        />
        <el-form label-width="110px">
          <el-form-item label="Token">
            <el-input
              v-model="tokenInput"
              :placeholder="pp.has_token ? `已配置：${pp.token_masked}（输入新值可更换）` : '请输入 pushplus 用户 token'"
              show-password
            />
            <div class="muted">
              获取方式：前往
              <a href="https://www.pushplus.plus/push1.html" target="_blank" rel="noopener">pushplus 推送页</a>
              登录后复制 token（微信扫码登录即自动关注公众号）
            </div>
          </el-form-item>
          <el-form-item label="推送渠道">
            <el-checkbox-group v-model="channelList" class="channel-group">
              <el-checkbox v-for="ch in CHANNELS" :key="ch.value" :value="ch.value" :disabled="ch.paid">
                {{ ch.label }}
                <el-tag v-if="ch.paid" size="small" type="danger" style="margin-left: 2px">收费</el-tag>
              </el-checkbox>
            </el-checkbox-group>
            <div class="muted">
              可多选同时推送；APP / 插件 / webhook / ClawBot / QQ机器人 等渠道需先前往
              <a href="https://www.pushplus.plus/uc-channel.html" target="_blank" rel="noopener">pushplus 渠道设置页</a>
              绑定，webhook 渠道还需在 pushplus 后台配置对应机器人编码
            </div>
          </el-form-item>
          <el-form-item label="推送形式">
            <el-select v-model="pp.template" style="width: 200px">
              <el-option value="markdown" label="文字（markdown）" />
              <el-option value="html" label="表格（富文本）" />
            </el-select>
            <div class="muted">对所有课表推送任务生效：文字为列表排版，表格为课表网格排版</div>
          </el-form-item>
          <el-form-item label="群组编码">
            <el-input v-model="pp.topic" placeholder="选填，多人订阅时填写（topic 推送）" style="width: 300px" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
          </el-form-item>
        </el-form>

        <el-divider />

        <div class="page-title">测试推送</div>
        <div class="muted" style="margin-bottom: 12px">
          保存配置后，到「推送任务」页对任意任务点「立即执行」即可测试全链路，发送结果见「推送日志」。
        </div>
      </div>
    </el-col>

    <!-- API 密钥 -->
    <el-col :span="12">
      <div class="page-card">
        <div class="page-title">API 密钥</div>
        <el-alert
          type="info"
          :closable="false"
          style="margin-bottom: 12px"
        >
          <template #title>
            用于 PC 桌面课程表等第三方程序调用本平台 API。请求时携带
            <code>X-API-Key: kb_xxx</code> 头或 <code>Authorization: Bearer kb_xxx</code> 即可以你的身份访问。
          </template>
        </el-alert>

        <div class="keys-toolbar">
          <el-input v-model="newKeyName" placeholder="密钥名称（如：桌面端课程程序）" maxlength="30" style="width: 260px" />
          <el-button type="primary" :loading="creatingKey" @click="createKey">创建密钥</el-button>
        </div>

        <el-table :data="keys" size="small">
          <el-table-column prop="name" label="名称" min-width="120" />
          <el-table-column label="密钥" width="120">
            <template #default="{ row }"><code class="mono">{{ row.key_prefix }}…</code></template>
          </el-table-column>
          <el-table-column label="状态" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="最近使用" width="150">
            <template #default="{ row }">
              <span class="muted">{{ row.last_used_at ? row.last_used_at.slice(0, 16).replace('T', ' ') : '从未使用' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130" align="center">
            <template #default="{ row }">
              <el-button size="small" @click="toggleKey(row)">{{ row.enabled ? '停用' : '启用' }}</el-button>
              <el-button size="small" type="danger" plain @click="removeKey(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-divider />
        <div class="page-title" style="font-size: 14px">API 调用示例</div>
        <pre class="api-example">curl http://localhost:3300/api/view/day \
  -H "X-API-Key: kb_你的密钥"

curl http://localhost:3300/api/courses \
  -H "Authorization: Bearer kb_你的密钥"</pre>
      </div>
    </el-col>
  </el-row>

  <!-- 密钥明文弹窗（仅创建时可见一次） -->
  <el-dialog v-model="keyVisible" title="密钥创建成功" width="520px" :close-on-click-modal="false">
    <el-alert type="warning" :closable="false" style="margin-bottom: 12px" title="请立即复制保存，此明文仅显示这一次" />
    <el-input :model-value="newKeyPlain" readonly type="textarea" :rows="2" />
    <template #footer>
      <el-button type="primary" @click="copyKey">复制密钥</el-button>
      <el-button @click="keyVisible = false">我已保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import type { PushplusSettings, ApiKey } from '../types'

// ---------- pushplus ----------
const loading = ref(true)
const saving = ref(false)
const pp = ref<PushplusSettings>({ token_masked: '', has_token: false, channel: 'wechat', topic: '', template: 'markdown' })
const tokenInput = ref('')

/** pushplus 官方渠道（编码来自官方文档）；sms/voice 为收费渠道 */
const CHANNELS: { value: string; label: string; paid?: boolean }[] = [
  { value: 'wechat', label: '微信公众号' },
  { value: 'app', label: 'APP' },
  { value: 'extension', label: '插件' },
  { value: 'webhook', label: 'Webhook（钉钉/飞书等）' },
  { value: 'clawbot', label: '微信 ClawBot' },
  { value: 'qq', label: 'QQ 机器人' },
  { value: 'cp', label: '企业微信' },
  { value: 'mail', label: '邮件' },
  { value: 'sms', label: '短信', paid: true },
  { value: 'voice', label: '语音', paid: true },
]

/** 渠道多选值 ↔ 后端逗号分隔字符串 */
const channelList = computed({
  get: () => (pp.value.channel ? pp.value.channel.split(',').filter(Boolean) : []),
  set: (v: string[]) => { pp.value.channel = v.length ? v.join(',') : 'wechat' },
})

async function load() {
  loading.value = true
  try { pp.value = await api.getPushplus() } finally { loading.value = false }
}

async function save() {
  saving.value = true
  try {
    const payload: Record<string, unknown> = {
      channel: pp.value.channel,
      template: pp.value.template,
      topic: pp.value.topic,
    }
    if (tokenInput.value.trim()) payload.token = tokenInput.value.trim()
    await api.setPushplus(payload)
    ElMessage.success('已保存')
    tokenInput.value = ''
    load()
  } finally {
    saving.value = false
  }
}

// ---------- API 密钥 ----------
const keys = ref<ApiKey[]>([])
const newKeyName = ref('')
const creatingKey = ref(false)
const keyVisible = ref(false)
const newKeyPlain = ref('')

async function loadKeys() {
  keys.value = await api.keys()
}

async function createKey() {
  creatingKey.value = true
  try {
    const res = await api.createKey(newKeyName.value.trim())
    newKeyPlain.value = res.key
    keyVisible.value = true
    newKeyName.value = ''
    loadKeys()
  } finally {
    creatingKey.value = false
  }
}

async function copyKey() {
  try {
    await navigator.clipboard.writeText(newKeyPlain.value)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.warning('复制失败，请手动选择复制')
  }
}

async function toggleKey(row: ApiKey) {
  const res = await api.toggleKey(row.id)
  row.enabled = res.enabled
  ElMessage.success(res.enabled ? '已启用' : '已停用')
}

async function removeKey(row: ApiKey) {
  await ElMessageBox.confirm(`确定删除密钥「${row.name}」？使用该密钥的程序将立即失去访问权限。`, '删除确认', { type: 'warning' })
  await api.deleteKey(row.id)
  ElMessage.success('已删除')
  loadKeys()
}

onMounted(() => {
  load()
  loadKeys()
})
</script>

<style scoped>
.mono { font-size: 12px; }
.keys-toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.api-example {
  background: #f4f4f5;
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  color: #303133;
  overflow-x: auto;
  white-space: pre;
}
.channel-group { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
.channel-group :deep(.el-checkbox) { margin-right: 0; }
a { color: #409eff; text-decoration: none; }
a:hover { text-decoration: underline; }
</style>
