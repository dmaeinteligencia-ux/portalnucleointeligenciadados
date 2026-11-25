"""Configuração lida do ambiente (.env) e dos arquivos de setor."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parent.parent


def _carregar_env(arquivo: Path) -> None:
    """Lê um .env simples (CHAVE=valor) sem sobrescrever o que já está no ambiente."""
    if not arquivo.exists():
        return
    for linha in arquivo.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))


CHAVES_POR_FORNECEDOR = {
    "gemini": "GEMINI_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}


@dataclass
class ConfigModelo:
    fornecedor: str
    modelo: str

    @property
    def chave(self) -> str:
        return os.environ.get(CHAVES_POR_FORNECEDOR.get(self.fornecedor, ""), "")

    @staticmethod
    def de_texto(texto: str) -> "ConfigModelo":
        """Aceita 'fornecedor:modelo', por exemplo 'gemini:gemini-flash-latest'."""
        fornecedor, _, modelo = texto.partition(":")
        if not modelo:
            raise ValueError(f"Modelo '{texto}' deve estar no formato fornecedor:modelo")
        return ConfigModelo(fornecedor.strip().lower(), modelo.strip())


@dataclass
class Setor:
    id: str
    nome: str
    descricao: str
    instrucoes: str = ""
    esquemas: list[str] = field(default_factory=list)
    modelo: str | None = None  # opcional: modelo próprio para este setor


@dataclass
class Config:
    modelo_padrao: ConfigModelo
    modelo_coordenador: ConfigModelo
    banco_url: str
    tempo_maximo_s: int
    limite_linhas: int
    arquivo_registro: Path
    setores: list[Setor]


def carregar_setores(pasta: Path) -> list[Setor]:
    setores = []
    for arq in sorted(pasta.glob("*.yaml")):
        if arq.name.startswith("_"):
            continue
        dados = yaml.safe_load(arq.read_text(encoding="utf-8")) or {}
        setores.append(
            Setor(
                id=arq.stem,
                nome=dados.get("nome", arq.stem),
                descricao=dados.get("descricao", ""),
                instrucoes=dados.get("instrucoes", ""),
                esquemas=list(dados.get("esquemas") or []),
                modelo=dados.get("modelo"),
            )
        )
    return setores


def carregar() -> Config:
    _carregar_env(RAIZ / ".env")
    padrao = ConfigModelo.de_texto(os.environ.get("MODELO_PADRAO", "gemini:gemini-flash-latest"))
    coordenador = os.environ.get("MODELO_COORDENADOR")
    return Config(
        modelo_padrao=padrao,
        modelo_coordenador=ConfigModelo.de_texto(coordenador) if coordenador else padrao,
        banco_url=os.environ.get("BANCO_URL", ""),
        tempo_maximo_s=int(os.environ.get("BANCO_TEMPO_MAXIMO_S", "30")),
        limite_linhas=int(os.environ.get("BANCO_LIMITE_LINHAS", "200")),
        arquivo_registro=Path(os.environ.get("ARQUIVO_REGISTRO", str(RAIZ / "dados" / "registro.jsonl"))),
        setores=carregar_setores(Path(os.environ.get("PASTA_SETORES", str(RAIZ / "setores")))),
    )
