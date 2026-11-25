<script setup>
// Evolução mensal: duas séries na mesma unidade (quantidade de OS), um único eixo.
import { computed, ref } from 'vue'
import { numero, mesCurto } from '../../lib/paineis'

const props = defineProps({
  dados: { type: Array, required: true }, // [{ mes, ...valores }]
  series: { type: Array, required: true }, // [{ campo, nome, cor }]
})

const L = 720, A = 260, M = { e: 52, d: 28, t: 16, b: 30 }
const larg = L - M.e - M.d, alt = A - M.t - M.b

const maximo = computed(() => {
  const vals = props.dados.flatMap((d) => props.series.map((s) => d[s.campo] || 0))
  const bruto = Math.max(1, ...vals)
  const ordem = 10 ** Math.floor(Math.log10(bruto))
  return Math.ceil(bruto / ordem) * ordem
})
const x = (i) => M.e + (props.dados.length <= 1 ? larg / 2 : (i * larg) / (props.dados.length - 1))
const y = (v) => M.t + alt - ((v || 0) / maximo.value) * alt
const marcas = computed(() => [0, 0.25, 0.5, 0.75, 1].map((f) => f * maximo.value))
const linhas = computed(() => props.series.map((s) => ({
  ...s, d: props.dados.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[s.campo]).toFixed(1)}`).join(' '),
})))
const passoRotulo = computed(() => Math.ceil(props.dados.length / 12))

const foco = ref(null)
function mover(ev) {
  const caixa = ev.currentTarget.getBoundingClientRect()
  const px = ((ev.clientX - caixa.left) / caixa.width) * L
  if (!props.dados.length) return
  const i = Math.round(((px - M.e) / larg) * (props.dados.length - 1))
  foco.value = Math.min(props.dados.length - 1, Math.max(0, i))
}
const dica = computed(() => (foco.value === null ? null : props.dados[foco.value]))
const dicaEsq = computed(() => (foco.value === null ? 0 : (x(foco.value) / L) * 100))
</script>

<template>
  <div class="grafico-mensal">
    <ul class="legenda">
      <li v-for="s in series" :key="s.campo"><i :style="{ background: s.cor }" />{{ s.nome }}</li>
    </ul>
    <div class="grafico-area">
      <svg :viewBox="`0 0 ${L} ${A}`" role="img" :aria-label="`Evolução mensal: ${series.map((s) => s.nome).join(' e ')}`"
           @mousemove="mover" @mouseleave="foco = null">
        <g class="grade">
          <g v-for="m in marcas" :key="m">
            <line :x1="M.e" :x2="L - M.d" :y1="y(m)" :y2="y(m)" />
            <text :x="M.e - 8" :y="y(m) + 4" text-anchor="end">{{ numero(m) }}</text>
          </g>
          <text v-for="(p, i) in dados" v-show="i % passoRotulo === 0 || i === dados.length - 1" :key="p.mes"
                :x="x(i)" :y="A - 8" text-anchor="middle">{{ mesCurto(p.mes) }}</text>
        </g>
        <line v-if="foco !== null" class="mira" :x1="x(foco)" :x2="x(foco)" :y1="M.t" :y2="M.t + alt" />
        <g v-for="s in linhas" :key="s.campo">
          <path :d="s.d" fill="none" :stroke="s.cor" stroke-width="2" stroke-linejoin="round" />
          <circle v-for="(p, i) in dados" :key="p.mes" :cx="x(i)" :cy="y(p[s.campo])" :r="foco === i ? 5 : 3"
                  :fill="s.cor" class="ponto-serie" />
        </g>
      </svg>
      <div v-if="dica" class="dica" :style="{ left: `${dicaEsq}%` }">
        <strong>{{ mesCurto(dica.mes) }}</strong>
        <span v-for="s in series" :key="s.campo"><i :style="{ background: s.cor }" />{{ s.nome }}: <b>{{ numero(dica[s.campo]) }}</b></span>
      </div>
    </div>
  </div>
</template>
