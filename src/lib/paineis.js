// Painéis próprios do Núcleo (feitos em código, sem ferramenta de BI).
//
// Os dados vêm do serviço de dados (servidor-paineis/) na rede interna do DMAE. O navegador de quem
// está logado busca direto lá: os números nunca passam pela Vercel nem saem da rede.
// Por isso os painéis só abrem dentro da rede do DMAE (ou pela VPN).
import { supabase, modoDemo } from './supabase'

export const PAINEIS_URL = (import.meta.env.VITE_PAINEIS_URL || 'https://172.22.1.200/paineis').replace(/\/$/, '')

export class ErroPainel extends Error {
  constructor(mensagem, { rede = false, dicas = [] } = {}) {
    super(mensagem)
    this.rede = rede
    this.dicas = dicas
  }
}

async function token() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}

export async function buscarPainel(caminho, params = {}) {
  if (modoDemo) return demoPainel(caminho, params)
  const url = new URL(`${PAINEIS_URL}/${caminho}`)
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, v)
  let r
  try {
    r = await fetch(url, { headers: { Authorization: `Bearer ${await token()}` } })
  } catch {
    throw new ErroPainel(
      'Não foi possível falar com o servidor de dados. Isso costuma ter uma destas causas:',
      {
        rede: true,
        dicas: [
          'O computador está fora da rede do DMAE. Fora dela, os painéis só abrem pela VPN.',
          'O certificado do servidor de dados não está instalado neste computador. Peça ao Núcleo de Inteligência de Dados o instalador do certificado (leva 1 minuto e não precisa de administrador).',
          'O navegador bloqueou o acesso à rede local. Clique no cadeado ao lado do endereço do portal e permita o acesso à rede local.',
        ],
      },
    )
  }
  if (!r.ok) {
    let detalhe = ''
    try { detalhe = (await r.json()).detail } catch { /* sem corpo */ }
    throw new ErroPainel(detalhe || `O servidor de dados respondeu com erro ${r.status}.`)
  }
  return r.json()
}

// ----------------------------------------------------------------------------
// Formatação
// ----------------------------------------------------------------------------

const nf = new Intl.NumberFormat('pt-BR')
export const numero = (v) => (v === null || v === undefined ? '–' : nf.format(Math.round(v)))
export const pct = (parte, todo) => (todo ? `${(100 * parte / todo).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '–')
export function horas(h) {
  if (h === null || h === undefined) return '–'
  if (h < 48) return `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
  return `${(h / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`
}
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const mesCurto = (iso) => { const [a, m] = iso.split('-'); return `${MESES[+m - 1]}/${a.slice(2)}` }
export const dataHora = (iso) => {
  if (!iso) return '–'
  const [d, h] = iso.split('T')
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}${h ? ` às ${h.slice(0, 5)}` : ''}`
}

// ----------------------------------------------------------------------------
// Modo demonstração (portal sem Supabase): números fictícios, só para ver o layout
// ----------------------------------------------------------------------------

function aleatorio(semente) {
  let s = semente
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

function demoPainel(caminho, params) {
  const r = aleatorio(42 + Object.values(params).join('').length)
  const lista = (prefixo, n, base) => Array.from({ length: n }, (_, i) => ({
    codigo: i + 1, nome: `${prefixo} ${i + 1}`, total: Math.round(base / (i + 1.3)),
    executadas: Math.round(base / (i + 1.3) * 0.82), reprogramadas: Math.round(base / (i + 1.3) * 0.14), mediana_horas: 8 + r() * 30,
  }))
  const atualizacao = { executado_em: new Date().toISOString().slice(0, 16), resultado: 'OK (demonstração)' }
  if (caminho.endsWith('opcoes')) {
    return Promise.resolve({
      periodo: { inicio: '2020-01-02', ultima_solicitacao: atualizacao.executado_em }, atualizacao,
      servicos: lista('Serviço', 12, 1), sintomas: lista('Sintoma', 8, 1), bairros: lista('Bairro', 20, 1),
      regioes: [1, 2, 3].map((c) => ({ codigo: c, nome: `Região ${c}` })), equipes: lista('Equipe', 10, 1),
    })
  }
  const hoje = new Date()
  const mensal = Array.from({ length: 13 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 12 + i, 1)
    const abertas = Math.round(4800 + r() * 2400)
    return {
      mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, os_abertas: abertas,
      solicitacoes: Math.round(abertas * 0.72), executadas_no_mes: Math.round(abertas * (0.78 + r() * 0.08)),
      reprogramadas: Math.round(abertas * 0.14), mediana_horas: 10 + r() * 10,
    }
  })
  const soma = (k) => mensal.reduce((a, m) => a + m[k], 0)
  const os = soma('os_abertas')
  const mapa = Array.from({ length: 900 }, () => ({
    lat: -18.92 + (r() - 0.5) * 0.13 * (0.4 + r()), lon: -48.28 + (r() - 0.5) * 0.15 * (0.4 + r()), total: 1 + Math.floor(r() ** 4 * 40),
  }))
  return Promise.resolve({
    atualizacao,
    indicadores: {
      solicitacoes: soma('solicitacoes'), os_abertas: os, executadas: Math.round(os * 0.82), reprogramadas: soma('reprogramadas'),
      canceladas: Math.round(os * 0.003), com_prazo: Math.round(os * 0.7), no_prazo: Math.round(os * 0.46),
      mediana_horas: 14.5, p90_horas: 140, executadas_no_periodo: soma('executadas_no_mes'), em_aberto_agora: 612, em_aberto_48h: 97, em_aberto_anteriores: 41,
    },
    mensal,
    situacao: [{ nome: 'Executada', total: Math.round(os * 0.82) }, { nome: 'Reprogramada', total: Math.round(os * 0.14) },
      { nome: 'Programada', total: Math.round(os * 0.03) }, { nome: 'Cancelada', total: Math.round(os * 0.01) }],
    servicos: lista('Serviço', 12, 9000), sintomas: lista('Sintoma', 12, 8000),
    motivos: lista('Motivo', 6, 6000).map(({ codigo, nome, total }) => ({ codigo, nome, total })),
    bairros: lista('Bairro', 15, 3000), regioes: lista('Região', 3, 30000), equipes: lista('Equipe', 15, 6000),
    mapa, cobertura_mapa: { com_coordenada: Math.round(os * 0.53), com_posicao: Math.round(os * 0.96), total: os },
    ruas: Array.from({ length: 15 }, (_, i) => ({ cd_distrito: 0, cd_logradouro: i + 1, nome: `RUA ${i + 1}`, bairro: `BAIRRO ${(i % 9) + 1}`, total: Math.round(900 / (i + 1.4)), executadas: 0 })),
    bairros_mapa: Array.from({ length: 60 }, (_, i) => {
      const t = Math.round(3000 / (i + 1.3)), ang = r() * Math.PI * 2, dist = 0.01 + r() * 0.05
      return { codigo: i + 1, nome: `Bairro ${i + 1}`, total: t, executadas: Math.round(t * 0.82), mediana_horas: 8 + r() * 30,
        lat: i % 17 === 16 ? null : -18.918 + Math.sin(ang) * dist, lon: i % 17 === 16 ? null : -48.277 + Math.cos(ang) * dist * 1.1 }
    }),
    semana_hora: Array.from({ length: 7 * 24 }, (_, i) => {
      const dia = Math.floor(i / 24) + 1, hora = i % 24
      const curva = Math.exp(-((hora - 10) ** 2) / 18) + 0.5 * Math.exp(-((hora - 15) ** 2) / 10) + 0.04
      return { dia, hora, total: Math.round(900 * curva * (dia >= 6 ? 0.45 : 1) * (0.85 + r() * 0.3)) }
    }),
    faixas_tempo: [9, 21, 24, 18, 15, 8, 5].map((t, i) => ({ faixa: i + 1, total: Math.round((os * 0.82 * t) / 100) })),
    regioes_mensal: [1, 2, 3].flatMap((reg) => mensal.map((m) => ({ regiao: reg, mes: m.mes, total: Math.round(m.os_abertas * [0.5, 0.29, 0.21][reg - 1] * (0.9 + r() * 0.2)) }))),
    idade_abertas: [210, 180, 125, 70, 27].map((t, i) => ({ faixa: i + 1, total: t })),
  })
}
