<script setup>
import { ref } from 'vue'
import { definirSenha } from '../lib/auth'

// Cria ou troca a senha da própria conta. Depois disso a pessoa pode entrar com e-mail e senha.
const aberto = ref(false)
const senha = ref('')
const repetir = ref('')
const erro = ref('')
const ok = ref(false)
const salvando = ref(false)

function abrir() { aberto.value = true; senha.value = ''; repetir.value = ''; erro.value = ''; ok.value = false }

async function salvar() {
  erro.value = ''
  if (senha.value.length < 8) return (erro.value = 'Use pelo menos 8 caracteres.')
  if (senha.value !== repetir.value) return (erro.value = 'As duas senhas não são iguais.')
  salvando.value = true
  try {
    await definirSenha(senha.value)
    ok.value = true
  } catch (e) {
    erro.value = e.message
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <button class="botao-link" title="Criar ou trocar a senha de acesso" @click="abrir">Minha senha</button>
  <Teleport to="body">
    <div v-if="aberto" class="senha-fundo" @click.self="aberto = false">
      <form class="hud-painel senha-caixa" @submit.prevent="salvar">
        <h2>Minha senha</h2>
        <template v-if="!ok">
          <p class="suave pequeno">Com a senha, você entra com e-mail e senha, sem precisar do link por e-mail.</p>
          <label>Nova senha<input v-model="senha" type="password" autocomplete="new-password" required minlength="8" /></label>
          <label>Repita a senha<input v-model="repetir" type="password" autocomplete="new-password" required minlength="8" /></label>
          <p v-if="erro" class="erro">⚠ {{ erro }}</p>
          <div class="senha-acoes">
            <button type="button" class="botao secundario" @click="aberto = false">Cancelar</button>
            <button class="botao brilho" :disabled="salvando">{{ salvando ? 'Salvando…' : 'Salvar senha' }}</button>
          </div>
        </template>
        <template v-else>
          <div class="aviso-ok">Senha salva. Da próxima vez, entre com seu e-mail e essa senha.</div>
          <div class="senha-acoes"><button type="button" class="botao" @click="aberto = false">Fechar</button></div>
        </template>
      </form>
    </div>
  </Teleport>
</template>
