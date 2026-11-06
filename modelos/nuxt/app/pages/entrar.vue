<script setup lang="ts">
const supabase = useSupabaseClient()
const usuario = useSupabaseUser()
const email = ref('')
const senha = ref('')
const erro = ref('')
const enviando = ref(false)

watchEffect(() => { if (usuario.value) navigateTo('/') })

// E-mail e senha funcionam dentro do portal. Link mágico abre outra aba e o login não chega ao iframe.
async function enviar() {
  erro.value = ''
  enviando.value = true
  const { error } = await supabase.auth.signInWithPassword({ email: email.value, password: senha.value })
  enviando.value = false
  if (error) erro.value = error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message
}
</script>

<template>
  <div class="tela-entrar">
    <div class="painel caixa-entrar">
      <img src="/logo-dmae.png" alt="DMAE · Prefeitura de Uberlândia">
      <h1>Novo sistema</h1>
      <p class="suave">Núcleo de Inteligência de Dados</p>
      <form @submit.prevent="enviar">
        <label for="email">E-MAIL</label>
        <input id="email" v-model="email" type="email" required autocomplete="email">
        <label for="senha">SENHA</label>
        <input id="senha" v-model="senha" type="password" required autocomplete="current-password">
        <p v-if="erro" class="erro">⚠ {{ erro }}</p>
        <button class="botao" :disabled="enviando">{{ enviando ? 'ENTRANDO…' : 'ENTRAR' }}</button>
      </form>
    </div>
  </div>
</template>
