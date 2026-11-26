"""Consultas do painel "Solicitações e Execuções de Serviços - Manutenção de Água".

Tudo lê só as views do schema `painel` no banco ODS do srvbi (usuário painel_leitura).
Os filtros viram parâmetros (%(nome)s): nada do navegador entra direto no SQL.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class Filtros:
    inicio: date
    fim: date
    servico: int | None = None
    sintoma: int | None = None
    bairro: int | None = None
    regiao: int | None = None
    equipe: int | None = None

    def chave(self) -> tuple:
        return (self.inicio, self.fim, self.servico, self.sintoma, self.bairro, self.regiao, self.equipe)

    def params(self) -> dict:
        return {
            "inicio": self.inicio,
            "fim_excl": self.fim + timedelta(days=1),
            "servico": self.servico,
            "sintoma": self.sintoma,
            "bairro": self.bairro,
            "regiao": self.regiao,
            "equipe": self.equipe,
        }


# Filtros que não são de período (valem também para "em aberto agora")
_RECORTE = """
    (%(servico)s::bigint is null or cd_servico = %(servico)s)
    and (%(sintoma)s::int is null or cd_sintoma = %(sintoma)s)
    and (%(bairro)s::int is null or cd_bairro = %(bairro)s)
    and (%(regiao)s::int is null or cd_regiao_dmae = %(regiao)s)
    and (%(equipe)s::int is null or cd_equipe = %(equipe)s)
"""
_PERIODO_SOLIC = "dt_solicitacao >= %(inicio)s and dt_solicitacao < %(fim_excl)s"
_PERIODO_EXEC = "dt_execucao >= %(inicio)s and dt_execucao < %(fim_excl)s"
_ONDE = f"where {_PERIODO_SOLIC} and {_RECORTE}"

# Prazo só conta quando há prazo real (prevista depois da abertura) e execução válida
_COM_PRAZO = "executada and dt_execucao is not null and dt_prevista > dt_solicitacao"

SQL_INDICADORES = f"""
select
  count(distinct (dt_ano, nr_solicitacao))                                   as solicitacoes,
  count(*)                                                                    as os_abertas,
  count(*) filter (where executada)                                           as executadas,
  count(*) filter (where situacao = 'Reprogramada')                           as reprogramadas,
  count(*) filter (where situacao in ('Cancelada', 'Duplicidade'))            as canceladas,
  count(*) filter (where {_COM_PRAZO})                                        as com_prazo,
  count(*) filter (where {_COM_PRAZO} and dt_execucao <= dt_prevista)         as no_prazo,
  percentile_cont(0.5) within group (order by horas_ate_execucao)
    filter (where executada and horas_ate_execucao is not null)               as mediana_horas,
  percentile_cont(0.9) within group (order by horas_ate_execucao)
    filter (where executada and horas_ate_execucao is not null)               as p90_horas
from painel.mag_os
{_ONDE}
"""

SQL_EXECUTADAS_NO_PERIODO = f"""
select count(*) as executadas_no_periodo
from painel.mag_os
where executada and {_PERIODO_EXEC} and {_RECORTE}
"""

SQL_EM_ABERTO_AGORA = f"""
select count(*) as em_aberto_agora,
       count(*) filter (where dt_solicitacao < now() - interval '48 hours') as em_aberto_48h
from painel.mag_os
where em_aberto and {_RECORTE}
"""

SQL_MENSAL = f"""
with abertas as (
  select mes_solicitacao as mes,
         count(*) as os_abertas,
         count(distinct (dt_ano, nr_solicitacao)) as solicitacoes,
         count(*) filter (where situacao = 'Reprogramada') as reprogramadas,
         percentile_cont(0.5) within group (order by horas_ate_execucao)
           filter (where executada and horas_ate_execucao is not null) as mediana_horas
  from painel.mag_os {_ONDE}
  group by 1
), executadas as (
  select mes_execucao as mes, count(*) as executadas_no_mes
  from painel.mag_os
  where executada and {_PERIODO_EXEC} and {_RECORTE}
  group by 1
)
select coalesce(a.mes, e.mes) as mes,
       coalesce(a.solicitacoes, 0) as solicitacoes,
       coalesce(a.os_abertas, 0) as os_abertas,
       coalesce(e.executadas_no_mes, 0) as executadas_no_mes,
       coalesce(a.reprogramadas, 0) as reprogramadas,
       a.mediana_horas
from abertas a full join executadas e on e.mes = a.mes
order by 1
"""


# Alguns bairros aparecem com dois nomes no SIMA para o mesmo código (ex.: os distritos 200-203,
# "TAPUIRAMA (DISTRITO)" e "DISTRITO TAPUIRAMA"). O código é o mesmo lugar, então agrupamos só
# pelo código e usamos o nome mais comum entre as OS com coordenada (ou, sem nenhuma, o mais comum).
NOME_BAIRRO = (
    "coalesce(mode() within group (order by nm_bairro) filter (where latitude is not null), "
    "mode() within group (order by nm_bairro))"
)


def _ranking(codigo: str, nome: str, limite: int, extra_where: str = "") -> str:
    """Ranking agrupado só pelo código; `nome` é uma expressão agregada (um nome por código)."""
    return f"""
select {codigo} as codigo, {nome} as nome, count(*) as total,
       count(*) filter (where executada) as executadas,
       count(*) filter (where situacao = 'Reprogramada') as reprogramadas,
       percentile_cont(0.5) within group (order by horas_ate_execucao)
         filter (where executada and horas_ate_execucao is not null) as mediana_horas
from painel.mag_os
{_ONDE} {extra_where}
group by 1
order by total desc, 2
limit {int(limite)}
"""


SQL_SERVICOS = _ranking("cd_servico", "min(ds_servico)", 12)
SQL_SINTOMAS = _ranking("cd_sintoma", "min(ds_sintoma)", 12, "and cd_sintoma is not null")
SQL_BAIRROS = _ranking("cd_bairro", NOME_BAIRRO, 15, "and cd_bairro is not null")
SQL_EQUIPES = _ranking("cd_equipe", "'Equipe ' || cd_equipe", 15, "and cd_equipe is not null")
SQL_REGIOES = _ranking("cd_regiao_dmae::int", "coalesce('Região ' || cd_regiao_dmae::int, 'Sem região')", 10)

SQL_MOTIVOS = f"""
select cd_motivo as codigo, ds_motivo as nome, count(*) as total
from painel.mag_os
{_ONDE} and situacao = 'Reprogramada' and cd_motivo is not null and cd_motivo <> 0
group by 1, 2 order by total desc, 2 limit 10
"""

SQL_SITUACAO = f"""
select situacao as nome, count(*) as total
from painel.mag_os {_ONDE}
group by 1 order by total desc
"""

# Quando os pedidos chegam: dia da semana (1 = segunda) × hora do dia
SQL_SEMANA_HORA = f"""
select extract(isodow from dt_solicitacao)::int as dia, extract(hour from dt_solicitacao)::int as hora, count(*) as total
from painel.mag_os {_ONDE}
group by 1, 2 order by 1, 2
"""

# Quanto tempo as OS executadas levaram, em faixas
SQL_FAIXAS_TEMPO = f"""
select faixa, count(*) as total
from (
  select case
    when horas_ate_execucao < 4 then 1 when horas_ate_execucao < 12 then 2
    when horas_ate_execucao < 24 then 3 when horas_ate_execucao < 48 then 4
    when horas_ate_execucao < 120 then 5 when horas_ate_execucao < 240 then 6 else 7 end as faixa
  from painel.mag_os
  {_ONDE} and executada and horas_ate_execucao is not null
) t
group by 1 order by 1
"""

# Tendência por região DMAE (pequenos múltiplos)
SQL_REGIOES_MENSAL = f"""
select cd_regiao_dmae::int as regiao, mes_solicitacao as mes, count(*) as total
from painel.mag_os {_ONDE} and cd_regiao_dmae >= 1
group by 1, 2 order by 1, 2
"""

# Idade das OS em aberto agora (não depende do período, só do recorte)
SQL_IDADE_ABERTAS = f"""
select case
    when dt_solicitacao >= now() - interval '1 day' then 1
    when dt_solicitacao >= now() - interval '3 days' then 2
    when dt_solicitacao >= now() - interval '7 days' then 3
    when dt_solicitacao >= now() - interval '30 days' then 4 else 5 end as faixa,
  count(*) as total
from painel.mag_os
where em_aberto and {_RECORTE}
group by 1 order by 1
"""

# Mapa de bolhas por bairro: a posição de cada bairro é o ponto mediano das OS com coordenada
# (todas desde 2020, para não mudar com o filtro); o tamanho é a quantidade de OS no recorte.
# Só entram coordenadas dentro do município (descarta lat/long trocadas e lixo).
SQL_BAIRROS_MAPA = f"""
with posicao as (
  select cd_bairro,
         percentile_cont(0.5) within group (order by latitude)  as lat,
         percentile_cont(0.5) within group (order by longitude) as lon
  from painel.mag_os
  where cd_bairro is not null and latitude between -19.60 and -18.40 and longitude between -48.95 and -47.60
  group by 1
  having count(*) >= 3
), contagem as (
  select cd_bairro, {NOME_BAIRRO} as nm_bairro, count(*) as total,
         count(*) filter (where executada) as executadas,
         percentile_cont(0.5) within group (order by horas_ate_execucao)
           filter (where executada and horas_ate_execucao is not null) as mediana_horas
  from painel.mag_os
  {_ONDE} and cd_bairro is not null
  group by 1
)
select c.cd_bairro as codigo, c.nm_bairro as nome, c.total, c.executadas, c.mediana_horas,
       p.lat::float as lat, p.lon::float as lon
from contagem c left join posicao p using (cd_bairro)
order by c.total desc
"""

# Pontos do mapa (zoom aproximado e mapa de calor): OS somadas numa grade de ~100 m.
# A posição vem de painel.mag_posicao: a coordenada da OS ou, sem ela, a estimada pela rua e
# pelo número do imóvel (só a posição arredondada; o número não sai do banco).
SQL_MAPA = f"""
select p.lat::float as lat, p.lon::float as lon, count(*) as total
from painel.mag_os o
join painel.mag_posicao p using (cd_empresa, dt_ano, nr_ordem_servico)
{_ONDE} and p.lat is not null
group by 1, 2
order by total desc
limit 8000
"""

# Ruas com mais OS no recorte (nome da rua e bairro, nunca o número)
SQL_RUAS = f"""
select cd_distrito, cd_logradouro, min(nm_logradouro) as nome, {NOME_BAIRRO} as bairro, count(*) as total,
       count(*) filter (where executada) as executadas
from painel.mag_os
{_ONDE} and cd_logradouro is not null
group by 1, 2
order by total desc
limit 15
"""

SQL_COBERTURA_MAPA = f"""
select count(*) filter (where o.latitude is not null) as com_coordenada,
       count(p.lat) as com_posicao, count(*) as total
from painel.mag_os o
left join painel.mag_posicao p using (cd_empresa, dt_ano, nr_ordem_servico)
{_ONDE}
"""

SQL_ATUALIZACAO = """
select executado_em, resultado
from painel.atualizacoes
order by executado_em desc
limit 1
"""

SQL_PERIODO = """
select min(dt_solicitacao)::date as inicio, max(dt_solicitacao) as ultima_solicitacao
from painel.mag_os
"""

SQL_OPCOES_SERVICOS = """
select cd_servico as codigo, ds_servico as nome, count(*) as total
from painel.mag_os where dt_solicitacao >= now() - interval '24 months'
group by 1, 2 order by 2
"""
SQL_OPCOES_SINTOMAS = """
select cd_sintoma as codigo, ds_sintoma as nome, count(*) as total
from painel.mag_os where dt_solicitacao >= now() - interval '24 months' and cd_sintoma is not null
group by 1, 2 order by 2
"""
SQL_OPCOES_BAIRROS = f"""
select cd_bairro as codigo, {NOME_BAIRRO} as nome, count(*) as total
from painel.mag_os where dt_solicitacao >= now() - interval '24 months' and cd_bairro is not null
group by 1 order by 2
"""
SQL_OPCOES_REGIOES = """
select distinct cd_regiao_dmae::int as codigo, 'Região ' || cd_regiao_dmae::int as nome
from painel.mag_os where cd_regiao_dmae >= 1 order by 1
"""
SQL_OPCOES_EQUIPES = """
select cd_equipe as codigo, 'Equipe ' || cd_equipe as nome, count(*) as total
from painel.mag_os where dt_solicitacao >= now() - interval '24 months' and cd_equipe is not null
group by 1 order by 1
"""
