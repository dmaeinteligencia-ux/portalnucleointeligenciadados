"""Registro de cada pedido (um JSON por linha), com tokens e custo estimado.

O custo usa a tabela PRECOS (US$ por 1 milhão de tokens). Confira os valores
no site de cada fornecedor e ajuste aqui quando mudarem.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path

from .modelos import Uso

# (entrada, saída, leitura de cache) em US$ por 1 milhão de tokens
PRECOS: dict[str, tuple[float, float, float]] = {
    "anthropic:claude-opus-5-5": (4.00, 20.00, 0.20),
    "anthropic:claude-sonnet-5-5": (2.00, 10.00, 0.10),
    "anthropic:claude-haiku-5-5": (0.10, 0.50, 0.01),
}


def custo_estimado(modelo: str, uso: Uso) -> float | None:
    preco = PRECOS.get(modelo)
    if not preco:
        return None
    entrada, saida, cache = preco
    return round((uso.entrada * entrada + uso.saida * saida + uso.cache * cache) / 1_000_000, 6)


class Registro:
    def __init__(self, arquivo: str | Path):
        self.arquivo = Path(arquivo)
        self.arquivo.parent.mkdir(parents=True, exist_ok=True)
        self._trava = threading.Lock()

    def anotar(self, *, agente: str, modelo: str, pedido: str, resposta: str,
               ferramentas: list[str], uso: Uso, segundos: float) -> None:
        linha = {
            "quando": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "agente": agente,
            "modelo": modelo,
            "pedido": pedido[:2000],
            "resposta": resposta[:4000],
            "ferramentas": ferramentas,
            "tokens_entrada": uso.entrada,
            "tokens_saida": uso.saida,
            "tokens_cache": uso.cache,
            "custo_usd": custo_estimado(modelo, uso),
            "segundos": segundos,
        }
        with self._trava, self.arquivo.open("a", encoding="utf-8") as f:
            f.write(json.dumps(linha, ensure_ascii=False) + "\n")
