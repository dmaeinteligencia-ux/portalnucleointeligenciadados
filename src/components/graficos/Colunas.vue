<script setup>
// Colunas verticais com rótulo em cada barra (distribuições em faixas, poucas categorias).
import { computed, ref } from 'vue'
import { numero, pct } from '../../lib/paineis'
const props = defineProps({
  itens: { type: Array, required: true }, // [{ nome, total, cor? }]
  cor: { type: String, default: '#0e50a0' },
})
const L = 420, A = 190, MB = 36, MT = 22
const total = computed(() => props.itens.reduce((a, i) => a + i.total, 0) || 1)
const maximo = computed(() => Math.max(1, ...props.itens.map((i) => i.total)))
const larg = computed(() => L / Math.max(1, props.itens.length))
const barras = computed(() => props.itens.map((i, k) => {
  const h = ((A - MB - MT) * i.total) / maximo.value, w = larg.value * 0.68, x = k * larg.value + larg.value * 0.16
  const y = A - MB - h, r = Math.min(4, h)
  return { ...i, k, cx: k * larg.value + larg.value / 2, topo: y,
    d: `M${x},${A - MB} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${A - MB} Z` }
}))
const foco = ref(null)
</script>

<template>
  <svg class="colunas" :viewBox="`0 0 ${L} ${A}`" role="img" :aria-label="itens.map((i) => `${i.nome}: ${i.total}`).join(', ')">
    <line x1="0" :x2="L" :y1="A - MB" :y2="A - MB" class="base" />
    <g v-for="b in barras" :key="b.nome" @mouseenter="foco = b.k" @mouseleave="foco = null">
      <rect :x="b.k * larg + 1" y="0" :width="larg - 2" :height="A" fill="transparent" />
      <path :d="b.d" :fill="b.cor || cor" :fill-opacity="foco === null || foco === b.k ? 1 : 0.55" />
      <text :x="b.cx" :y="b.topo - 6" text-anchor="middle" class="valor">{{ foco === b.k ? numero(b.total) : pct(b.total, total) }}</text>
      <text :x="b.cx" :y="A - MB + 16" text-anchor="middle" class="eixo">{{ b.nome }}</text>
    </g>
  </svg>
</template>
