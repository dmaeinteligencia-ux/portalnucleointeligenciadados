# Serviço de dados dos painéis

Entrega os números dos painéis próprios do portal (feitos em código, sem ferramenta de BI).
Roda no servidor interno (172.22.1.200), atrás do mesmo Caddy do `servidor-voz`, em `https://172.22.1.200/paineis/`.

- Lê **só** as views do schema `painel` no banco ODS do srvbi (172.22.1.45), com o usuário somente leitura `painel_leitura`.
- Só atende quem está logado no portal (o token do Supabase é conferido, como no serviço de voz) e só aceita o site do portal (Origin).
- Os dados nunca passam pela Vercel nem saem da rede do DMAE. Por isso os painéis só abrem dentro da rede (ou pela VPN).
- Resultados ficam em cache por 10 minutos; uma atualização do painel invalida o cache em até 1 minuto.

## Painéis

| Painel | Página no portal | Rotas | Views |
| --- | --- | --- | --- |
| Solicitações e Execuções de Serviços - Manutenção de Água | `/paineis/manutencao-agua` | `/manutencao-agua/opcoes`, `/manutencao-agua/dados` | `painel.mag_os`, `painel.atualizacoes` |

As views são materializadas e atualizadas de hora em hora (`painel.mag_atualizar()`, agendada no 172.22.1.200 aos :45).
A função não atualiza enquanto a carga do SIMA (~04:00 e ~11:00) estiver rodando, então o painel nunca fica zerado.

## Instalar no servidor

```bash
cd /opt/portal-nucleo && git pull
# 1) O Caddy do servidor-voz passa a encaminhar /paineis/ para este serviço
cd servidor-voz && docker compose up -d
# 2) O serviço de dados
cd ../servidor-paineis
cp .env.example .env   # preencher a chave pública do Supabase e a senha do painel_leitura
docker compose up -d --build
curl -k https://localhost/paineis/saude
```

Atualizar: `git pull && docker compose up -d --build`. Limite de memória: 256 MB.

## Testar localmente

`testes/dados_exemplo.sql` cria um schema `painel` com dados **fictícios** num PostgreSQL de teste.

```bash
pip install -r requirements.txt
PAINEIS_SEM_LOGIN=1 BANCO_URL=postgresql://usuario@localhost/teste uvicorn app.main:app --port 8765
```

Sem Supabase configurado, o portal abre o painel em modo demonstração, com números fictícios.
