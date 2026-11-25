<script setup>
// Mapa em hexágonos (hexbin), sem mapa de fundo: as OS são somadas em hexágonos de mesmo
// tamanho e cada um fica mais escuro quanto mais OS tem. Mostra onde a demanda se concentra.
import { computed, ref } from 'vue'
import { numero } from '../../lib/paineis'

const props = defineProps({ pontos: { type: Array, required: true } }) // [{ lat, lon, total }]
const L = 560, A = 460, borda = 14, RH = 9 // raio do hexágono
const RAMPA = ['#d3e1f3', '#a9c4e8', '#7aa3d9', '#4a7fc4', '#1f5ea8', '#0b3f7e']

const caixa = computed(() => {
  if (!props.pontos.length) return null
  // Recorta 1% das pontas para um ponto isolado não achatar o mapa
  const ordenar = (k) => props.pontos.map((p) => p[k]).sort((a, b) => a - b)
  const corte = (v) => [v[Math.floor(v.length * 0.01)], v[Math.ceil(v.length * 0.99) - 1]]
  const [la0, la1] = corte(ordenar('lat'))
  const [lo0, lo1] = corte(ordenar('lon'))
  // Mantém a proporção real (1° de longitude encolhe com a latitude)
  const escalaLon = Math.cos(((la0 + la1) / 2) * (Math.PI / 180))
  const larg = (lo1 - lo0) * escalaLon || 0.01, alt = la1 - la0 || 0.01
  const k = Math.min((L - 2 * borda) / larg, (A - 2 * borda) / alt)
  return { la1, lo0, escalaLon, k, dx: (L - larg * k) / 2, dy: (A - alt * k) / 2 }
})
const hexagonos = computed(() => {
  const c = caixa.value
  if (!c) return []
  const w = Math.sqrt(3) * RH, h = 1.5 * RH, soma = new Map()
  for (const p of props.pontos) {
    const px = c.dx + (p.lon - c.lo0) * c.escalaLon * c.k, py = c.dy + (c.la1 - p.lat) * c.k
    if (px < 0 || px > L || py < 0 || py > A) continue
    // Hexágono mais próximo (grade com linhas alternadas deslocadas)
    let lin = Math.round(py / h), col = Math.round((px - (lin & 1 ? w / 2 : 0)) / w), melhor = null
    for (const dl of [-1, 0, 1]) for (const dc of [-1, 0, 1]) {
      const l = lin + dl, k = col + dc, cx = k * w + (l & 1 ? w / 2 : 0), cy = l * h, d = (px - cx) ** 2 + (py - cy) ** 2
      if (!melhor || d < melhor.d) melhor = { l, k, cx, cy, d }
    }
    const chave = `${melhor.l},${melhor.k}`
    const atual = soma.get(chave) || { x: melhor.cx, y: melhor.cy, total: 0 }
    atual.total += p.total
    soma.set(chave, atual)
  }
  const lista = [...soma.values()]
  const max = Math.max(1, ...lista.map((x) => x.total))
  const forma = Array.from({ length: 6 }, (_, i) => {
    const ang = (Math.PI / 180) * (60 * i - 30)
    return `${(RH * Math.cos(ang)).toFixed(2)},${(RH * Math.sin(ang)).toFixed(2)}`
  }).join(' ')
  return lista.map((x) => ({
    ...x, forma, cor: RAMPA[Math.min(RAMPA.length - 1, Math.floor(Math.sqrt(x.total / max) * RAMPA.length))],
  }))
})
const foco = ref(null)
</script>

<template>
  <div class="mapa-pontos">
    <p v-if="!pontos.length" class="suave pequeno">Nenhuma OS com coordenada no recorte escolhido.</p>
    <svg v-else :viewBox="`0 0 ${L} ${A}`" role="img" aria-label="Mapa de concentração das OS" @mouseleave="foco = null">
      <rect x="0" y="0" :width="L" :height="A" rx="10" class="mapa-fundo" />
      <polygon v-for="(hx, i) in hexagonos" :key="i" :points="hx.forma" :transform="`translate(${hx.x} ${hx.y})`" :fill="hx.cor"
               class="mapa-hex" :class="{ focado: foco === hx }" @mouseenter="foco = hx" />
    </svg>
    <div class="calor-rodape">
      <p class="pequeno suave">
        <template v-if="foco"><b>{{ numero(foco.total) }} OS</b> neste hexágono (≈{{ numero(Math.round((2 * RH) / caixa.k * 111000 / 10) * 10) }} m)</template>
        <template v-else>Passe o mouse num hexágono. Quanto mais escuro, mais OS.</template>
      </p>
      <span class="calor-escala pequeno suave">menos <i v-for="c in RAMPA" :key="c" :style="{ background: c }" /> mais</span>
    </div>
  </div>
</template>
