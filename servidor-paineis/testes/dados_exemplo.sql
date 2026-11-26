-- Dados FICTÍCIOS com o mesmo formato das views do schema painel (para testes e demonstração)
drop schema if exists painel cascade;
create schema painel;
create table painel.atualizacoes (painel text, executado_em timestamp, resultado text);
insert into painel.atualizacoes values ('mag', now()::timestamp, 'OK: teste');
create table painel.mag_os as
with base as (
  select g,
         (now() - (random() * 730) * interval '1 day')::timestamp as dt_solicitacao,
         (array[1209,1019,1300,1301,1450,1500,1600,1700])[1 + (g % 8)] as cd_servico,
         (array[4,213,10,11,12])[1 + (g % 5)] as cd_sintoma,
         (g % 40) + 1 as cd_bairro,
         (array[49,1076,140,2,177,188])[1 + (g % 6)] as cd_equipe,
         random() as r
  from generate_series(1, 20000) g
)
select 1 as cd_empresa, extract(year from dt_solicitacao)::int as dt_ano, g::bigint as nr_ordem_servico,
       (g / 2)::bigint as nr_solicitacao, dt_solicitacao, date_trunc('month', dt_solicitacao)::date as mes_solicitacao,
       dt_solicitacao + interval '30 minutes' as dt_programacao,
       dt_solicitacao + interval '24 hours' as dt_prevista,
       case when r < 0.82 then dt_solicitacao + (r * 60) * interval '1 hour' end as dt_execucao,
       case when r < 0.82 then date_trunc('month', dt_solicitacao + (r * 60) * interval '1 hour')::date end as mes_execucao,
       case when r < 0.82 then round((r * 60)::numeric, 1) end as horas_ate_execucao,
       (r < 0.82 and r * 60 <= 24) as executada_no_prazo,
       case when r < 0.82 then 77 when r < 0.96 then 78 when r < 0.98 then 21 else 99 end as cd_status_os,
       ''::varchar as ds_status_os,
       case when r < 0.82 then 'Executada' when r < 0.96 then 'Reprogramada' when r < 0.98 then 'Programada' else 'Cancelada' end as situacao,
       (r < 0.82) as executada, (r >= 0.96 and r < 0.98) as em_aberto,
       cd_servico::bigint, 'SERVIÇO ' || cd_servico as ds_servico, 2 as tp_equipe,
       cd_sintoma, 'SINTOMA ' || cd_sintoma as ds_sintoma,
       case when r >= 0.82 and r < 0.96 then (array[1,2,3])[1 + (g % 3)] end as cd_motivo,
       case when r >= 0.82 and r < 0.96 then (array['OUTROS','PRECISA DE OUTRO TIPO DE EQUIPE','IMÓVEL FECHADO'])[1 + (g % 3)] end as ds_motivo,
       cd_equipe, false as urgente, 4::smallint as cd_origem_os, 0 as cd_distrito,
       cd_bairro, 'BAIRRO ' || cd_bairro as nm_bairro, ((cd_bairro % 3) + 1)::double precision as cd_regiao_dmae,
       1::double precision as cd_distrito_sanitario, g % 100 as cd_logradouro, 'RUA ' || (g % 100) as nm_logradouro,
       case when g % 2 = 0 then round((-18.92 + (random() - .5) * .12)::numeric, 3) end as latitude,
       case when g % 2 = 0 then round((-48.28 + (random() - .5) * .14)::numeric, 3) end as longitude
from base;

-- Posição estimada (fictícia): a coordenada da OS ou, sem ela, a mediana da rua
create table painel.mag_posicao as
with rua as (
  select cd_distrito, cd_logradouro,
         round(percentile_cont(0.5) within group (order by latitude)::numeric, 3) as lat,
         round(percentile_cont(0.5) within group (order by longitude)::numeric, 3) as lon
  from painel.mag_os where latitude is not null group by 1, 2
)
select o.cd_empresa, o.dt_ano, o.nr_ordem_servico,
       coalesce(o.latitude, r.lat) as lat, coalesce(o.longitude, r.lon) as lon,
       case when o.latitude is not null then 'coordenada' when r.lat is not null then 'rua' end as origem
from painel.mag_os o left join rua r using (cd_distrito, cd_logradouro);
