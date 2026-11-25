"""Camada de modelo: o resto do código não sabe qual fornecedor está por trás.

Cada fornecedor implementa `Conversa`, que guarda o histórico no formato nativo
dele (assim nada se perde entre uma chamada e outra, como as assinaturas de
raciocínio do Gemini ou os blocos de raciocínio do Claude).

Fornecedores:
- gemini    -> API compatível com OpenAI do Google AI Studio
- deepseek  -> API compatível com OpenAI da DeepSeek
- anthropic -> SDK oficial da Anthropic (Claude)
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class ChamadaFerramenta:
    id: str
    nome: str
    argumentos: dict[str, Any]


@dataclass
class Uso:
    entrada: int = 0
    saida: int = 0
    cache: int = 0

    def somar(self, outro: "Uso") -> None:
        self.entrada += outro.entrada
        self.saida += outro.saida
        self.cache += outro.cache


@dataclass
class Resposta:
    texto: str
    chamadas: list[ChamadaFerramenta] = field(default_factory=list)
    uso: Uso = field(default_factory=Uso)


@dataclass
class Ferramenta:
    nome: str
    descricao: str
    parametros: dict[str, Any]  # JSON Schema dos argumentos


@dataclass
class ResultadoFerramenta:
    id: str
    conteudo: str
    erro: bool = False


class Conversa(Protocol):
    def usuario(self, texto: str) -> None: ...
    def resultados(self, resultados: list[ResultadoFerramenta]) -> None: ...
    def responder(self) -> Resposta: ...


class Modelo(Protocol):
    nome: str

    def conversa(self, sistema: str, ferramentas: list[Ferramenta]) -> Conversa: ...


# --------------------------------------------------------------------------
# Gemini e DeepSeek (formato OpenAI)
# --------------------------------------------------------------------------

ENDERECOS_OPENAI = {
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/",
    "deepseek": "https://api.deepseek.com",
}


class ModeloOpenAI:
    def __init__(self, fornecedor: str, modelo: str, chave: str, max_tokens: int = 8000):
        from openai import OpenAI

        self.nome = f"{fornecedor}:{modelo}"
        self.modelo = modelo
        self.max_tokens = max_tokens
        self.cliente = OpenAI(api_key=chave, base_url=ENDERECOS_OPENAI[fornecedor])

    def conversa(self, sistema: str, ferramentas: list[Ferramenta]) -> Conversa:
        return _ConversaOpenAI(self, sistema, ferramentas)


class _ConversaOpenAI:
    def __init__(self, modelo: ModeloOpenAI, sistema: str, ferramentas: list[Ferramenta]):
        self.m = modelo
        self.mensagens: list[dict[str, Any]] = [{"role": "system", "content": sistema}]
        self.ferramentas = [
            {
                "type": "function",
                "function": {"name": f.nome, "description": f.descricao, "parameters": f.parametros},
            }
            for f in ferramentas
        ]

    def usuario(self, texto: str) -> None:
        self.mensagens.append({"role": "user", "content": texto})

    def resultados(self, resultados: list[ResultadoFerramenta]) -> None:
        for r in resultados:
            self.mensagens.append({"role": "tool", "tool_call_id": r.id, "content": r.conteudo})

    def responder(self) -> Resposta:
        args: dict[str, Any] = {
            "model": self.m.modelo,
            "messages": self.mensagens,
            "max_tokens": self.m.max_tokens,
        }
        if self.ferramentas:
            args["tools"] = self.ferramentas
        r = self.m.cliente.chat.completions.create(**args)
        msg = r.choices[0].message
        # Guarda a mensagem como veio (inclui campos extras, como assinaturas do Gemini)
        self.mensagens.append(msg.model_dump(exclude_none=True))

        chamadas = []
        for c in msg.tool_calls or []:
            try:
                argumentos = json.loads(c.function.arguments or "{}")
            except json.JSONDecodeError:
                argumentos = {"_json_invalido": c.function.arguments}
            chamadas.append(ChamadaFerramenta(c.id, c.function.name, argumentos))

        uso = Uso()
        if r.usage:
            uso.entrada = r.usage.prompt_tokens or 0
            uso.saida = r.usage.completion_tokens or 0
            detalhes = getattr(r.usage, "prompt_tokens_details", None)
            uso.cache = getattr(detalhes, "cached_tokens", 0) or 0
        return Resposta(msg.content or "", chamadas, uso)


# --------------------------------------------------------------------------
# Claude (SDK da Anthropic)
# --------------------------------------------------------------------------


class ModeloAnthropic:
    def __init__(self, modelo: str, chave: str, max_tokens: int = 16000, esforco: str = "medium"):
        import anthropic

        self.nome = f"anthropic:{modelo}"
        self.modelo = modelo
        self.max_tokens = max_tokens
        self.esforco = esforco
        self.cliente = anthropic.Anthropic(api_key=chave)

    def conversa(self, sistema: str, ferramentas: list[Ferramenta]) -> Conversa:
        return _ConversaAnthropic(self, sistema, ferramentas)


class _ConversaAnthropic:
    def __init__(self, modelo: ModeloAnthropic, sistema: str, ferramentas: list[Ferramenta]):
        self.m = modelo
        # Instruções fixas em cache: reaproveitar sai bem mais barato
        self.sistema = [{"type": "text", "text": sistema, "cache_control": {"type": "ephemeral"}}]
        self.ferramentas = [
            {"name": f.nome, "description": f.descricao, "input_schema": f.parametros}
            for f in ferramentas
        ]
        self.mensagens: list[dict[str, Any]] = []

    def usuario(self, texto: str) -> None:
        self.mensagens.append({"role": "user", "content": texto})

    def resultados(self, resultados: list[ResultadoFerramenta]) -> None:
        # Todos os resultados de uma rodada vão juntos numa única mensagem
        self.mensagens.append(
            {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": r.id, "content": r.conteudo, "is_error": r.erro}
                    for r in resultados
                ],
            }
        )

    def responder(self) -> Resposta:
        r = self.m.cliente.beta.messages.create(
            model=self.m.modelo,
            max_tokens=self.m.max_tokens,
            system=self.sistema,
            tools=self.ferramentas,
            messages=self.mensagens,
            output_config={"effort": self.m.esforco},
            # Se um filtro de segurança recusar por engano, a API tenta outro modelo
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        # Devolve o conteúdo inteiro, sem mexer (os blocos de raciocínio precisam voltar iguais)
        self.mensagens.append({"role": "assistant", "content": r.content})

        uso = Uso(
            entrada=(r.usage.input_tokens or 0) + (r.usage.cache_creation_input_tokens or 0),
            saida=r.usage.output_tokens or 0,
            cache=r.usage.cache_read_input_tokens or 0,
        )
        if r.stop_reason == "refusal":
            return Resposta("O modelo recusou este pedido. Tente reformular a pergunta.", [], uso)

        texto = "".join(b.text for b in r.content if b.type == "text")
        chamadas = [ChamadaFerramenta(b.id, b.name, dict(b.input)) for b in r.content if b.type == "tool_use"]
        if r.stop_reason == "max_tokens" and not chamadas:
            texto += "\n\n[Resposta cortada por limite de tamanho.]"
        return Resposta(texto, chamadas, uso)


# --------------------------------------------------------------------------


def criar_modelo(fornecedor: str, modelo: str, chave: str) -> Modelo:
    fornecedor = fornecedor.strip().lower()
    if not chave:
        raise ValueError(f"Falta a chave da API para o fornecedor '{fornecedor}' no .env")
    if fornecedor in ENDERECOS_OPENAI:
        return ModeloOpenAI(fornecedor, modelo, chave)
    if fornecedor == "anthropic":
        return ModeloAnthropic(modelo, chave)
    raise ValueError(f"Fornecedor desconhecido: '{fornecedor}'. Use gemini, deepseek ou anthropic.")
