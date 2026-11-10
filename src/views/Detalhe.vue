<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HudPanel from '../components/HudPanel.vue'
import Onda from '../components/Onda.vue'
import { obterAplicacao, registrarAcesso, rotuloStatus, rotuloPlataforma } from '../lib/dados'

const route = useRoute()
const router = useRouter()
const app = ref(null)
const carregado = ref(false)

onMounted(async () => {
  app.value = await obterAplicacao(route.params.slug)
  carregado.value = true
})

const usarNoPortal = () => router.push(`/aplicacoes/${app.value.slug}/usar`)

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
      <div class="icone-app grande" aria-hidden="true">{{ app.tipo === 'painel' ? '◧' : app.nome.charAt(0) }}</div>
      <div>
        <h1 class="titulo-tela">{{ app.nome }}</h1>
        <div class="etiquetas">
          <span class="etiqueta">{{ app.area }}</span>
          <span class="etiqueta" :class="`status-${app.status}`">{{ rotuloStatus[app.status] }}</span>
        </div>
      </div>
      <Onda :barras="28" class="onda-detalhe" />
      <div class="acoes-detalhe">
        <button class="botao brilho" :disabled="!app.url" @click="usarNoPortal">{{ app.url ? 'Usar no portal' : 'Link a definir' }}</button>
        <button v-if="app.url" class="botao secundario" @click="abrir">Abrir em nova aba ↗</button>
      </div>
    </div>
    <p>{{ app.descricao }}</p>
    <dl class="ficha">
      <dt>Responsável</dt><dd>{{ app.responsavel || 'A definir' }}</dd>
      <dt>Endereço</dt><dd class="quebra">{{ app.url || 'A definir' }}</dd>
      <template v-if="app.tipo === 'painel'">
        <dt>Tipo</dt><dd>Painel {{ rotuloPlataforma[app.plataforma] || 'de BI' }}</dd>
        <dt>Como pedir acesso</dt><dd>O acesso aos dados é controlado no {{ rotuloPlataforma[app.plataforma] || 'BI' }}. Peça ao responsável para compartilhar o painel com o seu e-mail institucional.</dd>
      </template>
      <template v-else><dt>Como pedir acesso</dt><dd>Fale com o Núcleo de Inteligência de Dados. A aplicação tem login próprio.</dd></template>
    </dl>
  </HudPanel>
  <p v-else-if="carregado" class="suave">Aplicação não encontrada ou sem acesso liberado.</p>
</div>
</template>
