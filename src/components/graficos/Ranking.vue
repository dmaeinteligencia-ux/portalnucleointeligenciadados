<script setup>
// Ranking em barras horizontais. Clicar numa linha aplica o filtro (quando o painel permite).
import { computed } from 'vue'
import { numero, pct, horas } from '../../lib/paineis'

const props = defineProps({
  itens: { type: Array, required: true }, // [{ codigo, nome, total, executadas?, mediana_horas? }]
  cor: { type: String, default: 'var(--ciano)' },
  selecionado: { type: [Number, String], default: null },
  clicavel: { type: Boolean, default: false },
  detalhe: { type: String, default: 'execucao' }, // 'execucao' | 'nenhum'
  estilo: { type: String, default: 'barra' }, // 'barra' | 'pirulito'
})
const emit = defineEmits(['escolher'])
const maximo = computed(() => Math.max(1, ...props.itens.map((i) => i.total)))
const titulo = (i) => props.detalhe === 'execucao' && i.executadas !== undefined
  ? `${i.nome}: ${numero(i.total)} OS · ${pct(i.executadas, i.total)} executadas · mediana ${horas(i.mediana_horas)}`
  : `${i.nome}: ${numero(i.total)}`
</script>

<template>
  <p v-if="!itens.length" class="suave pequeno">Sem dados no recorte escolhido.</p>
  <ol v-else class="ranking" :class="[{ clicavel }, estilo]">
    <li v-for="i in itens" :key="i.codigo" :title="titulo(i)" :class="{ ativo: selecionado === i.codigo }"
        :tabindex="clicavel ? 0 : -1" @click="clicavel && emit('escolher', i.codigo)"
        @keydown.enter="clicavel && emit('escolher', i.codigo)">
      <span class="ranking-nome">{{ i.nome }}</span>
      <span class="ranking-barra"><i :style="{ width: `${(100 * i.total) / maximo}%`, background: cor }" /></span>
      <span class="ranking-valor">{{ numero(i.total) }}</span>
      <span v-if="detalhe === 'execucao' && i.mediana_horas !== undefined" class="ranking-extra">{{ horas(i.mediana_horas) }}</span>
    </li>
  </ol>
</template>
