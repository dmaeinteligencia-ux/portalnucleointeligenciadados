<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { entrar } from '../lib/auth'

const router = useRouter()
const email = ref('')
const senha = ref('')
const erro = ref('')
const enviando = ref(false)

async function enviar() {
  erro.value = ''
  enviando.value = true
  try {
    await entrar(email.value, senha.value)
    router.push('/')
  } catch (e) {
    erro.value = e.message
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="tela-entrar">
    <div class="painel caixa-entrar">
      <img src="/logo-dmae.png" alt="DMAE · Prefeitura de Uberlândia" />
      <h1>Novo sistema</h1>
      <p class="suave">Núcleo de Inteligência de Dados</p>
      <form @submit.prevent="enviar">
        <label for="email">E-MAIL</label>
        <input id="email" v-model="email" type="email" required autocomplete="email" />
        <label for="senha">SENHA</label>
        <input id="senha" v-model="senha" type="password" required autocomplete="current-password" />
        <p v-if="erro" class="erro">⚠ {{ erro }}</p>
        <button class="botao" :disabled="enviando">{{ enviando ? 'ENTRANDO…' : 'ENTRAR' }}</button>
      </form>
    </div>
  </div>
</template>
