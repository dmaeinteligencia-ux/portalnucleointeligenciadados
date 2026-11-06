<script setup>
defineProps({ barras: { type: Number, default: 18 }, cor: { type: String, default: 'var(--ciano)' } })
</script>
<template>
  <span class="onda" aria-hidden="true" :style="{ color: cor }">
    <i v-for="n in barras" :key="n" :style="{ animationDelay: `${(n * 97) % 900}ms`, height: `${30 + ((n * 37) % 70)}%` }" />
  </span>
</template>
