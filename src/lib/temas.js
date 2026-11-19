// Temas sazonais do portal: cada tema tem um período do ano e liga sozinho nele (modo "auto").
// Os administradores podem deixar um tema ligado agora ou desligar todos (tabela configuracoes, chave 'tema').
// Para criar um tema novo: acrescente-o em TEMAS e escreva o visual em style.css, sob [data-tema="<id>"].
import { reactive, computed } from 'vue'
import { supabase, modoDemo } from './supabase'
import { demo } from './demo'

export const TEMAS = [
  {
    id: 'natal', nome: 'Natal', inicio: '12-01', fim: '01-06', // de 1º de dezembro ao Dia de Reis
    periodo: '1º de dezembro a 6 de janeiro',
    // Feliz Natal até o dia 25; de 26/12 até o Dia de Reis, feliz ano novo.
    saudacao: (d = new Date()) => ((d.getMonth() === 11 && d.getDate() > 25) || d.getMonth() === 0 ? 'FELIZ ANO NOVO' : 'FELIZ NATAL'),
  },
]

export const rotuloModoTema = {
  auto: 'Automático, pelas datas',
  ...Object.fromEntries(TEMAS.map(t => [t.id, `${t.nome} ligado agora`])),
  nenhum: 'Sem tema sazonal',
}

export const temaConfig = reactive({ modo: 'auto', carregado: false })

const mmdd = d => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// Período que vira o ano (ex.: 12-01 a 01-06) também vale
const noPeriodo = (t, d) => {
  const h = mmdd(d)
  return t.inicio <= t.fim ? h >= t.inicio && h <= t.fim : h >= t.inicio || h <= t.fim
}
export const temaDaData = (d = new Date()) => TEMAS.find(t => noPeriodo(t, d)) || null

// Prévia só neste navegador: ?tema=natal (ou ?tema=nenhum) no endereço. Fica até fechar a aba.
function lerPrevia() {
  try {
    const p = new URLSearchParams(window.location.search).get('tema')
    if (p) sessionStorage.setItem('tema-previa', p)
    return sessionStorage.getItem('tema-previa')
  } catch { return null }
}
const previa = lerPrevia()

export const temaAtivo = computed(() => {
  const modo = previa || temaConfig.modo
  if (modo === 'nenhum') return null
  if (modo && modo !== 'auto') return TEMAS.find(t => t.id === modo) || null
  return temaDaData()
})

export async function carregarTema() {
  try {
    if (modoDemo) temaConfig.modo = demo.configuracoes?.tema?.modo || 'auto'
    else {
      const { data, error } = await supabase.from('configuracoes').select('valor').eq('chave', 'tema').maybeSingle()
      if (error) throw error
      temaConfig.modo = data?.valor?.modo || 'auto'
    }
  } catch {
    temaConfig.modo = 'auto' // tabela ainda não criada: segue pelas datas
  }
  temaConfig.carregado = true
}

export async function salvarModoTema(modo) {
  if (modoDemo) {
    demo.configuracoes = { ...(demo.configuracoes || {}), tema: { modo } }
  } else {
    const { error } = await supabase.from('configuracoes')
      .upsert({ chave: 'tema', valor: { modo }, atualizado_em: new Date().toISOString() })
    if (error) throw new Error(/configuracoes/.test(error.message)
      ? 'A tabela de ajustes ainda não existe no banco (migração 0009).'
      : error.message)
  }
  temaConfig.modo = modo
}
