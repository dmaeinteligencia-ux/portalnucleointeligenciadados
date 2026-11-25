<script setup>
// Pequenos múltiplos: um minigráfico por região, todos na mesma escala para comparar.
import { computed } from 'vue'
import { numero, mesCurto } from '../../lib/paineis'
const props = defineProps({
  linhas: { type: Array, required: true }, // [{ regiao, mes, total }]
  cor: { type: String, default: '#0e50a0' },
  selecionado: { type: [Number, String], default: null },
})
const emit = defineEmits(['escolher'])
const L = 200, A = 70
const meses = computed(() => [...new Set(props.linhas.map((l) => l.mes))].sort())
const maximo = computed(() => Math.max(1, ...props.linhas.map((l) => l.total)))
const regioes = computed(() => {
  const por = new Map()
  for (const l of props.linhas) {
    if (!por.has(l.regiao)) por.set(l.regiao, new Map())
    por.get(l.regiao).set(l.mes, l.total)
  }
  return [...por.entries()].sort((a, b) => a[0] - b[0]).map(([regiao, m]) => {
    const v = meses.value.map((mes) => m.get(mes) || 0)
    const n = Math.max(1, v.length - 1)
    const pts = v.map((t, i) => [(i * L) / n, 4 + (A - 8) * (1 - t / maximo.value)])
    const linha = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
    return { regiao, total: v.reduce((a, b) => a + b, 0), ultimo: v.at(-1), linha, area: `${linha} L${L},${A} L0,${A} Z` }
  })
})
</script>

<template>
  <div class="multiplos">
    <button v-for="r in regioes" :key="r.regiao" class="multiplo" :class="{ ativo: Number(selecionado) === r.regiao }" @click="emit('escolher', r.regiao)">
      <span class="multiplo-cab"><b>Região {{ r.regiao }}</b><span>{{ numero(r.total) }} OS</span></span>
      <svg :viewBox="`0 0 ${L} ${A}`" preserveAspectRatio="none" aria-hidden="true">
        <path :d="r.area" :fill="cor" fill-opacity=".12" />
        <path :d="r.linha" fill="none" :stroke="cor" stroke-width="2" vector-effect="non-scaling-stroke" />
      </svg>
      <span class="multiplo-pe pequeno suave"><span>{{ mesCurto(meses[0]) }}</span><span>{{ mesCurto(meses.at(-1)) }}</span></span>
    </button>
  </div>
</template>
