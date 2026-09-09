// 冒烟测试：登录 → 课程 CRUD → 视图/预览 → 任务管理 → 设置
const BASE = 'http://localhost:3300'

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

let pass = 0, failCnt = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { failCnt++; console.log(`  ❌ ${name} ${extra}`) }
}

const main = async () => {
  console.log('== 1. 登录 ==')
  let r = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin123' })
  check('登录成功', r.status === 200 && r.json?.data?.token, JSON.stringify(r.json))
  const token = r.json.data.token

  console.log('== 2. 错误密码 ==')
  r = await api('POST', '/api/auth/login', { username: 'admin', password: 'wrong' })
  check('401 拒绝', r.status === 401)

  console.log('== 3. 未授权访问 ==')
  r = await api('GET', '/api/courses')
  check('401 拦截', r.status === 401)

  console.log('== 4. 课程 CRUD ==')
  r = await api('POST', '/api/courses', { name: '高等数学', teacher: '张三', location: '教一 101', weekday: 1, start_period: 1, end_period: 2, weeks: '1-16', odd_even: 'all' }, token)
  check('创建 高等数学', r.status === 200 && r.json?.data?.id > 0, JSON.stringify(r.json))
  const id1 = r.json.data.id
  r = await api('POST', '/api/courses', { name: '大学英语', teacher: '李四', location: '外语楼 302', weekday: 3, start_period: 3, end_period: 4, weeks: '1-8', odd_even: 'odd', color: '#67C23A' }, token)
  check('创建 大学英语', r.status === 200 && r.json?.data?.id > 0)
  const id2 = r.json.data.id
  r = await api('POST', '/api/courses', { name: '', weekday: 1, start_period: 1, end_period: 2 }, token)
  check('空课程名被拒', r.status === 400)
  r = await api('POST', '/api/courses', { name: 'X', weekday: 9, start_period: 1, end_period: 2 }, token)
  check('非法星期被拒', r.status === 400)
  r = await api('PUT', `/api/courses/${id1}`, { name: '高等数学(改)', location: '教二 202' }, token)
  check('修改课程', r.status === 200)
  r = await api('GET', '/api/courses', null, token)
  check('列表 2 门', r.json?.data?.length === 2, `got ${r.json?.data?.length}`)
  const updated = r.json.data.find(c => c.id === id1)
  check('修改生效', updated?.name === '高等数学(改)' && updated?.location === '教二 202')

  console.log('== 5. 视图与预览 ==')
  r = await api('GET', '/api/view/day', null, token)
  check('今日视图', r.json?.data?.date && Array.isArray(r.json?.data?.courses))
  r = await api('GET', '/api/view/week', null, token)
  check('周视图 7 天', r.json?.data?.days?.length === 7 && r.json?.data?.week >= 1)
  r = await api('GET', '/api/preview?type=today&template=md', null, token)
  check('今日 md 预览', typeof r.json?.data?.content === 'string')
  r = await api('GET', '/api/preview?type=week&template=html', null, token)
  check('本周 html 预览', typeof r.json?.data?.content === 'string')
  console.log('  --- 今日 md 预览 ---')
  console.log((await api('GET', '/api/preview?type=today&template=md', null, token)).json.data.content)
  console.log('  --- 预览结束 ---')

  console.log('== 6. 任务管理 ==')
  r = await api('GET', '/api/tasks', null, token)
  check('预置 3 个任务', r.json?.data?.length === 3, `got ${r.json?.data?.length}`)
  r = await api('POST', '/api/tasks', { name: '测试任务', type: 'today', time: '08:15', days: [1, 3, 5], send_empty: true }, token)
  check('创建任务', r.status === 200 && r.json?.data?.id > 0, JSON.stringify(r.json))
  const tid = r.json.data.id
  r = await api('POST', '/api/tasks', { name: '坏时间', type: 'today', time: '25:00' }, token)
  check('非法时间被拒', r.status === 400)
  r = await api('GET', '/api/tasks', null, token)
  const t = r.json.data.find(x => x.id === tid)
  check('cron 生成正确', t?.cron_expr === '15 8 * * 1,3,5', t?.cron_expr)
  r = await api('PUT', `/api/tasks/${tid}`, { time: '09:00', days: [] }, token)
  check('修改任务', r.status === 200)
  r = await api('GET', '/api/tasks', null, token)
  check('cron 更新为每天', r.json.data.find(x => x.id === tid)?.cron_expr === '0 9 * * *')
  r = await api('PUT', `/api/tasks/${tid}/toggle`, null, token)
  check('停用任务', r.json?.data?.enabled === false)
  r = await api('PUT', `/api/tasks/${tid}/toggle`, null, token)
  check('重新启用', r.json?.data?.enabled === true)

  console.log('== 7. 设置 ==')
  r = await api('GET', '/api/settings/semester', null, token)
  check('读取学期设置', /^\d{4}-\d{2}-\d{2}$/.test(r.json?.data?.semester_start || ''))
  r = await api('PUT', '/api/settings/semester', { semester_start: '2026-09-07', total_weeks: 20 }, token)
  check('写入学期设置', r.status === 200)
  r = await api('PUT', '/api/settings/pushplus', { channel: 'wechat', template: 'markdown', topic: '' }, token)
  check('写入推送设置(无token)', r.status === 200)
  r = await api('GET', '/api/settings/pushplus', null, token)
  check('未配置 token 时 has_token=false', r.json?.data?.has_token === false)
  r = await api('GET', '/api/times', null, token)
  check('节次列表 11 条', r.json?.data?.length === 11, `got ${r.json?.data?.length}`)
  const timesList = r.json.data
  r = await api('PUT', '/api/times', timesList.map((t) => ({ id: t.id, start_time: t.start_time, end_time: t.end_time, kind: t.kind })), token)
  check('节次整表保存(原样)', r.json?.code === 0 && r.json?.data?.length === 11)

  console.log('== 8. 日志与统计 ==')
  r = await api('POST', `/api/tasks/${tid}/run`, null, token)
  check('手动触发(未配token应记失败日志)', r.status === 200)
  await new Promise(res => setTimeout(res, 500))
  r = await api('GET', '/api/logs', null, token)
  check('推送日志有记录', (r.json?.data?.total || 0) >= 1, JSON.stringify(r.json?.data?.total))
  const lastLog = r.json?.data?.list?.[0]
  check('日志记录"未配置token"错误', lastLog?.error?.includes('token'), lastLog?.error)
  r = await api('GET', '/api/stats', null, token)
  check('统计接口', r.json?.data?.course_total === 2 && r.json?.data?.task_total === 4, JSON.stringify({ c: r.json?.data?.course_total, t: r.json?.data?.task_total }))

  console.log('== 9. 清理 ==')
  r = await api('DELETE', `/api/tasks/${tid}`, null, token)
  check('删除任务', r.status === 200)
  r = await api('DELETE', `/api/courses/${id2}`, null, token)
  check('删除课程', r.status === 200)
  r = await api('DELETE', '/api/logs', null, token)
  check('清空日志', r.status === 200)
  r = await api('PUT', `/api/courses/${id1}`, { name: '高等数学', location: '教一 101' }, token)
  check('恢复课程名', r.status === 200)

  console.log(`\n结果: ${pass} 通过, ${failCnt} 失败`)
  process.exit(failCnt > 0 ? 1 : 0)
}

main().catch(e => { console.error('测试脚本异常:', e); process.exit(1) })
