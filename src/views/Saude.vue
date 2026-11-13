<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { listarAplicacoes, desativada } from '../lib/dados'
import { saude, carregarSaude, historicoSaude, rotuloBanco } from '../lib/saude'
import HudPanel from '../components/HudPanel.vue'
import LuzSaude from '../components/LuzSaude.vue'

const REPO = 'https://github.com/dmaeinteligencia-ux/portalnucleointeligenciadados'
const SUPABASE_PORTAL = import.meta.env.VITE_SUPABASE_URL
const DIAS = 30
const apps = ref([])
const historico = ref([])
const erro = ref('')

onMounted(async () => {
  try {
    ;[apps.value, historico.value] = await Promise.all([listarAplicacoes({ todas: true }), historicoSaude(DIAS), carregarSaude({ forcar: true })])
  } catch (e) {
    erro.value = 'Não foi possível ler o monitoramento. A migração 0003_monitoramento.sql já foi aplicada no Supabase?'
  }
})

const peso = { ok: 0, atencao: 1, fora: 2 }
const diaDe = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const diasEixo = Array.from({ length: DIAS }, (_, i) => diaDe(Date.now() - (DIAS - 1 - i) * 86400000))

const alvos = computed(() => {
  const lista = [{ slug: 'portal', nome: 'Portal do Núcleo', url: location.origin, supabase_url: SUPABASE_PORTAL, portal: true }, ...apps.value.filter((a) => (a.url || a.supabase_url) && !desativada(a))]
  return lista.map((alvo) => {
    const h = historico.value.filter((v) => v.slug === alvo.slug)
    const porDia = {}
    for (const v of h) {
      const d = diaDe(v.em)
      if (!(d in porDia) || peso[v.situacao] > peso[porDia[d]]) porDia[d] = v.situacao
    }
    const tempos = h.map((v) => v.site_ms).filter(Boolean)
    return {
      ...alvo,
      atual: saude.porSlug[alvo.slug],
      disponibilidade: h.length ? (100 * h.filter((v) => v.situacao !== 'fora').length) / h.length : null,
      mediaMs: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null,
      dias: diasEixo.map((d) => ({ d, s: porDia[d], lista: h.filter((v) => diaDe(v.em) === d) })),
      links: links(alvo),
    }
  })
})

// Filtro pelos números do topo: null mostra todos.
const filtro = ref(null)
const desativadas = computed(() => apps.value.filter(desativada))
const alternarFiltro = (s) => (filtro.value = filtro.value === s ? null : s)
const visiveis = computed(() => (filtro.value ? alvos.value.filter((a) => a.atual?.situacao === filtro.value) : alvos.value))

// Dia aberto na barra de 30 dias, por aplicação.
const diaAberto = ref({})
const abrirDia = (slug, d) => (diaAberto.value = { ...diaAberto.value, [slug]: diaAberto.value[slug]?.d === d.d ? null : d })
const hora = (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

// Atalhos de cada cartão.
function idsPowerBI(url) {
  try {
    const u = new URL(url)
    const r = u.searchParams.get('reportId') || u.pathname.match(/reports\/([0-9a-f-]{36})/i)?.[1]
    const g = u.searchParams.get('groupId') || u.pathname.match(/groups\/([0-9a-f-]{36})/i)?.[1]
    return { r, g }
  } catch { return {} }
}
function projetoSupabase(url) {
  const ref = (url || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1]
  return ref && `https://supabase.com/dashboard/project/${ref}`
}
function links(a) {
  const l = []
  if (!a.portal && a.url) l.push({ rotulo: 'Abrir no portal', para: `/aplicacoes/${a.slug}/usar`, principal: true })
  if (!a.portal) l.push({ rotulo: 'Detalhes', para: `/aplicacoes/${a.slug}` }, { rotulo: 'Editar', para: { path: '/admin', query: { editar: a.slug } } })
  if (a.tipo === 'painel') {
    const { r, g } = idsPowerBI(a.url)
    const grupo = g ? `groups/${g}` : 'groups/me'
    if (r) l.push({ rotulo: 'Abrir no Power BI', href: `https://app.powerbi.com/${grupo}/reports/${r}` })
    l.push({ rotulo: 'Atualização dos dados', href: `https://app.powerbi.com/${grupo}/list?experience=power-bi`, dica: 'Workspace no Power BI: colunas "Atualizado" e "Próxima atualização" e o botão de agendar a atualização do modelo semântico' })
  } else {
    if (a.url) l.push({ rotulo: 'Abrir site', href: a.url })
    const sb = projetoSupabase(a.supabase_url)
    if (sb) l.push({ rotulo: 'Abrir Supabase', href: sb })
  }
  return l
}
const linkAlerta = (slug) => `${REPO}/issues?q=${encodeURIComponent(`is:issue is:open label:monitoramento "[${slug}]"`)}`

const contagem = computed(() => {
  const c = { ok: 0, atencao: 0, fora: 0 }
  for (const a of alvos.value) if (a.atual) c[a.atual.situacao]++
  return c
})
const ultima = computed(() => {
  const datas = Object.values(saude.porSlug).map((v) => v.em).sort()
  return datas.length ? dataHora(datas.at(-1)) : '—'
})
const dataHora = (d) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const pct = (n) => (n === null ? '—' : `${n.toFixed(n === 100 ? 0 : 1)}%`)
const filtros = [
  { s: 'ok', rotulo: 'no ar', cor: 'var(--verde)' },
  { s: 'atencao', rotulo: 'com atenção', cor: 'var(--amarelo)' },
  { s: 'fora', rotulo: 'fora do ar', cor: 'var(--vermelho)' },
]
const rotuloDia = { ok: 'tudo certo', atencao: 'atenção', fora: 'fora do ar' }
</script>

<template>
<div>
  <h1 class="titulo-tela">Saúde das aplicações</h1>
  <p v-if="erro" class="aviso-erro">{{ erro }}</p>

  <div class="saude-resumo">
    <button v-for="f in filtros" :key="f.s" type="button" class="hud-painel numero filtro-saude" :class="{ ativo: filtro === f.s }"
      :aria-pressed="filtro === f.s" :title="filtro === f.s ? 'Mostrar todos' : `Mostrar só ${f.rotulo}`" @click="alternarFiltro(f.s)">
      <strong :style="{ color: f.cor }">{{ contagem[f.s] }}</strong><span>{{ f.rotulo }}</span>
    </button>
    <div class="hud-painel numero"><strong :style="{ fontSize: '1.1rem' }">{{ ultima }}</strong><span>última verificação · 7h, 12h e 17h</span></div>
  </div>

  <div class="barra">
    <a class="botao secundario" :href="`${REPO}/actions/workflows/monitorar-aplicacoes.yml`" target="_blank" rel="noopener">Verificar agora (GitHub)</a>
    <a class="botao secundario" :href="`${REPO}/issues?q=is%3Aissue+label%3Amonitoramento`" target="_blank" rel="noopener">Alertas</a>
  </div>

  <p v-if="desativadas.length" class="filtro-aviso">Fora do monitoramento (desativados): {{ desativadas.map((a) => a.nome).join(', ') }}. <RouterLink to="/admin" class="botao-link">Reativar na Administração</RouterLink></p>
  <p v-if="filtro" class="filtro-aviso">Mostrando só {{ filtros.find((f) => f.s === filtro).rotulo }} ({{ visiveis.length }}). <button class="botao-link" @click="filtro = null">Mostrar todos</button></p>

  <div class="saude-lista">
    <HudPanel v-for="(a, i) in visiveis" :key="a.slug" :atraso="i * 80">
      <div class="saude-item">
        <div class="saude-topo">
          <h2>{{ a.nome }}</h2>
          <LuzSaude :slug="a.slug" texto />
          <span class="disp" title="Verificações sem queda nos últimos 30 dias">{{ pct(a.disponibilidade) }} no ar · 30 dias</span>
        </div>
        <p v-if="a.atual?.detalhe" class="saude-detalhe" :class="a.atual.situacao">{{ a.atual.detalhe }}</p>
        <nav class="saude-acoes" :aria-label="`Atalhos de ${a.nome}`">
          <template v-for="l in a.links" :key="l.rotulo">
            <RouterLink v-if="l.para" :to="l.para" class="acao" :class="{ principal: l.principal }">{{ l.rotulo }}</RouterLink>
            <a v-else :href="l.href" class="acao" target="_blank" rel="noopener" :title="l.dica">{{ l.rotulo }} ↗</a>
          </template>
          <a v-if="a.atual && a.atual.situacao !== 'ok'" :href="linkAlerta(a.slug)" class="acao alerta" target="_blank" rel="noopener">Ver alerta ↗</a>
        </nav>
        <div v-if="a.tipo === 'painel'" class="saude-dados">
          <div><small>TIPO</small><strong>Painel Power BI</strong></div>
          <div><small>O QUE É VERIFICADO</small><strong>Atualização dos dados</strong></div>
        </div>
        <div v-else class="saude-dados">
          <div><small>SITE</small><strong>{{ a.atual?.site_status ? `${a.atual.site_status} · ${a.atual.site_ms} ms` : a.atual ? 'sem resposta' : '—' }}</strong></div>
          <div><small>TEMPO MÉDIO</small><strong>{{ a.mediaMs ? `${a.mediaMs} ms` : '—' }}</strong></div>
          <div><small>BANCO</small><strong>{{ a.atual ? rotuloBanco[a.atual.banco] || '—' : '—' }}</strong></div>
          <div><small>CERTIFICADO HTTPS</small><strong>{{ a.atual?.ssl_dias != null ? `vence em ${a.atual.ssl_dias} dias` : '—' }}</strong></div>
        </div>
        <div class="saude-dias" role="img" :aria-label="`Últimos ${DIAS} dias de ${a.nome}`">
          <button v-for="(d, j) in a.dias" :key="d.d" type="button" :class="[d.s && `d-${d.s}`, { aberto: diaAberto[a.slug]?.d === d.d }]"
            :style="{ animationDelay: `${j * 15}ms` }" :title="`${d.d}: ${d.s ? rotuloDia[d.s] : 'sem verificação'}`"
            :aria-label="`${d.d}: ${d.s ? rotuloDia[d.s] : 'sem verificação'}`" @click="abrirDia(a.slug, d)" />
        </div>
        <div class="saude-eixo"><span>{{ DIAS }} dias atrás</span><span>clique num dia para ver as verificações</span><span>hoje</span></div>
        <div v-if="diaAberto[a.slug]" class="saude-dia">
          <div class="saude-dia-topo">
            <strong>{{ diaAberto[a.slug].d }}</strong>
            <button class="botao-link" @click="abrirDia(a.slug, diaAberto[a.slug])">Fechar</button>
          </div>
          <p v-if="!diaAberto[a.slug].lista.length" class="suave">Nenhuma verificação neste dia.</p>
          <ul v-else>
            <li v-for="v in [...diaAberto[a.slug].lista].reverse()" :key="v.id || v.em">
              <span class="hora">{{ hora(v.em) }}</span>
              <span class="situacao" :class="v.situacao">{{ rotuloDia[v.situacao] }}</span>
              <span v-if="a.tipo !== 'painel' && v.site_status" class="suave">site {{ v.site_status }} · {{ v.site_ms }} ms</span>
              <span v-if="v.detalhe" class="detalhe">{{ v.detalhe }}</span>
            </li>
          </ul>
        </div>
      </div>
    </HudPanel>
  </div>
</div>
</template>
