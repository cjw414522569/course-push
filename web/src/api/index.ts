import http from './http'
import type {
  LoginResult, Me, Course, ClassTime, DayView, WeekView,
  PushTask, PushLog, Stats, PushplusSettings, SemesterSettings,
} from '../types'

export const api = {
  login: (username: string, password: string) =>
    http.post<unknown, LoginResult>('/api/auth/login', { username, password }),
  register: (username: string, password: string, nickname?: string) =>
    http.post<unknown, LoginResult>('/api/auth/register', { username, password, nickname }),
  me: () => http.get<unknown, Me>('/api/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    http.put('/api/auth/password', { oldPassword, newPassword }),

  // ---------- API 密钥 ----------
  keys: () => http.get<unknown, ApiKey[]>('/api/keys'),
  createKey: (name: string) => http.post<unknown, { id: number; key: string }>('/api/keys', { name }),
  toggleKey: (id: number) => http.put<unknown, { enabled: boolean }>(`/api/keys/${id}/toggle`, {}),
  deleteKey: (id: number) => http.delete(`/api/keys/${id}`),

  // ---------- 管理员 ----------
  adminUsers: () => http.get<unknown, AdminUser[]>('/api/admin/users'),
  adminUpdateUser: (id: number, patch: { nickname?: string; role?: string; disabled?: boolean }) =>
    http.put(`/api/admin/users/${id}`, patch),
  adminResetPassword: (id: number, newPassword: string) =>
    http.put(`/api/admin/users/${id}/password`, { newPassword }),
  adminDeleteUser: (id: number) => http.delete(`/api/admin/users/${id}`),
  adminGetRegistration: () => http.get<unknown, { enabled: boolean }>('/api/admin/registration'),
  adminSetRegistration: (enabled: boolean) => http.put('/api/admin/registration', { enabled }),

  courses: () => http.get<unknown, Course[]>('/api/courses'),
  createCourse: (c: Partial<Course>) => http.post<unknown, { id: number }>('/api/courses', c),
  updateCourse: (id: number, c: Partial<Course>) => http.put(`/api/courses/${id}`, c),
  deleteCourse: (id: number) => http.delete(`/api/courses/${id}`),

  times: () => http.get<unknown, ClassTime[]>('/api/times'),
  updateTimes: (list: { id?: number; start_time: string; end_time: string; kind: 'big' | 'small' }[]) =>
    http.put<unknown, ClassTime[]>('/api/times', list),

  dayView: (date?: string) => http.get<unknown, DayView>('/api/view/day', { params: { date } }),
  weekView: (date?: string) => http.get<unknown, WeekView>('/api/view/week', { params: { date } }),
  preview: (type: string, template: string) =>
    http.get<unknown, { title: string; content: string }>('/api/preview', { params: { type, template } }),

  tasks: () => http.get<unknown, PushTask[]>('/api/tasks'),
  createTask: (t: Partial<PushTask>) => http.post<unknown, { id: number }>('/api/tasks', t),
  updateTask: (id: number, t: Partial<PushTask>) => http.put(`/api/tasks/${id}`, t),
  toggleTask: (id: number) => http.put<unknown, { enabled: boolean }>(`/api/tasks/${id}/toggle`, {}),
  runTask: (id: number) => http.post(`/api/tasks/${id}/run`, {}),
  deleteTask: (id: number) => http.delete(`/api/tasks/${id}`),

  logs: (page: number, pageSize: number) =>
    http.get<unknown, { total: number; page: number; pageSize: number; list: PushLog[] }>('/api/logs', {
      params: { page, pageSize },
    }),
  clearLogs: () => http.delete('/api/logs'),

  stats: () => http.get<unknown, Stats>('/api/stats'),

  getPushplus: () => http.get<unknown, PushplusSettings>('/api/settings/pushplus'),
  setPushplus: (s: Partial<PushplusSettings> & { token?: string }) => http.put('/api/settings/pushplus', s),
  getSemester: () => http.get<unknown, SemesterSettings>('/api/settings/semester'),
  setSemester: (s: Partial<SemesterSettings>) => http.put('/api/settings/semester', s),
}
