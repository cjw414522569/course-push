// 前端页面 API 覆盖测试：模拟 5 个页面发起的全部请求
const BASE = 'http://localhost:3300'
let pass = 0, failCnt = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { failCnt++; console.log(`  ❌ ${name} ${extra}`) }
}

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

const main = async () => {
  const token = (await api('POST', '/api/auth/login', { username: 'admin', password: 'admin123' })).json.data.token
  const H = (m, p, b) => api(m, p, b, token)

  console.log('== Dashboard ==')
  check('GET /api/stats', (await H('GET', '/api/stats')).json.code === 0)

  console.log('== Schedule ==')
  const mon = '2026-09-07'
  check('GET /api/view/week?date', (await H('GET', `/api/view/week?date=${mon}`)).json.code === 0)
  check('GET /api/times', (await H('GET', '/api/times')).json.data.length === 11)
  const c = (await H('POST', '/api/courses', { name: '前端验证课', weekday: 5, start_period: 6, end_period: 7, weeks: '1-16' })).json.data.id
  check('POST course', c > 0)
  const wv = (await H('GET', `/api/view/week?date=${mon}`)).json.data
  const fri = wv.days[4]
  check('周五视图含新课', fri.courses.some(x => x.id === c), JSON.stringify(fri.courses))
  const friCourse = fri.courses.find(x => x.id === c)
  check('time_range 生成', /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(friCourse?.time_range || ''), friCourse?.time_range)
  check('PUT partial update', (await H('PUT', `/api/courses/${c}`, { note: 'partial' })).json.code === 0)
  check('DELETE course', (await H('DELETE', `/api/courses/${c}`)).json.code === 0)

  console.log('== Tasks ==')
  check('GET /api/tasks', (await H('GET', '/api/tasks')).json.code === 0)
  const t = (await H('POST', '/api/tasks', { name: '前端验证任务', type: 'tomorrow', time: '20:30', days: [2, 4], send_empty: false })).json.data.id
  check('POST task', t > 0)
  check('toggle', (await H('PUT', `/api/tasks/${t}/toggle`, {})).json.data.enabled === false)
  check('run(无token→日志)', (await H('POST', `/api/tasks/${t}/run`, {})).json.code === 0)
  check('DELETE task', (await H('DELETE', `/api/tasks/${t}`)).json.code === 0)

  console.log('== Logs ==')
  check('GET /api/logs', (await H('GET', '/api/logs?page=1&pageSize=20')).json.code === 0)

  console.log('== Settings ==')
  const pp = (await H('GET', '/api/settings/pushplus')).json.data
  check('GET pushplus', typeof pp.has_token === 'boolean')
  check('PUT pushplus(channel)', (await H('PUT', '/api/settings/pushplus', { channel: 'wechat', template: 'markdown', topic: '' })).json.code === 0)
  check('PUT pushplus(空token被拒)', (await H('PUT', '/api/settings/pushplus', { token: '' })).status === 400)
  check('GET semester', (await H('GET', '/api/settings/semester')).json.code === 0)
  check('PUT semester', (await H('PUT', '/api/settings/semester', { semester_start: '2026-09-07', total_weeks: 20 })).json.code === 0)
  // 节次整表保存：原 11 节 + 末尾新增一个大课
  const cur = (await H('GET', '/api/times')).json.data
  const payload = cur.map((t) => ({ id: t.id, start_time: t.start_time, end_time: t.end_time, kind: t.kind }))
  payload.push({ start_time: '21:45', end_time: '22:30', kind: 'big' })
  const savedTimes = (await H('PUT', '/api/times', payload)).json.data
  check('PUT /api/times 新增大课', savedTimes.length === payload.length && savedTimes.at(-1).kind === 'big')
  check('节次序号重排', savedTimes.at(-1).period === savedTimes.length)
  const restored = (await H('PUT', '/api/times', payload.slice(0, -1))).json.data
  check('删除节次(整表保存)', restored.length === payload.length - 1)
  check('GET /api/preview', (await H('GET', '/api/preview?type=today&template=markdown')).json.code === 0)
  check('GET /api/auth/me', (await H('GET', '/api/auth/me')).json.data.username === 'admin')

  console.log(`\n结果: ${pass} 通过, ${failCnt} 失败`)
  process.exit(failCnt > 0 ? 1 : 0)
}

main().catch(e => { console.error('异常:', e); process.exit(1) })
