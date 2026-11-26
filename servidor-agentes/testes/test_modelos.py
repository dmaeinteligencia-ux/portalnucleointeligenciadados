"""Confere o formato das chamadas de cada fornecedor sem acessar a internet."""

import json

import httpx2 as httpx

from agentes.modelos import Ferramenta, ModeloAnthropic, ModeloOpenAI, ResultadoFerramenta

FERRAMENTA = Ferramenta("consultar_sql", "Roda SQL", {"type": "object", "properties": {"sql": {"type": "string"}}, "required": ["sql"]})


def _servidor(respostas):
    pedidos = []

    def tratar(request: httpx.Request):
        pedidos.append(json.loads(request.content))
        return httpx.Response(200, json=respostas.pop(0))

    return pedidos, httpx.Client(transport=httpx.MockTransport(tratar))


def test_openai_compativel_ida_e_volta():
    pedidos, http = _servidor([
        {"id": "1", "object": "chat.completion", "created": 0, "model": "m", "choices": [{
            "index": 0, "finish_reason": "tool_calls",
            "message": {"role": "assistant", "content": None, "tool_calls": [{
                "id": "c1", "type": "function", "function": {"name": "consultar_sql", "arguments": '{"sql": "select 1"}'},
                "extra_content": {"google": {"thought_signature": "abc"}}}]}}],
         "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}},
        {"id": "2", "object": "chat.completion", "created": 0, "model": "m", "choices": [{
            "index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "Resultado: 1"}}],
         "usage": {"prompt_tokens": 20, "completion_tokens": 3, "total_tokens": 23}},
    ])
    m = ModeloOpenAI("gemini", "gemini-flash-latest", "chave")
    m.cliente = m.cliente.with_options(http_client=http)
    c = m.conversa("sistema", [FERRAMENTA])
    c.usuario("quanto?")
    r = c.responder()
    assert r.chamadas[0].nome == "consultar_sql" and r.chamadas[0].argumentos == {"sql": "select 1"}
    c.resultados([ResultadoFerramenta("c1", '{"linhas": [[1]]}')])
    r2 = c.responder()
    assert r2.texto == "Resultado: 1" and r2.uso.entrada == 20

    segundo = pedidos[1]["messages"]
    assert [m["role"] for m in segundo] == ["system", "user", "assistant", "tool"]
    # a assinatura de raciocínio do Gemini volta intacta
    assert segundo[2]["tool_calls"][0]["extra_content"] == {"google": {"thought_signature": "abc"}}
    assert pedidos[0]["tools"][0]["function"]["name"] == "consultar_sql"


def test_anthropic_ida_e_volta():
    pedidos, http = _servidor([
        {"id": "m1", "type": "message", "role": "assistant", "model": "claude-opus-5-5", "stop_reason": "tool_use",
         "content": [{"type": "thinking", "thinking": "", "signature": "sig"},
                     {"type": "tool_use", "id": "t1", "name": "consultar_sql", "input": {"sql": "select 1"}}],
         "usage": {"input_tokens": 10, "output_tokens": 5, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 100}},
        {"id": "m2", "type": "message", "role": "assistant", "model": "claude-opus-5-5", "stop_reason": "end_turn",
         "content": [{"type": "text", "text": "Resultado: 1"}],
         "usage": {"input_tokens": 20, "output_tokens": 3, "cache_read_input_tokens": 100, "cache_creation_input_tokens": 0}},
    ])
    m = ModeloAnthropic("claude-opus-5-5", "chave")
    m.cliente = m.cliente.with_options(http_client=http)
    c = m.conversa("sistema", [FERRAMENTA])
    c.usuario("quanto?")
    r = c.responder()
    assert r.chamadas[0].id == "t1" and r.uso.entrada == 110
    c.resultados([ResultadoFerramenta("t1", "1")])
    r2 = c.responder()
    assert r2.texto == "Resultado: 1" and r2.uso.cache == 100

    p = pedidos[1]
    assert p["fallbacks"] == "default" and p["output_config"] == {"effort": "medium"}
    assert p["system"][0]["cache_control"] == {"type": "ephemeral"}
    # o bloco de raciocínio volta sem alteração, e os resultados vão numa mensagem só
    assert p["messages"][1]["content"][0] == {"type": "thinking", "thinking": "", "signature": "sig"}
    assert p["messages"][2]["content"][0]["type"] == "tool_result"
    assert "thinking" not in p
