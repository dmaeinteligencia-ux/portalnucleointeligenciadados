// Monitoramento das aplicações do portal.
//
// Para cada aplicação cadastrada (e para o próprio portal):
// - Site: se o endereço responde, com qual código e em quanto tempo.
// - Banco: faz uma consulta leve no Supabase da aplicação. Além de mostrar se o banco está no ar,
//   isso conta como uso e evita que o plano grátis pause o banco depois de 7 dias parado.
// - Certificado HTTPS: quantos dias faltam para vencer.
// O resultado vai para a tabela "verificacoes" do portal. Quando algo dá errado, abre uma issue
// no GitHub (o GitHub avisa os admins por e-mail); quando volta ao normal, fecha a issue sozinho.
//
// Variáveis (GitHub Actions → Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  Supabase do portal
//   GITHUB_TOKEN, GITHUB_REPOSITORY          automáticos no Actions (para as issues)
//   PORTAL_URL (opcional)                    padrão: https://portalnucleointeligenciadados.vercel.app
//   SIMULAR=1 (opcional)                     só mostra o resultado, sem gravar nem abrir issues

import { appendFileSync } from 'node:fs'
import tls from 'node:tls'

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SB_CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORTAL_URL = process.env.PORTAL_URL || 'https://portalnucleointeligenciadados.vercel.app'
const SIMULAR = process.env.SIMULAR === '1'
const GH = process.env.GITHUB_TOKEN
const REPO = process.env.GITHUB_REPOSITORY
const ETIQUETA = 'monitoramento'
const LENTO_MS = 8000
const SSL_AVISO_DIAS = 15
const GUARDAR_DIAS = 90

if (!SB_URL || !SB_CHAVE) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const relatorio = []
const anotar = (linha) => { console.log(linha); relatorio.push(linha) }

async function cronometrar(fn) {
  const ini = Date.now()
  const r = await fn()
  return { r, ms: Date.now() - ini }
}

async function portal(metodo, caminho, corpo) {
  const r = await fetch(`${SB_URL}/rest/v1/${caminho}`, {
    method: metodo,
    headers: { apikey: SB_CHAVE, Authorization: `Bearer ${SB_CHAVE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(20000),
  })
  if (!r.ok) throw new Error(`Supabase do portal ${metodo} ${caminho}: ${r.status} ${await r.text()}`)
  const texto = await r.text()
  return texto ? JSON.parse(texto) : null
}

// ---------- Site ----------
async function verificarSite(url) {
  try {
    const { r, ms } = await cronometrar(() => fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) }))
    return { status: r.status, ms }
  } catch (e) {
    return { status: null, ms: null, erro: e.name === 'TimeoutError' ? 'não respondeu em 20 s' : e.cause?.code || e.message }
  }
}

// ---------- Certificado HTTPS ----------
function diasCertificado(url) {
  return new Promise((resolve) => {
    let host
    try { host = new URL(url).hostname } catch { return resolve(null) }
    const s = tls.connect({ host, port: 443, servername: host, timeout: 10000 }, () => {
      const fim = s.getPeerCertificate()?.valid_to
      s.end()
      resolve(fim ? Math.floor((new Date(fim) - Date.now()) / 86400000) : null)
    })
    s.on('error', () => resolve(null))
    s.on('timeout', () => { s.destroy(); resolve(null) })
  })
}

// ---------- Banco Supabase ----------
// 540 é o código que o Supabase devolve para projeto pausado.
const pausado = (status, texto) => status === 540 || /project (is )?paused|paused project/i.test(texto)

async function chamar(url, chave, caminho, opcoes = {}) {
  const { r, ms } = await cronometrar(() => fetch(`${url}${caminho}`, {
    ...opcoes,
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', ...opcoes.headers },
    signal: AbortSignal.timeout(20000),
  }))
  return { status: r.status, texto: await r.text(), ms }
}

async function verificarBanco(app) {
  const url = (app.supabase_url || '').replace(/\/$/, '')
  if (!url) return { banco: 'sem' }
  if (!app.supabase_chave) return { banco: 'erro', nota: 'falta a chave publishable do Supabase no cadastro' }
  try {
    // 1º: função ping() do banco (vem pronta nos modelos novos)
    let r = await chamar(url, app.supabase_chave, '/rest/v1/rpc/ping', { method: 'POST', body: '{}' })
    if (pausado(r.status, r.texto)) return { banco: 'pausado', ms: r.ms }
    if (r.status < 300) return { banco: 'ok', ms: r.ms }
    // 2º: consulta leve numa tabela indicada (mesmo sem permissão de leitura, o banco é consultado)
    if (app.supabase_tabela) {
      r = await chamar(url, app.supabase_chave, `/rest/v1/${encodeURIComponent(app.supabase_tabela)}?select=*&limit=1`)
      if (pausado(r.status, r.texto)) return { banco: 'pausado', ms: r.ms }
      if (r.status < 500 && r.status !== 404) return { banco: 'ok', ms: r.ms }
    }
    // 3º: só confere se o projeto está no ar (não garante que o banco conte como usado)
    r = await chamar(url, app.supabase_chave, '/auth/v1/health')
    if (pausado(r.status, r.texto)) return { banco: 'pausado', ms: r.ms }
    if (r.status < 300) return { banco: 'ok', ms: r.ms, nota: 'banco no ar, mas sem consulta que evite a pausa (crie a função ping() ou informe uma tabela)' }
    return { banco: 'erro', ms: r.ms, nota: `Supabase respondeu ${r.status}` }
  } catch (e) {
    return { banco: 'erro', nota: e.name === 'TimeoutError' ? 'Supabase não respondeu em 20 s' : `Supabase: ${e.cause?.code || e.message}` }
  }
}

async function verificarBancoPortal() {
  try {
    const { ms } = await cronometrar(() => portal('GET', 'aplicacoes?select=id&limit=1'))
    return { banco: 'ok', ms }
  } catch (e) {
    return { banco: /540|paused/i.test(e.message) ? 'pausado' : 'erro', nota: e.message.slice(0, 200) }
  }
}

// ---------- Avaliação ----------
function avaliar(site, banco, ssl) {
  const fora = [], atencao = []
  if (site) {
    if (site.status === null) fora.push(`site fora do ar (${site.erro})`)
    else if (site.status >= 500) fora.push(`site com erro ${site.status}`)
    else if (site.status >= 400) atencao.push(`site respondeu ${site.status}`)
    else if (site.ms > LENTO_MS) atencao.push(`site lento (${(site.ms / 1000).toFixed(1)} s)`)
  }
  if (banco.banco === 'pausado') fora.push('banco Supabase PAUSADO')
  else if (banco.banco === 'erro') fora.push(`banco com problema${banco.nota ? `: ${banco.nota}` : ''}`)
  else if (banco.nota) atencao.push(banco.nota)
  if (ssl !== null && ssl < SSL_AVISO_DIAS) (ssl < 0 ? fora : atencao).push(ssl < 0 ? 'certificado HTTPS vencido' : `certificado HTTPS vence em ${ssl} dias`)
  return { situacao: fora.length ? 'fora' : atencao.length ? 'atencao' : 'ok', detalhe: [...fora, ...atencao].join('; ') || null }
}

// ---------- Issues no GitHub ----------
async function github(metodo, caminho, corpo) {
  const r = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${REPO}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  if (!r.ok && !(metodo === 'POST' && caminho === '/labels' && r.status === 422)) throw new Error(`GitHub ${metodo} ${caminho}: ${r.status} ${await r.text()}`)
  return r.status === 204 ? null : r.json()
}

const marcador = (slug) => `[${slug}]`

function corpoIssue(alvo, v) {
  const linhas = [
    `**${alvo.nome}** precisa de atenção.`,
    '',
    ...v.detalhe.split('; ').map((p) => `- ${p}`),
    '',
    `Endereço: ${alvo.url || '—'}`,
  ]
  if (v.banco === 'pausado' && alvo.supabase_url) {
    const ref = new URL(alvo.supabase_url).hostname.split('.')[0]
    linhas.push('', `**Para reativar o banco:** entre em https://supabase.com/dashboard/project/${ref} e clique em *Restore project*. Depois disso o monitoramento mantém o banco em uso e ele não pausa de novo.`)
  }
  linhas.push('', 'Esta issue fecha sozinha quando a próxima verificação der tudo certo. Histórico na tela **Saúde** do portal.')
  return linhas.join('\n')
}

async function sincronizarIssues(resultados) {
  if (!GH || !REPO) { anotar('_(sem GITHUB_TOKEN: issues de alerta não foram atualizadas)_'); return }
  await github('POST', '/labels', { name: ETIQUETA, color: 'd73a4a', description: 'Alertas automáticos do monitoramento' })
  const abertas = await github('GET', `/issues?state=open&labels=${ETIQUETA}&per_page=100`)
  for (const { alvo, v } of resultados) {
    const issue = abertas.find((i) => i.title.includes(marcador(alvo.slug)))
    if (v.situacao !== 'ok' && !issue) {
      const icone = v.situacao === 'fora' ? '🔴' : '🟡'
      const criada = await github('POST', '/issues', {
        title: `${icone} ${alvo.nome}: ${v.detalhe.split('; ')[0]} ${marcador(alvo.slug)}`,
        body: corpoIssue(alvo, v),
        labels: [ETIQUETA],
      })
      anotar(`- Alerta aberto para ${alvo.nome}: ${criada.html_url}`)
    } else if (v.situacao === 'ok' && issue) {
      await github('POST', `/issues/${issue.number}/comments`, { body: `✅ ${alvo.nome} voltou ao normal em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.` })
      await github('PATCH', `/issues/${issue.number}`, { state: 'closed', state_reason: 'completed' })
      anotar(`- Alerta fechado para ${alvo.nome}: ${issue.html_url}`)
    }
  }
}

// ---------- Execução ----------
const apps = await portal('GET', 'aplicacoes?select=slug,nome,url,supabase_url,supabase_chave,supabase_tabela,ativo&order=ordem')
const alvos = [
  { slug: 'portal', nome: 'Portal do Núcleo', url: PORTAL_URL, supabase_url: SB_URL, proprio: true },
  ...apps.filter((a) => a.url || a.supabase_url),
]

const icone = { ok: '🟢', atencao: '🟡', fora: '🔴' }
anotar(`## Monitoramento das aplicações${SIMULAR ? ' (simulação, nada foi gravado)' : ''}`)
anotar('')
anotar('| | Aplicação | Site | Banco | HTTPS | Observação |')
anotar('|---|---|---|---|---|---|')

const resultados = await Promise.all(alvos.map(async (alvo) => {
  const [site, banco, ssl] = await Promise.all([
    alvo.url ? verificarSite(alvo.url) : null,
    alvo.proprio ? verificarBancoPortal() : verificarBanco(alvo),
    alvo.url ? diasCertificado(alvo.url) : null,
  ])
  const { situacao, detalhe } = avaliar(site, banco, ssl)
  return {
    alvo,
    v: {
      slug: alvo.slug, situacao, detalhe,
      site_status: site?.status ?? null, site_ms: site?.ms ?? null,
      banco: banco.banco, banco_ms: banco.ms ?? null, ssl_dias: ssl,
    },
  }
}))

for (const { alvo, v } of resultados) {
  const site = v.site_status ? `${v.site_status} · ${v.site_ms} ms` : alvo.url ? 'sem resposta' : '—'
  const banco = v.banco === 'sem' ? '—' : `${v.banco}${v.banco_ms ? ` · ${v.banco_ms} ms` : ''}`
  anotar(`| ${icone[v.situacao]} | ${alvo.nome} | ${site} | ${banco} | ${v.ssl_dias != null ? `${v.ssl_dias} dias` : '—'} | ${v.detalhe || ''} |`)
}
anotar('')

if (!SIMULAR) {
  await portal('POST', 'verificacoes', resultados.map((r) => r.v))
  const limite = new Date(Date.now() - GUARDAR_DIAS * 86400000).toISOString()
  await portal('DELETE', `verificacoes?em=lt.${limite}`)
  await sincronizarIssues(resultados)
}

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, relatorio.join('\n') + '\n')
