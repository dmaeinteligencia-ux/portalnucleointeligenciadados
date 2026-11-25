<script setup>
// Minigráfico (sparkline) dos últimos meses dentro de um cartão de indicador.
import { computed } from 'vue'
const props = defineProps({
  valores: { type: Array, required: true },
  cor: { type: String, default: '#0e50a0' },
})
const L = 120, A = 32
const caminho = computed(() => {
  const v = props.valores.map((x) => x ?? 0)
  if (v.length < 2) return null
  const min = Math.min(...v), max = Math.max(...v), faixa = max - min || 1
  const pts = v.map((x, i) => [(i * L) / (v.length - 1), 3 + (A - 6) * (1 - (x - min) / faixa)])
  return { linha: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '), ultimo: pts.at(-1) }
})
</script>

<template>
  <svg v-if="caminho" class="faisca" :viewBox="`-3 0 ${L + 6} ${A}`" preserveAspectRatio="none" aria-hidden="true">
    <path :d="`${caminho.linha} L${L},${A} L0,${A} Z`" :fill="cor" fill-opacity=".1" />
    <path :d="caminho.linha" fill="none" :stroke="cor" stroke-width="1.6" vector-effect="non-scaling-stroke" />
    <circle :cx="caminho.ultimo[0]" :cy="caminho.ultimo[1]" r="2.5" :fill="cor" />
  </svg>
</template>
