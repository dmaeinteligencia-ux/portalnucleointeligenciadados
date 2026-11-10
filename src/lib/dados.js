import { supabase, modoDemo } from './supabase'
import { demo } from './demo'
import { auth } from './auth'

const ordenar = lista => [...lista].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
const ok = async (consulta) => { const { data, error } = await consulta; if (error) throw error; return data }

export async function listarAplicacoes({ todas = false } = {}) {
  if (modoDemo) return ordenar(demo.aplicacoes.filter(a => todas || a.ativo)).map(ajustar)
  let q = supabase.from('aplicacoes').select('*').order('ordem').order('nome')
  if (!todas) q = q.eq('ativo', true)
  return (await ok(q)).map(ajustar)
}

export async function obterAplicacao(slug) {
  if (modoDemo) return ajustar(demo.aplicacoes.find(a => a.slug === slug) || null)
  return ajustar(await ok(supabase.from('aplicacoes').select('*').eq('slug', slug).maybeSingle()))
}

export async function salvarAplicacao(app) {
  if (modoDemo) {
    if (app.id) Object.assign(demo.aplicacoes.find(a => a.id === app.id), app)
    else demo.aplicacoes.push({ ...app, id: crypto.randomUUID() })
    return
  }
  const { id, criado_em, ...campos } = app
  if (id) await ok(supabase.from('aplicacoes').update(campos).eq('id', id))
  else await ok(supabase.from('aplicacoes').insert(campos))
}

export async function registrarAcesso(app) {
  const registro = { email: auth.usuario.email, aplicacao_id: app.id }
  if (modoDemo) demo.acessos.unshift({ ...registro, id: Date.now(), em: new Date().toISOString() })
  else await supabase.from('acessos').insert(registro)
}

export async function listarAcessos(limite = 50) {
  if (modoDemo) return demo.acessos.slice(0, limite)
  return ok(supabase.from('acessos').select('*').order('em', { ascending: false }).limit(limite))
}

export async function listarAvisos({ todos = false } = {}) {
  const ord = l => [...l].sort((a, b) => b.publicado_em.localeCompare(a.publicado_em))
  if (modoDemo) return ord(demo.avisos.filter(v => todos || v.ativo))
  let q = supabase.from('avisos').select('*').order('publicado_em', { ascending: false })
  if (!todos) q = q.eq('ativo', true)
  return ok(q)
}

export async function salvarAviso(aviso) {
  if (modoDemo) {
    if (aviso.id) Object.assign(demo.avisos.find(v => v.id === aviso.id), aviso)
    else demo.avisos.push({ ...aviso, id: crypto.randomUUID(), publicado_em: new Date().toISOString() })
    return
  }
  const { id, ...campos } = aviso
  if (id) await ok(supabase.from('avisos').update(campos).eq('id', id))
  else await ok(supabase.from('avisos').insert(campos))
}

export async function listarAutorizados() {
  if (modoDemo) return [...demo.autorizados]
  return ok(supabase.from('autorizados').select('*').order('email'))
}

export async function autorizar(pessoa) {
  pessoa = { ...pessoa, email: pessoa.email.trim().toLowerCase() }
  if (modoDemo) {
    const existente = demo.autorizados.find(a => a.email === pessoa.email)
    existente ? Object.assign(existente, pessoa) : demo.autorizados.push(pessoa)
    return
  }
  await ok(supabase.from('autorizados').upsert(pessoa))
}

export async function removerAutorizado(email) {
  if (modoDemo) { demo.autorizados = demo.autorizados.filter(a => a.email !== email); return }
  await ok(supabase.from('autorizados').delete().eq('email', email))
}

export const rotuloTipo = { sistema: 'Sistema', painel: 'Painel de BI' }
export const rotuloPlataforma = { powerbi: 'Power BI', looker: 'Looker Studio', metabase: 'Metabase', outro: 'Outra' }

// Link de inserção do Power BI: aceita o endereço, o código <iframe> inteiro ou o link normal do relatório.
// O link normal (app.powerbi.com/groups/<espaço>/reports/<relatório>/...) é bloqueado pelo Power BI dentro
// de iframe, então vira o link de inserção segura (reportEmbed), que pede o login Microsoft no quadro.
export function normalizarLinkPainel(texto) {
  const t = (texto || '').trim()
  const src = t.match(/src\s*=\s*["']([^"']+)["']/i)
  const url = (src ? src[1] : t).replace(/&amp;/g, '&')
  let u
  try { u = new URL(url) } catch { return url }
  if (!/(^|\.)powerbi\.com$/i.test(u.hostname)) return url
  const m = u.pathname.match(/\/groups\/([^/]+)\/reports\/([0-9a-f-]{36})(?:\/([^/?#]+))?/i)
  if (!m) return url
  const [, grupo, relatorio, pagina] = m
  const p = new URLSearchParams({ reportId: relatorio })
  if (grupo !== 'me') p.set('groupId', grupo)
  if (pagina && !/^reportsection$/i.test(pagina)) p.set('pageName', pagina)
  p.set('autoAuth', 'true')
  const ctid = u.searchParams.get('ctid')
  if (ctid) p.set('ctid', ctid)
  return `${u.origin}/reportEmbed?${p}`
}
export const linkPowerBI = url => /^https:\/\/([a-z0-9-]+\.)*powerbi\.com\//i.test(url || '')

// Cadastros antigos ou feitos como "Sistema" com link do Power BI passam a ser tratados como painel.
function ajustar(app) {
  if (!app || !linkPowerBI(app.url)) return app
  return { ...app, tipo: 'painel', plataforma: app.plataforma || 'powerbi', url: normalizarLinkPainel(app.url) }
}
// "Publicar na web" gera app.powerbi.com/view?r=..., que qualquer pessoa com o link consegue abrir.
export const linkPublicoPowerBI = url => /powerbi\.com\/view\?r=/i.test(url || '')

export const rotuloStatus = { producao: 'Em produção', piloto: 'Piloto', desenvolvimento: 'Em desenvolvimento' }
