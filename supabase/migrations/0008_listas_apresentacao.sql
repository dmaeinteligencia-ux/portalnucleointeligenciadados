-- Listas de apresentação: conjuntos nomeados de painéis e sistemas para a TV, montados pelos administradores.
-- itens: [{ "id": "<aplicacoes.id>", "tempo": 20, "fora": false, "paginas": "todas" | "primeira", "paginas_fora": ["ReportSection…"] }, …]
--        na ordem em que passam na TV. Os ajustes valem só dentro da lista.
-- tempo: tempo padrão de cada tela da lista (segundos); vazio usa o padrão da TV.
-- Todos os autorizados (inclusive a conta da TV) leem; só administradores criam, mudam e excluem.
-- Pode ser reaplicada sem problema.
create table if not exists public.listas_apresentacao (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  tempo      int check (tempo is null or tempo between 5 and 600),
  itens      jsonb not null default '[]'::jsonb,
  ordem      int not null default 100,
  criado_em  timestamptz not null default now()
);

alter table public.listas_apresentacao enable row level security;

drop policy if exists listas_apresentacao_ler on public.listas_apresentacao;
create policy listas_apresentacao_ler on public.listas_apresentacao for select to authenticated
  using (public.is_autorizado());

drop policy if exists listas_apresentacao_admin on public.listas_apresentacao;
create policy listas_apresentacao_admin on public.listas_apresentacao for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.listas_apresentacao to authenticated;
