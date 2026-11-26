"""Acesso ao PostgreSQL, sempre em modo somente leitura.

Três camadas de proteção:
1. O usuário do banco deve ter só permissão de leitura (ver README).
2. Toda transação abre como READ ONLY e com tempo máximo de execução.
3. O texto do SQL é conferido: um único comando, começando por SELECT, WITH,
   TABLE ou EXPLAIN (sem ANALYZE).
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any

_INICIO_PERMITIDO = re.compile(r"^\s*(select|with|table|explain)\b", re.IGNORECASE)
_PROIBIDAS = re.compile(
    r"\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|copy|call|do|"
    r"vacuum|analyze|refresh|reindex|cluster|lock|listen|notify|set|reset|"
    r"pg_terminate_backend|pg_cancel_backend|pg_read_file|pg_sleep|lo_import|lo_export|dblink)\b",
    re.IGNORECASE,
)


class SQLRecusado(ValueError):
    pass


def _sem_textos_e_comentarios(sql: str) -> str:
    sql = re.sub(r"--[^\n]*", " ", sql)
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    sql = re.sub(r"'(?:''|[^'])*'", "''", sql)
    sql = re.sub(r'"(?:""|[^"])*"', '""', sql)
    sql = re.sub(r"\$([A-Za-z_]*)\$.*?\$\1\$", "''", sql, flags=re.DOTALL)
    return sql


def validar_sql(sql: str) -> str:
    """Devolve o SQL limpo ou levanta SQLRecusado."""
    sql = sql.strip().rstrip(";").strip()
    if not sql:
        raise SQLRecusado("SQL vazio.")
    limpo = _sem_textos_e_comentarios(sql)
    if ";" in limpo:
        raise SQLRecusado("Envie um único comando por vez.")
    if not _INICIO_PERMITIDO.match(limpo):
        raise SQLRecusado("Só são permitidas consultas de leitura (SELECT, WITH, TABLE ou EXPLAIN).")
    proibida = _PROIBIDAS.search(limpo)
    if proibida:
        raise SQLRecusado(f"Comando não permitido em consultas de leitura: {proibida.group(0).upper()}")
    return sql


def _valor(v: Any) -> Any:
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, (bytes, memoryview)):
        return "<binário>"
    return v


class Banco:
    def __init__(self, url: str, tempo_maximo_s: int = 30, limite_linhas: int = 200):
        self.url = url
        self.tempo_maximo_ms = tempo_maximo_s * 1000
        self.limite_linhas = limite_linhas

    def _conectar(self):
        import psycopg

        return psycopg.connect(
            self.url,
            autocommit=False,
            options=f"-c default_transaction_read_only=on -c statement_timeout={self.tempo_maximo_ms}",
            application_name="nucleo-agentes",
        )

    def _executar(self, sql: str, params: tuple = ()) -> tuple[list[str], list[tuple], bool]:
        with self._conectar() as con:
            con.read_only = True
            with con.cursor() as cur:
                cur.execute(sql, params)
                colunas = [d.name for d in cur.description or []]
                linhas = cur.fetchmany(self.limite_linhas + 1)
            con.rollback()
        cortado = len(linhas) > self.limite_linhas
        return colunas, linhas[: self.limite_linhas], cortado

    def consultar(self, sql: str) -> str:
        sql = validar_sql(sql)
        colunas, linhas, cortado = self._executar(sql)
        resultado = {
            "colunas": colunas,
            "linhas": [[_valor(v) for v in linha] for linha in linhas],
            "total_linhas_mostradas": len(linhas),
        }
        if cortado:
            resultado["aviso"] = (
                f"Resultado cortado em {self.limite_linhas} linhas. Use agregações (GROUP BY, SUM, COUNT) ou LIMIT."
            )
        return json.dumps(resultado, ensure_ascii=False)

    def listar_tabelas(self, esquemas: list[str] | None = None) -> str:
        sql = """
            select t.table_schema, t.table_name, t.table_type,
                   obj_description(format('%%I.%%I', t.table_schema, t.table_name)::regclass) as descricao
              from information_schema.tables t
             where t.table_schema not in ('pg_catalog', 'information_schema')
               and t.table_schema not like 'pg_toast%%'
        """
        params: tuple = ()
        if esquemas:
            sql += " and t.table_schema = any(%s)"
            params = (esquemas,)
        sql += " order by 1, 2"
        colunas, linhas, _ = self._executar(sql, params)
        return json.dumps([dict(zip(colunas, l)) for l in linhas], ensure_ascii=False)

    def descrever_tabela(self, tabela: str) -> str:
        if "." in tabela:
            esquema, nome = tabela.split(".", 1)
        else:
            esquema, nome = "public", tabela
        sql = """
            select c.column_name as coluna, c.data_type as tipo, c.is_nullable as aceita_nulo,
                   col_description(format('%%I.%%I', c.table_schema, c.table_name)::regclass, c.ordinal_position) as descricao
              from information_schema.columns c
             where c.table_schema = %s and c.table_name = %s
             order by c.ordinal_position
        """
        colunas, linhas, _ = self._executar(sql, (esquema, nome))
        if not linhas:
            return json.dumps({"erro": f"Tabela {esquema}.{nome} não encontrada ou sem permissão."}, ensure_ascii=False)
        estimativa = self._executar(
            "select reltuples::bigint from pg_class where oid = format('%%I.%%I', %s::text, %s::text)::regclass",
            (esquema, nome),
        )[1]
        return json.dumps(
            {
                "tabela": f"{esquema}.{nome}",
                "linhas_estimadas": estimativa[0][0] if estimativa else None,
                "colunas": [dict(zip(colunas, l)) for l in linhas],
            },
            ensure_ascii=False,
        )
