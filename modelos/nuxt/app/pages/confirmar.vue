<script setup lang="ts">
const usuario = useSupabaseUser()
watchEffect(() => { if (usuario.value) navigateTo('/') })
</script>

<template>
  <div class="tela-entrar"><p class="suave">Confirmando acesso…</p></div>
</template>
