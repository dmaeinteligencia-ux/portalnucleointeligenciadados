-- Status "desativado": para painéis (ou sistemas) que não estão em uso no momento.
-- Continua no catálogo (seção recolhida "Desativados"), mas sai do monitoramento e dos alertas.
-- A automação de cadastro de painéis não o reativa, porque reconhece o relatório pelo reportId.
-- Pode ser reaplicada sem problema.
alter table public.aplicacoes drop constraint if exists aplicacoes_status_check;
alter table public.aplicacoes add constraint aplicacoes_status_check
  check (status in ('producao', 'piloto', 'desenvolvimento', 'desativado'));

-- A última verificação de um item desativado deixa de valer (não acende luz nem muda o status geral).
create or replace view public.saude_atual with (security_invoker = true) as
  select distinct on (v.slug) v.*
  from public.verificacoes v
  where not exists (select 1 from public.aplicacoes a where a.slug = v.slug and a.status = 'desativado')
  order by v.slug, v.em desc;

grant select on public.saude_atual to authenticated;
