<script setup>
import { ref, watch, computed } from 'vue'
const props = defineProps({ rotulo: String, valor: Number, total: { type: Number, default: 100 }, sufixo: { type: String, default: '' } })
const atual = ref(0)
const R = 34, C = 2 * Math.PI * R
const traco = computed(() => C * (1 - Math.min(atual.value / (props.total || 1), 1)))
watch(() => props.valor, fim => {
  const ini = performance.now(), de = atual.value
  const passo = t => { const p = Math.min((t - ini) / 1200, 1), e = 1 - (1 - p) ** 3; atual.value = de + (fim - de) * e; if (p < 1) requestAnimationFrame(passo) }
  requestAnimationFrame(passo)
}, { immediate: true })
</script>

<template>
  <div class="medidor">
    <svg viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" :r="R" class="trilho" />
      <circle cx="40" cy="40" :r="R" class="progresso" :stroke-dasharray="C" :stroke-dashoffset="traco" />
    </svg>
    <div class="medidor-texto"><small>{{ rotulo }}</small><strong>{{ Math.round(atual) }}{{ sufixo }}</strong></div>
  </div>
</template>
