"""O ciclo de um agente: pergunta ao modelo, executa as ferramentas pedidas e repete
até o modelo responder sem pedir mais nada."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from .modelos import Ferramenta, Modelo, ResultadoFerramenta, Uso
from .registro import Registro

Acao = Callable[[dict[str, Any]], str]


@dataclass
class FerramentaAgente:
    definicao: Ferramenta
    acao: Acao


@dataclass
class Agente:
    nome: str
    descricao: str
    instrucoes: str
    modelo: Modelo
    ferramentas: list[FerramentaAgente] = field(default_factory=list)
    registro: Registro | None = None
    max_rodadas: int = 15
    ao_usar_ferramenta: Callable[[str, str, dict], None] | None = None

    def __post_init__(self) -> None:
        self._acoes = {f.definicao.nome: f.acao for f in self.ferramentas}
        self._conversa = None

    def nova_conversa(self) -> None:
        self._conversa = None

    def perguntar(self, texto: str) -> str:
        """Envia uma mensagem e devolve a resposta final. Mantém o histórico entre chamadas."""
        if self._conversa is None:
            self._conversa = self.modelo.conversa(self.instrucoes, [f.definicao for f in self.ferramentas])
        conversa = self._conversa
        conversa.usuario(texto)

        uso_total = Uso()
        inicio = time.monotonic()
        ferramentas_usadas: list[str] = []
        resposta_final = ""
        try:
            for _ in range(self.max_rodadas):
                r = conversa.responder()
                uso_total.somar(r.uso)
                if not r.chamadas:
                    resposta_final = r.texto
                    return resposta_final
                resultados = []
                for c in r.chamadas:
                    ferramentas_usadas.append(c.nome)
                    if self.ao_usar_ferramenta:
                        self.ao_usar_ferramenta(self.nome, c.nome, c.argumentos)
                    resultados.append(self._executar(c.id, c.nome, c.argumentos))
                conversa.resultados(resultados)
            resposta_final = (
                "Parei por segurança depois de muitas etapas sem chegar a uma resposta. "
                "Tente dividir o pedido em partes menores."
            )
            return resposta_final
        finally:
            if self.registro:
                self.registro.anotar(
                    agente=self.nome,
                    modelo=self.modelo.nome,
                    pedido=texto,
                    resposta=resposta_final,
                    ferramentas=ferramentas_usadas,
                    uso=uso_total,
                    segundos=round(time.monotonic() - inicio, 1),
                )

    def _executar(self, id_: str, nome: str, argumentos: dict[str, Any]) -> ResultadoFerramenta:
        acao = self._acoes.get(nome)
        if acao is None:
            return ResultadoFerramenta(id_, f"Ferramenta desconhecida: {nome}", erro=True)
        if "_json_invalido" in argumentos:
            return ResultadoFerramenta(id_, "Argumentos em JSON inválido. Tente de novo.", erro=True)
        try:
            return ResultadoFerramenta(id_, acao(argumentos))
        except Exception as e:  # o erro volta para o modelo, que pode corrigir a consulta
            return ResultadoFerramenta(id_, json.dumps({"erro": f"{type(e).__name__}: {e}"}, ensure_ascii=False), erro=True)
