<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { listarAplicacoes, salvarAplicacao, desativada, rotuloPlataforma, listarListas, salvarLista, excluirLista } from '../lib/dados'
import { auth } from '../lib/auth'
import HudPanel from '../components/HudPanel.vue'

// Modo apresentação: percorre painéis e sistemas visíveis, um de cada vez, em tela cheia (TV, telão).
// Painéis do Power BI com várias páginas viram uma tela por página (lista lida pela automação diária).
// Os ajustes de cada item (tempo, fora da rotação, páginas) ficam no banco, coluna "apresentacao",
// para valer em qualquer TV. Tempo padrão e filtro de tipo ficam no navegador.
// Listas de apresentação: conjuntos nomeados (ex.: "Recepção", "Diretoria") montados pelos administradores,
// com ordem, tempos e páginas próprios. "Todos os itens" é a rotação geral de antes.
// Endereço aceita ?lista=<id>&tempo=15&tipo=painel&auto=1 para deixar a TV já configurada num favorito.
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
const listas = ref([])
const listaId = ref(String(route.query.lista || pref.lista || ''))
const lista = computed(() => listas.value.find(l => l.id === listaId.value) || null)
// Ajustes que ainda não chegaram ao banco (sem permissão, sem a migração 0006 ou versão antiga desta tela)
const pendentes = reactive(soVer ? {} : { ...(pref.pendentes || {}) })
if (!soVer) for (const id of pref.excluidos || []) pendentes[id] = { ...pendentes[id], fora: true }
const aviso = ref('')

const guardarPreferencias = () => {
  try { localStorage.setItem(CHAVE, JSON.stringify({ tempo: tempo.value, tipo: tipo.value, lista: listaId.value, pendentes })) } catch { /* sem armazenamento */ }
}
watch([tempo, tipo, listaId, pendentes], guardarPreferencias, { deep: true })

const ajustes = app => ({ ...(app.apresentacao || {}), ...(pendentes[app.id] || {}) })
// Tempo padrão: o da lista escolhida, se ela tiver um; senão o desta TV
const tempoPadrao = computed(() => Number(lista.value?.tempo) || tempo.value)
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
// Itens mostrados: na rotação geral, todos os do tipo escolhido; numa lista, os dela, na ordem dela.
// Cada item leva seus ajustes (cfg): os do próprio item na geral, os da lista dentro de uma lista.
const itens = computed(() => {
  if (!lista.value) return doTipo.value.map(app => ({ chave: app.id, app, cfg: ajustes(app) }))
  const porId = new Map(disponiveis.value.map(a => [a.id, a]))
  return (lista.value.itens || []).filter(it => porId.has(it.id)).map(it => ({ chave: it.id, app: porId.get(it.id), cfg: it }))
})
// Itens da lista que sumiram do catálogo, foram desativados ou ficaram sem endereço
const indisponiveis = computed(() => lista.value ? (lista.value.itens || []).length - itens.value.length : 0)
const fila = computed(() => itens.value.filter(i => !i.cfg.fora))
const temPowerBI = computed(() => fila.value.some(i => i.app.plataforma === 'powerbi'))
const tempoDe = item => Number(item.cfg.tempo) || tempoPadrao.value

// Cada item vira uma ou mais telas (uma por página do painel escolhida)
function paginasEscolhidas({ app, cfg }) {
  const todas = paginasDe(app)
  if (todas.length < 2) return [null]
  if (cfg.paginas === 'primeira') return [todas[0]]
  const fora = new Set(cfg.paginas_fora || [])
  const escolhidas = todas.filter(p => !fora.has(p.nome))
  return escolhidas.length ? escolhidas : [todas[0]]
}
const telas = computed(() => fila.value.flatMap((item, n) => {
  const paginas = paginasEscolhidas(item)
  return paginas.map((pagina, i) => ({
    chave: `${n}:${item.app.id}:${pagina?.nome || ''}`, app: item.app, pagina, posicao: i + 1, total: paginas.length, tempo: tempoDe(item),
  }))
}))
const totalTelas = computed(() => telas.value.length)

// Ajuste de um item: na rotação geral vai para o próprio item; numa lista, só para a lista
function ajustarItem(item, mudanca) {
  if (!lista.value) return ajustar(item.app, mudanca)
  if (!admin.value) return
  const novo = { ...item.cfg, ...mudanca }
  for (const k of Object.keys(novo)) if (novo[k] === undefined || novo[k] === null || novo[k] === '') delete novo[k]
  gravarLista({ itens: lista.value.itens.map(it => (it.id === item.app.id ? novo : it)) })
}

function alternarPagina(item, pagina) {
  const fora = new Set(item.cfg.paginas_fora || [])
  fora.has(pagina.nome) ? fora.delete(pagina.nome) : fora.add(pagina.nome)
  ajustarItem(item, { paginas_fora: [...fora] })
}

function mudarTempoPadrao(valor) {
  const v = Number(valor) || undefined
  if (!lista.value) { tempo.value = v || 10; return }
  gravarLista({ tempo: v ?? null })
}

// ---------- Listas (só administradores mudam) ----------
const novoNome = ref('')
const criando = ref(false)
const confirmarExclusao = ref(false)
const linkCopiado = ref(false)

async function gravarLista(mudanca) {
  if (!admin.value || !lista.value) return
  const alvo = lista.value
  const anterior = { ...alvo }
  Object.assign(alvo, mudanca) // aparece na hora; volta atrás se o banco recusar
  try {
    await salvarLista({ id: alvo.id, ...mudanca })
    aviso.value = ''
  } catch {
    Object.assign(alvo, anterior)
    aviso.value = 'Não consegui salvar a lista (falta aplicar a migração 0008?).'
  }
}

async function criarLista() {
  const nome = novoNome.value.trim()
  if (!nome || !admin.value) return
  try {
    const nova = await salvarLista({ nome, itens: [] })
    listas.value = [...listas.value, nova]
    listaId.value = nova.id
    novoNome.value = ''
    criando.value = false
    aviso.value = ''
  } catch {
    aviso.value = 'Não consegui criar a lista (falta aplicar a migração 0008?).'
  }
}

async function apagarLista() {
  if (!confirmarExclusao.value) { confirmarExclusao.value = true; setTimeout(() => { confirmarExclusao.value = false }, 4000); return }
  confirmarExclusao.value = false
  const id = listaId.value
  try {
    await excluirLista(id)
    listas.value = listas.value.filter(l => l.id !== id)
    listaId.value = ''
  } catch {
    aviso.value = 'Não consegui excluir a lista.'
  }
}

// Itens que ainda podem entrar na lista escolhida, separados em painéis e sistemas
const paraAdicionar = computed(() => {
  if (!lista.value) return { paineis: [], sistemas: [] }
  const ja = new Set((lista.value.itens || []).map(it => it.id))
  const livres = disponiveis.value.filter(a => !ja.has(a.id))
  return { paineis: livres.filter(a => a.tipo === 'painel'), sistemas: livres.filter(a => a.tipo !== 'painel') }
})

function adicionarItem(id) {
  if (!id || !lista.value) return
  gravarLista({ itens: [...(lista.value.itens || []), { id }] })
}

function moverItem(item, direcao) {
  const lst = [...lista.value.itens]
  const i = lst.findIndex(it => it.id === item.app.id)
  const j = i + direcao
  if (i < 0 || j < 0 || j >= lst.length) return
  ;[lst[i], lst[j]] = [lst[j], lst[i]]
  gravarLista({ itens: lst })
}

const tirarItem = item => gravarLista({ itens: lista.value.itens.filter(it => it.id !== item.app.id) })
// Tira da lista o que não existe mais no catálogo ou foi desativado
const limparIndisponiveis = () => gravarLista({ itens: lista.value.itens.filter(it => itens.value.some(i => i.app.id === it.id)) })

const linkTV = computed(() => lista.value ? `${location.origin}/apresentacao?lista=${lista.value.id}&auto=1` : '')
async function copiarLink() {
  try { await navigator.clipboard.writeText(linkTV.value); linkCopiado.value = true; setTimeout(() => { linkCopiado.value = false }, 2500) } catch { /* sem área de transferência */ }
}

async function carregar() {
  const [a, l] = await Promise.all([listarAplicacoes(), listarListas().catch(() => [])])
  apps.value = a
  listas.value = l
  // Lista guardada que foi excluída: volta para a rotação geral
  if (listaId.value && !l.some(x => x.id === listaId.value)) listaId.value = ''
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
const duracao = computed(() => (atual.value?.tempo || tempoPadrao.value) * 1000)
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
      <div class="apres-listas">
        <label>Lista exibida
          <select v-model="listaId">
            <option value="">Todos os itens (rotação geral)</option>
            <option v-for="l in listas" :key="l.id" :value="l.id">{{ l.nome }} ({{ (l.itens || []).length }})</option>
          </select>
        </label>
        <template v-if="admin">
          <form v-if="criando" class="apres-nova" @submit.prevent="criarLista">
            <input v-model="novoNome" placeholder="Nome da lista, ex.: Recepção" maxlength="60" autofocus />
            <button class="botao" :disabled="!novoNome.trim()">Criar</button>
            <button type="button" class="botao secundario" @click="criando = false">Cancelar</button>
          </form>
          <button v-else class="botao secundario" @click="criando = true">+ Nova lista</button>
          <template v-if="lista && !criando">
            <label class="apres-nome">Nome
              <input :value="lista.nome" maxlength="60" @change="$event.target.value.trim() && gravarLista({ nome: $event.target.value.trim() })" />
            </label>
            <button class="botao-link perigo" @click="apagarLista">{{ confirmarExclusao ? 'Clique de novo para excluir' : 'Excluir lista' }}</button>
          </template>
        </template>
      </div>
      <div class="apres-config">
        <label>Tempo padrão em cada tela
          <span class="apres-tempo"><input :value="tempoPadrao" type="number" min="5" max="600" step="5" :disabled="lista && !admin" @change="mudarTempoPadrao($event.target.value)" /> segundos</span>
        </label>
        <label v-if="!lista">O que mostrar
          <select v-model="tipo">
            <option value="">Painéis e sistemas</option>
            <option value="painel">Só painéis de BI</option>
            <option value="sistema">Só sistemas</option>
          </select>
        </label>
        <div v-if="temPowerBI" class="login-painel">
          <span>⛨ {{ loginFeito ? 'Login Microsoft feito. Pode iniciar.' : 'Os painéis do Power BI pedem a conta Microsoft do DMAE. Entre uma vez antes de iniciar.' }}</span>
          <button class="botao secundario" @click="entrarMicrosoft">{{ loginFeito ? 'Entrar de novo' : 'Entrar com a Microsoft' }}</button>
        </div>
        <button class="botao brilho apres-iniciar" :disabled="!totalTelas" @click="iniciar">▶ Iniciar apresentação ({{ totalTelas }} {{ totalTelas === 1 ? 'tela' : 'telas' }})</button>
      </div>
      <p v-if="lista" class="apres-link">
        <span>Link desta lista para a TV (já começa sozinho): <code>{{ linkTV }}</code></span>
        <button class="botao-link" @click="copiarLink">{{ linkCopiado ? 'Copiado ✓' : 'Copiar link' }}</button>
      </p>
      <p class="dica-embutida">Atalhos durante a apresentação: espaço pausa, setas voltam e avançam, Esc sai. A lista é atualizada a cada volta completa, então mudanças feitas em outro computador entram sozinhas.</p>
    </HudPanel>

    <HudPanel :titulo="lista ? `Itens da lista ${lista.nome}` : 'Itens na rotação'" :etiqueta="`${fila.length} de ${itens.length}`">
      <p v-if="aviso" class="filtro-aviso">{{ aviso }}</p>
      <p v-if="carregado && !lista && !doTipo.length" class="suave">Nenhum item visível com endereço cadastrado.</p>
      <p v-if="lista && !itens.length" class="suave">{{ admin ? 'Lista vazia. Escolha abaixo os painéis e sistemas que entram nela.' : 'Esta lista ainda não tem itens.' }}</p>
      <p v-if="indisponiveis" class="filtro-aviso">
        {{ indisponiveis }} {{ indisponiveis === 1 ? 'item desta lista não está disponível' : 'itens desta lista não estão disponíveis' }} (desativado, oculto ou sem endereço) e não {{ indisponiveis === 1 ? 'aparece' : 'aparecem' }}.
        <button v-if="admin" class="botao-link" @click="limparIndisponiveis">Tirar da lista</button>
      </p>
      <ul class="apres-lista">
        <li v-for="(item, n) in itens" :key="item.chave" :class="{ fora: item.cfg.fora }">
          <div class="apres-item">
            <span v-if="lista" class="apres-posicao">{{ n + 1 }}</span>
            <label class="apres-item-nome">
              <input type="checkbox" :checked="!item.cfg.fora" :disabled="soVer || (lista && !admin)" :title="lista ? 'Desmarcado: fica na lista, mas não passa na TV' : ''" @change="ajustarItem(item, { fora: !item.cfg.fora || undefined })" />
              <span class="icone-app mini" aria-hidden="true">{{ item.app.tipo === 'painel' ? '◧' : item.app.nome.charAt(0) }}</span>
              <span><strong>{{ item.app.nome }}</strong><small>{{ item.app.tipo === 'painel' ? `Painel ${rotuloPlataforma[item.app.plataforma] || 'de BI'}` : 'Sistema' }}{{ paginasDe(item.app).length > 1 ? ` · ${paginasDe(item.app).length} páginas` : '' }}{{ item.app.area ? ` · ${item.app.area}` : '' }}</small></span>
            </label>
            <label class="apres-item-tempo" :title="`Tempo em cada tela deste item. Vazio usa o padrão (${tempoPadrao}s).`">
              <input type="number" min="5" max="600" step="5" :value="item.cfg.tempo || ''" :placeholder="String(tempoPadrao)" :disabled="soVer || (lista && !admin) || item.cfg.fora" @change="ajustarItem(item, { tempo: Number($event.target.value) || undefined })" />
              <small>s</small>
            </label>
            <span v-if="lista && admin" class="apres-ordem">
              <button class="comando-mini" title="Subir" :disabled="n === 0" @click="moverItem(item, -1)">↑</button>
              <button class="comando-mini" title="Descer" :disabled="n === itens.length - 1" @click="moverItem(item, 1)">↓</button>
              <button class="comando-mini" title="Tirar da lista" @click="tirarItem(item)">✕</button>
            </span>
          </div>
          <div v-if="paginasDe(item.app).length > 1 && !item.cfg.fora" class="apres-paginas">
            <select :value="item.cfg.paginas || 'todas'" :disabled="soVer || (lista && !admin)" aria-label="Páginas a mostrar" @change="ajustarItem(item, { paginas: $event.target.value === 'todas' ? undefined : $event.target.value })">
              <option value="todas">Mostrar as páginas marcadas ({{ paginasEscolhidas(item).length }})</option>
              <option value="primeira">Só a primeira página</option>
            </select>
            <div v-if="(item.cfg.paginas || 'todas') === 'todas'" class="apres-paginas-lista">
              <label v-for="p in paginasDe(item.app)" :key="p.nome" :class="{ fora: (item.cfg.paginas_fora || []).includes(p.nome) }">
                <input type="checkbox" :checked="!(item.cfg.paginas_fora || []).includes(p.nome)" :disabled="soVer || (lista && !admin)" @change="alternarPagina(item, p)" />{{ p.titulo }}
              </label>
            </div>
          </div>
        </li>
      </ul>
      <label v-if="lista && admin" class="apres-adicionar">Adicionar à lista
        <select value="" @change="adicionarItem($event.target.value); $event.target.value = ''">
          <option value="" disabled>Escolha um painel ou sistema…</option>
          <optgroup v-if="paraAdicionar.paineis.length" label="Painéis de BI">
            <option v-for="a in paraAdicionar.paineis" :key="a.id" :value="a.id">{{ a.nome }}{{ a.area ? ` · ${a.area}` : '' }}</option>
          </optgroup>
          <optgroup v-if="paraAdicionar.sistemas.length" label="Sistemas">
            <option v-for="a in paraAdicionar.sistemas" :key="a.id" :value="a.id">{{ a.nome }}{{ a.area ? ` · ${a.area}` : '' }}</option>
          </optgroup>
        </select>
      </label>
      <p v-if="soVer" class="dica-embutida">Esta é a conta de apresentação: ela só exibe. Escolha a lista em cima; os itens, tempos e páginas são definidos pelos administradores do portal.</p>
      <p v-else-if="lista" class="dica-embutida">A lista passa na TV nesta ordem. Tempo e páginas de cada item valem só dentro desta lista. Desmarcar um item tira ele da TV sem tirar da lista. Itens desativados não entram.</p>
      <p v-else class="dica-embutida">Desmarque o que não deve aparecer na TV, como um sistema que fica em branco dentro do portal. O tempo ao lado de cada item vale para cada tela dele (vazio usa o padrão). Os ajustes ficam salvos no portal e valem em qualquer TV. Itens desativados não entram. Para mostrar só alguns itens, crie uma lista.</p>
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
