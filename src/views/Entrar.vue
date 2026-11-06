<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { entrar } from '../lib/auth'
import { modoDemo } from '../lib/supabase'
import NucleoOrb from '../components/NucleoOrb.vue'

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
    <div class="entrar-orb"><NucleoOrb /></div>
    <div class="hud-painel caixa-entrar">
      <span class="canto c1" /><span class="canto c2" /><span class="canto c3" /><span class="canto c4" />
      <span class="varredura" aria-hidden="true" />
      <img src="/logo-dmae.png" alt="DMAE · Prefeitura de Uberlândia" class="logo-entrar" />
      <h1>Portal do Núcleo</h1>
      <p class="digitando">Inteligência de Dados · acesso restrito</p>

      <div v-if="enviado" class="aviso-ok">
        Link de acesso enviado para <strong>{{ email }}</strong>. Abra seu e-mail e clique no link para entrar.
      </div>

      <form v-else @submit.prevent="enviar">
        <label for="email">IDENTIFICAÇÃO</label>
        <input id="email" v-model="email" type="email" required autocomplete="email" placeholder="seu.email@exemplo.com" />
        <p v-if="erro" class="erro">⚠ {{ erro }}</p>
        <button class="botao brilho" :disabled="enviando">{{ enviando ? 'VERIFICANDO…' : 'RECEBER LINK DE ACESSO' }}</button>
      </form>

      <p v-if="modoDemo" class="dica">Demonstração: use euthiagosilveira@gmail.com (admin) ou servidor@dmae.exemplo (usuário).</p>
      <p class="suave pequeno">Não tem acesso? Fale com o Núcleo de Inteligência de Dados.</p>
    </div>
  </div>
</template>
