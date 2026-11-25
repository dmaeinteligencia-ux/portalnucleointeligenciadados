<script setup>
// Rosca (donut) para partes de um todo com poucas fatias; total no centro e legenda ao lado.
import { computed, ref } from 'vue'
import { numero, pct } from '../../lib/paineis'
const props = defineProps({
  itens: { type: Array, required: true }, // [{ nome, total, cor }]
  rotulo: { type: String, default: 'OS' },
})
const R = 70, E = 22, C = 2 * Math.PI * R
const total = computed(() => props.itens.reduce((a, i) => a + i.total, 0) || 1)
const fatias = computed(() => {
  let acc = 0
  return props.itens.map((i) => {
    const comp = (i.total / total.value) * C
    const f = { ...i, dash: `${Math.max(0, comp - 2)} ${C}`, off: -acc }
    acc += comp
    return f
  })
})
const foco = ref(null)
</script>

<template>
  <div class="rosca">
    <svg viewBox="0 0 180 180" role="img" :aria-label="itens.map((i) => `${i.nome} ${i.total}`).join(', ')">
      <g transform="rotate(-90 90 90)">
        <circle cx="90" cy="90" :r="R" fill="none" stroke="var(--pc-linha)" :stroke-width="E" />
        <circle v-for="f in fatias" :key="f.nome" cx="90" cy="90" :r="R" fill="none" :stroke="f.cor"
                :stroke-width="foco === f.nome ? E + 6 : E" :stroke-dasharray="f.dash" :stroke-dashoffset="f.off"
                @mouseenter="foco = f.nome" @mouseleave="foco = null" />
      </g>
      <text x="90" y="88" text-anchor="middle" class="rosca-total">{{ numero(foco ? itens.find((i) => i.nome === foco).total : total) }}</text>
      <text x="90" y="108" text-anchor="middle" class="rosca-rotulo">{{ foco || rotulo }}</text>
    </svg>
    <ul class="lista-situacao">
      <li v-for="i in itens" :key="i.nome" :class="{ ativo: foco === i.nome }" @mouseenter="foco = i.nome" @mouseleave="foco = null">
        <i :style="{ background: i.cor }" />{{ i.nome }}
        <b>{{ numero(i.total) }}</b><span class="suave">{{ pct(i.total, total) }}</span>
      </li>
    </ul>
  </div>
</template>
