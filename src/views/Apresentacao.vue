<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { listarAplicacoes, desativada, rotuloPlataforma } from '../lib/dados'
import HudPanel from '../components/HudPanel.vue'

// Modo apresentação: percorre painéis e sistemas visíveis, um de cada vez, em tela cheia (TV, telão).
// Endereço aceita ?tempo=15&tipo=painel&auto=1 para deixar a TV já configurada num favorito.
const route = useRoute()
const CHAVE = 'nucleo:apresentacao'
const lerPreferencias = () => { try { return JSON.parse(localStorage.getItem(CHAVE)) || {} } catch { return {} } }
const pref = lerPreferencias()

const apps = ref([])
const carregado = ref(false)
const tempo = ref(Number(route.query.tempo) || pref.tempo || 10)
const tipo = ref(route.query.tipo || pref.tipo || '')
const excluidos = ref(new Set(pref.excluidos || []))

watch([tempo, tipo, excluidos], () => {
  try { localStorage.setItem(CHAVE, JSON.stringify({ tempo: tempo.value, tipo: tipo.value, excluidos: [...excluidos.value] })) } catch { /* sem armazenamento */ }
}, { deep: true })

// Só entram itens visíveis, com endereço e que não estejam desativados
const disponiveis = computed(() => apps.value.filter(a => a.url && !desativada(a)))
const doTipo = computed(() => disponiveis.value.filter(a => !tipo.value || (a.tipo || 'sistema') === tipo.value))
const fila = computed(() => doTipo.value.filter(a => !excluidos.value.has(a.id)))
const temPowerBI = computed(() => fila.value.some(a => a.plataforma === 'powerbi'))

function alternar(app) {
  const s = new Set(excluidos.value)
  s.has(app.id) ? s.delete(app.id) : s.add(app.id)
  excluidos.value = s
}

async function carregar() {
  apps.value = await listarAplicacoes()
  carregado.value = true
}

// ---------- Exibição ----------
const rodando = ref(false)
const pausado = ref(false)
const indice = ref(0)
const decorrido = ref(0) // ms do item atual
const prontos = ref(new Set())
const palco = ref(null)
const controlesVisiveis = ref(true)
let relogio = null
let ultimo = 0
let ocultar = null

const atual = computed(() => fila.value[indice.value])
const proximoIndice = computed(() => fila.value.length ? (indice.value + 1) % fila.value.length : 0)
const progresso = computed(() => Math.min(100, (decorrido.value / (tempo.value * 1000)) * 100))
const restante = computed(() => Math.max(0, Math.ceil(tempo.value - decorrido.value / 1000)))
// Só o item atual e o próximo ficam carregados: o próximo vai carregando escondido para não piscar
const montado = i => rodando.value && (i === indice.value || i === proximoIndice.value)

// Painel na TV: esconde o painel de filtros e a lista de páginas do Power BI
function enderecoExibicao(app) {
  if (app.plataforma !== 'powerbi' || !/\/reportEmbed\?/i.test(app.url)) return app.url
  const u = new URL(app.url)
  u.searchParams.set('filterPaneEnabled', 'false')
  u.searchParams.set('navContentPaneEnabled', 'false')
  return u.toString()
}

function iniciar() {
  if (!fila.value.length) return
  indice.value = 0
  decorrido.value = 0
  pausado.value = false
  rodando.value = true
  palco.value?.requestFullscreen?.().catch(() => {})
  mexeu()
  ultimo = performance.now()
  relogio = setInterval(passo, 200)
}

function parar() {
  rodando.value = false
  clearInterval(relogio)
  prontos.value = new Set()
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
}

function passo() {
  const agora = performance.now()
  if (!pausado.value) decorrido.value += agora - ultimo
  ultimo = agora
  if (decorrido.value >= tempo.value * 1000) avancar()
}

async function avancar(direcao = 1) {
  const n = fila.value.length
  if (!n) return parar()
  const volta = indice.value + direcao >= n
  indice.value = (indice.value + direcao + n) % n
  decorrido.value = 0
  // A cada volta completa, busca a lista de novo para pegar painéis novos ou desativados
  if (volta && direcao > 0) {
    const id = atual.value?.id
    await carregar()
    const novo = fila.value.findIndex(a => a.id === id)
    indice.value = novo >= 0 ? novo : 0
    if (!fila.value.length) parar()
  }
}

const marcarPronto = id => { prontos.value = new Set(prontos.value).add(id) }

function alternarTelaCheia() {
  if (document.fullscreenElement) document.exitFullscreen()
  else palco.value?.requestFullscreen?.()
}

// Controles somem depois de alguns segundos sem mexer o mouse
function mexeu() {
  controlesVisiveis.value = true
  clearTimeout(ocultar)
  ocultar = setTimeout(() => { if (!pausado.value) controlesVisiveis.value = false }, 3500)
}

function teclas(e) {
  if (!rodando.value) return
  if (e.key === ' ' || e.key === 'k') { e.preventDefault(); pausado.value = !pausado.value }
  else if (e.key === 'ArrowRight') avancar(1)
  else if (e.key === 'ArrowLeft') avancar(-1)
  else if (e.key === 'Escape' && !document.fullscreenElement) parar()
  else return
  mexeu()
}

// Login Microsoft numa janelinha antes de começar: o Power BI guarda a sessão para todos os painéis
const loginFeito = ref(false)
function entrarMicrosoft() {
  const janela = window.open('https://app.powerbi.com/', 'pbi-login', 'width=520,height=700')
  if (!janela) return window.open('https://app.powerbi.com/', '_blank', 'noopener')
  const espera = setInterval(() => { if (janela.closed) { clearInterval(espera); loginFeito.value = true } }, 800)
}

onMounted(async () => {
  window.addEventListener('keydown', teclas)
  await carregar()
  if (route.query.auto) iniciar()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', teclas)
  clearInterval(relogio)
  clearTimeout(ocultar)
})
</script>

<template>
<div class="apresentacao">
  <h1 class="titulo-tela">Modo apresentação</h1>

  <div class="apres-grade">
    <HudPanel titulo="Configuração">
      <div class="apres-config">
        <label>Tempo em cada item
          <span class="apres-tempo"><input v-model.number="tempo" type="number" min="5" max="600" step="5" /> segundos</span>
        </label>
        <label>O que mostrar
          <select v-model="tipo">
            <option value="">Painéis e sistemas</option>
            <option value="painel">Só painéis de BI</option>
            <option value="sistema">Só sistemas</option>
          </select>
        </label>
      </div>
      <div v-if="temPowerBI" class="login-painel">
        <span>⛨ {{ loginFeito ? 'Login Microsoft feito. Pode iniciar.' : 'Os painéis do Power BI pedem a conta Microsoft do DMAE. Entre uma vez antes de iniciar.' }}</span>
        <button class="botao secundario" @click="entrarMicrosoft">{{ loginFeito ? 'Entrar de novo' : 'Entrar com a Microsoft' }}</button>
      </div>
      <button class="botao brilho apres-iniciar" :disabled="!fila.length" @click="iniciar">▶ Iniciar apresentação ({{ fila.length }} {{ fila.length === 1 ? 'item' : 'itens' }})</button>
      <p class="dica-embutida">Atalhos durante a apresentação: espaço pausa, setas voltam e avançam, Esc sai. A lista é atualizada a cada volta completa, então painéis novos entram sozinhos.</p>
    </HudPanel>

    <HudPanel titulo="Itens na rotação" :etiqueta="`${fila.length} de ${doTipo.length}`">
      <p v-if="carregado && !doTipo.length" class="suave">Nenhum item visível com endereço cadastrado.</p>
      <ul class="apres-lista">
        <li v-for="app in doTipo" :key="app.id" :class="{ fora: excluidos.has(app.id) }">
          <label>
            <input type="checkbox" :checked="!excluidos.has(app.id)" @change="alternar(app)" />
            <span class="icone-app mini" aria-hidden="true">{{ app.tipo === 'painel' ? '◧' : app.nome.charAt(0) }}</span>
            <span><strong>{{ app.nome }}</strong><small>{{ app.tipo === 'painel' ? `Painel ${rotuloPlataforma[app.plataforma] || 'de BI'}` : 'Sistema' }}{{ app.area ? ` · ${app.area}` : '' }}</small></span>
          </label>
        </li>
      </ul>
      <p class="dica-embutida">Desmarque o que não deve aparecer na TV, como um sistema que fica em branco dentro do portal. A escolha fica guardada neste navegador. Itens desativados não entram.</p>
    </HudPanel>
  </div>

  <div ref="palco" class="apres-palco" :class="{ ativo: rodando, 'sem-cursor': rodando && !controlesVisiveis }" @mousemove="mexeu" @click="mexeu">
    <template v-if="rodando">
      <div v-for="(app, i) in fila" :key="app.id" class="apres-slide" :class="{ visivel: i === indice }">
        <template v-if="montado(i)">
          <div v-if="!prontos.has(app.id)" class="carregando-app"><span class="anel-carga" /><small>Conectando à {{ app.nome }}…</small></div>
          <iframe :src="enderecoExibicao(app)" :title="app.nome" allow="fullscreen" referrerpolicy="strict-origin-when-cross-origin" @load="marcarPronto(app.id)" />
        </template>
      </div>

      <!-- O quadro da aplicação engole o mouse; esta faixa no rodapé traz os controles de volta -->
      <div class="apres-zona" @mousemove="mexeu" @click="mexeu" />
      <div class="apres-barra-tempo"><i :style="{ width: `${progresso}%` }" /></div>
      <div class="apres-controles" :class="{ oculto: !controlesVisiveis }">
        <span class="icone-app mini" aria-hidden="true">{{ atual?.tipo === 'painel' ? '◧' : atual?.nome.charAt(0) }}</span>
        <span class="embutida-nome"><strong>{{ atual?.nome }}</strong><small>{{ indice + 1 }} de {{ fila.length }} · {{ pausado ? 'pausado' : `próximo em ${restante}s` }}</small></span>
        <div class="embutida-acoes">
          <button class="comando-mini" title="Anterior (←)" @click.stop="avancar(-1)">⏮</button>
          <button class="comando-mini" :title="pausado ? 'Continuar (espaço)' : 'Pausar (espaço)'" @click.stop="pausado = !pausado">{{ pausado ? '▶' : '⏸' }}</button>
          <button class="comando-mini" title="Próximo (→)" @click.stop="avancar(1)">⏭</button>
          <button class="comando-mini" title="Tela cheia" @click.stop="alternarTelaCheia">⤢</button>
          <button class="botao secundario" @click.stop="parar">Sair</button>
        </div>
      </div>
    </template>
  </div>
</div>
</template>
