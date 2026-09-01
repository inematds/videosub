# VideoSub local

MVP local que transforma conteúdo escrito em um vídeo MP4, mantendo cada etapa visível para revisão: roteiro, voz, imagens, movimento opcional, legendas e render.

## 📖 Guia de uso

Guia completo (landing + passo a passo): **https://inematds.github.io/videosub/guia/**

## Requisitos

- Node.js 22 ou superior;
- pnpm 10;
- FFmpeg e FFprobe no `PATH` (o FFmpeg precisa incluir o filtro `subtitles` para gravar legendas no vídeo);
- para o modo real: Codex CLI instalado e autenticado (`codex login`), além das chaves Agnes e ElevenLabs.

## Executar

```bash
cp .env.example apps/server/.env
pnpm install
pnpm dev
```

Abra `http://localhost:5173`. A configuração padrão usa Codex OAuth, ElevenLabs e Agnes reais. Preencha `apps/server/.env` antes de gerar voz ou imagens. Para testes explícitos, cada adaptador pode ser trocado individualmente para `mock`.

Com `HOST=0.0.0.0`, a aplicação compilada também fica disponível na rede local em `http://IP-DA-MAQUINA:3333`. Não encaminhe essa porta para a internet: esta versão não possui login de usuário.

O arquivo deve ficar em `apps/server/.env`, pois os scripts filtrados do pnpm executam o servidor a partir desse diretório. O OAuth do Codex não é salvo no `.env`; o servidor reutiliza a sessão local criada por `codex login`.

## Comandos

```bash
pnpm dev        # web + API em modo desenvolvimento
pnpm test       # testes da interface e API
pnpm typecheck  # validação TypeScript
pnpm build      # aplicação de produção
pnpm start      # serve API, mídia e web compilada
```

### Operação em segundo plano

```bash
./start.sh      # inicia e grava PID/log em .runtime/
./stop.sh       # encerra somente o processo registrado
./atualiza.sh   # atualiza, valida, compila e reinicia
```

O `atualiza.sh` cancela a atualização quando encontra alterações locais no Git, evitando sobrescrevê-las.

`pnpm start` não compila a aplicação. Para executar a versão de produção, rode primeiro `pnpm build`, depois `pnpm start`, e abra `http://localhost:3333` (ou a porta definida por `PORT`).

## Configuração

As variáveis disponíveis estão documentadas em [`.env.example`](./.env.example). As essenciais são:

- `CODEX_PROVIDER=codex`: usa o Codex OAuth real;
- `VOICE_PROVIDER=elevenlabs`: usa voz real da ElevenLabs;
- `IMAGE_PROVIDER=agnes` e `VIDEO_PROVIDER=agnes`: usam mídia real da Agnes;
- qualquer provedor pode receber `mock` somente em testes controlados;
- `PORT` e `WEB_ORIGIN`: porta da API e origem permitida pelo CORS no desenvolvimento;
- `DATA_DIR`: banco SQLite e mídias, resolvidos a partir da raiz do repositório;
- `CODEX_PATH` e `CODEX_MODEL`: executável e modelo opcionais do Codex;
- `AGNES_*` e `ELEVENLABS_*`: credenciais e modelos dos provedores reais.

O perfil recomendado de vídeo é `agnes-video-2.5-flash`. Ele trabalha com clipes de 4–12 segundos; o VideoSub usa a duração real da voz para decidir automaticamente quantos clipes gerar por cena. A interface também aceita música local, volumes separados e edição do roteiro por prompt.

Os projetos ficam em `data/videosub.db` e as mídias em `data/projects/<id>/`. O diretório inteiro é ignorado pelo Git.

Consulte [a documentação do projeto](./docs/README.md), [os provedores previstos](./docs/PROVEDORES-E-FERRAMENTAS-v1.01.00.md) e [o sistema visual](./DESIGN.md).
