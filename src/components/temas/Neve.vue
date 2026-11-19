<script setup>
// Neve do tema de Natal: flocos discretos atrás dos painéis, num único canvas.
// Pausa com a aba escondida; com "reduzir movimento" fica um céu de flocos parado.
import { ref, onMounted, onBeforeUnmount } from 'vue'

const tela = ref(null)
let quadro = 0, flocos = [], w = 0, h = 0, ctx = null, ultimo = 0
const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function criar(topo) {
  const cristal = Math.random() < 0.2
  return {
    x: Math.random() * w,
    y: topo ? -10 - Math.random() * 40 : Math.random() * h,
    r: cristal ? 4 + Math.random() * 4.5 : 0.9 + Math.random() * 2.2,
    vy: 18 + Math.random() * 34, // px por segundo
    fase: Math.random() * Math.PI * 2,
    giro: (Math.random() - 0.5) * 0.6,
    ang: Math.random() * Math.PI,
    alfa: 0.5 + Math.random() * 0.45,
    ciano: Math.random() < 0.35,
    cristal,
  }
}

function medir() {
  const c = tela.value, dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  w = window.innerWidth; h = window.innerHeight
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const total = Math.round(Math.min(170, Math.max(45, (w * h) / 9500)))
  while (flocos.length < total) flocos.push(criar(false))
  flocos.length = total
}

function desenharFloco(f) {
  const cor = f.ciano ? '165, 240, 255' : '255, 255, 255'
  ctx.globalAlpha = f.alfa
  if (!f.cristal) {
    ctx.fillStyle = `rgb(${cor})`
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill()
    return
  }
  // Cristal de seis pontas, no traço fino do HUD
  ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang)
  ctx.strokeStyle = `rgb(${cor})`; ctx.lineWidth = 1; ctx.shadowColor = 'rgba(56, 214, 255, 0.9)'; ctx.shadowBlur = 6
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3, cx = Math.cos(a), sy = Math.sin(a)
    ctx.moveTo(0, 0); ctx.lineTo(cx * f.r, sy * f.r)
    const m = f.r * 0.55, p = f.r * 0.3, a1 = a + 0.6, a2 = a - 0.6
    ctx.moveTo(cx * m, sy * m); ctx.lineTo(cx * m + Math.cos(a1) * p, sy * m + Math.sin(a1) * p)
    ctx.moveTo(cx * m, sy * m); ctx.lineTo(cx * m + Math.cos(a2) * p, sy * m + Math.sin(a2) * p)
  }
  ctx.stroke(); ctx.restore()
}

function passo(agora) {
  const dt = Math.min(0.05, (agora - (ultimo || agora)) / 1000)
  ultimo = agora
  ctx.clearRect(0, 0, w, h)
  for (let i = 0; i < flocos.length; i++) {
    const f = flocos[i]
    f.fase += dt * 0.8
    f.y += f.vy * dt
    f.x += Math.sin(f.fase) * 12 * dt
    f.ang += f.giro * dt
    if (f.y > h + 10) flocos[i] = criar(true)
    desenharFloco(flocos[i])
  }
  ctx.globalAlpha = 1
  quadro = requestAnimationFrame(passo)
}

function visibilidade() {
  cancelAnimationFrame(quadro)
  if (!document.hidden) { ultimo = 0; quadro = requestAnimationFrame(passo) }
}
function redimensionar() {
  medir()
  if (reduzir) { ctx.clearRect(0, 0, w, h); flocos.forEach(desenharFloco); ctx.globalAlpha = 1 }
}

onMounted(() => {
  ctx = tela.value.getContext('2d')
  medir()
  window.addEventListener('resize', redimensionar)
  if (reduzir) { redimensionar(); return }
  document.addEventListener('visibilitychange', visibilidade)
  quadro = requestAnimationFrame(passo)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(quadro)
  window.removeEventListener('resize', redimensionar)
  document.removeEventListener('visibilitychange', visibilidade)
})
</script>

<template>
  <canvas ref="tela" class="neve" aria-hidden="true" />
</template>
