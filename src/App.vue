<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { auth, sair } from './lib/auth'
import { modoDemo } from './lib/supabase'
import Relogio from './components/Relogio.vue'
import VozComando from './components/VozComando.vue'
import { saude, carregarSaude } from './lib/saude'

const router = useRouter()
const route = useRoute()
// Aplicações e Painéis usam a mesma tela; o menu marca um ou outro pelo filtro de tipo
const emPaineis = computed(() => route.path === '/aplicacoes' && route.query.tipo === 'painel')
const busca = ref('')
const buscar = () => router.push({ path: '/aplicacoes', query: busca.value ? { q: busca.value } : {} })
const fazerSair = async () => { await sair(); router.push('/entrar') }
// Na conta da TV: sai dela e abre o login já indicando que é para um administrador
const entrarComoAdmin = async () => { await sair(); router.push({ path: '/entrar', query: { admin: '1' } }) }
// Pílula do topo: mostra se o monitoramento achou algum sistema com problema
watch(() => auth.usuario, (u) => { if (u) carregarSaude() }, { immediate: true })
const situacaoGeral = computed(() => {
  const lista = Object.values(saude.porSlug)
  if (lista.some((v) => v.situacao === 'fora')) return { classe: 'alerta', texto: 'SISTEMA FORA DO AR' }
  if (lista.some((v) => v.situacao === 'atencao')) return { classe: 'atencao', texto: 'ATENÇÃO' }
  return { classe: '', texto: 'OPERACIONAL' }
})
const iniciais = n => (n || '?').split(/[ @.]/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('')
</script>

<template>
  <div class="fundo-grade" aria-hidden="true" />
  <!-- Conta da TV (perfil Apresentação): sem menu, sem busca, sem voz; só a tela de apresentação -->
  <div v-if="auth.usuario?.papel === 'apresentacao'" class="moldura-tv">
    <header class="topo topo-tv">
      <span class="marca">
        <span class="marca-icone"><img src="/favicon.svg" alt="" /></span>
        <span><strong>NÚCLEO</strong><small>Inteligência de Dados</small></span>
      </span>
      <Relogio class="topo-relogio" />
      <div class="operador">
        <span class="operador-texto"><strong>{{ auth.usuario.nome || auth.usuario.email }}</strong><small>Apresentação · só exibição</small></span>
        <button class="botao secundario" title="Sai da conta da TV e abre o login para um administrador" @click="entrarComoAdmin">Entrar como administrador</button>
      </div>
    </header>
    <main class="conteudo"><RouterView /></main>
  </div>
  <div v-else-if="auth.usuario" class="moldura">
    <aside class="lateral">
      <RouterLink to="/" class="marca">
        <span class="marca-icone"><img src="/favicon.svg" alt="" /></span>
        <span><strong>NÚCLEO</strong><small>Inteligência de Dados</small></span>
      </RouterLink>
      <nav class="menu">
        <RouterLink to="/" class="item"><span class="ic">◈</span>Central</RouterLink>
        <RouterLink to="/aplicacoes" class="item" :class="{ desmarcado: emPaineis }"><span class="ic">▦</span>Aplicações</RouterLink>
        <RouterLink :to="{ path: '/aplicacoes', query: { tipo: 'painel' } }" class="item" :class="{ desmarcado: !emPaineis }"><span class="ic">◧</span>Painéis</RouterLink>
        <RouterLink to="/apresentacao" class="item"><span class="ic">▶</span>Apresentação</RouterLink>
        <RouterLink v-if="auth.usuario.papel === 'admin'" to="/saude" class="item"><span class="ic">♥</span>Saúde</RouterLink>
        <RouterLink v-if="auth.usuario.papel === 'admin'" to="/admin" class="item"><span class="ic">⚙</span>Administração</RouterLink>
      </nav>
      <div class="lateral-rodape">
        <div class="status-voz">
          <small>CONEXÃO SEGURA</small>
          <span class="onda-mini"><i /><i /><i /><i /><i /><i /><i /><i /></span>
        </div>
        <img src="/logo-dmae.png" alt="DMAE · Prefeitura de Uberlândia" class="logo-dmae" />
      </div>
    </aside>

    <div class="principal">
      <header class="topo">
        <component :is="auth.usuario.papel === 'admin' ? 'RouterLink' : 'div'" to="/saude" class="pilula-status" :class="situacaoGeral.classe"><span>STATUS DO SISTEMA</span><b><i />{{ modoDemo && !situacaoGeral.classe ? 'DEMONSTRAÇÃO' : situacaoGeral.texto }}</b></component>
        <Relogio class="topo-relogio" />
        <form class="busca" @submit.prevent="buscar">
          <span aria-hidden="true">⌕</span>
          <input v-model="busca" type="search" placeholder="Buscar aplicação…" aria-label="Buscar aplicação" />
        </form>
        <VozComando />
        <div class="operador">
          <span class="operador-texto"><strong>{{ auth.usuario.nome || auth.usuario.email }}</strong><small>{{ auth.usuario.papel === 'admin' ? 'Administrador' : 'Usuário' }}</small></span>
          <span class="avatar">{{ iniciais(auth.usuario.nome || auth.usuario.email) }}</span>
          <button class="botao-link" @click="fazerSair">Sair</button>
        </div>
      </header>
      <main class="conteudo">
        <RouterView v-slot="{ Component, route }">
          <Transition name="tela" mode="out-in"><component :is="Component" :key="route.fullPath" /></Transition>
        </RouterView>
      </main>
    </div>
  </div>
  <RouterView v-else />
</template>
