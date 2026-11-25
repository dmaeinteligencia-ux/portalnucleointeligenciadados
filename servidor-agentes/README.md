# Time de agentes de BI do Núcleo

Um **coordenador** conversa com a equipe e distribui as tarefas para **agentes de setor**.
Cada agente de setor lê o PostgreSQL (só leitura), escreve e roda SQL e responde em português.

```
você ──► coordenador ──delegar──► agente "comercial" ──► PostgreSQL (somente leitura)
                     └─delegar──► agente "operacao"  ──► PostgreSQL (somente leitura)
```

Esta é a **etapa 1**: o time funciona pelo terminal do servidor. A tela de chat no portal vem depois.

## O que tem

- **Modelo configurável**: Gemini, DeepSeek ou Claude, trocando só o `.env`. Cada setor pode usar um modelo próprio.
- **Ferramentas do agente de setor**: `listar_tabelas`, `descrever_tabela` e `consultar_sql`.
- **Proteções do banco**: usuário só de leitura, transação `READ ONLY`, tempo máximo por consulta,
  um comando por vez (só `SELECT`/`WITH`), resultado limitado a 200 linhas e agente preso aos esquemas do seu setor.
- **Registro** em `dados/registro.jsonl`: cada pedido com agente, modelo, ferramentas usadas, tokens, tempo e custo estimado (Claude).

## Setores

Cada arquivo `setores/<id>.yaml` é um agente. Hoje há só o piloto `geral.yaml`, que enxerga todo o banco.
Para criar um setor, copie `setores/_modelo.yaml.exemplo`. **Este repositório é público**: não coloque
senhas, dados pessoais ou informações sigilosas nesses arquivos.

## Preparar o banco (uma vez)

Crie um usuário só de leitura (no futuro, um por setor, com acesso apenas às views daquele setor):

```sql
create role agente_bi_leitura login password 'troque-esta-senha';
alter role agente_bi_leitura set default_transaction_read_only = on;
grant connect on database NOME_DO_BANCO to agente_bi_leitura;
grant usage on schema ESQUEMA to agente_bi_leitura;
grant select on all tables in schema ESQUEMA to agente_bi_leitura;
alter default privileges in schema ESQUEMA grant select on tables to agente_bi_leitura;
```

Comentários nas tabelas e colunas (`comment on table ...`) aparecem para os agentes e melhoram muito o SQL gerado.

## Instalar no servidor

No mesmo servidor do serviço de voz (Ubuntu com Docker):

```bash
cd /opt/portal-nucleo && git pull
cd servidor-agentes
cp .env.example .env      # preencher modelo, chave e BANCO_URL
docker compose build
docker compose run --rm agentes                                   # conversa com o coordenador
docker compose run --rm agentes python -m agentes.chat --agente geral   # direto com um agente
```

Comandos no chat: `/novo` (nova conversa), `/agentes` (lista os agentes), `/sair`.

O contêiner fica limitado a 512 MB de memória, porque o servidor tem pouca folga.

## Testes

```bash
pip install -r requirements.txt pytest
python -m pytest testes
# Opcional, com um PostgreSQL de TESTE (cria e apaga o esquema teste_agentes):
TESTE_BANCO_URL=postgresql://usuario@localhost/banco_teste python -m pytest testes
```

Os testes usam um modelo falso e não gastam API.
