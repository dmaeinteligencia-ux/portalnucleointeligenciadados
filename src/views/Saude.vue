<script setup>
import { ref, computed, onMounted } from 'vue'
import { listarAplicacoes } from '../lib/dados'
import { saude, carregarSaude, historicoSaude, rotuloBanco } from '../lib/saude'
import HudPanel from '../components/HudPanel.vue'
import LuzSaude from '../components/LuzSaude.vue'

const REPO = 'https://github.com/dmaeinteligencia-ux/portalnucleointeligenciadados'
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
  const lista = [{ slug: 'portal', nome: 'Portal do Núcleo', url: location.origin }, ...apps.value.filter((a) => a.url || a.supabase_url)]
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
      dias: diasEixo.map((d) => ({ d, s: porDia[d] })),
    }
  })
})

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
const rotuloDia = { ok: 'tudo certo', atencao: 'atenção', fora: 'fora do ar' }
</script>

<template>
<div>
  <h1 class="titulo-tela">Saúde das aplicações</h1>
  <p v-if="erro" class="aviso-erro">{{ erro }}</p>

  <div class="saude-resumo">
    <div class="hud-painel numero"><strong class="ok">{{ contagem.ok }}</strong><span>no ar</span></div>
    <div class="hud-painel numero"><strong :style="{ color: 'var(--amarelo)' }">{{ contagem.atencao }}</strong><span>com atenção</span></div>
    <div class="hud-painel numero"><strong :style="{ color: 'var(--vermelho)' }">{{ contagem.fora }}</strong><span>fora do ar</span></div>
    <div class="hud-painel numero"><strong :style="{ fontSize: '1.1rem' }">{{ ultima }}</strong><span>última verificação · 7h, 12h e 17h</span></div>
  </div>

  <div class="barra">
    <a class="botao secundario" :href="`${REPO}/actions/workflows/monitorar-aplicacoes.yml`" target="_blank" rel="noopener">Verificar agora (GitHub)</a>
    <a class="botao secundario" :href="`${REPO}/issues?q=is%3Aissue+label%3Amonitoramento`" target="_blank" rel="noopener">Alertas</a>
  </div>

  <div class="saude-lista">
    <HudPanel v-for="(a, i) in alvos" :key="a.slug" :atraso="i * 80">
      <div class="saude-item">
        <div class="saude-topo">
          <h2>{{ a.nome }}</h2>
          <LuzSaude :slug="a.slug" texto />
          <span class="disp" title="Verificações sem queda nos últimos 30 dias">{{ pct(a.disponibilidade) }} no ar · 30 dias</span>
        </div>
        <p v-if="a.atual?.detalhe" class="saude-detalhe" :class="a.atual.situacao">{{ a.atual.detalhe }}</p>
        <div class="saude-dados">
          <div><small>SITE</small><strong>{{ a.atual?.site_status ? `${a.atual.site_status} · ${a.atual.site_ms} ms` : a.atual ? 'sem resposta' : '—' }}</strong></div>
          <div><small>TEMPO MÉDIO</small><strong>{{ a.mediaMs ? `${a.mediaMs} ms` : '—' }}</strong></div>
          <div><small>BANCO</small><strong>{{ a.atual ? rotuloBanco[a.atual.banco] || '—' : '—' }}</strong></div>
          <div><small>CERTIFICADO HTTPS</small><strong>{{ a.atual?.ssl_dias != null ? `vence em ${a.atual.ssl_dias} dias` : '—' }}</strong></div>
        </div>
        <div class="saude-dias" role="img" :aria-label="`Últimos ${DIAS} dias de ${a.nome}`">
          <span v-for="(d, j) in a.dias" :key="d.d" :class="d.s && `d-${d.s}`" :style="{ animationDelay: `${j * 15}ms` }"
            :title="`${d.d}: ${d.s ? rotuloDia[d.s] : 'sem verificação'}`" />
        </div>
        <div class="saude-eixo"><span>{{ DIAS }} dias atrás</span><span>hoje</span></div>
      </div>
    </HudPanel>
  </div>
</div>
</template>
