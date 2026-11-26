// Painéis próprios do portal (feitos em código, sem ferramenta de BI).
// Entram no catálogo junto com os cadastrados no Supabase, mas não são editáveis na Administração:
// a página, as consultas e o acesso ficam no código (src/views/paineis/ e servidor-paineis/).
export const PAINEIS_PROPRIOS = [
  {
    id: 'proprio-manutencao-agua',
    slug: 'manutencao-agua',
    nome: 'Solicitações e Execuções de Serviços - Manutenção de Água',
    descricao: 'Pedidos, execução, prazos, equipes e locais das OS de manutenção de redes de água (dados do SIMA, atualizados a cada hora). Abre só na rede do DMAE ou pela VPN.',
    area: 'Manutenção de Água',
    status: 'producao',
    tipo: 'painel',
    plataforma: 'proprio',
    url: '/paineis/manutencao-agua',
    responsavel: 'Núcleo de Inteligência de Dados',
    restrita: false,
    ativo: true,
    ordem: 5,
    interno: true,
  },
]
