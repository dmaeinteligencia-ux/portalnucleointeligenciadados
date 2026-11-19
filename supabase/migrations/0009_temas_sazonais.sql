-- Temas sazonais do portal (Natal e os próximos): ajustes gerais do portal em chave/valor.
-- chave 'tema', valor: { "modo": "auto" }     -> liga cada tema no seu período (Natal: 1º/12 a 6/1)
--                      { "modo": "natal" }    -> deixa o tema de Natal ligado agora, fora do período
--                      { "modo": "nenhum" }   -> nenhum tema sazonal
-- Sem a linha (ou sem a tabela), o portal usa "auto".
-- Todos os autorizados leem; só administradores mudam. Pode ser reaplicada sem problema.
create table if not exists public.configuracoes (
  chave         text primary key,
  valor         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

alter table public.configuracoes enable row level security;

drop policy if exists configuracoes_ler on public.configuracoes;
create policy configuracoes_ler on public.configuracoes for select to authenticated
  using (public.is_autorizado());

drop policy if exists configuracoes_admin on public.configuracoes;
create policy configuracoes_admin on public.configuracoes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.configuracoes to authenticated;

insert into public.configuracoes (chave, valor) values ('tema', '{"modo": "auto"}')
on conflict (chave) do nothing;
