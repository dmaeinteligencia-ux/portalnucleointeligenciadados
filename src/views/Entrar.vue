<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { entrar } from '../lib/auth'
import { modoDemo } from '../lib/supabase'

const router = useRouter()
const email = ref('')
const enviando = ref(false)
const erro = ref('')
const enviado = ref(false)

async function enviar() {
  erro.value = ''
  enviando.value = true
  try {
    const { entrouDireto } = await entrar(email.value)
    if (entrouDireto) router.push('/')
    else enviado.value = true
  } catch (e) {
    erro.value = e.message
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="tela-entrar">
    <div class="cartao caixa-entrar">
      <img src="/favicon.svg" alt="" width="48" height="48" />
      <h1>Portal do Núcleo de Inteligência de Dados</h1>
      <p class="suave">DMAE · acesso restrito a usuários autorizados</p>

      <div v-if="enviado" class="aviso-ok">
        Enviamos um link de acesso para <strong>{{ email }}</strong>. Abra seu e-mail e clique no link para entrar.
      </div>

      <form v-else @submit.prevent="enviar">
        <label for="email">E-mail</label>
        <input id="email" v-model="email" type="email" required autocomplete="email" placeholder="seu.email@exemplo.com" />
        <p v-if="erro" class="erro">{{ erro }}</p>
        <button class="botao" :disabled="enviando">{{ enviando ? 'Enviando…' : 'Receber link de acesso' }}</button>
      </form>

      <p v-if="modoDemo" class="dica">Demonstração: use euthigosilveira@gmail.com (admin) ou servidor@dmae.exemplo (usuário).</p>
      <p class="suave pequeno">Não tem acesso? Fale com o Núcleo de Inteligência de Dados.</p>
    </div>
  </div>
</template>
