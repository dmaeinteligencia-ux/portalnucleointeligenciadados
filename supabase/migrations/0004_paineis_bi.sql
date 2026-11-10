-- Painéis de BI (Power BI) no catálogo do portal.
-- Um painel é uma aplicação com tipo = 'painel'; o campo url guarda o link de inserção
-- ("Inserir relatório > Site ou portal" no Power BI), que pede login Microsoft dentro do quadro.
alter table public.aplicacoes add column if not exists tipo text not null default 'sistema';
alter table public.aplicacoes add column if not exists plataforma text; -- powerbi, looker, metabase, outro

do $$ begin
  alter table public.aplicacoes add constraint aplicacoes_tipo_check check (tipo in ('sistema', 'painel'));
exception when duplicate_object then null; end $$;
