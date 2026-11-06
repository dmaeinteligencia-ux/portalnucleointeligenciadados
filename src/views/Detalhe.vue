<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { obterAplicacao, registrarAcesso, rotuloStatus } from '../lib/dados'

const route = useRoute()
const app = ref(null)
const carregado = ref(false)

onMounted(async () => {
  app.value = await obterAplicacao(route.params.slug)
  carregado.value = true
})

async function abrir() {
  await registrarAcesso(app.value)
  window.open(app.value.url, '_blank', 'noopener')
}
</script>

<template>
  <RouterLink to="/aplicacoes" class="voltar">← Aplicações</RouterLink>
  <div v-if="app" class="cartao detalhe">
    <div class="detalhe-topo">
      <div class="icone-app grande" aria-hidden="true">{{ app.nome.charAt(0) }}</div>
      <div>
        <h1>{{ app.nome }}</h1>
        <div class="etiquetas">
          <span class="etiqueta">{{ app.area }}</span>
          <span class="etiqueta" :class="`status-${app.status}`">{{ rotuloStatus[app.status] }}</span>
        </div>
      </div>
      <button class="botao" :disabled="!app.url" @click="abrir">{{ app.url ? 'Abrir aplicação' : 'Link a definir' }}</button>
    </div>
    <p>{{ app.descricao }}</p>
    <dl class="ficha">
      <dt>Responsável</dt><dd>{{ app.responsavel || 'A definir' }}</dd>
      <dt>Endereço</dt><dd>{{ app.url || 'A definir' }}</dd>
      <dt>Como pedir acesso</dt><dd>Fale com o Núcleo de Inteligência de Dados. A aplicação tem login próprio.</dd>
    </dl>
  </div>
  <p v-else-if="carregado" class="suave">Aplicação não encontrada ou sem acesso liberado.</p>
</template>
