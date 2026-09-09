import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/Login.vue'), meta: { public: true } },
    {
      path: '/',
      component: () => import('./layouts/MainLayout.vue'),
      children: [
        { path: '', name: 'dashboard', component: () => import('./views/Dashboard.vue') },
        { path: 'schedule', name: 'schedule', component: () => import('./views/Schedule.vue') },
        { path: 'tasks', name: 'tasks', component: () => import('./views/Tasks.vue') },
        { path: 'logs', name: 'logs', component: () => import('./views/Logs.vue') },
        { path: 'settings', name: 'settings', component: () => import('./views/Settings.vue') },
        { path: 'admin/users', name: 'adminUsers', component: () => import('./views/AdminUsers.vue'), meta: { admin: true } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const token = localStorage.getItem('kb_token')
  if (!to.meta.public && !token) return { path: '/login' }
  if (to.path === '/login' && token) return { path: '/' }
  if (to.meta.admin) {
    const role = (() => { try { return JSON.parse(localStorage.getItem('kb_user') || '{}').role } catch { return '' } })()
    if (role !== 'admin') return { path: '/' }
  }
  return true
})

export default router
