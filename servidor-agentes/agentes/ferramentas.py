"""Ferramentas que os agentes de setor usam para ler o banco."""

from __future__ import annotations

from .agente import FerramentaAgente
from .banco import Banco
from .modelos import Ferramenta


def ferramentas_de_banco(banco: Banco, esquemas: list[str] | None) -> list[FerramentaAgente]:
    def listar(args: dict) -> str:
        pedidos = args.get("esquemas") or esquemas
        if esquemas and pedidos:
            pedidos = [e for e in pedidos if e in esquemas] or esquemas
        return banco.listar_tabelas(pedidos)

    def descrever(args: dict) -> str:
        tabela = str(args.get("tabela", ""))
        esquema = tabela.split(".", 1)[0] if "." in tabela else "public"
        if esquemas and esquema not in esquemas:
            return f'{{"erro": "O esquema {esquema} não faz parte deste setor."}}'
        return banco.descrever_tabela(tabela)

    def consultar(args: dict) -> str:
        return banco.consultar(str(args.get("sql", "")))

    return [
        FerramentaAgente(
            Ferramenta(
                "listar_tabelas",
                "Lista as tabelas e views disponíveis (esquema, nome, tipo e descrição). Use primeiro para se orientar.",
                {
                    "type": "object",
                    "properties": {
                        "esquemas": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Opcional: limitar a estes esquemas.",
                        }
                    },
                    "required": [],
                },
            ),
            listar,
        ),
        FerramentaAgente(
            Ferramenta(
                "descrever_tabela",
                "Mostra as colunas, tipos e descrições de uma tabela ou view, e quantas linhas ela tem (estimativa).",
                {
                    "type": "object",
                    "properties": {"tabela": {"type": "string", "description": "Nome no formato esquema.tabela"}},
                    "required": ["tabela"],
                },
            ),
            descrever,
        ),
        FerramentaAgente(
            Ferramenta(
                "consultar_sql",
                "Executa UMA consulta de leitura no PostgreSQL (SELECT/WITH) e devolve até o limite de linhas em JSON. "
                "Prefira agregar no banco (GROUP BY, SUM, COUNT) em vez de trazer muitas linhas.",
                {
                    "type": "object",
                    "properties": {"sql": {"type": "string", "description": "Consulta SQL de leitura"}},
                    "required": ["sql"],
                },
            ),
            consultar,
        ),
    ]
