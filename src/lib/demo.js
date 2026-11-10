// Dados de exemplo usados enquanto o Supabase não está configurado.
export const demo = {
  autorizados: [
    { email: 'euthiagosilveira@gmail.com', nome: 'Thiago Silveira', papel: 'admin' },
    { email: 'nativowesley@gmail.com', nome: 'Wesley Nativo', papel: 'admin' },
    { email: 'servidor@dmae.exemplo', nome: 'Servidor de exemplo', papel: 'usuario' },
  ],
  aplicacoes: [
    {
      id: 'a1', slug: 'ouvidoria', nome: 'Ouvidoria', area: 'Atendimento', status: 'producao',
      descricao: 'Registro e acompanhamento das manifestações recebidas pela Ouvidoria do DMAE.',
      url: 'https://exemplo.com/ouvidoria', responsavel: 'Núcleo de Inteligência de Dados',
      restrita: false, ativo: true, ordem: 10,
    },
    {
      id: 'a2', slug: 'agenda-lavagem', nome: 'Agenda de lavagem', area: 'Operação', status: 'producao',
      descricao: 'Agendamento e controle das lavagens.',
      url: 'https://exemplo.com/agenda-lavagem', responsavel: 'Núcleo de Inteligência de Dados',
      restrita: false, ativo: true, ordem: 20,
    },
    {
      id: 'a3', slug: 'painel-indicadores', nome: 'Indicadores operacionais', area: 'Gestão', status: 'producao',
      tipo: 'painel', plataforma: 'powerbi',
      descricao: 'Painel do Power BI com os principais indicadores do DMAE.',
      url: 'https://app.powerbi.com/reportEmbed?reportId=00000000-0000-0000-0000-000000000000&autoAuth=true',
      responsavel: 'Núcleo de Inteligência de Dados', restrita: false, ativo: true, ordem: 30,
    },
  ],
  avisos: [
    { id: 'v1', titulo: 'Bem-vindo ao portal', texto: 'Todas as aplicações do Núcleo agora ficam reunidas aqui.', ativo: true, publicado_em: '2026-11-06T12:00:00Z' },
  ],
  acessos: [
    { id: 1, email: 'servidor@dmae.exemplo', aplicacao_id: 'a1', em: '2026-11-06T13:10:00Z' },
    { id: 2, email: 'nativowesley@gmail.com', aplicacao_id: 'a2', em: '2026-11-06T14:02:00Z' },
  ],
  verificacoes: gerarVerificacoes(),
}

// 30 dias de verificações de exemplo (3 por dia), mais recentes primeiro.
function gerarVerificacoes() {
  const lista = []
  const agora = Date.now()
  for (let i = 0; i < 90; i++) {
    const em = new Date(agora - i * 8 * 3600000).toISOString()
    lista.push({ slug: 'portal', em, situacao: 'ok', site_status: 200, site_ms: 180 + (i % 7) * 20, banco: 'ok', banco_ms: 90 + (i % 5) * 10, ssl_dias: 70, detalhe: null })
    lista.push({ slug: 'ouvidoria', em, situacao: i === 40 ? 'fora' : 'ok', site_status: i === 40 ? 502 : 200, site_ms: 420 + (i % 4) * 60, banco: 'ok', banco_ms: 140, ssl_dias: 55, detalhe: i === 40 ? 'site com erro 502' : null })
    const pausado = i >= 20 && i < 23
    lista.push({ slug: 'agenda-lavagem', em, situacao: pausado ? 'fora' : i < 3 ? 'atencao' : 'ok', site_status: 200, site_ms: 650 + (i % 6) * 40, banco: pausado ? 'pausado' : 'ok', banco_ms: pausado ? null : 160, ssl_dias: 12 + Math.floor(i / 3), detalhe: pausado ? 'banco Supabase PAUSADO' : i < 3 ? 'certificado HTTPS vence em 12 dias' : null })
  }
  return lista
}
