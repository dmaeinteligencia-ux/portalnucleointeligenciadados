// Comandos de voz do portal.
//
// O microfone é capturado no navegador (PCM 16 kHz) e enviado por WebSocket ao serviço de voz
// na rede interna (servidor-voz/), que reconhece só as frases de comando do portal e devolve o texto.
// Na escuta contínua, o comando precisa começar pela palavra de ativação "Sane".
// Quando o pedido não é um comando conhecido e o serviço tem o Gemini configurado, o portal pede ao
// serviço que mande aquele trecho de áudio ao Gemini, que devolve a ação ou uma resposta falada.
import { reactive } from 'vue'
import { supabase, modoDemo } from './supabase'

export const VOZ_URL = (import.meta.env.VITE_VOZ_URL || 'https://172.22.1.200').replace(/\/$/, '')
export const PALAVRA = 'sane'

// Palavras que o modelo de voz (Vosk pequeno em português) não conhece: trocadas por palavras que ele
// conhece e que soam igual juntas ("ouvido ria" ≈ "ouvidoria"), além de apelidos.
// Quando um nome de aplicação não for reconhecido, acrescente aqui.
const SINONIMOS = {
  ouvidoria: ['ouvido ria', 'ouvidor ia', 'ouvidor', 'reclamações'],
}

// Nome completo com cada palavra desconhecida trocada pelos sinônimos ("agenda da ouvidoria" → "agenda da ouvido ria"…)
function variantes(nome) {
  let saida = [nome]
  for (const [palavra, trocas] of Object.entries(SINONIMOS)) {
    if (!nome.split(' ').includes(palavra)) continue
    saida = saida.flatMap((n) => trocas.map((t) => n.split(' ').map((w) => (w === palavra ? t : w)).join(' ')))
  }
  return saida
}

// Preferência de escuta automática (por navegador). Começa ligada; desligar pelo botão vale até religar.
function lerAutomatica() {
  try { return localStorage.getItem('voz-automatica') !== '0' } catch { return true }
}
export function definirAutomatica(sim) {
  voz.automatica = sim
  try { localStorage.setItem('voz-automatica', sim ? '1' : '0') } catch { /* sem armazenamento */ }
}

// A escuta automática só liga sozinha se o microfone já foi permitido antes (senão o navegador pediria permissão sem clique).
export async function microfonePermitido() {
  try {
    const p = await navigator.permissions.query({ name: 'microphone' })
    return p.state === 'granted'
  } catch {
    return false
  }
}

export const voz = reactive({
  disponivel: false, // serviço alcançável a partir deste computador
  verificado: false,
  estado: 'desligado', // desligado | conectando | ouvindo | comando | falando | erro
  parcial: '',
  ultimo: '', // último texto reconhecido
  resposta: '', // o que o portal respondeu
  erro: '',
  gemini: false, // o serviço tem a inteligência artificial (Gemini) configurada
  automatica: lerAutomatica(), // liga a escuta sozinha ao abrir o portal
  nivel: 0, // volume da voz agora (0 a 1), para a animação
  falaServidor: false, // o serviço gera a voz (Piper); senão, voz do navegador
})

const suportado = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!window.AudioWorkletNode && !!window.WebSocket

// ---------- Texto ----------
export const normalizar = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const SEM_PESO = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'para', 'sistema', 'app', 'portal'])

// Apelidos de cada aplicação: nome completo e palavras que só ela tem.
export function apelidos(apps) {
  const contagem = {}
  const porApp = apps.map((app) => {
    const nome = (app.nome || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim()
    const palavras = nome.split(' ').filter((p) => p.length > 3 && !SEM_PESO.has(p))
    for (const p of [...palavras]) if (SINONIMOS[p]) palavras.push(...SINONIMOS[p].slice(2))
    palavras.forEach((p) => (contagem[p] = (contagem[p] || 0) + 1))
    return { app, nome, palavras }
  })
  return porApp.map(({ app, nome, palavras }) => ({
    app,
    nomes: [...new Set([...variantes(nome), ...palavras.filter((p) => contagem[p] === 1)])].filter((n) => n && !SINONIMOS[n]),
  }))
}

const NAVEGACAO = [
  { frases: ['início', 'ir para o início', 'central', 'ir para a central', 'tela inicial'], acao: { tipo: 'ir', para: '/', fala: 'Central.' } },
  { frases: ['aplicações', 'ir para aplicações', 'mostrar aplicações', 'catálogo'], acao: { tipo: 'ir', para: '/aplicacoes', fala: 'Aplicações.' } },
  { frases: ['administração', 'ir para administração', 'painel de administração'], acao: { tipo: 'ir', para: '/admin', fala: 'Administração.' } },
  { frases: ['voltar', 'volta'], acao: { tipo: 'voltar', fala: 'Voltando.' } },
  { frases: ['que horas são', 'horas'], acao: { tipo: 'horas' } },
  { frases: ['parar de ouvir', 'desligar microfone', 'desligar'], acao: { tipo: 'parar', fala: 'Microfone desligado.' } },
  { frases: ['sair do portal'], acao: { tipo: 'sair', fala: 'Saindo do portal.' } },
]
const VERBOS = ['abrir', 'abre', 'mostrar', 'usar']

// Frases que o serviço deve reconhecer (com e sem a palavra de ativação).
export function montarFrases(apps) {
  const base = []
  for (const n of NAVEGACAO) base.push(...n.frases)
  for (const { nomes } of apelidos(apps)) {
    for (const nome of nomes) {
      for (const v of VERBOS) base.push(`${v} ${nome}`, `${v} a ${nome}`, `${v} o ${nome}`)
      base.push(`abrir ${nome} em nova aba`)
    }
  }
  return [...new Set([PALAVRA, ...base, ...base.map((f) => `${PALAVRA} ${f}`)])]
}

// Transforma o texto reconhecido numa ação.
export function interpretar(texto, apps, { exigirPalavra = true } = {}) {
  // O reconhecedor marca ruído e palavras fora da lista como [unk]; o comando vale a partir da palavra de ativação.
  let t = normalizar((texto || '').replace(/\[unk\]/g, ' '))
  const palavra = normalizar(PALAVRA)
  const palavras = t.split(' ')
  const posicao = palavras.lastIndexOf(palavra)
  const temPalavra = posicao !== -1
  if (exigirPalavra && !temPalavra) return null
  if (temPalavra) t = palavras.slice(posicao + 1).join(' ')
  if (!t) return { tipo: 'ativar' }

  for (const n of NAVEGACAO) if (n.frases.some((f) => normalizar(f) === t)) return n.acao

  const novaAba = /\bem nova aba$/.test(t)
  if (novaAba) t = t.replace(/\s*em nova aba$/, '')
  const verbo = VERBOS.find((v) => t.startsWith(v + ' '))
  if (verbo) {
    const alvo = t.slice(verbo.length).trim().replace(/^(a|o) /, '')
    for (const { app, nomes } of apelidos(apps)) {
      if (nomes.some((n) => normalizar(n) === alvo)) return { tipo: 'abrir', app, novaAba }
    }
    return { tipo: 'desconhecido', texto: alvo }
  }
  return { tipo: 'desconhecido', texto: t }
}

// ---------- Fala ----------
// Escolhe a melhor voz em português que o navegador tem. As vozes "Natural"/"Online" do Edge
// (Francisca, Thalita, Antonio) são as mais naturais; depois as do Google no Chrome; por último as do Windows.
let vozEscolhida = null
function pontuar(v) {
  const nome = `${v.name} ${v.voiceURI}`
  let p = 0
  if (/natural|online|neural/i.test(nome)) p += 10
  if (/google/i.test(nome)) p += 6
  if (/francisca|thalita/i.test(nome)) p += 2
  if (v.lang?.toLowerCase().replace('_', '-') === 'pt-br') p += 3
  if (/pt-pt|portugal/i.test(`${v.lang} ${nome}`)) p -= 5
  return p
}
function escolherVoz() {
  const vozes = (window.speechSynthesis?.getVoices() || []).filter((v) => v.lang?.toLowerCase().startsWith('pt'))
  vozEscolhida = vozes.sort((a, b) => pontuar(b) - pontuar(a))[0] || null
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  escolherVoz()
  speechSynthesis.addEventListener?.('voiceschanged', escolherVoz)
}

// Voz gerada no serviço (Piper): pede pelo WebSocket já aberto e toca o áudio; se falhar, usa a do navegador.
let falaPendente = null
function pedirFalaServidor(texto) {
  if (!voz.falaServidor || !sessao || sessao.ws.readyState !== WebSocket.OPEN) return Promise.resolve(null)
  falaPendente?.(null)
  return new Promise((resolver) => {
    const prazo = setTimeout(() => { falaPendente = null; resolver(null) }, 8000)
    falaPendente = (audio) => { clearTimeout(prazo); falaPendente = null; resolver(audio) }
    sessao.ws.send(JSON.stringify({ tipo: 'falar', texto }))
  })
}
async function tocar(audio) {
  ctxBipe = ctxBipe || new AudioContext()
  if (ctxBipe.state === 'suspended') await ctxBipe.resume().catch(() => {})
  const buffer = await ctxBipe.decodeAudioData(audio)
  return new Promise((resolver) => {
    const fonte = ctxBipe.createBufferSource()
    fonte.buffer = buffer
    fonte.connect(ctxBipe.destination)
    fonte.onended = () => resolver()
    fonte.start()
  })
}

export async function falar(texto) {
  if (!texto) return
  voz.resposta = texto
  try {
    const audio = await pedirFalaServidor(texto)
    if (audio) return await tocar(audio)
  } catch { /* cai para a voz do navegador */ }
  return falarNavegador(texto)
}

function falarNavegador(texto) {
  if (!window.speechSynthesis) return Promise.resolve()
  if (!vozEscolhida) escolherVoz()
  return new Promise((resolver) => {
    const fala = new SpeechSynthesisUtterance(texto)
    fala.lang = 'pt-BR'
    if (vozEscolhida) fala.voice = vozEscolhida
    // vozes naturais já têm bom ritmo; as antigas soam melhor um pouco mais lentas e graves
    const natural = vozEscolhida && pontuar(vozEscolhida) >= 10
    fala.rate = natural ? 1.05 : 0.95
    fala.pitch = natural ? 1 : 0.95
    fala.onend = fala.onerror = () => resolver()
    speechSynthesis.cancel()
    speechSynthesis.speak(fala)
  })
}

// Bipe curto de "pode falar". Não pausa o microfone (a fala "Sim?" cortava o começo do pedido).
let ctxBipe = null
export function bipe() {
  try {
    ctxBipe = ctxBipe || new AudioContext()
    const o = ctxBipe.createOscillator()
    const g = ctxBipe.createGain()
    const t = ctxBipe.currentTime
    o.frequency.setValueAtTime(880, t)
    o.frequency.setValueAtTime(1320, t + 0.07)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    o.connect(g).connect(ctxBipe.destination)
    o.start(t)
    o.stop(t + 0.17)
  } catch { /* sem áudio: segue só com o aviso visual */ }
}

// ---------- Serviço ----------
export async function verificarServico() {
  if (modoDemo || !suportado) {
    voz.disponivel = false
    voz.verificado = true
    return false
  }
  try {
    const controle = new AbortController()
    const prazo = setTimeout(() => controle.abort(), 3000)
    const r = await fetch(`${VOZ_URL}/saude`, { signal: controle.signal, cache: 'no-store' })
    clearTimeout(prazo)
    voz.disponivel = r.ok
    const info = r.ok ? await r.json().catch(() => ({})) : {}
    voz.gemini = !!info.gemini
    voz.falaServidor = !!info.fala
  } catch {
    voz.disponivel = false
  }
  voz.verificado = true
  return voz.disponivel
}

// ---------- Captura ----------
const WORKLET = `
class Captura extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(1600); this.n = 0 }
  process(entradas) {
    const canal = entradas[0] && entradas[0][0]
    if (canal) for (let i = 0; i < canal.length; i++) {
      const s = Math.max(-1, Math.min(1, canal[i]))
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.buffer.slice(0)); this.n = 0 }
    }
    return true
  }
}
registerProcessor('captura-nucleo', Captura)`

let sessao = null // { ws, ctx, stream, no, aoTexto, aoAcao, frases }
let pausado = false
let tentativas = 0

export async function ligar({ frases, aoTexto, aoAcao }) {
  if (sessao) return
  voz.erro = ''
  voz.estado = 'conectando'
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('Entre no portal para usar a voz.')

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    const ctx = new AudioContext({ sampleRate: 16000 })
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })))
    const fonte = ctx.createMediaStreamSource(stream)
    const no = new AudioWorkletNode(ctx, 'captura-nucleo')
    fonte.connect(no)
    // O Chrome só processa o nó se ele chegar ao destino; o ganho zero evita ouvir o próprio microfone.
    const mudo = ctx.createGain()
    mudo.gain.value = 0
    no.connect(mudo).connect(ctx.destination)
    // Sem um clique na página, o navegador pode manter o áudio suspenso (escuta automática):
    // tenta retomar agora e, se não der, no primeiro clique ou tecla.
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
      const retomar = () => {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {})
        if (ctxBipe?.state === 'suspended') ctxBipe.resume().catch(() => {})
      }
      for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, retomar, { once: true, capture: true })
    }

    const ws = new WebSocket(VOZ_URL.replace(/^http/, 'ws') + '/escuta')
    ws.binaryType = 'arraybuffer'
    sessao = { ws, ctx, stream, no, aoTexto, aoAcao, frases }

    ws.onopen = () => ws.send(JSON.stringify({ token, frases }))
    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) return falaPendente?.(ev.data) // áudio da resposta (Piper)
      const msg = JSON.parse(ev.data)
      if (msg.tipo === 'fala') return falaPendente?.(null)
      if (msg.tipo === 'pronto') {
        tentativas = 0
        voz.estado = 'ouvindo'
      } else if (msg.tipo === 'parcial') {
        voz.parcial = msg.texto
      } else if (msg.tipo === 'final') {
        voz.parcial = ''
        if (msg.texto) voz.ultimo = msg.texto
        aoTexto(msg.texto, msg)
      } else if (msg.tipo === 'acao') {
        aoAcao?.(msg)
      } else if (msg.tipo === 'erro') {
        voz.erro = msg.mensagem
      }
    }
    ws.onclose = (ev) => {
      const ativo = sessao?.ws === ws
      desligar({ manterEstado: true })
      if (!ativo) return
      if (ev.code === 4401) {
        voz.estado = 'erro'
        voz.erro = voz.erro || 'Login expirado. Entre de novo no portal.'
      } else if (tentativas < 3) {
        tentativas++
        voz.estado = 'conectando'
        setTimeout(() => ligar({ frases, aoTexto, aoAcao }), 2000 * tentativas)
      } else {
        voz.estado = 'erro'
        voz.erro = 'Sem conexão com o serviço de voz.'
      }
    }
    no.port.onmessage = (ev) => {
      if (!pausado && ws.readyState === WebSocket.OPEN) ws.send(ev.data)
      const a = new Int16Array(ev.data)
      let soma = 0
      for (let i = 0; i < a.length; i += 4) soma += a[i] * a[i]
      voz.nivel = pausado ? 0 : Math.min(1, Math.sqrt(soma / (a.length / 4)) / 6000)
    }
  } catch (e) {
    desligar({ manterEstado: true })
    voz.estado = 'erro'
    voz.erro = e.name === 'NotAllowedError' ? 'Permita o uso do microfone para este site.' : e.message || 'Não foi possível ligar o microfone.'
  }
}

export function atualizarFrases(frases) {
  if (!sessao) return
  sessao.frases = frases
  if (sessao.ws.readyState === WebSocket.OPEN) sessao.ws.send(JSON.stringify({ tipo: 'frases', frases }))
}

// Pede ao serviço que mande o último trecho falado ao Gemini; a resposta chega em aoAcao.
export function entender(apps) {
  if (!sessao || sessao.ws.readyState !== WebSocket.OPEN) return false
  const lista = apps.map(({ slug, nome, area, descricao }) => ({ slug, nome, area, descricao }))
  sessao.ws.send(JSON.stringify({ tipo: 'entender', apps: lista }))
  return true
}

// Enquanto o portal fala, o áudio não é enviado (para ele não ouvir a própria voz).
export function pausar(sim) { pausado = sim }

export function desligar({ manterEstado = false } = {}) {
  const s = sessao
  sessao = null
  if (s) {
    try { s.ws.close() } catch { /* já fechado */ }
    try { s.no.disconnect() } catch { /* nada */ }
    s.stream.getTracks().forEach((t) => t.stop())
    s.ctx.close().catch(() => {})
  }
  voz.parcial = ''
  if (!manterEstado) voz.estado = 'desligado'
}
