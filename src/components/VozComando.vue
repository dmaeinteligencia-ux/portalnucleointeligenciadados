<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { auth, sair } from '../lib/auth'
import { listarAplicacoes } from '../lib/dados'
import { voz, verificarServico, ligar, desligar, atualizarFrases, montarFrases, interpretar, entender, falar, pausar, bipe, definirAutomatica, microfonePermitido, PALAVRA } from '../lib/voz'

const router = useRouter()
const apps = ref([])
const direto = ref(false) // atalho Ctrl+Espaço: próximo comando sem a palavra de ativação
let prazoDireto = null
let prazoComando = null
const pensando = ref(false) // esperando a resposta do Gemini
let prazoPensando = null

const ativo = computed(() => ['conectando', 'ouvindo', 'comando', 'falando'].includes(voz.estado))
const dica = computed(() => {
  if (!voz.disponivel) return 'Comandos de voz: disponível só na rede do DMAE'
  if (voz.estado === 'erro') return voz.erro
  if (ativo.value) return `Ouvindo. Diga "${PALAVRA}" e o comando (Ctrl+Espaço fala direto). Clique para desligar (a escuta não liga mais sozinha até você religar).`
  return 'Ligar comandos de voz (Ctrl+Espaço). Fica ligado sozinho nas próximas vezes.'
})
const balao = computed(() => {
  if (voz.estado === 'erro') return voz.erro
  if (pensando.value) return 'Pensando…'
  if (voz.parcial) return voz.parcial
  if (voz.estado === 'comando' || direto.value) return 'Pode falar…'
  return voz.resposta || (voz.ultimo ? `Ouvi: “${voz.ultimo}”` : '')
})

async function carregarApps() {
  apps.value = await listarAplicacoes().catch(() => [])
  atualizarFrases(montarFrases(apps.value))
}

async function executar(texto, msg = {}) {
  if (pensando.value) return
  const esperandoComando = direto.value || voz.estado === 'comando'
  // Só ruído ou fala fora da lista: vale apenas logo depois de "Sane" (ou do atalho), e só com o Gemini
  if (!texto) {
    if (esperandoComando && msg.incompleto && voz.gemini) perguntarIA()
    return
  }
  voz.resposta = ''
  const acao = interpretar(texto, apps.value, { exigirPalavra: !esperandoComando })
  if (!acao) {
    // Comando válido dito sem a palavra de ativação: avisa em vez de ficar calado
    const semPalavra = interpretar(texto, apps.value, { exigirPalavra: false })
    if (semPalavra && ['abrir', 'ir'].includes(semPalavra.tipo)) return responder(`Diga ${PALAVRA} antes do comando.`)
    return
  }
  clearTimeout(prazoComando)
  // Pedido que não é um comando conhecido ("Sane, quais sistemas temos?"): o Gemini tenta entender.
  // Se só "Sane" foi reconhecido mas a fala durou bem mais que a palavra, o resto também vai para o Gemini.
  if (voz.gemini && (acao.tipo === 'desconhecido' || (acao.tipo === 'ativar' && (msg.incompleto || msg.voz_ms >= 1000)))) return perguntarIA()
  if (acao.tipo === 'ativar') {
    voz.estado = 'comando'
    voz.resposta = ''
    // Bipe em vez de falar "Sim?": quem diz "Sane, …" sem pausa não perde o resto do pedido
    prazoComando = setTimeout(() => { if (voz.estado === 'comando') voz.estado = 'ouvindo' }, 10000)
    return bipe()
  }
  return executarAcao(acao)
}

function perguntarIA() {
  direto.value = false
  voz.estado = 'ouvindo'
  if (!entender(apps.value)) return responder('Não entendi o comando.')
  pensando.value = true
  clearTimeout(prazoPensando)
  prazoPensando = setTimeout(() => {
    if (pensando.value) {
      pensando.value = false
      responder('A inteligência artificial demorou para responder.')
    }
  }, 25000)
}

// Resposta do Gemini: { acao, slug, nova_aba, para, fala, transcricao }
function aoAcao(r) {
  if (!pensando.value) return
  pensando.value = false
  clearTimeout(prazoPensando)
  if (r.transcricao) voz.ultimo = r.transcricao
  switch (r.acao) {
    case 'abrir': {
      const app = apps.value.find((a) => a.slug === r.slug)
      return app ? executarAcao({ tipo: 'abrir', app, novaAba: !!r.nova_aba }) : responder(r.fala || 'Não encontrei essa aplicação.')
    }
    case 'ir':
      return ['/', '/aplicacoes', '/admin'].includes(r.para) ? executarAcao({ tipo: 'ir', para: r.para, fala: r.fala || 'Certo.' }) : responder(r.fala || 'Não entendi o comando.')
    case 'voltar':
      return executarAcao({ tipo: 'voltar', fala: r.fala || 'Voltando.' })
    case 'horas':
      return executarAcao({ tipo: 'horas' })
    case 'parar':
      return executarAcao({ tipo: 'parar', fala: 'Microfone desligado.' })
    default:
      return responder(r.fala || 'Não entendi o comando.')
  }
}

async function executarAcao(acao) {
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
      definirAutomatica(false)
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
  if (ativo.value) {
    pensando.value = false
    definirAutomatica(false) // desligou no botão: não liga mais sozinho até religar
    return desligar()
  }
  definirAutomatica(true)
  await iniciar()
}

async function iniciar() {
  if (!apps.value.length) apps.value = await listarAplicacoes().catch(() => [])
  await ligar({ frases: montarFrases(apps.value), aoTexto: executar, aoAcao })
}

// Escuta automática ao abrir o portal (se o serviço responde e o microfone já foi permitido antes)
async function ligarSozinho() {
  if (!(await verificarServico()) || !voz.automatica || ativo.value) return
  if (!(await microfonePermitido())) return
  await iniciar()
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
  ligarSozinho()
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
  <div v-if="voz.verificado" class="voz" :class="[`voz-${voz.estado}`, { 'voz-off': !voz.disponivel, 'voz-direto': direto, 'voz-pensando': pensando }]">
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
