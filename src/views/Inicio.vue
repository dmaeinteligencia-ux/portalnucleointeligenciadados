<script setup>
import { ref, computed, onMounted } from 'vue'
import { auth } from '../lib/auth'
import { listarAplicacoes, listarAvisos, listarAcessos, listarAutorizados, registrarAcesso } from '../lib/dados'
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

onMounted(async () => {
  ;[apps.value, avisos.value] = await Promise.all([listarAplicacoes(), listarAvisos()])
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
      <ul class="feed">
        <li v-for="(v, i) in avisos" :key="v.id" :style="{ animationDelay: `${300 + i * 120}ms` }">
          <span class="ic-quad">✦</span>
          <span><strong>{{ v.titulo }}</strong><small>{{ v.texto }}</small></span>
          <em class="tag">{{ dia(v.publicado_em) }}</em>
        </li>
        <li v-for="(a, i) in apps" :key="a.id" :style="{ animationDelay: `${420 + (avisos.length + i) * 120}ms` }">
          <span class="ic-quad">▲</span>
          <span><strong>{{ a.nome }} {{ situacao(a.slug) === 'fora' ? 'fora do ar' : 'disponível' }}</strong><small>{{ saude.porSlug[a.slug]?.detalhe || a.area }}</small></span>
          <em class="tag" :class="situacao(a.slug) && situacao(a.slug) !== 'ok' ? situacao(a.slug) : 'ok'">{{ situacao(a.slug) ? rotuloSituacao[situacao(a.slug)] : 'ONLINE' }}</em>
        </li>
      </ul>
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
