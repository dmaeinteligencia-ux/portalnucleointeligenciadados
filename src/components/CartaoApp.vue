<script setup>
import { rotuloStatus } from '../lib/dados'
import Onda from './Onda.vue'
defineProps({ app: Object, indice: { type: Number, default: 0 } })
</script>

<template>
  <RouterLink :to="`/aplicacoes/${app.slug}`" class="cartao-app" :style="{ animationDelay: `${150 + indice * 90}ms` }">
    <span class="icone-app" aria-hidden="true">{{ app.nome.charAt(0) }}</span>
    <span class="cartao-app-texto">
      <strong>{{ app.nome }}</strong>
      <small :class="`st st-${app.status}`"><i />{{ rotuloStatus[app.status] }} · {{ app.area }}</small>
      <span class="descricao">{{ app.descricao }}</span>
    </span>
    <Onda :barras="16" />
  </RouterLink>
</template>
