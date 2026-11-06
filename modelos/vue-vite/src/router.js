import { createRouter, createWebHistory } from 'vue-router'
import { auth } from './lib/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/entrar', component: () => import('./views/Entrar.vue'), meta: { publica: true } },
    { path: '/', component: () => import('./views/Inicio.vue') },
  ],
})

router.beforeEach((to) => {
  if (!to.meta.publica && !auth.usuario) return '/entrar'
  if (to.path === '/entrar' && auth.usuario) return '/'
})

export default router
