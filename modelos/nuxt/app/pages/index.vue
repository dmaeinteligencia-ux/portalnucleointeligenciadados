<script setup lang="ts">
const supabase = useSupabaseClient()
const usuario = useSupabaseUser()

async function sair() {
  await supabase.auth.signOut()
  await navigateTo('/entrar')
}
</script>

<template>
  <header class="topo">
    <img src="/logo-dmae.png" alt="DMAE">
    <h1>Novo sistema</h1>
    <span class="suave">{{ usuario?.email }}</span>
    <button class="botao secundario" @click="sair">Sair</button>
  </header>
  <main class="conteudo">
    <section class="painel">
      <h2>Tudo pronto</h2>
      <p class="suave">Comece o sistema a partir daqui. Este projeto já abre dentro do Portal do Núcleo.</p>
    </section>
  </main>
</template>
