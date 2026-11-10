<script setup>
import { rotuloStatus, rotuloPlataforma } from '../lib/dados'
import Onda from './Onda.vue'
import LuzSaude from './LuzSaude.vue'
defineProps({ app: Object, indice: { type: Number, default: 0 } })
</script>

<template>
  <RouterLink :to="app.url ? `/aplicacoes/${app.slug}/usar` : `/aplicacoes/${app.slug}`" class="cartao-app" :class="{ 'cartao-painel': app.tipo === 'painel' }" :style="{ animationDelay: `${150 + indice * 90}ms` }">
    <span class="icone-app" aria-hidden="true">{{ app.tipo === 'painel' ? '◧' : app.nome.charAt(0) }}</span>
    <span class="cartao-app-texto">
      <strong>{{ app.nome }}</strong>
      <small :class="`st st-${app.status}`"><i />{{ app.tipo === 'painel' ? `Painel ${rotuloPlataforma[app.plataforma] || 'de BI'}` : rotuloStatus[app.status] }} · {{ app.area }}</small>
      <span class="descricao">{{ app.descricao }}</span>
    </span>
    <Onda :barras="16" />
    <LuzSaude :slug="app.slug" class="cartao-luz" />
  </RouterLink>
</template>
