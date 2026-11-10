<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { obterAplicacao, registrarAcesso, rotuloStatus, rotuloPlataforma } from '../lib/dados'

const route = useRoute()
const router = useRouter()
const app = ref(null)
const carregado = ref(false)
const carregando = ref(true)
const moldura = ref(null)
const telaCheia = ref(false)
const bloqueado = ref(false)
const painel = computed(() => app.value?.tipo === 'painel')

// A aplicação embutida avisa se o navegador deixa o login funcionar dentro do quadro
function aoReceberMensagem(evento) {
  if (!app.value?.url) return
  let origem
  try { origem = new URL(app.value.url).origin } catch { return }
  if (evento.origin !== origem) return
  const tipo = evento.data?.tipo
  if (tipo === 'nucleo:sessao-bloqueada') bloqueado.value = true
  else if (tipo === 'nucleo:sessao-ok') bloqueado.value = false
}

onMounted(async () => {
  app.value = await obterAplicacao(route.params.slug)
  carregado.value = true
  if (app.value?.url) registrarAcesso(app.value)
  document.addEventListener('fullscreenchange', aoMudarTela)
  window.addEventListener('message', aoReceberMensagem)
})
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', aoMudarTela)
  window.removeEventListener('message', aoReceberMensagem)
})

function aoMudarTela() { telaCheia.value = !!document.fullscreenElement }
function alternarTelaCheia() {
  if (document.fullscreenElement) document.exitFullscreen()
  else moldura.value?.requestFullscreen?.()
}
const recarregar = () => { carregando.value = true; const f = moldura.value.querySelector('iframe'); f.src = f.src }
// Volta para a tela de onde a pessoa veio (início ou lista); sem histórico, vai para a lista
const voltar = () => (window.history.state?.back ? router.back() : router.push('/aplicacoes'))
const novaAba = () => window.open(app.value.url, '_blank', 'noopener')
</script>

<template>
<div class="embutida">
  <template v-if="app?.url">
    <div class="barra-embutida">
      <button class="voltar-mini" @click="voltar">‹ Voltar</button>
      <span class="icone-app mini" aria-hidden="true">{{ painel ? '◧' : app.nome.charAt(0) }}</span>
      <span class="embutida-nome"><strong>{{ app.nome }}</strong><small :class="`st st-${app.status}`"><i />{{ painel ? `Painel ${rotuloPlataforma[app.plataforma] || 'de BI'}` : rotuloStatus[app.status] }} · conectado</small></span>
      <span class="embutida-endereco" :title="app.url">⛨ {{ app.url }}</span>
      <div class="embutida-acoes">
        <RouterLink :to="`/aplicacoes/${app.slug}`" class="comando-mini" title="Detalhes da aplicação" aria-label="Detalhes da aplicação">ⓘ</RouterLink>
        <button class="comando-mini" title="Recarregar" @click="recarregar">⟳</button>
        <button class="comando-mini" :title="telaCheia ? 'Sair da tela cheia' : 'Tela cheia'" @click="alternarTelaCheia">{{ telaCheia ? '⤡' : '⤢' }}</button>
        <button class="botao secundario" @click="novaAba">Abrir em nova aba ↗</button>
      </div>
    </div>
    <div ref="moldura" class="moldura-app" :class="{ 'moldura-painel': painel }">
      <span class="canto c1" /><span class="canto c2" /><span class="canto c3" /><span class="canto c4" />
      <div v-if="carregando" class="carregando-app"><span class="anel-carga" /><small>Conectando à {{ app.nome }}…</small></div>
      <div v-if="bloqueado" class="bloqueio-app" role="alert">
        <strong>Este navegador bloqueou o login dentro do portal</strong>
        <p>O Safari e navegadores que bloqueiam cookies de terceiros não deixam a {{ app.nome }} manter o login aqui dentro. Abra em nova aba para usar normalmente.</p>
        <button class="botao brilho" @click="novaAba">Abrir em nova aba ↗</button>
      </div>
      <iframe :src="app.url" :title="app.nome" allow="clipboard-write; fullscreen" referrerpolicy="strict-origin-when-cross-origin" @load="carregando = false" />
    </div>
    <p v-if="painel && app.plataforma === 'powerbi'" class="dica-embutida">Se o Power BI pedir, clique em <strong>Entrar</strong> e use sua conta Microsoft do DMAE. Você só vê os painéis que foram compartilhados com você no Power BI. Se não carregar, use <button class="botao-link" @click="novaAba">Abrir em nova aba</button>.</p>
    <p v-else class="dica-embutida">Se a tela ficar em branco ou o login não completar, use <button class="botao-link" @click="novaAba">Abrir em nova aba</button>.</p>
  </template>
  <p v-else-if="carregado" class="suave">Aplicação não encontrada ou sem endereço cadastrado.</p>
</div>
</template>
