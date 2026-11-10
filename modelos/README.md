# Modelos para novos sistemas do Núcleo

Dois modelos já prontos para abrir dentro do Portal do Núcleo e aparecer no catálogo sozinhos:

| Modelo | Quando usar | Sessão do login |
| --- | --- | --- |
| `vue-vite/` | sistema só no navegador (como o portal) | localStorage (supabase-js) |
| `nuxt/` | sistema com servidor/SSR (como a Agenda de Lavagem) | cookies (@nuxtjs/supabase, `SameSite=None; Secure`) |

Cada modelo já vem com:

- o **aviso para o portal** (`embutido.js`), que diz ao portal se o login funciona lá dentro;
- **login por e-mail e senha** no visual do DMAE (link mágico não funciona dentro do portal, porque abre outra aba);
- `vercel.json` sem cabeçalhos que impeçam abrir dentro do portal;
- `nucleo.json`, a **ficha da aplicação** lida pelo cadastro automático;
- a verificação **"Pronto para o portal"**, que roda em cada PR e acusa se algo disso for quebrado.

## Criar um sistema novo

1. No GitHub, abra o repositório modelo (`nucleo-modelo-vue` ou `nucleo-modelo-nuxt`) e clique em **Use this template**.
2. Preencha o `nucleo.json`:
   ```json
   {
     "nome": "Agenda de Lavagem",
     "slug": "agenda-lavagem",
     "descricao": "Agendamento das lavagens da frota.",
     "area": "Frota",
     "status": "producao",
     "url": "https://agenda-lavagem.vercel.app",
     "responsavel": "Equipe de Frota",
     "portal": true,
     "monitorar": {
       "supabase_url": "https://xxxx.supabase.co",
       "supabase_chave": "sb_publishable_...",
       "tabela": ""
     }
   }
   ```
   `status`: `producao`, `piloto` ou `desenvolvimento`. `"portal": false` deixa o sistema fora do portal.
   `monitorar` liga o monitoramento do banco: use a chave **publishable** (nunca a secreta). `tabela` é opcional,
   só para banco sem a função `ping()`.
3. No SQL Editor do Supabase do sistema, rode uma vez o `supabase/ping.sql`. O portal chama essa função 3 vezes por dia,
   o que mostra se o banco está no ar e evita que o plano grátis pause o banco.
4. Copie `.env.example` para `.env` (ou cadastre na Vercel) com a URL e a chave **publishable** do Supabase do sistema.
5. Publique na Vercel.

No dia seguinte às 7h (ou na hora, em Actions → *Cadastro automático de aplicações* → *Run workflow*, no repositório do portal),
o sistema aparece no painel do portal **oculto**. Um admin confere e marca como ativo para liberar.

## Sistema que já existe

Basta adicionar ao projeto:

1. O `nucleo.json` acima (com o bloco `monitorar`) e o `supabase/ping.sql` rodado no Supabase do sistema.
2. No `index.html` (ou no `head` do `nuxt.config.ts`):
   ```html
   <script src="https://portalnucleointeligenciadados.vercel.app/embutido.js" defer></script>
   ```
   Se a sessão fica no localStorage, acrescente `data-sessao="local"`.
3. Se o login usa cookies (Nuxt + `@nuxtjs/supabase`): `supabase.cookieOptions` com `sameSite: 'none'` e `secure: true`.

## Limite conhecido

Com cookies, o Safari e navegadores que bloqueiam cookies de terceiros não mantêm o login dentro do portal.
O portal então mostra o botão **Abrir em nova aba**. Um domínio próprio comum ao portal e aos sistemas resolve isso.
