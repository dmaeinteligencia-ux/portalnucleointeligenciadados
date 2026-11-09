<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { auth, sair } from '../lib/auth'
import { listarAplicacoes } from '../lib/dados'
import { voz, verificarServico, ligar, desligar, atualizarFrases, montarFrases, interpretar, falar, pausar, PALAVRA } from '../lib/voz'

const router = useRouter()
const apps = ref([])
const direto = ref(false) // atalho Ctrl+Espaço: próximo comando sem a palavra de ativação
let prazoDireto = null
let prazoComando = null

const ativo = computed(() => ['conectando', 'ouvindo', 'comando', 'falando'].includes(voz.estado))
const dica = computed(() => {
  if (!voz.disponivel) return 'Comandos de voz: disponível só na rede do DMAE'
  if (voz.estado === 'erro') return voz.erro
  if (ativo.value) return `Ouvindo. Diga "${PALAVRA}" e o comando (Ctrl+Espaço fala direto). Clique para desligar.`
  return 'Ligar comandos de voz (Ctrl+Espaço)'
})
const balao = computed(() => {
  if (voz.estado === 'erro') return voz.erro
  if (voz.parcial) return voz.parcial
  if (voz.estado === 'comando' || direto.value) return 'Pode falar…'
  return voz.resposta || (voz.ultimo ? `Ouvi: “${voz.ultimo}”` : '')
})

async function carregarApps() {
  apps.value = await listarAplicacoes().catch(() => [])
  atualizarFrases(montarFrases(apps.value))
}

async function executar(texto) {
  voz.resposta = ''
  const acao = interpretar(texto, apps.value, { exigirPalavra: !direto.value && voz.estado !== 'comando' })
  if (!acao) {
    // Comando válido dito sem a palavra de ativação: avisa em vez de ficar calado
    const semPalavra = interpretar(texto, apps.value, { exigirPalavra: false })
    if (semPalavra && ['abrir', 'ir'].includes(semPalavra.tipo)) return responder(`Diga ${PALAVRA} antes do comando.`)
    return
  }
  clearTimeout(prazoComando)
  if (acao.tipo === 'ativar') {
    voz.estado = 'comando'
    prazoComando = setTimeout(() => { if (voz.estado === 'comando') voz.estado = 'ouvindo' }, 6000)
    return responder('Sim?')
  }
  direto.value = false
  voz.estado = 'ouvindo'
  switch (acao.tipo) {
    case 'abrir': {
      const { app, novaAba } = acao
      if (novaAba && app.url && window.open(app.url, '_blank', 'noopener')) return responder(`Abrindo ${app.nome} em nova aba.`)
      router.push(app.url ? `/aplicacoes/${app.slug}/usar` : `/aplicacoes/${app.slug}`)
      return responder(novaAba ? `O navegador bloqueou a nova aba. Abrindo ${app.nome} no portal.` : `Abrindo ${app.nome}.`)
    }
    case 'ir':
      if (acao.para === '/admin' && auth.usuario?.papel !== 'admin') return responder('A administração é só para administradores.')
      router.push(acao.para)
      return responder(acao.fala)
    case 'voltar':
      router.back()
      return responder(acao.fala)
    case 'horas':
      return responder(`São ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`)
    case 'parar':
      await responder(acao.fala)
      return desligar()
    case 'sair':
      await responder(acao.fala)
      desligar()
      await sair()
      return router.push('/entrar')
    default:
      return responder('Não entendi o comando.')
  }
}

async function responder(texto) {
  pausar(true)
  await falar(texto)
  pausar(false)
}

async function alternar() {
  if (!voz.disponivel) {
    await verificarServico()
    if (!voz.disponivel) return
  }
  if (ativo.value) return desligar()
  if (!apps.value.length) apps.value = await listarAplicacoes().catch(() => [])
  await ligar({ frases: montarFrases(apps.value), aoTexto: executar })
}

async function atalho(e) {
  if (!(e.ctrlKey && e.code === 'Space')) return
  e.preventDefault()
  if (!ativo.value) await alternar()
  if (!ativo.value) return
  direto.value = true
  clearTimeout(prazoDireto)
  prazoDireto = setTimeout(() => (direto.value = false), 6000)
}

onMounted(() => {
  verificarServico()
  window.addEventListener('keydown', atalho)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', atalho)
  desligar()
})
// Aplicação nova cadastrada: atualiza as frases ao voltar para o catálogo
watch(() => router.currentRoute.value.path, (p) => { if (ativo.value && (p === '/aplicacoes' || p === '/admin')) carregarApps() })
</script>

<template>
  <div v-if="voz.verificado" class="voz" :class="[`voz-${voz.estado}`, { 'voz-off': !voz.disponivel, 'voz-direto': direto }]">
    <button class="voz-botao" :title="dica" :aria-label="dica" :aria-pressed="ativo" @click="alternar">
      <span class="voz-anel" aria-hidden="true" />
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-2.07A7 7 0 0 0 19 12h-2Z" /></svg>
    </button>
    <Transition name="balao">
      <div v-if="ativo || voz.estado === 'erro'" class="voz-balao" role="status" aria-live="polite">
        <span class="voz-onda" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        <span class="voz-texto">{{ balao || `Diga “${PALAVRA}”…` }}</span>
      </div>
    </Transition>
  </div>
</template>
