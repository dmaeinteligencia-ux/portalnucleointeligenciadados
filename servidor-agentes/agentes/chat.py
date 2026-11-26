"""Chat no terminal com o time de agentes.

Uso:
    python -m agentes.chat                 # conversa com o coordenador
    python -m agentes.chat --agente geral  # conversa direto com um agente de setor

Comandos dentro do chat: /novo (nova conversa), /agentes (lista), /sair
"""

from __future__ import annotations

import argparse
import sys

from . import config as cfg
from .equipe import Time


def _mostrar_ferramenta(agente: str, ferramenta: str, argumentos: dict) -> None:
    if ferramenta == "delegar":
        print(f"  → coordenador delegou para [{argumentos.get('agente')}]: {argumentos.get('tarefa', '')[:160]}")
    elif ferramenta == "consultar_sql":
        sql = " ".join(str(argumentos.get("sql", "")).split())
        print(f"  · [{agente}] SQL: {sql[:200]}")
    else:
        print(f"  · [{agente}] {ferramenta} {argumentos or ''}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Chat com o time de agentes de BI")
    parser.add_argument("--agente", help="falar direto com um agente de setor (id do arquivo em setores/)")
    args = parser.parse_args()

    config = cfg.carregar()
    if not config.banco_url:
        print("Falta BANCO_URL no .env (veja .env.example).", file=sys.stderr)
        return 1
    time_ = Time(config, ao_usar_ferramenta=_mostrar_ferramenta)

    if args.agente:
        if args.agente not in time_.setores:
            print(f"Agente '{args.agente}' não existe. Opções: {', '.join(time_.setores)}", file=sys.stderr)
            return 1
        agente = time_.setores[args.agente]
    else:
        agente = time_.coordenador

    print(f"Conversando com: {agente.nome} ({agente.modelo.nome}). Comandos: /novo, /agentes, /sair\n")
    while True:
        try:
            texto = input("você> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if not texto:
            continue
        if texto == "/sair":
            return 0
        if texto == "/novo":
            agente.nova_conversa()
            print("(nova conversa)\n")
            continue
        if texto == "/agentes":
            for s in config.setores:
                print(f"  {s.id}: {s.nome}. {s.descricao}")
            print()
            continue
        try:
            resposta = agente.perguntar(texto)
        except Exception as e:
            print(f"\n[erro] {type(e).__name__}: {e}\n", file=sys.stderr)
            agente.nova_conversa()
            continue
        print(f"\n{agente.nome}> {resposta}\n")


if __name__ == "__main__":
    raise SystemExit(main())
