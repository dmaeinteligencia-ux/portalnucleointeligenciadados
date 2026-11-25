"""Serviço de dados dos painéis do Portal do Núcleo.

Roda na rede interna (172.22.1.200, atrás do mesmo Caddy do serviço de voz) e lê
o PostgreSQL do srvbi só com o usuário painel_leitura. O navegador de quem está
logado no portal busca aqui os números já agregados: os dados nunca passam pela
Vercel nem saem da rede do DMAE.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import date, datetime, timedelta
from decimal import Decimal

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from . import consultas as q

log = logging.getLogger("paineis")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_CHAVE = os.environ.get("SUPABASE_CHAVE_PUBLICA", "")
ORIGENS = [o.strip() for o in os.environ.get("PAINEIS_ORIGENS", "https://portalnucleointeligenciadados.vercel.app").split(",") if o.strip()]
BANCO_URL = os.environ.get("BANCO_URL", "")
CACHE_S = int(os.environ.get("PAINEIS_CACHE_S", "600"))
# Só para testes locais: desliga a conferência de login
SEM_LOGIN = os.environ.get("PAINEIS_SEM_LOGIN") == "1"

pool = ConnectionPool(
    BANCO_URL,
    min_size=0,
    max_size=4,
    open=False,
    kwargs={"options": "-c default_transaction_read_only=on -c statement_timeout=30000", "application_name": "paineis-nucleo"},
)

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.on_event("startup")
def _abrir() -> None:
    pool.open(wait=False)


@app.on_event("shutdown")
def _fechar() -> None:
    pool.close()


# ----------------------------------------------------------------------------
# Origem (CORS) e login, no mesmo molde do serviço de voz
# ----------------------------------------------------------------------------


def origem_permitida(origem: str | None) -> bool:
    if not origem:
        return False
    if origem in ORIGENS:
        return True
    # Previews da Vercel do próprio portal
    return origem.startswith("https://portalnucleointelige") and origem.endswith(".vercel.app")


@app.middleware("http")
async def cors(request: Request, call_next):
    origem = request.headers.get("origin")
    if request.method == "OPTIONS":
        resposta = Response(status_code=204)
    else:
        resposta = await call_next(request)
    if origem_permitida(origem):
        resposta.headers["Access-Control-Allow-Origin"] = origem
        resposta.headers["Vary"] = "Origin"
        resposta.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        resposta.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
        # Chrome/Edge: site da internet acessando endereço da rede interna
        resposta.headers["Access-Control-Allow-Private-Network"] = "true"
        resposta.headers["Access-Control-Max-Age"] = "600"
    return resposta


_tokens: dict[str, tuple[float, str]] = {}
_tokens_trava = threading.Lock()


def conferir_login(request: Request) -> str:
    if SEM_LOGIN:
        return "teste@local"
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Faça login no portal.")
    agora = time.time()
    with _tokens_trava:
        em_cache = _tokens.get(token)
    if em_cache and em_cache[0] > agora:
        return em_cache[1]
    try:
        r = httpx.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_CHAVE, "Authorization": f"Bearer {token}"},
            timeout=8,
        )
    except httpx.HTTPError as e:
        log.warning("Supabase indisponível: %s", e)
        raise HTTPException(503, "Não foi possível conferir o login agora.")
    if r.status_code != 200:
        raise HTTPException(401, "Sessão expirada. Entre de novo no portal.")
    email = r.json().get("email") or ""
    with _tokens_trava:
        if len(_tokens) > 500:
            _tokens.clear()
        _tokens[token] = (agora + 300, email)
    return email


# ----------------------------------------------------------------------------
# Banco
# ----------------------------------------------------------------------------


def _limpo(v):
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, datetime):
        return v.isoformat(timespec="minutes")  # hora de Brasília, como está no banco
    if isinstance(v, date):
        return v.isoformat()
    return v


def _linhas(cur, sql: str, params: dict | None = None) -> list[dict]:
    cur.execute(sql, params or {})
    return [{k: _limpo(v) for k, v in linha.items()} for linha in cur.fetchall()]


def _uma(cur, sql: str, params: dict | None = None) -> dict:
    linhas = _linhas(cur, sql, params)
    return linhas[0] if linhas else {}


_cache: dict[tuple, tuple[float, dict]] = {}
_cache_trava = threading.Lock()


def _em_cache(chave: tuple, gerar):
    agora = time.time()
    with _cache_trava:
        item = _cache.get(chave)
        if item and item[0] > agora:
            return item[1]
    valor = gerar()
    with _cache_trava:
        if len(_cache) > 200:
            _cache.clear()
        _cache[chave] = (agora + CACHE_S, valor)
    return valor


def _ultima_atualizacao(cur) -> dict:
    return _uma(cur, q.SQL_ATUALIZACAO)


# ----------------------------------------------------------------------------
# Rotas
# ----------------------------------------------------------------------------


@app.get("/saude")
def saude():
    try:
        with pool.connection(timeout=5) as con, con.cursor(row_factory=dict_row) as cur:
            atualizacao = _ultima_atualizacao(cur)
        return {"ok": True, "servico": "paineis-nucleo", "banco": True, "atualizacao": atualizacao}
    except Exception as e:  # noqa: BLE001
        log.warning("banco indisponível: %s", e)
        return JSONResponse({"ok": False, "servico": "paineis-nucleo", "banco": False}, status_code=503)


@app.get("/manutencao-agua/opcoes")
def opcoes(_email: str = Depends(conferir_login)):
    def gerar():
        with pool.connection(timeout=10) as con, con.cursor(row_factory=dict_row) as cur:
            return {
                "periodo": _uma(cur, q.SQL_PERIODO),
                "atualizacao": _ultima_atualizacao(cur),
                "servicos": _linhas(cur, q.SQL_OPCOES_SERVICOS),
                "sintomas": _linhas(cur, q.SQL_OPCOES_SINTOMAS),
                "bairros": _linhas(cur, q.SQL_OPCOES_BAIRROS),
                "regioes": _linhas(cur, q.SQL_OPCOES_REGIOES),
                "equipes": _linhas(cur, q.SQL_OPCOES_EQUIPES),
            }

    return _em_cache(("opcoes", _versao_dados()), gerar)


_versao = {"em": 0.0, "valor": ""}


def _versao_dados() -> str:
    """Muda quando o painel é atualizado: o cache nunca serve número antigo por mais de 1 minuto."""
    agora = time.time()
    if agora - _versao["em"] > 60:
        try:
            with pool.connection(timeout=10) as con, con.cursor(row_factory=dict_row) as cur:
                _versao["valor"] = str(_ultima_atualizacao(cur).get("executado_em"))
        except Exception:  # noqa: BLE001
            pass
        _versao["em"] = agora
    return _versao["valor"]


@app.get("/manutencao-agua/dados")
def dados(
    inicio: date | None = None,
    fim: date | None = None,
    servico: int | None = Query(None, ge=0),
    sintoma: int | None = Query(None, ge=0),
    bairro: int | None = Query(None, ge=0),
    regiao: int | None = Query(None, ge=0),
    equipe: int | None = Query(None, ge=0),
    _email: str = Depends(conferir_login),
):
    hoje = date.today()
    fim = min(fim or hoje, hoje)
    inicio = inicio or (fim.replace(day=1) - timedelta(days=365)).replace(day=1)
    if inicio > fim:
        raise HTTPException(400, "A data inicial é depois da final.")
    if (fim - inicio).days > 366 * 7:
        raise HTTPException(400, "Escolha um período de no máximo 7 anos.")
    f = q.Filtros(inicio, fim, servico, sintoma, bairro, regiao, equipe)

    def gerar():
        p = f.params()
        with pool.connection(timeout=10) as con, con.cursor(row_factory=dict_row) as cur:
            ind = _uma(cur, q.SQL_INDICADORES, p)
            ind.update(_uma(cur, q.SQL_EXECUTADAS_NO_PERIODO, p))
            ind.update(_uma(cur, q.SQL_EM_ABERTO_AGORA, p))
            return {
                "filtros": {k: _limpo(v) for k, v in zip(
                    ("inicio", "fim", "servico", "sintoma", "bairro", "regiao", "equipe"), f.chave())},
                "atualizacao": _ultima_atualizacao(cur),
                "indicadores": ind,
                "mensal": _linhas(cur, q.SQL_MENSAL, p),
                "situacao": _linhas(cur, q.SQL_SITUACAO, p),
                "servicos": _linhas(cur, q.SQL_SERVICOS, p),
                "sintomas": _linhas(cur, q.SQL_SINTOMAS, p),
                "motivos": _linhas(cur, q.SQL_MOTIVOS, p),
                "bairros": _linhas(cur, q.SQL_BAIRROS, p),
                "regioes": _linhas(cur, q.SQL_REGIOES, p),
                "equipes": _linhas(cur, q.SQL_EQUIPES, p),
                "semana_hora": _linhas(cur, q.SQL_SEMANA_HORA, p),
                "faixas_tempo": _linhas(cur, q.SQL_FAIXAS_TEMPO, p),
                "regioes_mensal": _linhas(cur, q.SQL_REGIOES_MENSAL, p),
                "idade_abertas": _linhas(cur, q.SQL_IDADE_ABERTAS, p),
                "mapa": _linhas(cur, q.SQL_MAPA, p),
                "cobertura_mapa": _uma(cur, q.SQL_COBERTURA_MAPA, p),
            }

    return _em_cache(("dados", _versao_dados(), f.chave()), gerar)
