<script setup>
import { useRouter } from 'vue-router'
import { auth, sair } from '../lib/auth'

const router = useRouter()
async function sairDoSistema() {
  await sair()
  router.push('/entrar')
}
</script>

<template>
  <header class="topo">
    <img src="/logo-dmae.png" alt="DMAE" />
    <h1>Novo sistema</h1>
    <span class="suave">{{ auth.usuario?.email }}</span>
    <button class="botao secundario" @click="sairDoSistema">Sair</button>
  </header>
  <main class="conteudo">
    <section class="painel">
      <h2>Tudo pronto</h2>
      <p class="suave">Comece o sistema a partir daqui. Este projeto já abre dentro do Portal do Núcleo.</p>
    </section>
  </main>
</template>
