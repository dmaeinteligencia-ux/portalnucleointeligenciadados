# Serviço de voz do Portal do Núcleo

Reconhece os comandos de voz do portal ("Sane, abrir Agenda de Lavagem") num servidor da rede interna.

- **Vosk** (modelo pequeno em português), limitado às frases de comando que o portal envia. Leve: ~300 MB de memória, sem GPU.
- O áudio chega do navegador por WebSocket, é reconhecido em memória e descartado. Nada é gravado.
- Só atende quem está logado no portal (o token do Supabase é conferido em `/auth/v1/user`) e só aceita o site do portal (Origin).
- **Caddy** cuida do HTTPS na porta 443 com certificado próprio (`tls internal`).

## Instalar

No servidor (Ubuntu com Docker):

```bash
git clone https://github.com/dmaeinteligencia-ux/portalnucleointeligenciadados.git /opt/portal-nucleo
cd /opt/portal-nucleo/servidor-voz
cp .env.example .env    # preencher SUPABASE_CHAVE_PUBLICA (a mesma chave publishable do portal)
docker compose up -d --build
curl -k https://localhost/saude
```

Atualizar: `git pull && docker compose up -d --build`.

## Confiar no certificado nos computadores que usam o portal

O Caddy cria uma autoridade certificadora própria. Exporte o certificado raiz:

```bash
docker compose cp https:/data/caddy/pki/authorities/local/root.crt ./voz-nucleo-raiz.crt
```

Em cada PC com Windows (Chrome e Edge usam o repositório do Windows), no PowerShell:

```powershell
certutil -user -addstore Root .\voz-nucleo-raiz.crt
```

Confirme a janela de segurança. Depois, abra `https://172.22.1.200/saude` no navegador: deve aparecer `{"ok":true,...}` sem aviso.
Se a TI tiver uma autoridade certificadora interna, troque `tls internal` no `Caddyfile` pelo certificado dela e pule este passo.

## No portal

O botão de microfone fica no topo. Ele só acende quando o portal consegue falar com este serviço (rede do DMAE ou VPN).
Na primeira vez, o Chrome/Edge pedem permissão para o microfone e, nas versões novas, para acessar a rede local.

- A escuta liga sozinha ao abrir o portal, se o microfone já foi permitido antes neste navegador. Desligar pelo botão (ou "Sane, parar de ouvir") desliga também o modo automático até ligar de novo pelo botão. Se o navegador segurar o áudio até a primeira interação, ela começa no primeiro clique ou tecla.
- Clique no microfone para ligar a escuta e diga **"Sane, abrir Agenda de Lavagem"**.
- **Ctrl+Espaço** liga e aceita o próximo comando sem precisar dizer "Sane".
- Comandos: abrir/abre/mostrar/usar *aplicação* (opcional "em nova aba"), início, aplicações, administração, voltar, que horas são, parar de ouvir, sair do portal.
- Endereço do serviço: `VITE_VOZ_URL` na Vercel (padrão `https://172.22.1.200`).

## Inteligência artificial (Gemini)

Opcional. Quando o pedido depois de "Sane" não é um comando conhecido ("Sane, abre o sistema da frota",
"Sane, quais sistemas temos?"), o portal pede ao serviço que mande **só aquele trecho de áudio** (até 15 s, em memória)
ao Gemini, junto com a lista de aplicações. O Gemini devolve a ação (abrir, ir, voltar…) ou uma resposta curta, que o
portal fala. Fora isso, nenhum áudio sai do servidor. Limite de 60 pedidos por sessão.

Para ligar, crie a chave em https://aistudio.google.com/apikey e grave no servidor sem mostrar na tela:

```bash
read -s -p 'Chave do Gemini: ' K && echo && echo GEMINI_API_KEY=$K >> /opt/portal-nucleo/servidor-voz/.env
docker compose up -d voz
curl -sk https://localhost/saude   # deve mostrar "gemini": true
```

No plano gratuito, o Google pode usar os dados enviados para melhorar os produtos dele.

## Voz falada (Piper)

As respostas são faladas com a voz "faber" (masculina, pt-BR) do [Piper](https://github.com/rhasspy/piper), gerada
aqui mesmo no servidor, sem internet e sem custo (cerca de 2 s por frase, ~250 MB de memória). O portal pede a fala
pelo mesmo WebSocket já autenticado. Se o modelo não estiver disponível ou a síntese falhar, o portal usa a voz do
navegador. Para trocar de voz, mude `FALA_URL` no `app/Dockerfile` (vozes pt-BR: cadu, edresson, faber, jeff).

## Vocabulário

O modelo pequeno não conhece todas as palavras (por exemplo, "ouvidoria"). Palavras desconhecidas são ignoradas pelo
reconhecedor. Para esses casos, `SINONIMOS` em `src/lib/voz.js` troca a palavra por outra parecida que o modelo conhece
("ouvidoria" → "ouvidor"). A palavra de ativação é `PALAVRA` no mesmo arquivo.
