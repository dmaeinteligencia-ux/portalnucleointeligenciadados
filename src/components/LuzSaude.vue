<script setup>
import { computed } from 'vue'
import { saude, rotuloSituacao } from '../lib/saude'
const props = defineProps({ slug: String, texto: Boolean })
const v = computed(() => saude.porSlug[props.slug])
const dica = computed(() => {
  if (!v.value) return 'Sem verificação do monitoramento ainda'
  const quando = new Date(v.value.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  return `${rotuloSituacao[v.value.situacao]}${v.value.detalhe ? `: ${v.value.detalhe}` : ''} (verificado em ${quando})`
})
</script>

<template>
  <span class="luz-saude" :class="v ? `luz-${v.situacao}` : 'luz-sem'" :title="dica" role="img" :aria-label="dica">
    <i /><template v-if="texto">{{ v ? rotuloSituacao[v.situacao] : 'Sem dados' }}</template>
  </span>
</template>
