// Saúde das aplicações, gravada pelo monitoramento (scripts/monitorar-aplicacoes.mjs, 3 vezes por dia).
import { reactive } from 'vue'
import { supabase, modoDemo } from './supabase'
import { demo } from './demo'

export const rotuloSituacao = { ok: 'No ar', atencao: 'Atenção', fora: 'Fora do ar' }
export const rotuloBanco = { ok: 'Banco no ar', pausado: 'Banco pausado', erro: 'Banco com problema', sem: 'Sem banco monitorado' }

// Última verificação de cada aplicação, compartilhada por todas as telas.
export const saude = reactive({ porSlug: {}, carregado: false })

let carregando = null
export function carregarSaude({ forcar = false } = {}) {
  if (carregando && !forcar) return carregando
  carregando = (async () => {
    let lista = []
    if (modoDemo) {
      const fora = new Set(demo.aplicacoes.filter((a) => a.status === 'desativado').map((a) => a.slug))
      lista = demo.verificacoes.filter((v, i, l) => !fora.has(v.slug) && l.findIndex((x) => x.slug === v.slug) === i)
    }
    else {
      // Se a migração do monitoramento ainda não foi aplicada, o portal só não mostra as luzes.
      // A view já deixa de fora os itens desativados (migração 0005).
      const { data, error } = await supabase.from('saude_atual').select('*')
      if (!error) lista = data
    }
    saude.porSlug = Object.fromEntries(lista.map((v) => [v.slug, v]))
    saude.carregado = true
  })()
  return carregando
}

export async function historicoSaude(dias = 30) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString()
  if (modoDemo) return demo.verificacoes.filter((v) => v.em >= desde)
  const { data, error } = await supabase.from('verificacoes').select('*').gte('em', desde).order('em', { ascending: false }).limit(5000)
  if (error) throw error
  return data
}

// Resumo falado/escrito: "Tudo no ar" ou a lista do que precisa de atenção.
export function resumoSaude(nomes = {}) {
  const lista = Object.values(saude.porSlug)
  if (!lista.length) return 'Ainda não há verificações do monitoramento.'
  const problemas = lista.filter((v) => v.situacao !== 'ok')
  if (!problemas.length) return `Todos os ${lista.length} sistemas monitorados estão no ar.`
  const nome = (v) => (v.slug === 'portal' ? 'o portal' : nomes[v.slug] || v.slug)
  return problemas.map((v) => `${nome(v)}: ${(v.detalhe || rotuloSituacao[v.situacao]).split('; ')[0]}`).join('. ') + '.'
}
