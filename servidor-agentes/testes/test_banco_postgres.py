"""Testa o acesso real ao PostgreSQL. Roda só se TESTE_BANCO_URL estiver definido
(use um banco de teste: o teste cria e apaga o esquema 'teste_agentes')."""

import json
import os

import pytest

from agentes.banco import Banco, SQLRecusado

URL = os.environ.get("TESTE_BANCO_URL")
pytestmark = pytest.mark.skipif(not URL, reason="defina TESTE_BANCO_URL para testar com um PostgreSQL de verdade")


@pytest.fixture(scope="module")
def banco():
    import psycopg

    with psycopg.connect(URL, autocommit=True) as con:
        con.execute("drop schema if exists teste_agentes cascade")
        con.execute("create schema teste_agentes")
        con.execute("create table teste_agentes.ligacoes (id int, situacao text, valor numeric(10,2))")
        con.execute("comment on table teste_agentes.ligacoes is 'Ligações de água'")
        con.execute(
            "insert into teste_agentes.ligacoes "
            "select g, case when g % 3 = 0 then 'I' else 'A' end, g * 1.5 from generate_series(1, 500) g"
        )
        con.execute("analyze teste_agentes.ligacoes")
    yield Banco(URL, tempo_maximo_s=2, limite_linhas=100)
    with psycopg.connect(URL, autocommit=True) as con:
        con.execute("drop schema if exists teste_agentes cascade")


def test_consulta_agregada(banco):
    r = json.loads(banco.consultar("select situacao, count(*) as n from teste_agentes.ligacoes group by 1 order by 1"))
    assert r["linhas"] == [["A", 334], ["I", 166]]


def test_corta_resultado_grande(banco):
    r = json.loads(banco.consultar("select * from teste_agentes.ligacoes"))
    assert r["total_linhas_mostradas"] == 100 and "aviso" in r


def test_transacao_e_somente_leitura(banco):
    # Mesmo pulando a validação de texto, o próprio banco recusa escrita
    import psycopg

    with pytest.raises(psycopg.errors.ReadOnlySqlTransaction):
        banco._executar("insert into teste_agentes.ligacoes values (1, 'A', 1)")


def test_tempo_maximo(banco):
    import psycopg

    with pytest.raises(psycopg.errors.QueryCanceled):
        banco._executar("select count(*) from generate_series(1, 2000000000)")


def test_recusa_escrita(banco):
    with pytest.raises(SQLRecusado):
        banco.consultar("update teste_agentes.ligacoes set valor = 0")


def test_listar_e_descrever(banco):
    tabelas = json.loads(banco.listar_tabelas(["teste_agentes"]))
    assert tabelas[0]["table_name"] == "ligacoes"
    assert tabelas[0]["descricao"] == "Ligações de água"
    d = json.loads(banco.descrever_tabela("teste_agentes.ligacoes"))
    assert [c["coluna"] for c in d["colunas"]] == ["id", "situacao", "valor"]
    assert d["linhas_estimadas"] == 500
