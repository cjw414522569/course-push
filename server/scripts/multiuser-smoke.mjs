// 多用户隔离 + API 密钥专项测试
const BASE = 'http://localhost:3300'
let pass = 0, failCnt = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { failCnt++; console.log(`  ❌ ${name} ${extra}`) }
}

async function api(method, path, body, token, apiKey) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

const main = async () => {
  console.log('== 注册两个用户 ==')
  const a = (await api('POST', '/api/auth/register', { username: 'alice', password: 'alice123', nickname: '爱丽丝' })).json
  const b = (await api('POST', '/api/auth/register', { username: 'bob', password: 'bob12345' })).json
  check('alice 注册', !!a.data?.token, JSON.stringify(a))
  check('bob 注册', !!b.data?.token)
  check('重名注册被拒', (await api('POST', '/api/auth/register', { username: 'alice', password: 'xxxxxx' })).status === 409)
  const ta = a.data.token, tb = b.data.token

  console.log('== 数据隔离：各自加课互不可见 ==')
  await api('POST', '/api/courses', { name: 'Alice的课', weekday: 1, start_period: 1, end_period: 2 }, ta)
  await api('POST', '/api/courses', { name: 'Bob的课', weekday: 2, start_period: 3, end_period: 4 }, tb)
  const la = (await api('GET', '/api/courses', null, ta)).json.data
  const lb = (await api('GET', '/api/courses', null, tb)).json.data
  check('alice 只看到 1 门', la.length === 1 && la[0].name === 'Alice的课', JSON.stringify(la.map(c => c.name)))
  check('bob 只看到 1 门', lb.length === 1 && lb[0].name === 'Bob的课', JSON.stringify(lb.map(c => c.name)))

  console.log('== 越权访问被拦 ==')
  const aCourseId = la[0].id
  check('bob 改 alice 的课 → 404', (await api('PUT', `/api/courses/${aCourseId}`, { name: '偷改' }, tb)).status === 404)
  check('bob 删 alice 的课 → 404', (await api('DELETE', `/api/courses/${aCourseId}`, null, tb)).status === 404)
  check('bob 看 alice 日志为空', (await api('GET', '/api/logs', null, tb)).json.data.total === 0)

  console.log('== 用户设置隔离 ==')
  await api('PUT', '/api/settings/semester', { semester_start: '2026-03-02' }, ta)
  const sa = (await api('GET', '/api/settings/semester', null, ta)).json.data
  const sb = (await api('GET', '/api/settings/semester', null, tb)).json.data
  check('alice 学期设置独立', sa.semester_start === '2026-03-02')
  check('bob 学期设置不受影响', sa.semester_start !== sb.semester_start)

  console.log('== API 密钥 ==')
  const keyA = (await api('POST', '/api/keys', { name: '桌面端' }, ta)).json.data
  check('创建密钥返回明文', /^kb_[0-9a-f]{40}$/.test(keyA.key), keyA.key)
  check('密钥列表不回明文', !JSON.stringify((await api('GET', '/api/keys', null, ta)).json.data).includes(keyA.key))
  check('X-API-Key 访问课程', (await api('GET', '/api/courses', null, null, keyA.key)).json.data.length === 1)
  check('Bearer kb_ 访问视图', (await api('GET', '/api/view/day', null, null, null)).status === 401)
  const viewDay = await fetch(BASE + '/api/view/day', { headers: { Authorization: `Bearer ${keyA.key}` } })
  check('Bearer kb_ 通道', viewDay.status === 200)
  check('无效密钥被拒', (await api('GET', '/api/courses', null, null, 'kb_deadbeef')).status === 401)
  check('密钥身份 = alice', (await api('GET', '/api/view/day', null, null, keyA.key)).json.data.courses.length === 0)

  console.log('== 密钥管理 ==')
  const kid = keyA.id
  check('停用密钥', (await api('PUT', `/api/keys/${kid}/toggle`, {}, ta)).json.data.enabled === false)
  check('停用后 API 访问被拒', (await api('GET', '/api/courses', null, null, keyA.key)).status === 401)
  check('重新启用', (await api('PUT', `/api/keys/${kid}/toggle`, {}, ta)).json.data.enabled === true)
  check('启用后恢复', (await api('GET', '/api/courses', null, null, keyA.key)).status === 200)
  check('bob 不能动 alice 的密钥', (await api('DELETE', `/api/keys/${kid}`, null, tb)).status === 200 && (await api('GET', '/api/courses', null, null, keyA.key)).status === 200)
  await api('POST', '/api/keys', { name: '第二把' }, ta)
  check('alice 有 2 把密钥', (await api('GET', '/api/keys', null, ta)).json.data.length === 2)
  check('删除密钥', (await api('DELETE', `/api/keys/${kid}`, null, ta)).status === 200)
  check('删除后失效', (await api('GET', '/api/courses', null, null, keyA.key)).status === 401)

  console.log('== 任务隔离 ==')
  const tA = (await api('POST', '/api/tasks', { name: 'Alice任务', type: 'today', time: '08:00' }, ta)).json.data.id
  const tB = (await api('POST', '/api/tasks', { name: 'Bob任务', type: 'today', time: '09:00' }, tb)).json.data.id
  check('alice 任务列表只有自己的', (await api('GET', '/api/tasks', null, ta)).json.data.every(x => x.name !== 'Bob任务'))
  check('bob 执行 alice 的任务 → 404', (await api('POST', `/api/tasks/${tA}/run`, {}, tb)).status === 404)
  await api('DELETE', `/api/tasks/${tA}`, null, ta)
  await api('DELETE', `/api/tasks/${tB}`, null, tb)

  console.log(`\n结果: ${pass} 通过, ${failCnt} 失败`)
  process.exit(failCnt > 0 ? 1 : 0)
}

main().catch(e => { console.error('异常:', e); process.exit(1) })
