<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { listarAplicacoes, salvarAplicacao, desativada, rotuloPlataforma } from '../lib/dados'
import { auth } from '../lib/auth'
import HudPanel from '../components/HudPanel.vue'

// Modo apresentação: percorre painéis e sistemas visíveis, um de cada vez, em tela cheia (TV, telão).
// Painéis do Power BI com várias páginas viram uma tela por página (lista lida pela automação diária).
// Os ajustes de cada item (tempo, fora da rotação, páginas) ficam no banco, coluna "apresentacao",
// para valer em qualquer TV. Tempo padrão e filtro de tipo ficam no navegador.
// Endereço aceita ?tempo=15&tipo=painel&auto=1 para deixar a TV já configurada num favorito.
const route = useRoute()
const CHAVE = 'nucleo:apresentacao'
const lerPreferencias = () => { try { return JSON.parse(localStorage.getItem(CHAVE)) || {} } catch { return {} } }
const pref = lerPreferencias()
const admin = computed(() => auth.usuario?.papel === 'admin')
// Conta da TV (perfil Apresentação): só exibe; os ajustes de cada item vêm dos administradores
const soVer = auth.usuario?.papel === 'apresentacao'

const apps = ref([])
const carregado = ref(false)
const tempo = ref(Number(route.query.tempo) || pref.tempo || 10)
const tipo = ref(route.query.tipo || pref.tipo || '')
// Ajustes que ainda não chegaram ao banco (sem permissão, sem a migração 0006 ou versão antiga desta tela)
const pendentes = reactive(soVer ? {} : { ...(pref.pendentes || {}) })
if (!soVer) for (const id of pref.excluidos || []) pendentes[id] = { ...pendentes[id], fora: true }
const aviso = ref('')

const guardarPreferencias = () => {
  try { localStorage.setItem(CHAVE, JSON.stringify({ tempo: tempo.value, tipo: tipo.value, pendentes })) } catch { /* sem armazenamento */ }
}
watch([tempo, tipo, pendentes], guardarPreferencias, { deep: true })

const ajustes = app => ({ ...(app.apresentacao || {}), ...(pendentes[app.id] || {}) })
const tempoDe = app => Number(ajustes(app).tempo) || tempo.value
const paginasDe = app => (Array.isArray(app.paginas) ? app.paginas : [])

async function ajustar(app, mudanca) {
  if (soVer) return
  const novo = { ...ajustes(app), ...mudanca }
  for (const k of Object.keys(novo)) if (novo[k] === undefined || novo[k] === null || novo[k] === '') delete novo[k]
  pendentes[app.id] = novo
  await enviar(app.id)
}

async function enviar(id) {
  const app = apps.value.find(a => a.id === id)
  if (!app || !admin.value) return
  const apresentacao = ajustes(app)
  try {
    await salvarAplicacao({ id, apresentacao })
    app.apresentacao = apresentacao
    delete pendentes[id]
    aviso.value = ''
  } catch {
    aviso.value = 'Não consegui salvar no banco (falta aplicar a migração 0006?). Os ajustes ficaram guardados só neste navegador.'
  }
}

// Só entram itens visíveis, com endereço e que não estejam desativados
const disponiveis = computed(() => apps.value.filter(a => a.url && !desativada(a)))
const doTipo = computed(() => disponiveis.value.filter(a => !tipo.value || (a.tipo || 'sistema') === tipo.value))
const fila = computed(() => doTipo.value.filter(a => !ajustes(a).fora))
const temPowerBI = computed(() => fila.value.some(a => a.plataforma === 'powerbi'))

// Cada item vira uma ou mais telas (uma por página do painel escolhida)
function paginasEscolhidas(app) {
  const lista = paginasDe(app)
  if (lista.length < 2) return [null]
  const a = ajustes(app)
  if (a.paginas === 'primeira') return [lista[0]]
  const fora = new Set(a.paginas_fora || [])
  const escolhidas = lista.filter(p => !fora.has(p.nome))
  return escolhidas.length ? escolhidas : [lista[0]]
}
const telas = computed(() => fila.value.flatMap(app => {
  const paginas = paginasEscolhidas(app)
  return paginas.map((pagina, i) => ({
    chave: `${app.id}:${pagina?.nome || ''}`, app, pagina, posicao: i + 1, total: paginas.length, tempo: tempoDe(app),
  }))
}))
const totalTelas = computed(() => telas.value.length)

function alternarPagina(app, pagina) {
  const fora = new Set(ajustes(app).paginas_fora || [])
  fora.has(pagina.nome) ? fora.delete(pagina.nome) : fora.add(pagina.nome)
  ajustar(app, { paginas_fora: [...fora] })
}

async function carregar() {
  apps.value = await listarAplicacoes()
  carregado.value = true
}

// ---------- Exibição ----------
const rodando = ref(false)
const pausado = ref(false)
const indice = ref(0)
const decorrido = ref(0) // ms da tela atual
const prontos = ref(new Set())
const palco = ref(null)
const controlesVisiveis = ref(true)
let relogio = null
let ultimo = 0
let ocultar = null

const atual = computed(() => telas.value[indice.value])
const duracao = computed(() => (atual.value?.tempo || tempo.value) * 1000)
const proximoIndice = computed(() => telas.value.length ? (indice.value + 1) % telas.value.length : 0)
const progresso = computed(() => Math.min(100, (decorrido.value / duracao.value) * 100))
const restante = computed(() => Math.max(0, Math.ceil((duracao.value - decorrido.value) / 1000)))
// Só a tela atual e a próxima ficam carregadas: a próxima vai carregando escondida para não piscar
const montado = i => rodando.value && (i === indice.value || i === proximoIndice.value)

// Painel na TV: abre na página certa, sem o painel de filtros e a lista de páginas do Power BI
function enderecoExibicao(tela) {
  const { app, pagina } = tela
  if (app.plataforma !== 'powerbi' || !/\/reportEmbed\?/i.test(app.url)) return app.url
  const u = new URL(app.url)
  u.searchParams.set('filterPaneEnabled', 'false')
  u.searchParams.set('navContentPaneEnabled', 'false')
  if (pagina) u.searchParams.set('pageName', pagina.nome)
  return u.toString()
}

function iniciar() {
  if (!telas.value.length) return
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
  if (decorrido.value >= duracao.value) avancar()
}

async function avancar(direcao = 1) {
  const n = telas.value.length
  if (!n) return parar()
  const volta = indice.value + direcao >= n
  indice.value = (indice.value + direcao + n) % n
  decorrido.value = 0
  // A cada volta completa, busca a lista de novo para pegar painéis novos, páginas novas e ajustes feitos em outro computador
  if (volta && direcao > 0) {
    const chave = atual.value?.chave
    await carregar()
    const novo = telas.value.findIndex(t => t.chave === chave)
    indice.value = novo >= 0 ? novo : 0
    if (!telas.value.length) parar()
  }
}

const marcarPronto = chave => { prontos.value = new Set(prontos.value).add(chave) }

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
  // Ajustes guardados só no navegador sobem para o banco quando possível
  for (const id of Object.keys(pendentes)) await enviar(id)
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
        <label>Tempo padrão em cada tela
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
      <button class="botao brilho apres-iniciar" :disabled="!totalTelas" @click="iniciar">▶ Iniciar apresentação ({{ totalTelas }} {{ totalTelas === 1 ? 'tela' : 'telas' }})</button>
      <p class="dica-embutida">Atalhos durante a apresentação: espaço pausa, setas voltam e avançam, Esc sai. A lista é atualizada a cada volta completa, então painéis e páginas novas entram sozinhos.</p>
    </HudPanel>

    <HudPanel titulo="Itens na rotação" :etiqueta="`${fila.length} de ${doTipo.length}`">
      <p v-if="aviso" class="filtro-aviso">{{ aviso }}</p>
      <p v-if="carregado && !doTipo.length" class="suave">Nenhum item visível com endereço cadastrado.</p>
      <ul class="apres-lista">
        <li v-for="app in doTipo" :key="app.id" :class="{ fora: ajustes(app).fora }">
          <div class="apres-item">
            <label class="apres-item-nome">
              <input type="checkbox" :checked="!ajustes(app).fora" :disabled="soVer" @change="ajustar(app, { fora: !ajustes(app).fora || undefined })" />
              <span class="icone-app mini" aria-hidden="true">{{ app.tipo === 'painel' ? '◧' : app.nome.charAt(0) }}</span>
              <span><strong>{{ app.nome }}</strong><small>{{ app.tipo === 'painel' ? `Painel ${rotuloPlataforma[app.plataforma] || 'de BI'}` : 'Sistema' }}{{ paginasDe(app).length > 1 ? ` · ${paginasDe(app).length} páginas` : '' }}{{ app.area ? ` · ${app.area}` : '' }}</small></span>
            </label>
            <label class="apres-item-tempo" :title="`Tempo em cada tela deste item. Vazio usa o padrão (${tempo}s).`">
              <input type="number" min="5" max="600" step="5" :value="ajustes(app).tempo || ''" :placeholder="String(tempo)" :disabled="soVer || ajustes(app).fora" @change="ajustar(app, { tempo: Number($event.target.value) || undefined })" />
              <small>s</small>
            </label>
          </div>
          <div v-if="paginasDe(app).length > 1 && !ajustes(app).fora" class="apres-paginas">
            <select :value="ajustes(app).paginas || 'todas'" :disabled="soVer" aria-label="Páginas a mostrar" @change="ajustar(app, { paginas: $event.target.value === 'todas' ? undefined : $event.target.value })">
              <option value="todas">Mostrar as páginas marcadas ({{ paginasEscolhidas(app).length }})</option>
              <option value="primeira">Só a primeira página</option>
            </select>
            <div v-if="(ajustes(app).paginas || 'todas') === 'todas'" class="apres-paginas-lista">
              <label v-for="p in paginasDe(app)" :key="p.nome" :class="{ fora: (ajustes(app).paginas_fora || []).includes(p.nome) }">
                <input type="checkbox" :checked="!(ajustes(app).paginas_fora || []).includes(p.nome)" :disabled="soVer" @change="alternarPagina(app, p)" />{{ p.titulo }}
              </label>
            </div>
          </div>
        </li>
      </ul>
      <p v-if="soVer" class="dica-embutida">Esta é a conta de apresentação: ela só exibe. Os itens, tempos e páginas são definidos pelos administradores do portal.</p>
      <p v-else class="dica-embutida">Desmarque o que não deve aparecer na TV, como um sistema que fica em branco dentro do portal. O tempo ao lado de cada item vale para cada tela dele (vazio usa o padrão). Os ajustes ficam salvos no portal e valem em qualquer TV. Itens desativados não entram.</p>
    </HudPanel>
  </div>

  <div ref="palco" class="apres-palco" :class="{ ativo: rodando, 'sem-cursor': rodando && !controlesVisiveis }" @mousemove="mexeu" @click="mexeu">
    <template v-if="rodando">
      <div v-for="(tela, i) in telas" :key="tela.chave" class="apres-slide" :class="{ visivel: i === indice }">
        <template v-if="montado(i)">
          <div v-if="!prontos.has(tela.chave)" class="carregando-app"><span class="anel-carga" /><small>Conectando à {{ tela.app.nome }}…</small></div>
          <iframe :src="enderecoExibicao(tela)" :title="tela.app.nome" allow="fullscreen" referrerpolicy="strict-origin-when-cross-origin" @load="marcarPronto(tela.chave)" />
        </template>
      </div>

      <!-- O quadro da aplicação engole o mouse; esta faixa no rodapé traz os controles de volta -->
      <div class="apres-zona" @mousemove="mexeu" @click="mexeu" />
      <div class="apres-barra-tempo"><i :style="{ width: `${progresso}%` }" /></div>
      <div class="apres-controles" :class="{ oculto: !controlesVisiveis }">
        <span class="icone-app mini" aria-hidden="true">{{ atual?.app.tipo === 'painel' ? '◧' : atual?.app.nome.charAt(0) }}</span>
        <span class="embutida-nome">
          <strong>{{ atual?.app.nome }}<template v-if="atual?.pagina"> · {{ atual.pagina.titulo }}</template></strong>
          <small><template v-if="atual?.total > 1">página {{ atual.posicao }} de {{ atual.total }} · </template>tela {{ indice + 1 }} de {{ totalTelas }} · {{ pausado ? 'pausado' : `próxima em ${restante}s` }}</small>
        </span>
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
