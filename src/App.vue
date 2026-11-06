<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth, sair } from './lib/auth'
import { modoDemo } from './lib/supabase'

const router = useRouter()
const busca = ref('')
const buscar = () => router.push({ path: '/aplicacoes', query: busca.value ? { q: busca.value } : {} })
const fazerSair = async () => { await sair(); router.push('/entrar') }
</script>

<template>
  <div v-if="modoDemo" class="faixa-demo">Modo demonstração: dados de exemplo, nada é salvo.</div>
  <header v-if="auth.usuario" class="topo">
    <div class="topo-interno">
      <RouterLink to="/" class="marca">
        <img src="/favicon.svg" alt="" width="32" height="32" />
        <span><strong>Núcleo de Inteligência de Dados</strong><small>DMAE</small></span>
      </RouterLink>
      <nav class="menu">
        <RouterLink to="/">Início</RouterLink>
        <RouterLink to="/aplicacoes">Aplicações</RouterLink>
        <RouterLink v-if="auth.usuario.papel === 'admin'" to="/admin">Administração</RouterLink>
      </nav>
      <form class="busca" @submit.prevent="buscar">
        <input v-model="busca" type="search" placeholder="Buscar aplicação" aria-label="Buscar aplicação" />
      </form>
      <div class="usuario">
        <span>{{ auth.usuario.nome || auth.usuario.email }}</span>
        <button class="botao-link" @click="fazerSair">Sair</button>
      </div>
    </div>
  </header>
  <main :class="{ conteudo: auth.usuario }">
    <RouterView />
  </main>
</template>
