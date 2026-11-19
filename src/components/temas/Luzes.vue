<script setup>
// Cordão de luzes de Natal pendurado na borda de baixo do topo
const props = defineProps({ quantidade: { type: Number, default: 28 } })
const cores = ['vermelha', 'dourada', 'verde', 'ciano']
</script>

<template>
  <div class="luzes-natal" aria-hidden="true">
    <svg class="luzes-fio" viewBox="0 0 100 10" preserveAspectRatio="none">
      <path :d="Array.from({ length: props.quantidade }, (_, i) => {
        const x0 = (i / props.quantidade) * 100, x1 = ((i + 1) / props.quantidade) * 100
        return `${i ? '' : 'M0 1 '}Q ${(x0 + x1) / 2} 7 ${x1} 1`
      }).join(' ')" />
    </svg>
    <i v-for="n in props.quantidade" :key="n" :class="cores[(n - 1) % cores.length]"
      :style="{ left: `${((n - 0.5) / props.quantidade) * 100}%`, animationDelay: `${((n * 37) % 23) / 10}s` }" />
  </div>
</template>
