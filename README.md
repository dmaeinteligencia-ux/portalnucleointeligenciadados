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
