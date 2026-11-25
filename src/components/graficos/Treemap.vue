<script setup>
// Treemap: cada bloco é proporcional ao volume. Bom para ver a fatia de cada item no todo.
import { computed, ref } from 'vue'
import { numero, pct } from '../../lib/paineis'
const props = defineProps({
  itens: { type: Array, required: true }, // [{ codigo, nome, total }]
  cor: { type: String, default: '#2f9e72' },
  selecionado: { type: [Number, String], default: null },
})
const emit = defineEmits(['escolher'])
const L = 600, A = 300

// Algoritmo "squarified" (Bruls et al.): blocos o mais quadrados possível
function squarify(itens, x, y, w, h) {
  const out = []
  let resto = [...itens]
  while (resto.length) {
    const lado = Math.min(w, h), soma = resto.reduce((a, i) => a + i.area, 0)
    let linha = [], pior = Infinity
    for (const i of resto) {
      const t = [...linha, i], s = t.reduce((a, j) => a + j.area, 0)
      const mx = Math.max(...t.map((j) => j.area)), mn = Math.min(...t.map((j) => j.area))
      const r = Math.max((lado * lado * mx) / (s * s), (s * s) / (lado * lado * mn))
      if (r > pior) break
      linha = t; pior = r
    }
    const s = linha.reduce((a, j) => a + j.area, 0), esp = s / lado
    let pos = 0
    for (const i of linha) {
      const comp = i.area / esp
      out.push(w >= h ? { ...i, x, y: y + pos, w: esp, h: comp } : { ...i, x: x + pos, y, w: comp, h: esp })
      pos += comp
    }
    if (w >= h) { x += esp; w -= esp } else { y += esp; h -= esp }
    resto = resto.slice(linha.length)
    if (soma <= 0) break
  }
  return out
}
const total = computed(() => props.itens.reduce((a, i) => a + i.total, 0) || 1)
const blocos = computed(() => {
  const its = props.itens.filter((i) => i.total > 0).map((i) => ({ ...i, area: (i.total / total.value) * L * A }))
  const max = Math.max(1, ...its.map((i) => i.total))
  return squarify(its, 0, 0, L, A).map((b) => ({ ...b, o: 0.62 + 0.38 * Math.sqrt(b.total / max) }))
})
const foco = ref(null)
</script>

<template>
  <p v-if="!itens.length" class="suave pequeno">Sem dados no recorte escolhido.</p>
  <svg v-else class="treemap" :viewBox="`0 0 ${L} ${A}`" role="img" :aria-label="itens.map((i) => `${i.nome}: ${i.total}`).join(', ')">
    <g v-for="b in blocos" :key="b.codigo" class="bloco" :class="{ ativo: selecionado === b.codigo }" tabindex="0"
       @click="emit('escolher', b.codigo)" @keydown.enter="emit('escolher', b.codigo)" @mouseenter="foco = b" @mouseleave="foco = null">
      <title>{{ b.nome }}: {{ numero(b.total) }} OS ({{ pct(b.total, total) }})</title>
      <rect :x="b.x + 1" :y="b.y + 1" :width="Math.max(0, b.w - 2)" :height="Math.max(0, b.h - 2)" rx="4" :fill="cor" :fill-opacity="b.o" />
      <foreignObject v-if="b.w > 70 && b.h > 38" :x="b.x + 4" :y="b.y + 3" :width="b.w - 8" :height="b.h - 6">
        <div class="bloco-texto"><span>{{ b.nome }}</span><b>{{ numero(b.total) }} · {{ pct(b.total, total) }}</b></div>
      </foreignObject>
    </g>
  </svg>
</template>
