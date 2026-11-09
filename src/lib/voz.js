// Comandos de voz do portal.
//
// O microfone é capturado no navegador (PCM 16 kHz) e enviado por WebSocket ao serviço de voz
// na rede interna (servidor-voz/), que reconhece só as frases de comando do portal e devolve o texto.
// Na escuta contínua, o comando precisa começar pela palavra de ativação "Núcleo".
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

export const voz = reactive({
  disponivel: false, // serviço alcançável a partir deste computador
  verificado: false,
  estado: 'desligado', // desligado | conectando | ouvindo | comando | falando | erro
  parcial: '',
  ultimo: '', // último texto reconhecido
  resposta: '', // o que o portal respondeu
  erro: '',
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
export function falar(texto) {
  if (!texto || !window.speechSynthesis) return Promise.resolve()
  return new Promise((resolver) => {
    const fala = new SpeechSynthesisUtterance(texto)
    fala.lang = 'pt-BR'
    const vozPt = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pt'))
    if (vozPt) fala.voice = vozPt
    fala.rate = 1.05
    fala.onend = fala.onerror = () => resolver()
    voz.resposta = texto
    speechSynthesis.cancel()
    speechSynthesis.speak(fala)
  })
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

let sessao = null // { ws, ctx, stream, no, aoTexto, frases }
let pausado = false
let tentativas = 0

export async function ligar({ frases, aoTexto }) {
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
    if (ctx.state === 'suspended') await ctx.resume()

    const ws = new WebSocket(VOZ_URL.replace(/^http/, 'ws') + '/escuta')
    ws.binaryType = 'arraybuffer'
    sessao = { ws, ctx, stream, no, aoTexto, frases }

    ws.onopen = () => ws.send(JSON.stringify({ token, frases }))
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.tipo === 'pronto') {
        tentativas = 0
        voz.estado = 'ouvindo'
      } else if (msg.tipo === 'parcial') {
        voz.parcial = msg.texto
      } else if (msg.tipo === 'final') {
        voz.parcial = ''
        voz.ultimo = msg.texto
        aoTexto(msg.texto)
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
        setTimeout(() => ligar({ frases, aoTexto }), 2000 * tentativas)
      } else {
        voz.estado = 'erro'
        voz.erro = 'Sem conexão com o serviço de voz.'
      }
    }
    no.port.onmessage = (ev) => {
      if (!pausado && ws.readyState === WebSocket.OPEN) ws.send(ev.data)
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
