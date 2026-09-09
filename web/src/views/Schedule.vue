<template>
  <div v-loading="loading">
    <div class="page-card">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-button :icon="ArrowLeft" @click="shiftWeek(-1)" />
          <el-date-picker v-model="anchorDate" type="date" :clearable="false" format="YYYY-MM-DD" style="width: 150px" @change="load" />
          <el-button :icon="ArrowRight" @click="shiftWeek(1)" />
          <el-button @click="goToday">今天</el-button>
          <el-tag type="primary" effect="plain" class="ml12">第 {{ weekView?.week }} 学周</el-tag>
        </div>
        <div class="toolbar-right">
          <el-button :icon="Setting" @click="openConfig">学期 / 节次</el-button>
          <el-button type="primary" :icon="Plus" @click="openEdit()">添加课程</el-button>
        </div>
      </div>

      <div class="grid-wrap">
        <table class="grid">
          <thead>
            <tr>
              <th class="col-seg">时段</th>
              <th class="col-time">节次</th>
              <th v-for="d in weekView?.days || []" :key="d.date" :class="{ today: d.date === todayStr }">
                <div>星期{{ d.weekdayCn }}</div>
                <div class="th-date">{{ d.date.slice(5) }}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(row, ri) in gridRows" :key="row.key">
              <tr v-if="boundaryBefore(row)" :class="boundaryBefore(row) === 'noon' ? 'noon-row' : 'evening-row'">
                <td class="col-seg seg-cell" :rowspan="segSpanFrom(row)">
                  <span class="seg-text">{{ segLabel(boundaryBefore(row)) }}</span>
                </td>
                <td class="col-time divider-cell">{{ boundaryBefore(row) === 'noon' ? '午休' : '晚上' }}</td>
                <td :colspan="7" class="divider-cell">{{ boundaryText(boundaryBefore(row)) }}</td>
              </tr>
              <tr :class="{ bigRow: row.kind === 'big' }">
              <td v-if="ri === 0 && !boundaryBefore(row)" class="col-seg seg-cell" :rowspan="segSpanFrom(row)">
                <span class="seg-text">上午</span>
              </td>
              <td class="col-time" :class="{ bigTime: row.kind === 'big' }">
                <div class="period-num">{{ row.label }}</div>
                <div class="period-time">{{ row.timeText }}</div>
              </td>
              <td
                v-for="d in weekView?.days || []"
                :key="d.date"
                class="cell"
                :class="{ bigCell: row.kind === 'big', dragOver: dragOverCell?.weekday === d.weekday && dragOverCell?.rowKey === row.key }"
                @click="onCellClick(d, row)"
                @contextmenu.prevent.stop="onCellCtx(d, row, $event)"
                @dragover.prevent="onDragOver(d, row)"
                @dragleave="onDragLeave(d, row)"
                @drop.prevent="onDrop(d, row)"
              >
                <div
                  v-for="c in cellCourses(d, row)"
                  :key="c.id"
                  class="course-block"
                  :class="{ dragging: dragCourse?.id === c.id }"
                  :style="courseStyle(c)"
                  draggable="true"
                  @dragstart="onDragStart(c, $event)"
                  @dragend="onDragEnd"
                  @click.stop="openEdit(c)"
                  @contextmenu.prevent.stop="onCourseCtx(c, d, row, $event)"
                >
                  <div class="cb-name">{{ c.name }}</div>
                  <div class="cb-info">{{ c.location }}</div>
                  <div v-if="c.start_period !== c.end_period" class="cb-info">{{ periodText(c) }}</div>
                  <div class="cb-weeks">{{ weeksText(c) }}</div>
                </div>
              </td>
            </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 课程编辑对话框 -->
    <el-dialog v-model="editVisible" :title="form.id ? '编辑课程' : '添加课程'" width="780px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="课程名称" prop="name">
          <el-input v-model="form.name" placeholder="如：高等数学" maxlength="30" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="教师">
              <el-input v-model="form.teacher" maxlength="20" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="地点">
              <el-input v-model="form.location" maxlength="30" placeholder="如：教一 101" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="星期" prop="weekday">
              <el-select v-model="form.weekday">
                <el-option v-for="i in 7" :key="i" :value="i" :label="'星期' + '一二三四五六日'[i - 1]" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="开始节" prop="start_period">
              <el-select v-model="form.start_period" @change="onCourseStartChange">
                <el-option v-for="r in gridRows" :key="r.key" :value="r.firstSeq" :label="rowOptionLabel(r)" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="结束节" prop="end_period">
              <el-select v-model="form.end_period">
                <el-option
                  v-for="r in gridRows"
                  :key="r.key"
                  :value="r.value"
                  :label="rowOptionLabel(r)"
                  :disabled="r.value < (form.start_period ?? 0)"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="周次">
              <el-input v-model="form.weeks" placeholder="如 1-16 或 1-8,10-16，留空=每周" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单双周">
              <el-select v-model="form.odd_even">
                <el-option value="all" label="每周" />
                <el-option value="odd" label="单周" />
                <el-option value="even" label="双周" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="form.note" maxlength="50" placeholder="选填" />
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="form.color" :predefine="predefineColors" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="form.id" type="danger" plain @click="remove">删除</el-button>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 学期 / 节次配置对话框 -->
    <el-dialog v-model="configVisible" title="学期 / 节次设置" width="640px" destroy-on-close>
      <el-divider content-position="left">学期</el-divider>
      <el-form inline label-width="90px">
        <el-form-item label="学期开始">
          <el-date-picker v-model="semStart" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width: 150px" />
        </el-form-item>
        <el-form-item label="总周数">
          <el-input-number v-model="totalWeeks" :min="1" :max="30" />
        </el-form-item>
        <el-form-item label="午休时间">
          <el-time-picker v-model="noonStart" format="HH:mm" :clearable="false" style="width: 100px" />
          <span class="muted" style="margin: 0 4px">~</span>
          <el-time-picker v-model="noonEnd" format="HH:mm" :clearable="false" style="width: 100px" />
        </el-form-item>
        <el-form-item label="晚间起始">
          <el-time-picker v-model="eveningStart" format="HH:mm" :clearable="false" style="width: 100px" />
        </el-form-item>
      </el-form>
      <div class="muted" style="margin: -14px 0 0 90px">该日所在周为第 1 周；课表中将显示午休与晚间的分界行</div>

      <el-divider content-position="left">节次时间表</el-divider>
      <el-alert
        title="修改任意一节的时间，其后所有节次会自动顺延相同偏移（保持课间间隔不变）"
        type="info"
        :closable="false"
        style="margin-bottom: 12px"
      />
      <div class="times-box" v-loading="savingTimes">
        <div v-for="(t, i) in timeRows" :key="t.key" class="time-row">
          <span class="time-label">第 {{ i + 1 }} 节</span>
          <el-tag v-if="absorbedByPrev.has(i)" size="small" type="warning">大课第 2 节</el-tag>
          <el-radio-group v-else v-model="t.kind" size="small">
            <el-radio-button value="small">小课</el-radio-button>
            <el-radio-button value="big">大课(2节)</el-radio-button>
          </el-radio-group>
          <el-time-picker v-model="t._start" format="HH:mm" :clearable="false" style="width: 105px" placeholder="开始" @focus="onStartFocus(i)" @change="onStartChange(i)" />
          <span class="muted">~</span>
          <el-time-picker v-model="t._end" format="HH:mm" :clearable="false" style="width: 105px" placeholder="结束" @focus="onEndFocus(i)" @change="onEndChange(i)" />
          <el-button :icon="ArrowUp" size="small" circle :disabled="i === 0" @click="moveRow(i, -1)" />
          <el-button :icon="ArrowDown" size="small" circle :disabled="i === timeRows.length - 1" @click="moveRow(i, 1)" />
          <el-button :icon="Delete" size="small" circle type="danger" plain @click="removeRow(i)" />
        </div>
        <div class="time-actions">
          <el-button type="primary" plain :icon="Plus" size="small" @click="addRow('small')">添加小课</el-button>
          <el-button type="warning" plain :icon="Plus" size="small" @click="addRow('big')">添加大课</el-button>
          <el-tag v-if="lastRowBig" size="small" type="danger">最后一节是大课，还缺少第 2 节</el-tag>
        </div>
      </div>

      <template #footer>
        <el-button @click="configVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingConfig" @click="saveConfig">保存全部</el-button>
      </template>
    </el-dialog>

    <!-- 课程右键菜单 -->
    <ContextMenu ref="ctxRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, Plus, Setting, ArrowUp, ArrowDown, Delete } from '@element-plus/icons-vue'
import { api } from '../api'
import ContextMenu from '../components/ContextMenu.vue'
import type { ClassTime, Course, CourseView, WeekView } from '../types'

const loading = ref(true)
const saving = ref(false)
const weekView = ref<WeekView | null>(null)
const times = ref<ClassTime[]>([])
const anchorDate = ref(localDateStr())
const todayStr = localDateStr()

/** 本地时区的 YYYY-MM-DD（toISOString 返回 UTC，东八区 0-8 点会差一天） */
function localDateStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---------- 网格行模型：大课占一行（双倍高、两节序号），小课每节一行 ----------
interface GridRow {
  key: string
  kind: 'big' | 'small'
  /** class_times 下标 */
  index: number
  /** 该行覆盖的全局节次序号（大课=两节，小课=一节） */
  firstSeq: number
  secondSeq: number
  label: string
  timeText: string
  endTimeText: string
  /** 开始/结束节选择器的值（该行末节序号） */
  value: number
}

const gridRows = computed<GridRow[]>(() => {
  const rows: GridRow[] = []
  let seq = 0
  times.value.forEach((t, i) => {
    const next = times.value[i + 1]
    if (t.kind === 'big') {
      seq += 2
      rows.push({
        key: `r${t.id ?? 'i' + i}`, kind: 'big', index: i,
        firstSeq: seq - 1, secondSeq: seq,
        label: `${seq - 1}-${seq}`,
        timeText: `${t.start_time}-${next?.end_time || t.end_time}`,
        endTimeText: next?.end_time || t.end_time,
        value: seq,
      })
    } else {
      seq += 1
      rows.push({
        key: `r${t.id ?? 'i' + i}`, kind: 'small', index: i,
        firstSeq: seq, secondSeq: seq,
        label: `${seq}`,
        timeText: `${t.start_time}-${t.end_time}`, endTimeText: t.end_time,
        value: seq,
      })
    }
  })
  return rows
})

/** 配置对话框行标签：第 N 行 */
function rowLabel(i: number): string {
  return `第 ${i + 1} 行`
}

// ---------- 课表分界线（午休 / 晚上） ----------
const noonStart = ref<Date>(toDate('12:00'))
const noonEnd = ref<Date>(toDate('14:00'))
const eveningStart = ref<Date>(toDate('18:00'))

function minutesOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** 该行前应插入的分界类型：null 无 / 'noon' 午休 / 'evening' 晚上。
 *  取该行与上一行之间的空档与分界时间的交集：午休看「上一行结束 ≤ noon_end 且该行开始 ≥ noon_end」，
 *  晚间看「该行开始 ≥ evening_start」。每类最多插一次，按行序先到先得。 */
function boundaryBefore(row: GridRow): 'noon' | 'evening' | null {
  const rows = gridRows.value
  const idx = rows.indexOf(row)
  if (idx === 0) return null
  const rowStart = minutesOf(toDate(row.timeText.split('-')[0]))
  const prevEndStr = rows[idx - 1].timeText.split('-')[1]
  const prevEnd = minutesOf(toDate(prevEndStr))
  // 午休：上一行在午休结束前结束，且该行从午休结束后的时间开始（空档覆盖 noon_end）
  const noonOk = prevEnd <= minutesOf(noonEnd.value) && rowStart >= minutesOf(noonEnd.value)
  const eveningOk = rowStart >= minutesOf(eveningStart.value)
  if (noonOk && !rows.slice(0, idx).some((r) => boundaryBefore(r) === 'noon')) return 'noon'
  if (eveningOk && !rows.slice(0, idx).some((r) => boundaryBefore(r) === 'evening')) return 'evening'
  return null
}

function boundaryText(kind: 'noon' | 'evening'): string {
  return kind === 'noon'
    ? `午休 ${toHHmm(noonStart.value)} ~ ${toHHmm(noonEnd.value)}`
    : `晚间课程 ${toHHmm(eveningStart.value)} 起`
}

// ---------- 时段列（上午 / 下午 / 晚上） ----------
/** 从 row 开始（含其分界行）到下一分界之前的总行高，供时段格 rowspan 使用。
 *  row 必须是时段起点：带分界线的行，或表首行。 */
function segSpanFrom(row: GridRow): number {
  const rows = gridRows.value
  const idx = rows.indexOf(row)
  let span = boundaryBefore(row) ? 1 : 0 // 分界行自身
  for (let i = idx; i < rows.length; i++) {
    if (i > idx && boundaryBefore(rows[i])) break
    span++
  }
  return Math.max(span, 1)
}

function segLabel(kind: 'noon' | 'evening'): string {
  return kind === 'noon' ? '下午' : '晚上'
}

// ---------- 单元格课程匹配 ----------
/** 课程统一渲染在其「开始节」所在行：小课行=该节开始的课；大课行=开始节落在大课两节内的课。
 *  跨节课（如 1-2 节）显示在第 1 节行，块内标注节次跨度。 */
function cellCourses(d: { courses: CourseView[] }, row: GridRow): CourseView[] {
  return d.courses.filter((c) => c.start_period >= row.firstSeq && c.start_period <= row.secondSeq)
}

// ---------- 右键菜单：复制 / 剪切 / 粘贴 ----------
const ctxRef = ref<InstanceType<typeof ContextMenu>>()
/** 剪贴板：copied=true 为复制(原课保留)，false 为剪切(原课待移动) */
const clipboard = ref<{ course: CourseView; copied: boolean } | null>(null)

function onCourseCtx(c: CourseView, d: { weekday: number }, row: GridRow, e: MouseEvent): void {
  ctxRef.value?.open(
    e,
    [
      { cmd: 'copy', label: '复制' },
      { cmd: 'cut', label: '剪切' },
      { cmd: 'paste', label: '粘贴', disabled: !clipboard.value },
      { cmd: 'delete', label: '删除' },
    ],
    (cmd) => handleCtx(cmd, c, d, row),
  )
}

async function handleCtx(cmd: string, c: CourseView, d: { weekday: number }, row: GridRow): Promise<void> {
  switch (cmd) {
    case 'copy':
      clipboard.value = { course: c, copied: true }
      ElMessage.success(`已复制「${c.name}」，点击空白格或右键空白格粘贴`)
      break
    case 'cut':
      clipboard.value = { course: c, copied: false }
      ElMessage.success(`已剪切「${c.name}」，点击空白格或右键空白格粘贴`)
      break
    case 'delete':
      await ElMessageBox.confirm(`确定删除课程「${c.name}」（星期${'一二三四五六日'[d.weekday - 1]} 第${c.start_period}-${c.end_period}节）？`, '删除确认', { type: 'warning' })
      await api.deleteCourse(c.id)
      // 剪贴板若是这门课的剪切引用，一并失效
      if (clipboard.value && !clipboard.value.copied && clipboard.value.course.id === c.id) clipboard.value = null
      ElMessage.success(`已删除「${c.name}」`)
      load()
      break
    case 'paste': {
      const src = clipboard.value
      if (!src) return
      await pasteTo(d.weekday, row, src)
      break
    }
  }
}

/** 把剪贴板课程放到目标格；冲突时 409 由拦截器提示 */
// ---------- 空白格：点击新增 / 右键粘贴 ----------
function onCellClick(d: { weekday: number; courses: CourseView[] }, row: GridRow): void {
  // 该行已有课（占此行）则不触发新增，避免误触
  const occupied = d.courses.some((c) => c.start_period >= row.firstSeq && c.start_period <= row.secondSeq)
  if (occupied) return
  form.value = {
    ...emptyForm(),
    weekday: d.weekday,
    start_period: row.firstSeq,
    end_period: row.secondSeq,
  }
  editVisible.value = true
}

function onCellCtx(d: { weekday: number; courses: CourseView[] }, row: GridRow, e: MouseEvent): void {
  // 有课的格子由课程块处理菜单；空白格子提供添加/粘贴入口
  const occupied = d.courses.some((c) => c.start_period >= row.firstSeq && c.start_period <= row.secondSeq)
  if (occupied) return
  const items: { cmd: string; label: string }[] = [{ cmd: 'add', label: '添加课程' }]
  if (clipboard.value) items.push({ cmd: 'paste', label: `粘贴「${clipboard.value.course.name}」` })
  ctxRef.value?.open(e, items, (cmd) => {
    if (cmd === 'add') onCellClick(d, row)
    else if (cmd === 'paste' && clipboard.value) pasteTo(d.weekday, row, clipboard.value)
  })
}

async function pasteTo(weekday: number, row: GridRow, src: { course: CourseView; copied: boolean }): Promise<void> {
  if (src.copied) {
    await api.createCourse({
      name: src.course.name,
      teacher: src.course.teacher,
      location: src.course.location,
      weekday,
      start_period: row.firstSeq,
      end_period: row.secondSeq,
      weeks: src.course.weeks,
      odd_even: src.course.odd_even,
      color: src.course.color,
      note: src.course.note,
    })
    ElMessage.success(`已粘贴「${src.course.name}」`)
  } else {
    await api.updateCourse(src.course.id, {
      weekday,
      start_period: row.firstSeq,
      end_period: row.secondSeq,
    })
    ElMessage.success(`已移动「${src.course.name}」`)
    clipboard.value = null
  }
  load()
}

// ---------- 拖拽移动 ----------
const dragCourse = ref<CourseView | null>(null)
const dragOverCell = ref<{ weekday: number; rowKey: string } | null>(null)

function onDragStart(c: CourseView, e: DragEvent): void {
  dragCourse.value = c
  e.dataTransfer?.setData('text/plain', String(c.id))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragEnd(): void {
  dragCourse.value = null
  dragOverCell.value = null
}

function onDragOver(d: { weekday: number }, row: GridRow): void {
  if (!dragCourse.value) return
  dragOverCell.value = { weekday: d.weekday, rowKey: row.key }
}

function onDragLeave(d: { weekday: number }, row: GridRow): void {
  if (dragOverCell.value?.weekday === d.weekday && dragOverCell.value?.rowKey === row.key) dragOverCell.value = null
}

async function onDrop(d: { weekday: number; date: string }, row: GridRow): Promise<void> {
  const c = dragCourse.value
  dragCourse.value = null
  dragOverCell.value = null
  if (!c) return
  if (c.weekday === d.weekday && c.start_period >= row.firstSeq && c.start_period <= row.secondSeq) return // 原位
  try {
    await api.updateCourse(c.id, { weekday: d.weekday, start_period: row.firstSeq, end_period: row.secondSeq })
    ElMessage.success(`「${c.name}」已移动到 星期${'一二三四五六日'[d.weekday - 1]} 第${row.label}节`)
    load()
  } catch {
    /* 冲突 409 已由拦截器提示 */
  }
}

function periodText(c: CourseView): string {
  return c.start_period === c.end_period ? `第${c.start_period}节` : `第${c.start_period}-${c.end_period}节`
}

function weeksText(c: CourseView): string {
  const oe = c.odd_even === 'odd' ? '单' : c.odd_even === 'even' ? '双' : ''
  return c.weeks ? `${oe}${c.weeks}周` : oe ? `${oe}周` : '全周'
}

function courseStyle(c: CourseView) {
  return { background: c.color + '22', borderColor: c.color, color: darken(c.color) }
}

function darken(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return '#409EFF'
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, ((n >> 16) & 255) - 60)
  const g = Math.max(0, ((n >> 8) & 255) - 60)
  const b = Math.max(0, (n & 255) - 60)
  return `rgb(${r},${g},${b})`
}

function shiftWeek(dir: number) {
  const d = new Date(anchorDate.value + 'T00:00:00')
  d.setDate(d.getDate() + dir * 7)
  anchorDate.value = localDateStr(d)
  load()
}

function goToday() {
  anchorDate.value = todayStr
  load()
}

async function load() {
  loading.value = true
  try {
    const [w, t] = await Promise.all([api.weekView(anchorDate.value), api.times()])
    weekView.value = w
    times.value = t
  } finally {
    loading.value = false
  }
}

// ---------- 课程编辑 ----------
const editVisible = ref(false)
const formRef = ref<FormInstance>()
const emptyForm = (): Partial<Course> => ({
  name: '', teacher: '', location: '', weekday: 1,
  start_period: 1, end_period: 2, weeks: '', odd_even: 'all',
  color: '#409EFF', note: '',
})
const form = ref<Partial<Course>>(emptyForm())

const rules: FormRules = {
  name: [{ required: true, message: '请输入课程名称', trigger: 'blur' }],
  weekday: [{ required: true, message: '必选', trigger: 'change' }],
  start_period: [{ required: true, message: '必选', trigger: 'change' }],
  end_period: [{ required: true, message: '必选', trigger: 'change' }],
}

const predefineColors = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#9c6ce0', '#00b8a9', '#f6416c', '#8d6e63']

function openEdit(c?: CourseView) {
  form.value = c ? { ...c } : { ...emptyForm(), weekday: (new Date().getDay() || 7) }
  editVisible.value = true
}

/** 选择器标签：小课 "3 10:00"；大课 "4-5 14:00" */
function rowOptionLabel(r: GridRow): string {
  return `${r.label} ${r.timeText}`
}

/** 课程编辑：开始节变化——若选中的是大课行，结束节自动 = 该大课第二节（大课默认占两节小课） */
function onCourseStartChange(val: number) {
  const row = gridRows.value.find((r) => r.firstSeq === val)
  if (row) form.value.end_period = row.value
}

async function save() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (form.value.id) await api.updateCourse(form.value.id, form.value)
    else await api.createCourse(form.value)
    ElMessage.success('已保存')
    editVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function remove() {
  await ElMessageBox.confirm(`确定删除课程「${form.value.name}」？`, '删除确认', { type: 'warning' })
  await api.deleteCourse(form.value.id!)
  // 剪贴板若是这门课的剪切引用，一并失效
  if (clipboard.value && !clipboard.value.copied && clipboard.value.course.id === form.value.id) clipboard.value = null
  ElMessage.success('已删除')
  editVisible.value = false
  load()
}

// ---------- 学期 / 节次配置 ----------
const configVisible = ref(false)
const semStart = ref('')
const totalWeeks = ref(20)
const savingTimes = ref(false)
const savingConfig = ref(false)

interface TimeRow {
  key: number
  id?: number
  kind: 'big' | 'small'
  _start: Date
  _end: Date
  /** 修改前快照（级联平移基准），change 后清除 */
  _oldStart?: number
  _oldEnd?: number
}
const timeRows = ref<TimeRow[]>([])
let rowKeySeed = 1

function toDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2000, 0, 1, h, m)
}

function toHHmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function addTimeAfter(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60000)
}

/** 被前一个大课吸收的行下标集合（该行是大课的第 2 节，不可单独编辑） */
const absorbedByPrev = computed(() => {
  const set = new Set<number>()
  timeRows.value.forEach((t, i) => {
    if (t.kind === 'big' && i + 1 < timeRows.value.length) set.add(i + 1)
  })
  return set
})

/** 最后一行是大课但后面没有可吸收的行 → 提示还缺第 2 节 */
const lastRowBig = computed(() => {
  const n = timeRows.value.length
  return n > 0 && timeRows.value[n - 1].kind === 'big' && !absorbedByPrev.has(n)
})

/** 级联平移核心：从第 i 行起，把「本行结束 → 下一行开始」的间隔记住，
 *  然后让 i 之后每行相对前一行保持这个间隔，整体平移 offset 毫秒 */
function shiftAfter(i: number, offset: number): void {
  const rows = timeRows.value
  if (offset === 0) return
  for (let j = i + 1; j < rows.length; j++) {
    rows[j]._start = new Date(rows[j]._start.getTime() + offset)
    rows[j]._end = new Date(rows[j]._end.getTime() + offset)
  }
}

/** 修改第 i 节开始时间：整体平移——本节及之后所有节移动相同偏移（新−旧） */
function onStartChange(i: number): void {
  const rows = timeRows.value
  const cur = rows[i]
  if (!cur || !cur._start) return
  const oldStart = cur._oldStart ?? cur._start.getTime()
  const offset = cur._start.getTime() - oldStart
  cur._oldStart = undefined
  if (offset === 0) return
  shiftAfter(i, offset)
}

/** 记录用户即将修改哪一行的开始时间（el-time-picker 的 change 在值变化后触发，
 *  需要在 focus 时快照旧值） */
function onStartFocus(i: number): void {
  const cur = timeRows.value[i]
  if (cur) cur._oldStart = cur._start.getTime()
}

/** 修改第 i 节结束时间：本节时长变化，之后所有节平移「新结束 − 旧结束」 */
function onEndChange(i: number): void {
  const rows = timeRows.value
  const cur = rows[i]
  if (!cur || !cur._end) return
  const oldEnd = cur._oldEnd ?? cur._end.getTime()
  const offset = cur._end.getTime() - oldEnd
  cur._oldEnd = undefined
  if (offset === 0) return
  shiftAfter(i, offset)
}

/** 同上，结束时间修改前快照旧值 */
function onEndFocus(i: number): void {
  const cur = timeRows.value[i]
  if (cur) cur._oldEnd = cur._end.getTime()
}

/** 添加节次：默认接在最后一节之后（沿用上一个课间间隔） */
function addRow(kind: 'big' | 'small') {
  const rows = timeRows.value
  const last = rows[rows.length - 1]
  let start: Date
  if (last) {
    // 沿用最近的课间间隔（上一行 start 距上上行 end 的间隙），无参照则 10 分钟
    const gap = rows.length >= 2 ? rows[rows.length - 1]._start.getTime() - rows[rows.length - 2]._end.getTime() : 10 * 60000
    start = new Date(last._end.getTime() + Math.max(0, gap))
  } else {
    start = toDate('08:00')
  }
  const duration = kind === 'big' ? 100 : 45
  rows.push({ key: rowKeySeed++, kind, _start: start, _end: addTimeAfter(start, duration) })
}

function removeRow(i: number) {
  timeRows.value.splice(i, 1)
}

function moveRow(i: number, dir: number) {
  const j = i + dir
  if (j < 0 || j >= timeRows.value.length) return
  const rows = [...timeRows.value]
  ;[rows[i], rows[j]] = [rows[j], rows[i]]
  timeRows.value = rows
}

async function openConfig() {
  const sem = await api.getSemester()
  semStart.value = sem.semester_start
  totalWeeks.value = sem.total_weeks
  noonStart.value = toDate(sem.noon_start || '12:00')
  noonEnd.value = toDate(sem.noon_end || '14:00')
  eveningStart.value = toDate(sem.evening_start || '18:00')
  const list = await api.times()
  timeRows.value = list.map((t) => ({ key: rowKeySeed++, id: t.id, kind: t.kind, _start: toDate(t.start_time), _end: toDate(t.end_time) }))
  configVisible.value = true
}

async function saveConfig() {
  if (!semStart.value) return ElMessage.warning('请选择学期开始日')
  if (timeRows.value.length === 0) return ElMessage.warning('至少保留一个节次')
  savingConfig.value = true
  savingTimes.value = true
  try {
    await api.setSemester({
      semester_start: semStart.value,
      total_weeks: totalWeeks.value,
      noon_start: toHHmm(noonStart.value),
      noon_end: toHHmm(noonEnd.value),
      evening_start: toHHmm(eveningStart.value),
    })
    const saved = await api.updateTimes(
      timeRows.value.map((t) => ({ id: t.id, start_time: toHHmm(t._start), end_time: toHHmm(t._end), kind: t.kind })),
    )
    times.value = saved
    ElMessage.success('已保存')
    configVisible.value = false
    load()
  } finally {
    savingConfig.value = false
    savingTimes.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.toolbar-left { display: flex; align-items: center; gap: 8px; }
.ml12 { margin-left: 12px; }
.grid-wrap { overflow-x: auto; }
.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
.grid th, .grid td { border: 1px solid #ebeef5; text-align: center; vertical-align: top; }
.grid thead th { padding: 8px 4px; background: #f5f7fa; font-size: 14px; color: #303133; }
.th-date { font-size: 12px; color: #909399; font-weight: 400; }
thead th.today { background: #ecf5ff; }
.grid th.today .th-date { color: #409EFF; font-weight: 600; }
.col-time { width: 90px; background: #fafafa; }
.col-seg { width: 44px; background: #fafafa; }
.seg-cell {
  background: linear-gradient(180deg, #f5f7fa 0%, #ecf5ff 100%);
  border: 1px solid #ebeef5;
  text-align: center;
  vertical-align: middle;
}
.seg-text {
  writing-mode: vertical-rl;
  letter-spacing: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #5a5e66;
}
.period-num { font-weight: 600; color: #303133; }
.period-time { font-size: 12px; color: #909399; }
.cell { height: 64px; padding: 2px; cursor: pointer; }
.cell:hover { background: #f5f7fa; }
.bigCell { height: 132px; }
.cell.dragOver { background: #ecf5ff; outline: 2px dashed #409eff; outline-offset: -2px; }
.course-block.dragging { opacity: 0.45; }
.noon-row td { padding: 0; }
.divider-cell {
  font-size: 12px;
  padding: 3px 8px !important;
  text-align: center;
}
.noon-row .divider-cell, .noon-cell {
  background: #fdf6ec;
  color: #e6a23c;
  border-top: 2px solid #e6a23c;
  border-bottom: 2px solid #e6a23c;
}
.evening-row td { padding: 0; }
.evening-row .divider-cell {
  background: #f0f9eb;
  color: #67c23a;
  border-top: 2px solid #67c23a;
  border-bottom: 2px solid #67c23a;
}
.course-block {
  border: 1.5px solid;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  height: 100%;
}
.course-block:hover { filter: brightness(0.96); }
.cb-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cb-info, .cb-weeks { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.85; }
.cb-weeks { font-size: 11px; opacity: 0.7; }
.times-box { display: flex; flex-direction: column; gap: 8px; }
.time-row { display: flex; align-items: center; gap: 8px; }
.time-label { width: 60px; font-size: 13px; color: #303133; }
</style>
