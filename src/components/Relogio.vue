<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
const agora = ref(new Date())
let t
onMounted(() => { t = setInterval(() => (agora.value = new Date()), 1000) })
onBeforeUnmount(() => clearInterval(t))
const data = d => d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
const hora = d => d.toLocaleTimeString('pt-BR')
</script>
<template>
  <div class="relogio"><small>{{ data(agora) }}</small><strong>{{ hora(agora) }}</strong></div>
</template>
