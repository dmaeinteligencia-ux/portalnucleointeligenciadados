<script setup>
// Dispersão das equipes: volume executado (x) × mediana de horas até executar (y).
// As linhas tracejadas marcam as medianas do grupo e dividem em quadrantes.
import { computed, ref } from 'vue'
import { numero, horas } from '../../lib/paineis'
const props = defineProps({
  itens: { type: Array, required: true }, // [{ codigo, nome, executadas, mediana_horas }]
  cor: { type: String, default: '#2f9e72' },
  selecionado: { type: [Number, String], default: null },
})
const emit = defineEmits(['escolher'])
const L = 560, A = 300, M = { e: 46, d: 14, t: 14, b: 34 }
const pts = computed(() => props.itens.filter((i) => i.executadas > 0 && i.mediana_horas != null))
const redondo = (v) => { const o = 10 ** Math.floor(Math.log10(Math.max(1, v))); return Math.ceil(v / o) * o }
const xmax = computed(() => redondo(Math.max(1, ...pts.value.map((p) => p.executadas))))
const ymax = computed(() => redondo(Math.max(1, ...pts.value.map((p) => p.mediana_horas))))
const x = (v) => M.e + (v / xmax.value) * (L - M.e - M.d)
const y = (v) => A - M.b - (v / ymax.value) * (A - M.t - M.b)
const mediana = (a) => { const s = [...a].sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const mx = computed(() => mediana(pts.value.map((p) => p.executadas)))
const my = computed(() => mediana(pts.value.map((p) => p.mediana_horas)))
const marcasX = computed(() => [0, 0.25, 0.5, 0.75, 1].map((f) => f * xmax.value))
const marcasY = computed(() => [0, 0.5, 1].map((f) => f * ymax.value))
// Rótulo só onde não encosta em outro já escrito (do maior volume para o menor)
const rotulados = computed(() => {
  const feitos = [], ok = new Set()
  for (const p of [...pts.value].sort((a, b) => b.executadas - a.executadas)) {
    const px = x(p.executadas), py = y(p.mediana_horas)
    if (feitos.every(([qx, qy]) => Math.abs(qx - px) > 22 || Math.abs(qy - py) > 14)) { feitos.push([px, py]); ok.add(p.codigo) }
  }
  return ok
})
const foco = ref(null)
</script>

<template>
  <p v-if="!pts.length" class="suave pequeno">Sem dados no recorte escolhido.</p>
  <div v-else class="dispersao">
    <svg :viewBox="`0 0 ${L} ${A}`" role="img" aria-label="Equipes: volume executado e tempo até executar">
      <g class="grade">
        <g v-for="m in marcasY" :key="`y${m}`"><line :x1="M.e" :x2="L - M.d" :y1="y(m)" :y2="y(m)" /><text :x="M.e - 6" :y="y(m) + 4" text-anchor="end">{{ horas(m) }}</text></g>
        <text v-for="m in marcasX" :key="`x${m}`" :x="x(m)" :y="A - M.b + 16" text-anchor="middle">{{ numero(m) }}</text>
        <text :x="(L + M.e) / 2" :y="A - 4" text-anchor="middle" class="titulo-eixo">OS executadas →</text>
      </g>
      <line :x1="x(mx)" :x2="x(mx)" :y1="M.t" :y2="A - M.b" class="quadrante" />
      <line :x1="M.e" :x2="L - M.d" :y1="y(my)" :y2="y(my)" class="quadrante" />
      <text :x="L - M.d - 4" :y="M.t + 12" text-anchor="end" class="quadrante-rotulo">muito volume · mais lentas</text>
      <text :x="L - M.d - 4" :y="A - M.b - 6" text-anchor="end" class="quadrante-rotulo">muito volume · mais rápidas</text>
      <g v-for="p in pts" :key="p.codigo" class="ponto" tabindex="0" @click="emit('escolher', p.codigo)" @keydown.enter="emit('escolher', p.codigo)"
         @mouseenter="foco = p" @mouseleave="foco = null">
        <circle :cx="x(p.executadas)" :cy="y(p.mediana_horas)" r="14" fill="transparent" />
        <circle :cx="x(p.executadas)" :cy="y(p.mediana_horas)" :r="foco === p || selecionado === p.codigo ? 8 : 6" :fill="cor"
                :fill-opacity="selecionado === p.codigo ? 1 : .8" stroke="#fff" stroke-width="2" />
        <text v-if="rotulados.has(p.codigo) || foco === p" :x="x(p.executadas) + 9" :y="y(p.mediana_horas) - 7" class="ponto-rotulo">{{ p.codigo }}</text>
      </g>
    </svg>
    <p class="pequeno suave">
      <template v-if="foco"><b>{{ foco.nome }}</b>: {{ numero(foco.executadas) }} executadas · mediana {{ horas(foco.mediana_horas) }}</template>
      <template v-else>Cada ponto é uma equipe (código). Tracejado = mediana do grupo. Clique para filtrar.</template>
    </p>
  </div>
</template>
