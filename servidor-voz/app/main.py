"""Serviço de voz do Portal do Núcleo de Inteligência de Dados.

Recebe o áudio do microfone do portal por WebSocket (PCM 16 kHz, 16 bits, mono),
reconhece com o Vosk em português, limitado às frases de comando que o portal envia,
e devolve o texto. O áudio não é gravado em disco nem sai do servidor.

Só atende quem está logado no portal: o token do Supabase é conferido antes do áudio.
"""
import asyncio
import json
import logging
import os
import time

import httpx
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response
from vosk import KaldiRecognizer, Model, SetLogLevel

SetLogLevel(-1)
log = logging.getLogger("voz")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_CHAVE = os.environ["SUPABASE_CHAVE_PUBLICA"]  # chave publishable (sb_publishable_...), não a secreta
ORIGENS = [o.strip() for o in os.environ.get("VOZ_ORIGENS", "https://portalnucleointeligenciadados.vercel.app").split(",") if o.strip()]
MODELO = os.environ.get("VOZ_MODELO", "/modelo")
TAXA = 16000
MAX_FRASES = 600
MAX_SESSAO_S = 60 * 60 * 8

modelo = Model(MODELO)
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
_tokens: dict[str, tuple[float, str]] = {}  # token -> (validade, e-mail)


def origem_permitida(origem: str | None) -> bool:
    if not origem:
        return False
    if origem in ORIGENS:
        return True
    # Previews da Vercel do próprio portal
    return origem.startswith("https://portalnucleointelige") and origem.endswith(".vercel.app")


@app.middleware("http")
async def cors(request: Request, chamar):
    origem = request.headers.get("origin")
    if request.method == "OPTIONS":
        resposta = Response(status_code=204)
    else:
        resposta = await chamar(request)
    if origem_permitida(origem):
        resposta.headers["Access-Control-Allow-Origin"] = origem
        resposta.headers["Vary"] = "Origin"
        resposta.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resposta.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
        # Chrome/Edge: site da internet acessando endereço da rede interna
        resposta.headers["Access-Control-Allow-Private-Network"] = "true"
        resposta.headers["Access-Control-Max-Age"] = "600"
    return resposta


@app.get("/saude")
async def saude():
    return {"ok": True, "servico": "voz-nucleo", "modelo": os.path.basename(MODELO.rstrip("/"))}


async def conferir_login(token: str) -> str | None:
    """Confere o token no Supabase do portal. Guarda o resultado por 5 minutos."""
    agora = time.time()
    em_cache = _tokens.get(token)
    if em_cache and em_cache[0] > agora:
        return em_cache[1]
    try:
        async with httpx.AsyncClient(timeout=8) as cliente:
            r = await cliente.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={"apikey": SUPABASE_CHAVE, "Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as e:
        log.warning("Supabase indisponível: %s", e)
        return None
    if r.status_code != 200:
        return None
    email = r.json().get("email")
    if len(_tokens) > 500:
        _tokens.clear()
    _tokens[token] = (agora + 300, email)
    return email


def montar_gramatica(frases) -> str | None:
    if not isinstance(frases, list):
        return None
    limpas = []
    for f in frases[:MAX_FRASES]:
        if isinstance(f, str):
            f = " ".join(f.lower().split())[:80]
            if f and f not in limpas:
                limpas.append(f)
    if not limpas:
        return None
    return json.dumps(limpas + ["[unk]"], ensure_ascii=False)


@app.websocket("/escuta")
async def escuta(ws: WebSocket):
    if not origem_permitida(ws.headers.get("origin")):
        await ws.close(code=4403)
        return
    await ws.accept()
    try:
        inicio = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=10))
    except (asyncio.TimeoutError, ValueError, WebSocketDisconnect):
        await ws.close(code=4400)
        return

    email = await conferir_login(str(inicio.get("token", "")))
    if not email:
        await ws.send_json({"tipo": "erro", "mensagem": "login do portal inválido ou expirado"})
        await ws.close(code=4401)
        return

    gramatica = montar_gramatica(inicio.get("frases"))
    reconhecedor = KaldiRecognizer(modelo, TAXA, gramatica) if gramatica else KaldiRecognizer(modelo, TAXA)
    log.info("escuta iniciada para %s (%s frases)", email, len(json.loads(gramatica)) - 1 if gramatica else "livre")
    await ws.send_json({"tipo": "pronto"})

    comeco = time.time()
    ultimo_parcial = ""
    recebido = 0
    try:
        while time.time() - comeco < MAX_SESSAO_S:
            mensagem = await ws.receive()
            if mensagem.get("type") == "websocket.disconnect":
                break
            if mensagem.get("text"):
                comando = json.loads(mensagem["text"])
                if comando.get("tipo") == "frases":
                    nova = montar_gramatica(comando.get("frases"))
                    if nova:
                        reconhecedor = KaldiRecognizer(modelo, TAXA, nova)
                continue
            dados = mensagem.get("bytes")
            if not dados:
                continue
            recebido += len(dados)
            final = await asyncio.to_thread(reconhecedor.AcceptWaveform, dados)
            if final:
                texto = json.loads(reconhecedor.Result()).get("text", "").strip()
                ultimo_parcial = ""
                log.info("ouvido: %r", texto)
                if texto and texto != "[unk]":
                    await ws.send_json({"tipo": "final", "texto": texto})
            else:
                parcial = json.loads(reconhecedor.PartialResult()).get("partial", "").strip()
                if parcial and parcial != ultimo_parcial:
                    ultimo_parcial = parcial
                    await ws.send_json({"tipo": "parcial", "texto": parcial})
    except WebSocketDisconnect:
        pass
    finally:
        log.info("escuta encerrada para %s (%.1f s de áudio)", email, recebido / (TAXA * 2))


@app.exception_handler(Exception)
async def erro_geral(_request, exc):
    log.exception("erro: %s", exc)
    return JSONResponse({"ok": False}, status_code=500)
