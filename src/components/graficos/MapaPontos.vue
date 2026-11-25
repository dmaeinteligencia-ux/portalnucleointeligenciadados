<script setup>
// Mapa de calor simples, sem mapa de fundo: cada ponto é uma célula de ~100 m e fica mais
// forte quanto mais OS tem. Mostra onde as ocorrências se concentram na cidade.
import { computed, ref } from 'vue'
import { numero } from '../../lib/paineis'

const props = defineProps({ pontos: { type: Array, required: true } }) // [{ lat, lon, total }]
const L = 560, A = 460, borda = 14

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
const maximo = computed(() => Math.max(1, ...props.pontos.map((p) => p.total)))
const desenhados = computed(() => {
  const c = caixa.value
  if (!c) return []
  return [...props.pontos].sort((a, b) => a.total - b.total).map((p) => {
    const f = Math.sqrt(p.total / maximo.value)
    return {
      ...p,
      x: c.dx + (p.lon - c.lo0) * c.escalaLon * c.k,
      y: c.dy + (c.la1 - p.lat) * c.k,
      r: 2.5 + f * 7,
      o: 0.25 + f * 0.75,
    }
  }).filter((p) => p.x >= 0 && p.x <= L && p.y >= 0 && p.y <= A)
})
const foco = ref(null)
</script>

<template>
  <div class="mapa-pontos">
    <p v-if="!pontos.length" class="suave pequeno">Nenhuma OS com coordenada no recorte escolhido.</p>
    <svg v-else :viewBox="`0 0 ${L} ${A}`" role="img" aria-label="Mapa de concentração das OS" @mouseleave="foco = null">
      <rect x="0" y="0" :width="L" :height="A" rx="10" class="mapa-fundo" />
      <circle v-for="(p, i) in desenhados" :key="i" :cx="p.x" :cy="p.y" :r="p.r" :fill-opacity="p.o"
              class="mapa-ponto" @mouseenter="foco = p" />
      <circle v-if="foco" :cx="foco.x" :cy="foco.y" :r="foco.r + 3" class="mapa-foco" />
    </svg>
    <p class="mapa-legenda pequeno suave">
      <template v-if="foco"><b>{{ numero(foco.total) }} OS</b> neste ponto (≈100 m)</template>
      <template v-else>Passe o mouse num ponto. Quanto maior e mais forte, mais OS.</template>
    </p>
  </div>
</template>
