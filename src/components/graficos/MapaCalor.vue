<script setup>
// Mapa de calor dia da semana × hora: quando os pedidos chegam. Uma cor só, do claro ao escuro.
import { computed, ref } from 'vue'
import { numero } from '../../lib/paineis'
const props = defineProps({ celulas: { type: Array, required: true } }) // [{ dia 1-7, hora 0-23, total }]
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const NOMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']
const RAMPA = ['#eef3fa', '#d3e1f3', '#a9c4e8', '#7aa3d9', '#4a7fc4', '#1f5ea8', '#0b3f7e']
const CW = 26, CH = 24, ME = 36, MT = 18
const grade = computed(() => {
  const m = new Map(props.celulas.map((c) => [`${c.dia}-${c.hora}`, c.total]))
  return Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => m.get(`${d + 1}-${h}`) || 0))
})
const maximo = computed(() => Math.max(1, ...grade.value.flat()))
const cor = (v) => (v ? RAMPA[Math.min(RAMPA.length - 1, Math.floor((v / maximo.value) * (RAMPA.length - 1) + 0.5))] : '#f6f8fb')
const foco = ref(null)
const pico = computed(() => {
  let melhor = { v: -1 }
  grade.value.forEach((l, d) => l.forEach((v, h) => { if (v > melhor.v) melhor = { v, d, h } }))
  return melhor
})
</script>

<template>
  <div class="mapa-calor">
    <svg :viewBox="`0 0 ${ME + 24 * CW} ${MT + 7 * CH}`" role="img" aria-label="Pedidos por dia da semana e hora">
      <text v-for="h in [0, 3, 6, 9, 12, 15, 18, 21]" :key="h" :x="ME + h * CW + CW / 2" y="12" text-anchor="middle" class="eixo">{{ h }}h</text>
      <g v-for="(linha, d) in grade" :key="d">
        <text :x="ME - 6" :y="MT + d * CH + CH / 2 + 4" text-anchor="end" class="eixo">{{ DIAS[d] }}</text>
        <rect v-for="(v, h) in linha" :key="h" :x="ME + h * CW + 1" :y="MT + d * CH + 1" :width="CW - 2" :height="CH - 2" rx="3"
              :fill="cor(v)" :class="{ focado: foco && foco.d === d && foco.h === h }" @mouseenter="foco = { d, h, v }" @mouseleave="foco = null" />
      </g>
    </svg>
    <div class="calor-rodape">
      <p class="pequeno suave">
        <template v-if="foco"><b>{{ numero(foco.v) }} OS</b> abertas às {{ foco.h }}h de {{ NOMES[foco.d] }}</template>
        <template v-else>Pico: {{ NOMES[pico.d] }} às {{ pico.h }}h ({{ numero(pico.v) }} OS)</template>
      </p>
      <span class="calor-escala pequeno suave">menos <i v-for="c in RAMPA" :key="c" :style="{ background: c }" /> mais</span>
    </div>
  </div>
</template>
