"""Monta o time: um agente por setor e o coordenador que delega para eles."""

from __future__ import annotations

import json
from typing import Callable

from .agente import Agente, FerramentaAgente
from .banco import Banco
from .config import Config, ConfigModelo, Setor
from .ferramentas import ferramentas_de_banco
from .modelos import Ferramenta, Modelo, criar_modelo
from .registro import Registro

INSTRUCOES_BASE_SETOR = """Você é o agente de BI do setor "{nome}" do DMAE (Departamento Municipal de Água e Esgoto).
{descricao}

Como trabalhar:
- Responda sempre em português do Brasil, de forma direta, para gestores que não são técnicos.
- Antes de escrever SQL, use listar_tabelas e descrever_tabela para conhecer os dados. Não invente nomes de tabelas ou colunas.
- Use apenas consultas de leitura. Prefira agregar no banco (GROUP BY, SUM, COUNT) a trazer muitas linhas.
- Se uma consulta der erro, leia a mensagem, corrija e tente de novo.
- Na resposta final, traga os números principais, diga de quais tabelas vieram e o período considerado.
  Se fizer alguma suposição (por exemplo, o que conta como "ativo"), diga qual foi.
- Se os dados não permitirem responder, diga isso claramente em vez de chutar.
{extras}"""

INSTRUCOES_COORDENADOR = """Você é o coordenador do time de agentes de BI do Núcleo de Inteligência de Dados do DMAE.
Você conversa com a equipe do Núcleo e distribui o trabalho entre os agentes de setor.

Agentes disponíveis:
{lista}

Como trabalhar:
- Responda sempre em português do Brasil.
- Você não acessa o banco diretamente. Para qualquer pergunta sobre dados, use a ferramenta delegar,
  escolhendo o agente certo e escrevendo uma tarefa clara e completa (período, recorte, o que deve voltar).
- Se o pedido envolver mais de um setor, delegue uma tarefa para cada agente e junte as respostas.
- Se não estiver claro qual setor ou período, pergunte antes de delegar.
- Na resposta final, resuma o que cada agente encontrou, sem esconder ressalvas que eles fizeram."""


class Time:
    def __init__(self, config: Config, banco: Banco | None = None,
                 fabrica_modelo: Callable[[ConfigModelo], Modelo] | None = None,
                 ao_usar_ferramenta: Callable[[str, str, dict], None] | None = None):
        self.config = config
        self.banco = banco or Banco(config.banco_url, config.tempo_maximo_s, config.limite_linhas)
        self.registro = Registro(config.arquivo_registro)
        self._fabrica = fabrica_modelo or (lambda c: criar_modelo(c.fornecedor, c.modelo, c.chave))
        self._ao_usar = ao_usar_ferramenta
        self.setores: dict[str, Agente] = {s.id: self._agente_setor(s) for s in config.setores}
        if not self.setores:
            raise ValueError("Nenhum setor configurado. Crie um arquivo .yaml na pasta setores/.")
        self.coordenador = self._montar_coordenador()

    def _agente_setor(self, setor: Setor) -> Agente:
        cfg_modelo = ConfigModelo.de_texto(setor.modelo) if setor.modelo else self.config.modelo_padrao
        extras = ""
        if setor.esquemas:
            extras += f"\nEsquemas do banco deste setor: {', '.join(setor.esquemas)}."
        if setor.instrucoes:
            extras += f"\n\nRegras e conhecimento do setor:\n{setor.instrucoes.strip()}"
        return Agente(
            nome=setor.id,
            descricao=setor.descricao,
            instrucoes=INSTRUCOES_BASE_SETOR.format(nome=setor.nome, descricao=setor.descricao, extras=extras),
            modelo=self._fabrica(cfg_modelo),
            ferramentas=ferramentas_de_banco(self.banco, setor.esquemas or None),
            registro=self.registro,
            ao_usar_ferramenta=self._ao_usar,
        )

    def _montar_coordenador(self) -> Agente:
        lista = "\n".join(f"- {s.id}: {s.nome}. {s.descricao}" for s in self.config.setores)

        def delegar(args: dict) -> str:
            setor = str(args.get("agente", ""))
            tarefa = str(args.get("tarefa", ""))
            agente = self.setores.get(setor)
            if agente is None:
                return json.dumps({"erro": f"Agente '{setor}' não existe. Opções: {list(self.setores)}"}, ensure_ascii=False)
            agente.nova_conversa()  # cada tarefa delegada começa do zero
            return json.dumps({"agente": setor, "resposta": agente.perguntar(tarefa)}, ensure_ascii=False)

        ferramenta = FerramentaAgente(
            Ferramenta(
                "delegar",
                "Envia uma tarefa a um agente de setor e devolve a resposta dele.",
                {
                    "type": "object",
                    "properties": {
                        "agente": {"type": "string", "enum": list(self.setores), "description": "Id do agente de setor"},
                        "tarefa": {"type": "string", "description": "Tarefa completa e autoexplicativa para o agente"},
                    },
                    "required": ["agente", "tarefa"],
                },
            ),
            delegar,
        )
        return Agente(
            nome="coordenador",
            descricao="Distribui os pedidos entre os agentes de setor.",
            instrucoes=INSTRUCOES_COORDENADOR.format(lista=lista),
            modelo=self._fabrica(self.config.modelo_coordenador),
            ferramentas=[ferramenta],
            registro=self.registro,
            ao_usar_ferramenta=self._ao_usar,
        )
