import axios from 'axios'
import { ElMessage } from 'element-plus'

const http = axios.create({ baseURL: '', timeout: 15000 })

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('kb_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (res) => {
    const body = res.data
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code !== 0) {
        ElMessage.error(body.message || '请求失败')
        return Promise.reject(new Error(body.message))
      }
      return body.data
    }
    return body
  },
  (err) => {
    const status = err.response?.status
    const msg = err.response?.data?.message || err.message
    if (status === 401) {
      localStorage.removeItem('kb_token')
      localStorage.removeItem('kb_user')
      if (!location.pathname.startsWith('/login')) location.href = '/login'
    }
    ElMessage.error(msg || '网络错误')
    return Promise.reject(err)
  },
)

export default http
