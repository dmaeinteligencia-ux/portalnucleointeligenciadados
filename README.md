# Portal do Núcleo de Inteligência de Dados (DMAE)

Porta de entrada única para as aplicações do Núcleo de Inteligência de Dados do DMAE.

## O que tem

- **Entrar**: login por link enviado ao e-mail. Só entra quem foi autorizado no painel.
- **Início**: aplicações liberadas para a pessoa e avisos do Núcleo.
- **Aplicações**: catálogo com busca e filtro por área e status.
- **Detalhe**: descrição, responsável e botão para abrir a aplicação (cada acesso fica registrado).
- **Administração** (só administradores): aplicações, usuários autorizados, avisos e acessos.

## Rodar localmente

```bash
npm install
npm run dev
```

Sem as variáveis do Supabase o portal abre em **modo demonstração**, com dados de exemplo.
Para usar dados reais, copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

## Banco de dados (Supabase)

Rode `supabase/migrations/0001_portal_inicial.sql` no projeto Supabase do portal. Ela cria as tabelas,
as regras de acesso (RLS), bloqueia contas de e-mails não autorizados e cadastra os primeiros administradores
e as aplicações Ouvidoria e Agenda de lavagem.

No painel do Supabase, em Authentication → URL Configuration, coloque o endereço do portal na Vercel como Site URL.

## Publicar na Vercel

Importe este repositório na Vercel (framework Vite), adicione as duas variáveis de ambiente e publique.
O `vercel.json` já faz as rotas do Vue funcionarem ao recarregar a página.

## Novos sistemas e cadastro automático

- `public/embutido.js`: script que cada sistema carrega para avisar o portal se o login funciona dentro dele.
- `modelos/`: modelos Vue/Vite e Nuxt para novos sistemas. Veja [modelos/README.md](modelos/README.md).
- `.github/workflows/sincronizar-aplicacoes.yml`: todo dia às 7h (ou pelo botão *Run workflow*) lê o `nucleo.json`
  de cada repositório da conta no GitHub e cadastra ou atualiza a aplicação no portal. Aplicação nova entra oculta.

Secrets necessários no repositório do portal (Settings → Secrets and variables → Actions):

| Nome | Valor |
| --- | --- |
| `NUCLEO_GH_TOKEN` | token do GitHub (fine-grained) com leitura de *Contents* e *Metadata* em todos os repositórios da conta |
| `SUPABASE_URL` | `https://tfbqiytwwmbicjeyjrmm.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave de serviço do Supabase do portal. Só aqui, nunca no código nem em variável `VITE_` |

## Monitoramento das aplicações

`.github/workflows/monitorar-aplicacoes.yml` roda às 7h, 12h e 17h (ou pelo botão *Run workflow*) e, para o portal
e cada aplicação cadastrada, confere:

- **site**: se o endereço responde, com qual código e em quanto tempo;
- **banco Supabase**: chama a função `ping()` do banco da aplicação (ou faz uma consulta leve na tabela indicada).
  Além de mostrar se o banco está no ar, isso mantém o banco em uso e evita que o plano grátis pause depois de 7 dias parado;
- **certificado HTTPS**: avisa quando faltam menos de 15 dias para vencer.

O resultado fica na tabela `verificacoes` (90 dias de histórico) e aparece como luz verde, amarela ou vermelha nos cartões,
na pílula "Status do sistema" e na tela **Saúde** (admins). Pelo assistente de voz: "Sane, como estão os sistemas?".
Quando algo dá errado, o monitoramento abre uma issue com a etiqueta `monitoramento` (o GitHub avisa por e-mail quem acompanha
o repositório) e fecha a issue sozinho quando volta ao normal.

Para monitorar o banco de uma aplicação, preencha o bloco `monitorar` do `nucleo.json` (veja [modelos/README.md](modelos/README.md))
ou os campos de Supabase em Administração → Aplicações, e rode uma vez `supabase/ping.sql` (está nos modelos) no SQL Editor
do Supabase da aplicação. Usa os mesmos secrets `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do cadastro automático.
O servidor interno (172.22.1.200) fica fora: o GitHub não alcança a rede do DMAE.
