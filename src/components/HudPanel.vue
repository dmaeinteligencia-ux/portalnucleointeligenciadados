<script setup>
defineProps({ titulo: String, etiqueta: String, atraso: { type: Number, default: 0 } })
</script>

<template>
  <section class="hud-painel" :style="{ animationDelay: `${atraso}ms` }">
    <span class="canto c1" /><span class="canto c2" /><span class="canto c3" /><span class="canto c4" />
    <span class="varredura" aria-hidden="true" />
    <header v-if="titulo" class="hud-painel-topo">
      <h2>{{ titulo }}</h2>
      <span v-if="etiqueta" class="pilula viva"><i />{{ etiqueta }}</span>
      <slot name="acao" />
    </header>
    <slot />
  </section>
</template>
