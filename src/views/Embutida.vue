<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { obterAplicacao, registrarAcesso, rotuloStatus } from '../lib/dados'

const route = useRoute()
const app = ref(null)
const carregado = ref(false)
const carregando = ref(true)
const moldura = ref(null)
const telaCheia = ref(false)

onMounted(async () => {
  app.value = await obterAplicacao(route.params.slug)
  carregado.value = true
  if (app.value?.url) registrarAcesso(app.value)
  document.addEventListener('fullscreenchange', aoMudarTela)
})
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', aoMudarTela))

function aoMudarTela() { telaCheia.value = !!document.fullscreenElement }
function alternarTelaCheia() {
  if (document.fullscreenElement) document.exitFullscreen()
  else moldura.value?.requestFullscreen?.()
}
const recarregar = () => { carregando.value = true; const f = moldura.value.querySelector('iframe'); f.src = f.src }
const novaAba = () => window.open(app.value.url, '_blank', 'noopener')
</script>

<template>
<div class="embutida">
  <template v-if="app?.url">
    <div class="barra-embutida">
      <RouterLink :to="`/aplicacoes/${app.slug}`" class="voltar-mini">‹ Voltar</RouterLink>
      <span class="icone-app mini" aria-hidden="true">{{ app.nome.charAt(0) }}</span>
      <span class="embutida-nome"><strong>{{ app.nome }}</strong><small :class="`st st-${app.status}`"><i />{{ rotuloStatus[app.status] }} · conectado</small></span>
      <span class="embutida-endereco" :title="app.url">⛨ {{ app.url }}</span>
      <div class="embutida-acoes">
        <button class="comando-mini" title="Recarregar" @click="recarregar">⟳</button>
        <button class="comando-mini" :title="telaCheia ? 'Sair da tela cheia' : 'Tela cheia'" @click="alternarTelaCheia">{{ telaCheia ? '⤡' : '⤢' }}</button>
        <button class="botao secundario" @click="novaAba">Abrir em nova aba ↗</button>
      </div>
    </div>
    <div ref="moldura" class="moldura-app">
      <span class="canto c1" /><span class="canto c2" /><span class="canto c3" /><span class="canto c4" />
      <div v-if="carregando" class="carregando-app"><span class="anel-carga" /><small>Conectando à {{ app.nome }}…</small></div>
      <iframe :src="app.url" :title="app.nome" allow="clipboard-write; fullscreen" referrerpolicy="strict-origin-when-cross-origin" @load="carregando = false" />
    </div>
    <p class="dica-embutida">Se a tela ficar em branco ou o login não completar, use <button class="botao-link" @click="novaAba">Abrir em nova aba</button>.</p>
  </template>
  <p v-else-if="carregado" class="suave">Aplicação não encontrada ou sem endereço cadastrado.</p>
</div>
</template>
