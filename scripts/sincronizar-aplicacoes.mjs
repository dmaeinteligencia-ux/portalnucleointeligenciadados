// Cadastro automático das aplicações no portal.
//
// Lê o arquivo nucleo.json de cada repositório do dono no GitHub e cadastra ou atualiza
// a aplicação na tabela "aplicacoes" do Supabase do portal.
// - Aplicação nova entra oculta (ativo = false) até um admin liberar no painel.
// - Aplicação existente tem nome, descrição, área, status, endereço, responsável e o Supabase
//   do bloco "monitorar" atualizados.
//   "ativo", "restrita", "ordem" e as permissões continuam sendo decididos no painel.
//
// Variáveis (GitHub Actions → Secrets):
//   NUCLEO_GH_TOKEN            token do GitHub com leitura dos repositórios (inclusive privados)
//   SUPABASE_URL               https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  chave de serviço do Supabase (só nos Secrets, nunca no código)
//   NUCLEO_DONO (opcional)     conta ou organização do GitHub; padrão: dono deste repositório
//   SIMULAR=1 (opcional)       só mostra o que faria, sem gravar

import { appendFileSync } from 'node:fs'

const GH = process.env.NUCLEO_GH_TOKEN || process.env.GITHUB_TOKEN
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SB_CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY
const DONO = process.env.NUCLEO_DONO || (process.env.GITHUB_REPOSITORY || '').split('/')[0]
const SIMULAR = process.env.SIMULAR === '1'
const STATUS = ['producao', 'piloto', 'desenvolvimento']
const CAMPOS = ['nome', 'descricao', 'area', 'status', 'url', 'responsavel']

const relatorio = []
const anotar = (linha) => { console.log(linha); relatorio.push(linha) }

function falhar(msg) {
  console.error(msg)
  process.exit(1)
}

if (!GH) falhar('Falta NUCLEO_GH_TOKEN.')
if (!DONO) falhar('Falta NUCLEO_DONO.')
if (!SIMULAR && (!SB_URL || !SB_CHAVE)) falhar('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')

async function github(caminho) {
  const r = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}${caminho}`, {
    headers: { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`GitHub ${caminho}: ${r.status} ${await r.text()}`)
  return r.json()
}

async function listarRepositorios() {
  const repos = []
  for (let pagina = 1; ; pagina++) {
    // Organização primeiro; se não for organização, repositórios da conta do token.
    let lote = await github(`/orgs/${DONO}/repos?per_page=100&page=${pagina}`)
    if (lote === null) lote = await github(`/user/repos?affiliation=owner&per_page=100&page=${pagina}`)
    if (!lote?.length) break
    repos.push(...lote.filter((r) => r.owner.login.toLowerCase() === DONO.toLowerCase() && !r.archived && !r.is_template))
    if (lote.length < 100) break
  }
  return repos
}

async function lerFicha(repo) {
  const arquivo = await github(`/repos/${repo.full_name}/contents/nucleo.json?ref=${repo.default_branch}`)
  if (!arquivo?.content) return null
  try {
    return JSON.parse(Buffer.from(arquivo.content, 'base64').toString('utf8'))
  } catch {
    return { invalido: true }
  }
}

function validar(ficha, repo) {
  const erros = []
  const slug = String(ficha.slug || repo.name).toLowerCase()
  if (!/^[a-z0-9-]+$/.test(slug)) erros.push('slug só pode ter letras minúsculas, números e hífen')
  if (!ficha.nome) erros.push('falta "nome"')
  if (ficha.status && !STATUS.includes(ficha.status)) erros.push(`status deve ser ${STATUS.join(', ')}`)
  if (ficha.url && !/^https:\/\//.test(ficha.url)) erros.push('url deve começar com https://')
  const dados = { slug }
  for (const c of CAMPOS) if (ficha[c] !== undefined && ficha[c] !== '') dados[c] = ficha[c]
  // Bloco "monitorar": Supabase da aplicação, usado pelo monitoramento (scripts/monitorar-aplicacoes.mjs)
  const m = ficha.monitorar
  const preenchido = (v) => v && !/SEU-PROJETO|\.\.\.$/.test(String(v))
  if (m && typeof m === 'object' && preenchido(m.supabase_url) && preenchido(m.supabase_chave)) {
    if (m.supabase_url && !/^https:\/\/[^/]+$/.test(String(m.supabase_url).replace(/\/$/, ''))) erros.push('monitorar.supabase_url deve ser https://<ref>.supabase.co')
    if (m.supabase_chave && chaveSecreta(m.supabase_chave)) erros.push('monitorar.supabase_chave é a chave SECRETA; use a publishable (anon). Troque a chave secreta no Supabase, ela ficou exposta no repositório')
    if (m.supabase_url) dados.supabase_url = String(m.supabase_url).replace(/\/$/, '')
    if (m.supabase_chave) dados.supabase_chave = m.supabase_chave
    if (m.tabela) dados.supabase_tabela = m.tabela
  }
  return { erros, dados }
}

// Chave service_role / secreta nunca pode ir no nucleo.json
function chaveSecreta(chave) {
  if (String(chave).startsWith('sb_secret_')) return true
  try { return JSON.parse(Buffer.from(String(chave).split('.')[1], 'base64url').toString()).role === 'service_role' } catch { return false }
}

// Avisa se o sistema não pode ser aberto dentro do portal.
async function conferirEmbutir(url) {
  try {
    const r = await fetch(url, { redirect: 'follow' })
    const xfo = (r.headers.get('x-frame-options') || '').toLowerCase()
    const csp = (r.headers.get('content-security-policy') || '').toLowerCase()
    if (xfo === 'deny' || xfo === 'sameorigin') return `bloqueia iframe (X-Frame-Options: ${xfo})`
    if (csp.includes('frame-ancestors') && !csp.includes('portalnucleointeligenciadados')) return 'bloqueia iframe (CSP frame-ancestors)'
    const html = await r.text()
    if (!html.includes('embutido.js')) return 'não carrega o embutido.js do portal'
    return null
  } catch (e) {
    return `endereço não respondeu (${e.message})`
  }
}

async function supabase(metodo, caminho, corpo) {
  const r = await fetch(`${SB_URL}/rest/v1/${caminho}`, {
    method: metodo,
    headers: {
      apikey: SB_CHAVE,
      Authorization: `Bearer ${SB_CHAVE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  if (!r.ok) throw new Error(`Supabase ${metodo} ${caminho}: ${r.status} ${await r.text()}`)
  const texto = await r.text()
  return texto ? JSON.parse(texto) : null
}

const repos = await listarRepositorios()
const existentes = SIMULAR && !SB_CHAVE ? [] : await supabase('GET', 'aplicacoes?select=slug')
const slugs = new Set(existentes.map((a) => a.slug))

anotar(`## Cadastro automático de aplicações`)
anotar(`${repos.length} repositórios lidos em ${DONO}.${SIMULAR ? ' (simulação, nada foi gravado)' : ''}`)
anotar('')

let novas = 0, atualizadas = 0, erros = 0
for (const repo of repos) {
  const ficha = await lerFicha(repo)
  if (!ficha) continue
  if (ficha.invalido) { erros++; anotar(`- ⚠️ ${repo.name}: nucleo.json inválido (não é JSON)`); continue }
  if (ficha.nome === 'Novo sistema' || ficha.slug === 'novo-sistema') { anotar(`- ${repo.name}: nucleo.json ainda não preenchido, ignorado`); continue }
  if (ficha.portal === false) { anotar(`- ${repo.name}: fora do portal ("portal": false)`); continue }
  const { erros: problemas, dados } = validar(ficha, repo)
  if (problemas.length) { erros++; anotar(`- ⚠️ ${repo.name}: ${problemas.join('; ')}`); continue }

  const aviso = dados.url ? await conferirEmbutir(dados.url) : 'sem endereço'
  const sufixo = aviso ? ` (atenção: ${aviso})` : ''
  try {
    if (slugs.has(dados.slug)) {
      if (!SIMULAR) await supabase('PATCH', `aplicacoes?slug=eq.${encodeURIComponent(dados.slug)}`, dados)
      atualizadas++
      anotar(`- ${dados.nome}: atualizada${sufixo}`)
    } else {
      if (!SIMULAR) await supabase('POST', 'aplicacoes', { ...dados, ativo: false })
      novas++
      anotar(`- 🆕 ${dados.nome}: cadastrada oculta, aguardando um admin liberar no painel${sufixo}`)
    }
  } catch (e) {
    erros++
    anotar(`- ⚠️ ${repo.name}: ${e.message}`)
  }
}

anotar('')
anotar(`Novas: ${novas} · Atualizadas: ${atualizadas} · Com problema: ${erros}`)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, relatorio.join('\n') + '\n')
if (erros) process.exitCode = 1
