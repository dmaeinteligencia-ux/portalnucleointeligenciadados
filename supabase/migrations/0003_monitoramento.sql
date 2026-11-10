-- Monitoramento das aplicações (saúde do site, do banco Supabase e do certificado HTTPS)
-- Gravado pelo GitHub Actions (scripts/monitorar-aplicacoes.mjs) 3 vezes por dia.

-- Dados do Supabase de cada aplicação, vindos do bloco "monitorar" do nucleo.json ou do painel.
-- A chave é a publishable/anon (a mesma que já vai para o navegador), nunca a service_role.
alter table public.aplicacoes add column if not exists supabase_url    text;
alter table public.aplicacoes add column if not exists supabase_chave  text;
alter table public.aplicacoes add column if not exists supabase_tabela text; -- opcional: tabela para a consulta leve

create table if not exists public.verificacoes (
  id           bigint generated always as identity primary key,
  slug         text not null,               -- slug da aplicação; 'portal' para o próprio portal
  em           timestamptz not null default now(),
  situacao     text not null check (situacao in ('ok', 'atencao', 'fora')),
  site_status  int,                          -- código HTTP; null se não respondeu
  site_ms      int,
  banco        text check (banco in ('ok', 'pausado', 'erro', 'sem')),
  banco_ms     int,
  ssl_dias     int,                          -- dias até o certificado vencer
  detalhe      text
);
create index if not exists verificacoes_slug_em on public.verificacoes (slug, em desc);

alter table public.verificacoes enable row level security;

-- Qualquer pessoa autorizada vê a saúde (luzes nos cartões); só o GitHub Actions (service_role) grava.
create policy verificacoes_ler on public.verificacoes for select to authenticated
  using (public.is_autorizado());

-- Última verificação de cada aplicação
create or replace view public.saude_atual with (security_invoker = true) as
  select distinct on (slug) * from public.verificacoes order by slug, em desc;

grant select on public.saude_atual to authenticated;
