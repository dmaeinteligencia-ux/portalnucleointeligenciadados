import pytest

from agentes.banco import SQLRecusado, validar_sql


@pytest.mark.parametrize("sql", [
    "select 1",
    "  SELECT count(*) FROM comercial.ligacoes;  ",
    "with t as (select 1 as x) select * from t",
    "select 'update; drop table x' as texto",
    'select "delete" from t',
    "explain select * from t",
    "table comercial.ligacoes",
])
def test_aceita_leitura(sql):
    assert validar_sql(sql)


@pytest.mark.parametrize("sql", [
    "",
    "delete from t",
    "update t set a = 1",
    "select 1; drop table t",
    "with x as (delete from t returning *) select * from x",
    "create table t (a int)",
    "select pg_sleep(100)",
    "select pg_terminate_backend(1)",
    "explain analyze delete from t",
    "set role postgres",
    "copy t to '/tmp/x'",
    "/* */ insert into t values (1)",
])
def test_recusa_escrita_e_perigos(sql):
    with pytest.raises(SQLRecusado):
        validar_sql(sql)
