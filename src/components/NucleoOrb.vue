<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { contagemNatal, corFaixa, arvore, presente, tampaEFita } from './temas/desenhoNatal'

const props = defineProps({
  titulo: { type: String, default: 'NÚCLEO' },
  subtitulo: { type: String, default: 'INTELIGÊNCIA DE DADOS' },
  modo: { type: String, default: '' }, // '' | ouvindo | pensando | falando (assistente de voz)
  nivel: { type: Number, default: 0 }, // volume da voz (0 a 1)
  enfeite: { type: String, default: '' }, // tema sazonal: 'natal' veste a esfera de bola de Natal
})
const natal = computed(() => props.enfeite === 'natal')
const saudacao = computed(() => (natal.value ? contagemNatal() : null))
// Bolinhas coloridas presas na esfera
const BOLAS = ['255,77,99', '255,201,77', '56,214,255', '255,120,200', '255,255,255']
// Cor das linhas e dos pontos em cada modo
const CORES = {
  '': [[80, 210, 255], [150, 235, 255]],
  ouvindo: [[52, 245, 164], [170, 255, 215]],
  pensando: [[167, 139, 250], [215, 200, 255]],
  falando: [[90, 225, 255], [200, 245, 255]],
}
const tela = ref(null)
let quadro = 0, observador = null

onMounted(() => {
  const c = tela.value, ctx = c.getContext('2d')
  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const N = 220, pontos = []
  for (let i = 0; i < N; i++) {           // esfera de Fibonacci
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), t = i * 2.39996
    pontos.push([Math.cos(t) * r, y, Math.sin(t) * r])
  }
  let ang = 0, pulso = 0
  const desenhar = () => {
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight
    // Confere largura E altura: se só a altura do quadro muda (layout carregando), o desenho esticava.
    const lw = Math.round(w * dpr), lh = Math.round(h * dpr)
    if (c.width !== lw || c.height !== lh) { c.width = lw; c.height = lh }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const modo = props.modo
    const alvo = modo === 'falando' ? 0.35 + 0.4 * Math.abs(Math.sin(performance.now() / 110))
      : modo === 'ouvindo' ? 0.15 + Math.min(1, props.nivel * 1.5)
      : modo === 'pensando' ? 0.25 + 0.15 * Math.sin(performance.now() / 250) : 0
    pulso += (alvo - pulso) * 0.18
    const [linha, ponto] = CORES[modo] || CORES['']
    const enfeitado = natal.value, agora = performance.now()
    const R = Math.min(w, h) * (enfeitado ? 0.31 : 0.36) * (1 + pulso * 0.1), cx = w / 2, cy = h / 2 + (enfeitado ? h * 0.04 : 0)
    if (enfeitado) {
      // Pinheiros dos lados (só se couberem) e presentes no chão
      const base = cy + R * 1.18, alt = Math.min(R * 1.45, h * 0.55)
      if (w > R * 4.2) { arvore(ctx, Math.max(cx - R * 1.75, alt * 0.36), base, alt, agora, 0); arvore(ctx, Math.min(cx + R * 1.75, w - alt * 0.32), base, alt * 0.85, agora, 3) }
      presente(ctx, cx - R * 0.95, base + 4, R * 0.22, '255,77,99', '255,201,77')
      presente(ctx, cx - R * 0.66, base + 8, R * 0.15, '56,214,255', '255,120,200')
      presente(ctx, cx + R * 0.8, base + 6, R * 0.19, '255,201,77', '255,77,99')
    }
    const brilho = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.25)
    brilho.addColorStop(0, `rgba(${linha.join(',')},${0.28 + pulso * 0.25})`); brilho.addColorStop(0.6, 'rgba(20,120,220,0.10)'); brilho.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = brilho; ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2); ctx.fill()
    const cos = Math.cos(ang), sin = Math.sin(ang), inc = 0.35
    const proj = pontos.map(([x, y, z]) => {
      const x1 = x * cos - z * sin, z1 = x * sin + z * cos
      const y1 = y * Math.cos(inc) - z1 * Math.sin(inc), z2 = y * Math.sin(inc) + z1 * Math.cos(inc)
      return [cx + x1 * R, cy + y1 * R, z2]
    })
    ctx.lineWidth = 0.6
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const a = proj[i], b = proj[j], dx = a[0] - b[0], dy = a[1] - b[1], d = dx * dx + dy * dy
      if (d < (R * 0.24) ** 2) {
        const prof = (a[2] + b[2] + 2) / 4
        const cl = enfeitado && !modo ? corFaixa((pontos[i][1] + pontos[j][1]) / 2) : linha
        ctx.strokeStyle = `rgba(${cl.join(',')},${0.05 + prof * (0.35 + pulso * 0.3)})`
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke()
      }
    }
    for (let i = 0; i < N; i++) {
      const [x, y, z] = proj[i], prof = (z + 1) / 2
      if (enfeitado && i % 11 === 4) { // bolinha de Natal com brilho
        const cor = BOLAS[(i / 11 | 0) % BOLAS.length], r = 2 + prof * 3, b = 0.75 + 0.25 * Math.sin(agora / 400 + i)
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3)
        g.addColorStop(0, `rgba(${cor},${(0.35 * prof + 0.1) * b})`); g.addColorStop(1, `rgba(${cor},0)`)
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = `rgba(${cor},${0.35 + prof * 0.65})`
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
        continue
      }
      ctx.fillStyle = enfeitado && !modo ? `rgba(255,245,225,${0.25 + prof * 0.75})` : `rgba(${ponto.join(',')},${0.25 + prof * 0.75})`
      ctx.beginPath(); ctx.arc(x, y, 0.8 + prof * (1.6 + pulso * 1.2), 0, Math.PI * 2); ctx.fill()
    }
    if (enfeitado) tampaEFita(ctx, cx, cy - R, R, agora)
    ang += 0.0035 * (modo === 'pensando' ? 6 : modo ? 2 : 1)
    if (!reduzir) quadro = requestAnimationFrame(desenhar)
  }
  desenhar()
  // Sem animação, redesenha quando o quadro muda de tamanho.
  if (reduzir) { observador = new ResizeObserver(() => desenhar()); observador.observe(c) }
})
onBeforeUnmount(() => { cancelAnimationFrame(quadro); observador?.disconnect() })
</script>

<template>
  <div class="orb" :class="[modo && `orb-${modo}`, { 'orb-natal': natal }]">
    <span class="anel a1" /><span class="anel a2" /><span class="anel a3" />
    <span class="chao" aria-hidden="true" />
    <canvas ref="tela" aria-hidden="true" />
    <div class="orb-texto">
      <strong>{{ titulo }}</strong>
      <small>{{ subtitulo }}</small>
      <template v-if="saudacao">
        <em class="orb-saudacao">✦ {{ saudacao.titulo }} ✦</em>
        <em class="orb-contagem">{{ saudacao.linha }}</em>
      </template>
      <em v-else>DMAE · v1.0</em>
    </div>
  </div>
</template>
