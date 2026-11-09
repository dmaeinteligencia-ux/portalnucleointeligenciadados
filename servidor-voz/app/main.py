"""Serviço de voz do Portal do Núcleo de Inteligência de Dados.

Recebe o áudio do microfone do portal por WebSocket (PCM 16 kHz, 16 bits, mono),
reconhece com o Vosk em português, limitado às frases de comando que o portal envia,
e devolve o texto. O áudio não é gravado em disco nem sai do servidor.

Só atende quem está logado no portal: o token do Supabase é conferido antes do áudio.
"""
import array
import asyncio
import math
import base64
import io
import json
import logging
import os
import time
import wave

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
GEMINI_CHAVE = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODELO = os.environ.get("GEMINI_MODELO", "gemini-flash-lite-latest")
MAX_FALA_S = 15  # trecho de áudio guardado em memória para o Gemini (nunca gravado em disco)
MAX_GEMINI_POR_SESSAO = 60
LIMIAR_VOZ = int(os.environ.get("VOZ_LIMIAR", "600"))  # volume (RMS) a partir do qual um trecho conta como fala
MIN_FALA_MS = 400  # fala mínima para um trecho não reconhecido valer como pedido


def volume(pcm: bytes) -> float:
    amostras = array.array("h", pcm[: len(pcm) - len(pcm) % 2])
    return math.sqrt(sum(a * a for a in amostras) / len(amostras)) if amostras else 0.0

modelo = Model(MODELO)

# Voz falada (Piper, roda aqui mesmo, sem internet). Opcional: sem o modelo, o portal usa a voz do navegador.
VOZ_FALA = os.environ.get("VOZ_FALA_MODELO", "/fala/pt_BR-faber-medium.onnx")
MAX_TEXTO_FALA = 500
try:
    from piper import PiperVoice

    fala_modelo = PiperVoice.load(VOZ_FALA) if os.path.exists(VOZ_FALA) else None
except Exception as e:  # noqa: BLE001
    logging.getLogger("voz").warning("voz falada indisponível: %s", e)
    fala_modelo = None
fala_trava = asyncio.Lock()  # uma síntese por vez, para não disputar a CPU


def sintetizar(texto: str) -> bytes:
    saida = io.BytesIO()
    with wave.open(saida, "wb") as w:
        if hasattr(fala_modelo, "synthesize_wav"):
            fala_modelo.synthesize_wav(texto, w)
        else:
            fala_modelo.synthesize(texto, w)
    return saida.getvalue()
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
    return {"ok": True, "servico": "voz-nucleo", "modelo": os.path.basename(MODELO.rstrip("/")), "gemini": bool(GEMINI_CHAVE), "fala": fala_modelo is not None}


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


def para_wav(pcm: bytes) -> bytes:
    saida = io.BytesIO()
    with wave.open(saida, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TAXA)
        w.writeframes(pcm)
    return saida.getvalue()


INSTRUCOES = """Você é o assistente de voz do Portal do Núcleo de Inteligência de Dados do DMAE (Uberlândia).
O áudio é um pedido falado em português, que pode começar com a palavra de ativação "Sane".
Aplicações do portal (JSON): {apps}
Páginas: "/" (Central/início), "/aplicacoes" (catálogo), "/admin" (administração).
Responda SOMENTE com um JSON neste formato:
{{"transcricao": "o que a pessoa disse",
 "acao": "abrir" | "ir" | "voltar" | "horas" | "parar" | "responder" | "nada",
 "slug": "slug da aplicação, quando acao = abrir",
 "nova_aba": false,
 "para": "página, quando acao = ir",
 "fala": "resposta curta e natural em português para ser falada (no máximo 2 frases)"}}
Use "abrir" quando a pessoa quiser abrir/usar uma aplicação (mesmo descrita por outras palavras ou pela área).
Use "responder" para perguntas sobre as aplicações do portal, respondendo só com base na lista acima.
Use "nada" se o áudio não tiver um pedido. Não invente aplicações."""


async def perguntar_gemini(pcm: bytes, apps) -> dict:
    lista = [
        {k: a.get(k) for k in ("slug", "nome", "area", "descricao") if isinstance(a, dict) and a.get(k)}
        for a in (apps or [])[:50]
    ]
    corpo = {
        "contents": [{
            "role": "user",
            "parts": [
                {"text": INSTRUCOES.format(apps=json.dumps(lista, ensure_ascii=False))},
                {"inline_data": {"mime_type": "audio/wav", "data": base64.b64encode(para_wav(pcm)).decode()}},
            ],
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1,
        },
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODELO}:generateContent"
    async with httpx.AsyncClient(timeout=20) as cliente:
        r = await cliente.post(url, headers={"x-goog-api-key": GEMINI_CHAVE}, json=corpo)
    if r.status_code != 200:
        raise RuntimeError(f"Gemini ({GEMINI_MODELO}) respondeu {r.status_code}: {r.text[:500]}")
    texto = r.json()["candidates"][0]["content"]["parts"][0]["text"]
    resposta = json.loads(texto)
    return {k: resposta.get(k) for k in ("transcricao", "acao", "slug", "nova_aba", "para", "fala")}


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
    fala = bytearray()  # áudio da frase atual, só em memória
    fala_ms = 0  # quanto da frase atual teve volume de voz
    ultima_fala = b""
    pedidos_gemini = 0
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
                elif comando.get("tipo") == "falar":
                    texto_fala = str(comando.get("texto") or "")[:MAX_TEXTO_FALA].strip()
                    if not fala_modelo or not texto_fala:
                        await ws.send_json({"tipo": "fala", "ok": False})
                    else:
                        try:
                            async with fala_trava:
                                audio = await asyncio.to_thread(sintetizar, texto_fala)
                            await ws.send_bytes(audio)
                        except Exception as e:  # noqa: BLE001
                            log.warning("síntese falhou: %s", e)
                            await ws.send_json({"tipo": "fala", "ok": False})
                elif comando.get("tipo") == "entender":
                    if not GEMINI_CHAVE:
                        await ws.send_json({"tipo": "acao", "acao": "nada", "fala": "A inteligência artificial ainda não está configurada."})
                    elif not ultima_fala or pedidos_gemini >= MAX_GEMINI_POR_SESSAO:
                        await ws.send_json({"tipo": "acao", "acao": "nada", "fala": "Não entendi o comando."})
                    else:
                        pedidos_gemini += 1
                        try:
                            resposta = await perguntar_gemini(ultima_fala, comando.get("apps"))
                            log.info("gemini: %r -> %s", resposta.get("transcricao"), resposta.get("acao"))
                            await ws.send_json({"tipo": "acao", **resposta})
                        except Exception as e:  # noqa: BLE001
                            log.warning("gemini falhou: %s", e)
                            await ws.send_json({"tipo": "acao", "acao": "nada", "fala": "Não consegui falar com a inteligência artificial agora."})
                continue
            dados = mensagem.get("bytes")
            if not dados:
                continue
            recebido += len(dados)
            fala.extend(dados)
            if volume(dados) >= LIMIAR_VOZ:
                fala_ms += len(dados) * 1000 // (TAXA * 2)
            if len(fala) > MAX_FALA_S * TAXA * 2:
                del fala[: len(fala) - MAX_FALA_S * TAXA * 2]
            final = await asyncio.to_thread(reconhecedor.AcceptWaveform, dados)
            if final:
                bruto = json.loads(reconhecedor.Result()).get("text", "").split()
                texto = " ".join(p for p in bruto if p != "[unk]")
                # incompleto: havia fala fora da lista de comandos (o portal pode pedir ao Gemini para entender)
                # Com a lista restrita, o reconhecedor às vezes devolve vazio para uma frase livre; o volume mostra que houve fala
                incompleto = "[unk]" in bruto or (not texto and fala_ms >= MIN_FALA_MS)
                if not texto and not incompleto and fala_ms:
                    log.info("final vazio (%d ms com voz, bruto %r)", fala_ms, " ".join(bruto))
                voz_ms, fala_ms = fala_ms, 0
                if texto or incompleto:
                    ultima_fala = bytes(fala)
                fala = bytearray()
                ultimo_parcial = ""
                if texto or incompleto:
                    log.info("ouvido: %r%s (bruto %r, %d ms com voz)", texto, " (+ fala fora da lista)" if incompleto else "", " ".join(bruto), voz_ms)
                    await ws.send_json({"tipo": "final", "texto": texto, "incompleto": incompleto, "voz_ms": voz_ms})
            else:
                parcial = " ".join(p for p in json.loads(reconhecedor.PartialResult()).get("partial", "").split() if p != "[unk]")
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
