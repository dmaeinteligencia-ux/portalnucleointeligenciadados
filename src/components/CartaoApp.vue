<script setup>
import { rotuloStatus } from '../lib/dados'
defineProps({ app: Object })
</script>

<template>
  <RouterLink :to="`/aplicacoes/${app.slug}`" class="cartao cartao-app">
    <div class="icone-app" aria-hidden="true">{{ app.nome.charAt(0) }}</div>
    <div>
      <h3>{{ app.nome }}</h3>
      <p>{{ app.descricao }}</p>
      <div class="etiquetas">
        <span class="etiqueta">{{ app.area }}</span>
        <span class="etiqueta" :class="`status-${app.status}`">{{ rotuloStatus[app.status] }}</span>
      </div>
    </div>
  </RouterLink>
</template>
