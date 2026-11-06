<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import HudPanel from '../components/HudPanel.vue'
import Onda from '../components/Onda.vue'
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
<div>
  <RouterLink to="/aplicacoes" class="voltar">‹ Aplicações</RouterLink>
  <HudPanel v-if="app" class="detalhe">
    <div class="detalhe-topo">
      <div class="icone-app grande" aria-hidden="true">{{ app.nome.charAt(0) }}</div>
      <div>
        <h1 class="titulo-tela">{{ app.nome }}</h1>
        <div class="etiquetas">
          <span class="etiqueta">{{ app.area }}</span>
          <span class="etiqueta" :class="`status-${app.status}`">{{ rotuloStatus[app.status] }}</span>
        </div>
      </div>
      <Onda :barras="28" class="onda-detalhe" />
      <button class="botao brilho" :disabled="!app.url" @click="abrir">{{ app.url ? 'Abrir aplicação' : 'Link a definir' }}</button>
    </div>
    <p>{{ app.descricao }}</p>
    <dl class="ficha">
      <dt>Responsável</dt><dd>{{ app.responsavel || 'A definir' }}</dd>
      <dt>Endereço</dt><dd>{{ app.url || 'A definir' }}</dd>
      <dt>Como pedir acesso</dt><dd>Fale com o Núcleo de Inteligência de Dados. A aplicação tem login próprio.</dd>
    </dl>
  </HudPanel>
  <p v-else-if="carregado" class="suave">Aplicação não encontrada ou sem acesso liberado.</p>
</div>
</template>
