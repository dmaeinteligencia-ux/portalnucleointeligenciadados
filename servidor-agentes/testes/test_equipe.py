"""Testa o ciclo de agentes e a delegação com um modelo falso (sem gastar API)."""

import json
from pathlib import Path

from agentes.config import Config, ConfigModelo, Setor
from agentes.equipe import Time
from agentes.modelos import ChamadaFerramenta, Resposta, Uso


class ModeloRoteirizado:
    """Devolve respostas pré-definidas, em ordem, e guarda o que recebeu."""

    def __init__(self, nome, roteiro):
        self.nome = nome
        self.roteiro = list(roteiro)
        self.recebido = []

    def conversa(self, sistema, ferramentas):
        modelo = self

        class _C:
            def usuario(self, texto):
                modelo.recebido.append(("usuario", texto))

            def resultados(self, resultados):
                modelo.recebido.append(("resultados", [(r.conteudo, r.erro) for r in resultados]))

            def responder(self):
                return modelo.roteiro.pop(0)

        return _C()


class BancoFalso:
    def __init__(self):
        self.consultas = []

    def listar_tabelas(self, esquemas=None):
        return json.dumps([{"table_schema": "comercial", "table_name": "ligacoes"}])

    def descrever_tabela(self, tabela):
        return json.dumps({"tabela": tabela, "colunas": [{"coluna": "situacao"}]})

    def consultar(self, sql):
        from agentes.banco import validar_sql

        validar_sql(sql)
        self.consultas.append(sql)
        return json.dumps({"colunas": ["total"], "linhas": [[42]]})


def _config(tmp_path: Path) -> Config:
    m = ConfigModelo("falso", "x")
    return Config(m, m, "postgresql://x", 30, 200, tmp_path / "registro.jsonl",
                  [Setor("comercial", "Comercial", "Ligações e faturamento", esquemas=["comercial"])])


def _time(tmp_path, setor, coord=None, banco=None):
    fabrica = iter([setor, coord or ModeloRoteirizado("c", [])])
    return Time(_config(tmp_path), banco=banco or BancoFalso(), fabrica_modelo=lambda c: next(fabrica))


def test_coordenador_delega_e_agente_consulta(tmp_path):
    setor = ModeloRoteirizado("falso:setor", [
        Resposta("", [ChamadaFerramenta("1", "listar_tabelas", {})], Uso(100, 10)),
        Resposta("", [ChamadaFerramenta("2", "consultar_sql", {"sql": "select count(*) from comercial.ligacoes"})], Uso(200, 20)),
        Resposta("São 42 ligações ativas.", [], Uso(300, 30)),
    ])
    coord = ModeloRoteirizado("falso:coord", [
        Resposta("", [ChamadaFerramenta("a", "delegar", {"agente": "comercial", "tarefa": "Conte as ligações ativas"})], Uso(50, 5)),
        Resposta("O Comercial informou 42 ligações ativas.", [], Uso(60, 6)),
    ])
    banco = BancoFalso()
    time_ = _time(tmp_path, setor, coord, banco)

    resposta = time_.coordenador.perguntar("Quantas ligações ativas temos?")

    assert resposta == "O Comercial informou 42 ligações ativas."
    assert banco.consultas == ["select count(*) from comercial.ligacoes"]
    assert setor.recebido[0] == ("usuario", "Conte as ligações ativas")
    linhas = [json.loads(l) for l in (tmp_path / "registro.jsonl").read_text().splitlines()]
    assert [l["agente"] for l in linhas] == ["comercial", "coordenador"]
    assert linhas[0]["tokens_entrada"] == 600
    assert linhas[0]["ferramentas"] == ["listar_tabelas", "consultar_sql"]


def test_sql_de_escrita_volta_como_erro_para_o_modelo(tmp_path):
    setor = ModeloRoteirizado("falso:setor", [
        Resposta("", [ChamadaFerramenta("1", "consultar_sql", {"sql": "delete from comercial.ligacoes"})]),
        Resposta("Não posso apagar dados.", []),
    ])
    banco = BancoFalso()
    time_ = _time(tmp_path, setor, banco=banco)

    assert time_.setores["comercial"].perguntar("apague tudo") == "Não posso apagar dados."
    conteudo, erro = setor.recebido[1][1][0]
    assert erro and "SQLRecusado" in conteudo
    assert banco.consultas == []


def test_agente_nao_descreve_tabela_de_outro_setor(tmp_path):
    setor = ModeloRoteirizado("falso:setor", [
        Resposta("", [ChamadaFerramenta("1", "descrever_tabela", {"tabela": "rh.salarios"})]),
        Resposta("Sem acesso.", []),
    ])
    time_ = _time(tmp_path, setor)
    time_.setores["comercial"].perguntar("salários?")
    assert "não faz parte deste setor" in setor.recebido[1][1][0][0]


def test_coordenador_com_agente_inexistente(tmp_path):
    coord = ModeloRoteirizado("falso:coord", [
        Resposta("", [ChamadaFerramenta("a", "delegar", {"agente": "rh", "tarefa": "x"})]),
        Resposta("Não há agente de RH.", []),
    ])
    time_ = _time(tmp_path, ModeloRoteirizado("s", []), coord)
    assert time_.coordenador.perguntar("RH?") == "Não há agente de RH."
    assert "não existe" in coord.recebido[1][1][0][0]


def test_para_depois_de_muitas_rodadas(tmp_path):
    loop = [Resposta("", [ChamadaFerramenta(str(i), "listar_tabelas", {})]) for i in range(20)]
    time_ = _time(tmp_path, ModeloRoteirizado("falso:setor", loop))
    assert "Parei por segurança" in time_.setores["comercial"].perguntar("x")
