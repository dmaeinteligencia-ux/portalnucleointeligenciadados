import { supabase, modoDemo } from './supabase'
import { demo } from './demo'
import { auth } from './auth'

const ordenar = lista => [...lista].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
const ok = async (consulta) => { const { data, error } = await consulta; if (error) throw error; return data }

export async function listarAplicacoes({ todas = false } = {}) {
  if (modoDemo) {
    // Imita as regras do banco (RLS): restritas só para admin ou para quem tem permissão
    const u = auth.usuario, admin = u?.papel === 'admin'
    const pode = a => admin || !a.restrita || demo.permissoes.some(p => p.aplicacao_id === a.id && p.email === u?.email)
    return ordenar(demo.aplicacoes.filter(a => (todas || a.ativo) && pode(a)))
  }
  let q = supabase.from('aplicacoes').select('*').order('ordem').order('nome')
  if (!todas) q = q.eq('ativo', true)
  return ok(q)
}

export async function obterAplicacao(slug) {
  if (modoDemo) return (await listarAplicacoes({ todas: auth.usuario?.papel === 'admin' })).find(a => a.slug === slug) || null
  return ok(supabase.from('aplicacoes').select('*').eq('slug', slug).maybeSingle())
}

export async function salvarAplicacao(app) {
  if (modoDemo) {
    if (app.id) { Object.assign(demo.aplicacoes.find(a => a.id === app.id), app); return app.id }
    const id = crypto.randomUUID()
    demo.aplicacoes.push({ ...app, id })
    return id
  }
  const { id, criado_em, ...campos } = app
  if (id) { await ok(supabase.from('aplicacoes').update(campos).eq('id', id)); return id }
  const nova = await ok(supabase.from('aplicacoes').insert(campos).select('id').single())
  return nova.id
}

export async function listarPermissoes() {
  if (modoDemo) return [...demo.permissoes]
  return ok(supabase.from('permissoes').select('*'))
}

// Substitui a lista de pessoas com acesso a uma aplicação restrita
export async function salvarPermissoes(aplicacaoId, emails) {
  if (modoDemo) {
    demo.permissoes = demo.permissoes.filter(p => p.aplicacao_id !== aplicacaoId)
      .concat(emails.map(email => ({ email, aplicacao_id: aplicacaoId })))
    return
  }
  await ok(supabase.from('permissoes').delete().eq('aplicacao_id', aplicacaoId))
  if (emails.length) await ok(supabase.from('permissoes').insert(emails.map(email => ({ email, aplicacao_id: aplicacaoId }))))
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

export const rotuloStatus = { producao: 'Em produção', piloto: 'Piloto', desenvolvimento: 'Em desenvolvimento' }
