<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { auth, entrar, entrarComSenha } from '../lib/auth'
import { modoDemo } from '../lib/supabase'
import NucleoOrb from '../components/NucleoOrb.vue'

const router = useRouter()
const paraAdmin = !!useRoute().query.admin
const email = ref('')
const enviando = ref(false)
const erro = ref(auth.erroLink)
const enviado = ref(false)
const senha = ref('')
// Padrão: e-mail e senha. "Receber link" fica como alternativa (primeiro acesso ou esqueci a senha).
const modoLink = ref(false)
const destino = () => (auth.usuario?.papel === 'apresentacao' ? '/apresentacao' : '/')

async function entrarSenha() {
  erro.value = ''
  enviando.value = true
  try {
    await entrarComSenha(email.value, senha.value)
    router.push(destino())
  } catch (e) {
    erro.value = e.message
  } finally {
    enviando.value = false
  }
}

async function enviar() {
  erro.value = ''
  enviando.value = true
  try {
    const { entrouDireto } = await entrar(email.value)
    if (entrouDireto) router.push(destino())
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
        Link de acesso enviado para <strong>{{ email }}</strong>. Abra seu e-mail e clique no link para entrar. Depois crie sua senha em "Minha senha".
      </div>

      <form v-else-if="!modoLink" @submit.prevent="entrarSenha">
        <p v-if="paraAdmin" class="dica">Entrada de administrador: use o seu e-mail e a sua senha de administrador.</p>
        <label for="email">E-MAIL</label>
        <input id="email" v-model="email" type="email" required autocomplete="username" placeholder="seu.email@exemplo.com" />
        <label for="senha">SENHA</label>
        <input id="senha" v-model="senha" type="password" required autocomplete="current-password" />
        <p v-if="erro" class="erro">⚠ {{ erro }}</p>
        <button class="botao brilho" :disabled="enviando">{{ enviando ? 'VERIFICANDO…' : 'ENTRAR' }}</button>
        <button type="button" class="botao-link entrar-alternar" @click="modoLink = true; erro = ''">Primeiro acesso ou esqueceu a senha? Receber link por e-mail</button>
      </form>

      <form v-else @submit.prevent="enviar">
        <p class="dica">Enviamos um link de acesso para o seu e-mail. Depois de entrar, crie sua senha em "Minha senha", no topo da tela.</p>
        <label for="email">E-MAIL</label>
        <input id="email" v-model="email" type="email" required autocomplete="email" placeholder="seu.email@exemplo.com" />
        <p v-if="erro" class="erro">⚠ {{ erro }}</p>
        <button class="botao brilho" :disabled="enviando">{{ enviando ? 'VERIFICANDO…' : 'RECEBER LINK DE ACESSO' }}</button>
        <button type="button" class="botao-link entrar-alternar" @click="modoLink = false; erro = ''">Voltar para e-mail e senha</button>
      </form>

      <p v-if="modoDemo" class="dica">Demonstração (qualquer senha): use euthiagosilveira@gmail.com (admin), servidor@dmae.exemplo (usuário) ou tv@dmae.exemplo (apresentação).</p>
      <p class="suave pequeno">Não tem acesso? Fale com o Núcleo de Inteligência de Dados.</p>
    </div>
  </div>
</template>
