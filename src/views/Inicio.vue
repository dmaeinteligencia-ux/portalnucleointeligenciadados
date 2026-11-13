<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { auth } from '../lib/auth'
import { listarAplicacoes, listarAvisos, listarAcessos, listarAutorizados, registrarAcesso, desativada } from '../lib/dados'
import HudPanel from '../components/HudPanel.vue'
import NucleoOrb from '../components/NucleoOrb.vue'
import CartaoApp from '../components/CartaoApp.vue'
import Medidor from '../components/Medidor.vue'
import { saude, rotuloSituacao } from '../lib/saude'

const admin = auth.usuario.papel === 'admin'
const apps = ref([]), avisos = ref([]), acessos = ref([]), pessoas = ref([])
const hoje = new Date().toDateString()
const acessosHoje = computed(() => acessos.value.filter(a => new Date(a.em).toDateString() === hoje).length)
const porApp = computed(() => apps.value.map(a => ({ app: a, total: acessos.value.filter(x => x.aplicacao_id === a.id).length })))
const situacao = slug => saude.porSlug[slug]?.situacao
const noAr = computed(() => apps.value.filter(a => situacao(a.slug) !== 'fora').length)
const comProblema = computed(() => apps.value.filter(a => ['fora', 'atencao'].includes(situacao(a.slug))).length)
const nomeApp = id => apps.value.find(a => a.id === id)?.nome || '—'
const hora = d => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dia = d => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

// Feed: sistemas em ordem de prioridade (fora do ar, atenção, no ar), com filtro rápido por situação.
const prioridade = { fora: 0, atencao: 1, ok: 2 }
const feedTodos = computed(() => apps.value
  .map(app => {
    const s = situacao(app.slug)
    return { app, situacao: s, grupo: s === 'fora' || s === 'atencao' ? s : 'ok', detalhe: saude.porSlug[app.slug]?.detalhe || app.area }
  })
  .sort((a, b) => prioridade[a.grupo] - prioridade[b.grupo] || a.app.nome.localeCompare(b.app.nome, 'pt-BR')))
const filtroFeed = ref('todos')
const filtrosFeed = computed(() => {
  const conta = g => feedTodos.value.filter(x => x.grupo === g).length
  return [
    { id: 'todos', rotulo: 'Todos', total: feedTodos.value.length + avisos.value.length },
    { id: 'fora', rotulo: 'Fora', total: conta('fora') },
    { id: 'atencao', rotulo: 'Atenção', total: conta('atencao') },
    { id: 'ok', rotulo: 'No ar', total: conta('ok') },
  ]
})
const feedApps = computed(() => filtroFeed.value === 'todos' ? feedTodos.value : feedTodos.value.filter(x => x.grupo === filtroFeed.value))

// Degradê no fim do feed enquanto ainda houver itens abaixo.
const feedEl = ref(null), feedTemMais = ref(false)
function medirFeed() {
  const el = feedEl.value
  feedTemMais.value = !!el && el.scrollHeight - el.scrollTop - el.clientHeight > 4
}
watch([feedApps, avisos, filtroFeed], async () => {
  await nextTick()
  if (feedEl.value) feedEl.value.scrollTop = 0
  medirFeed()
})

onMounted(async () => {
  let todas
  ;[todas, avisos.value] = await Promise.all([listarAplicacoes(), listarAvisos()])
  apps.value = todas.filter(a => !desativada(a)) // desativados não entram no feed nem nas contagens
  if (admin) [acessos.value, pessoas.value] = await Promise.all([listarAcessos(), listarAutorizados()])
})

async function abrir(app) {
  await registrarAcesso(app)
  if (app.url) window.open(app.url, '_blank', 'noopener')
}
</script>

<template>
  <div class="painel-central">
    <HudPanel titulo="Visão geral" class="area-visao" :atraso="0">
      <ul class="lista-status">
        <li><span class="ic-quad">▦</span><span><strong>Aplicações</strong><small :class="comProblema ? '' : 'ok'">{{ noAr }} de {{ apps.length }} no ar<template v-if="comProblema"> · {{ comProblema }} com alerta</template></small></span></li>
        <li><span class="ic-quad">✉</span><span><strong>Avisos</strong><small>{{ avisos.length }} ativos</small></span></li>
        <li v-if="admin"><span class="ic-quad">◉</span><span><strong>Usuários</strong><small>{{ pessoas.length }} autorizados</small></span></li>
        <li v-if="admin"><span class="ic-quad">↗</span><span><strong>Acessos hoje</strong><small>{{ acessosHoje }} registrados</small></span></li>
        <li><span class="ic-quad">⛨</span><span><strong>Segurança</strong><small class="ok">Acesso restrito</small></span></li>
      </ul>
    </HudPanel>

    <div class="area-orb"><NucleoOrb /></div>

    <HudPanel titulo="Feed do Núcleo" etiqueta="AO VIVO" class="area-feed" :atraso="120">
      <div class="feed-filtros" role="group" aria-label="Filtrar o feed por situação">
        <button v-for="f in filtrosFeed" :key="f.id" type="button" class="feed-filtro" :class="[f.id, { ativo: filtroFeed === f.id }]"
          :aria-pressed="filtroFeed === f.id" :title="f.id === 'fora' ? 'Fora do ar' : f.rotulo" @click="filtroFeed = f.id">{{ f.rotulo }}<b>{{ f.total }}</b></button>
      </div>
      <div class="feed-rolagem" :class="{ 'tem-mais': feedTemMais }" ref="feedEl" @scroll.passive="medirFeed">
        <ul class="feed">
          <template v-if="filtroFeed === 'todos'">
            <li v-for="(v, i) in avisos" :key="v.id" :style="{ animationDelay: `${300 + i * 120}ms` }">
              <span class="ic-quad">✦</span>
              <span><strong :title="v.titulo">{{ v.titulo }}</strong><small :title="v.texto">{{ v.texto }}</small></span>
              <em class="tag">{{ dia(v.publicado_em) }}</em>
            </li>
          </template>
          <li v-for="(item, i) in feedApps" :key="item.app.id" :style="{ animationDelay: `${420 + Math.min(i, 8) * 120}ms` }">
            <span class="ic-quad" :class="item.grupo">▲</span>
            <span><strong :title="item.app.nome">{{ item.app.nome }}</strong><small :title="item.detalhe">{{ item.detalhe }}</small></span>
            <em class="tag" :class="item.grupo">{{ item.situacao ? rotuloSituacao[item.situacao] : 'ONLINE' }}</em>
          </li>
          <li v-if="!feedApps.length && !(filtroFeed === 'todos' && avisos.length)" class="feed-vazio">
            {{ filtroFeed === 'todos' ? 'Nada no feed ainda.' : 'Nenhum sistema nesta situação.' }}
          </li>
        </ul>
      </div>
    </HudPanel>

    <HudPanel titulo="Aplicações ativas" class="area-apps" :atraso="200">
      <template #acao><RouterLink to="/aplicacoes" class="ver-todas">Ver todas ›</RouterLink></template>
      <div class="grade-apps">
        <CartaoApp v-for="(app, i) in apps" :key="app.id" :app="app" :indice="i" />
        <p v-if="!apps.length" class="suave">Nenhuma aplicação liberada para você ainda.</p>
      </div>
    </HudPanel>

    <HudPanel titulo="Comandos rápidos" class="area-comandos" :atraso="280">
      <div class="comandos">
        <button v-for="app in apps" :key="app.id" class="comando" @click="abrir(app)"><span>▶</span>Abrir {{ app.nome }}</button>
        <RouterLink to="/aplicacoes" class="comando"><span>▦</span>Catálogo de aplicações</RouterLink>
        <RouterLink v-if="admin" to="/admin" class="comando"><span>⚙</span>Administração</RouterLink>
      </div>
    </HudPanel>

    <template v-if="admin">
      <HudPanel titulo="Monitor de uso" class="area-monitor" :atraso="360">
        <div class="medidores">
          <Medidor v-for="r in porApp" :key="r.app.id" :rotulo="r.app.nome" :valor="r.total" :total="Math.max(acessos.length, 1)" />
          <Medidor rotulo="Hoje" :valor="acessosHoje" :total="Math.max(acessos.length, 1)" />
        </div>
      </HudPanel>
      <HudPanel titulo="Atividade recente" class="area-linha" :atraso="440">
        <ol class="linha-tempo">
          <li v-for="a in acessos.slice(0, 5)" :key="a.id">
            <time>{{ hora(a.em) }}</time><i />
            <span><strong>{{ nomeApp(a.aplicacao_id) }}</strong><small>{{ a.email }}</small></span>
          </li>
          <li v-if="!acessos.length" class="suave">Nenhum acesso ainda.</li>
        </ol>
      </HudPanel>
    </template>
  </div>
</template>
