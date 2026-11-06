import { createRouter, createWebHistory } from 'vue-router'
import { auth } from './lib/auth'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/entrar', component: () => import('./views/Entrar.vue'), meta: { publica: true } },
    { path: '/', component: () => import('./views/Inicio.vue') },
    { path: '/aplicacoes', component: () => import('./views/Aplicacoes.vue') },
    { path: '/aplicacoes/:slug', component: () => import('./views/Detalhe.vue') },
    { path: '/admin', component: () => import('./views/Admin.vue'), meta: { admin: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(to => {
  if (!to.meta.publica && !auth.usuario) return '/entrar'
  if (to.path === '/entrar' && auth.usuario) return '/'
  if (to.meta.admin && auth.usuario?.papel !== 'admin') return '/'
})
