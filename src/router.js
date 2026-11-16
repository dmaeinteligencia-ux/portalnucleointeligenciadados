import { createRouter, createWebHistory } from 'vue-router'
import { auth } from './lib/auth'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/entrar', component: () => import('./views/Entrar.vue'), meta: { publica: true } },
    { path: '/', component: () => import('./views/Inicio.vue') },
    { path: '/aplicacoes', component: () => import('./views/Aplicacoes.vue') },
    { path: '/aplicacoes/:slug', component: () => import('./views/Detalhe.vue') },
    { path: '/aplicacoes/:slug/usar', component: () => import('./views/Embutida.vue') },
    { path: '/apresentacao', component: () => import('./views/Apresentacao.vue') },
    { path: '/saude', component: () => import('./views/Saude.vue'), meta: { admin: true } },
    { path: '/admin', component: () => import('./views/Admin.vue'), meta: { admin: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// Perfil "Apresentação" (conta da TV): só a tela de apresentação, nenhuma outra
const soApresentacao = () => auth.usuario?.papel === 'apresentacao'

router.beforeEach(to => {
  if (!to.meta.publica && !auth.usuario) return '/entrar'
  if (to.path === '/entrar' && auth.usuario) return soApresentacao() ? '/apresentacao' : '/'
  if (soApresentacao() && to.path !== '/apresentacao') return '/apresentacao'
  if (to.meta.admin && auth.usuario?.papel !== 'admin') return '/'
})
