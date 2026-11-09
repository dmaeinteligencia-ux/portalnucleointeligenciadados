<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  titulo: { type: String, default: 'NÚCLEO' },
  subtitulo: { type: String, default: 'INTELIGÊNCIA DE DADOS' },
  modo: { type: String, default: '' }, // '' | ouvindo | pensando | falando (assistente de voz)
  nivel: { type: Number, default: 0 }, // volume da voz (0 a 1)
})
// Cor das linhas e dos pontos em cada modo
const CORES = {
  '': [[80, 210, 255], [150, 235, 255]],
  ouvindo: [[52, 245, 164], [170, 255, 215]],
  pensando: [[167, 139, 250], [215, 200, 255]],
  falando: [[90, 225, 255], [200, 245, 255]],
}
const tela = ref(null)
let quadro = 0

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
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const modo = props.modo
    const alvo = modo === 'falando' ? 0.35 + 0.4 * Math.abs(Math.sin(performance.now() / 110))
      : modo === 'ouvindo' ? 0.15 + Math.min(1, props.nivel * 1.5)
      : modo === 'pensando' ? 0.25 + 0.15 * Math.sin(performance.now() / 250) : 0
    pulso += (alvo - pulso) * 0.18
    const [linha, ponto] = CORES[modo] || CORES['']
    const R = Math.min(w, h) * 0.36 * (1 + pulso * 0.1), cx = w / 2, cy = h / 2
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
        ctx.strokeStyle = `rgba(${linha.join(',')},${0.05 + prof * (0.35 + pulso * 0.3)})`
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke()
      }
    }
    for (const [x, y, z] of proj) {
      const prof = (z + 1) / 2
      ctx.fillStyle = `rgba(${ponto.join(',')},${0.25 + prof * 0.75})`
      ctx.beginPath(); ctx.arc(x, y, 0.8 + prof * (1.6 + pulso * 1.2), 0, Math.PI * 2); ctx.fill()
    }
    ang += 0.0035 * (modo === 'pensando' ? 6 : modo ? 2 : 1)
    if (!reduzir) quadro = requestAnimationFrame(desenhar)
  }
  desenhar()
})
onBeforeUnmount(() => cancelAnimationFrame(quadro))
</script>

<template>
  <div class="orb" :class="modo && `orb-${modo}`">
    <span class="anel a1" /><span class="anel a2" /><span class="anel a3" />
    <span class="chao" aria-hidden="true" />
    <canvas ref="tela" aria-hidden="true" />
    <div class="orb-texto">
      <strong>{{ titulo }}</strong>
      <small>{{ subtitulo }}</small>
      <em>DMAE · v1.0</em>
    </div>
  </div>
</template>
