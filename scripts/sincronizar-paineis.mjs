// Cadastro automático dos painéis do Power BI no portal.
//
// Lê todos os relatórios dos workspaces em que o aplicativo "Portal Núcleo - Monitor Power BI"
// foi adicionado (como Colaborador) e cadastra cada relatório novo como painel VISÍVEL na tabela
// "aplicacoes", já com o link de inserção segura. Ele entra direto no monitoramento
// (sem fase de liberação). Um admin pode ocultar pelo painel se não quiser exibir.
// Painéis já cadastrados (mesmo reportId) não são alterados: nome, área e descrição ficam
// como o admin deixou (inclusive o status "desativado", que nunca é revertido aqui). Relatórios automáticos de "métricas de uso" são ignorados.
//
// Variáveis (GitHub Actions → Secrets):
//   PBI_TENANT_ID, PBI_CLIENT_ID, PBI_CLIENT_SECRET  aplicativo do Entra ID
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY          Supabase do portal
//   SIMULAR=1 (opcional)                             só mostra o que faria, sem gravar

import { appendFileSync } from 'node:fs'

const PBI = { tenant: process.env.PBI_TENANT_ID, cliente: process.env.PBI_CLIENT_ID, segredo: process.env.PBI_CLIENT_SECRET }
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SB_CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY
const SIMULAR = process.env.SIMULAR === '1'
const IGNORAR = /usage metrics|métricas de uso/i

const relatorio = []
const anotar = (linha) => { console.log(linha); relatorio.push(linha) }
const fim = () => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, relatorio.join('\n') + '\n') }

anotar(`## Cadastro automático de painéis do Power BI${SIMULAR ? ' (simulação, nada foi gravado)' : ''}`)
if (!PBI.tenant || !PBI.cliente || !PBI.segredo) { anotar('Sem os segredos PBI_*: nada a fazer.'); fim(); process.exit(0) }
if (!SB_URL || !SB_CHAVE) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1) }

async function supabase(metodo, caminho, corpo) {
  const r = await fetch(`${SB_URL}/rest/v1/${caminho}`, {
    method: metodo,
    headers: { apikey: SB_CHAVE, Authorization: `Bearer ${SB_CHAVE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  if (!r.ok) throw new Error(`Supabase ${metodo} ${caminho}: ${r.status} ${await r.text()}`)
  const texto = await r.text()
  return texto ? JSON.parse(texto) : null
}

async function token() {
  const r = await fetch(`https://login.microsoftonline.com/${PBI.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: PBI.cliente, client_secret: PBI.segredo, scope: 'https://analysis.windows.net/powerbi/api/.default' }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`login no Entra ID falhou: ${j.error_description?.split('\r\n')[0] || j.error || r.status}`)
  return j.access_token
}

const tk = await token()
async function powerbi(caminho) {
  const r = await fetch(`https://api.powerbi.com/v1.0/myorg${caminho}`, { headers: { Authorization: `Bearer ${tk}` } })
  if (!r.ok) throw new Error(`API do Power BI ${caminho}: ${r.status}`)
  return r.json()
}

// reportId de um link do Power BI (de inserção ou normal)
function idRelatorio(url) {
  try {
    const u = new URL(url)
    return (u.searchParams.get('reportId') || u.pathname.match(/\/reports\/([0-9a-f-]{36})/i)?.[1] || '').toLowerCase() || null
  } catch { return null }
}
const gerarSlug = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'painel'

const existentes = await supabase('GET', 'aplicacoes?select=slug,url')
const slugs = new Set(existentes.map((a) => a.slug))
const jaCadastrados = new Set(existentes.map((a) => idRelatorio(a.url)).filter(Boolean))

const grupos = (await powerbi('/groups?$top=500')).value
anotar(`Workspaces que o aplicativo enxerga: ${grupos.map((g) => g.name).join(', ') || 'nenhum'}`)
anotar('')

let novos = 0, ignorados = 0
for (const g of grupos) {
  for (const rel of (await powerbi(`/groups/${g.id}/reports`)).value) {
    const id = rel.id.toLowerCase()
    if (IGNORAR.test(rel.name)) { ignorados++; continue }
    if (jaCadastrados.has(id)) continue
    let slug = gerarSlug(rel.name), n = 2
    while (slugs.has(slug)) slug = `${gerarSlug(rel.name)}-${n++}`
    slugs.add(slug); jaCadastrados.add(id)
    const p = new URLSearchParams({ reportId: rel.id, groupId: g.id, autoAuth: 'true', ctid: PBI.tenant })
    const dados = {
      slug, nome: rel.name, tipo: 'painel', plataforma: 'powerbi', status: 'producao',
      area: g.name, descricao: `Painel do Power BI do workspace ${g.name}.`,
      url: `https://app.powerbi.com/reportEmbed?${p}`, ativo: true,
    }
    if (!SIMULAR) await supabase('POST', 'aplicacoes', dados)
    novos++
    anotar(`- 🆕 ${rel.name} (${g.name}): cadastrado e já visível no portal e no monitoramento`)
  }
}
anotar('')
anotar(`Novos: ${novos}${ignorados ? ` · Ignorados (métricas de uso): ${ignorados}` : ''}`)
fim()
