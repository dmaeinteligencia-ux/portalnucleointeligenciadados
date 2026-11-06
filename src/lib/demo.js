// Dados de exemplo usados enquanto o Supabase não está configurado.
export const demo = {
  autorizados: [
    { email: 'euthigosilveira@gmail.com', nome: 'Thiago Silveira', papel: 'admin' },
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
  ],
  avisos: [
    { id: 'v1', titulo: 'Bem-vindo ao portal', texto: 'Todas as aplicações do Núcleo agora ficam reunidas aqui.', ativo: true, publicado_em: '2026-11-06T12:00:00Z' },
  ],
  acessos: [
    { id: 1, email: 'servidor@dmae.exemplo', aplicacao_id: 'a1', em: '2026-11-06T13:10:00Z' },
    { id: 2, email: 'nativowesley@gmail.com', aplicacao_id: 'a2', em: '2026-11-06T14:02:00Z' },
  ],
}
