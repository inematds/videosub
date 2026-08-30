# Plano do MVP Local — VideoSub

**Versão:** `v1.01.00`  
**Status:** pronto para implementação  
**Objetivo:** validar, ponto a ponto, o percurso do usuário desde o roteiro até o MP4 final  
**Ambiente:** somente local, usuário único, sem deploy e sem cobrança

## 1. Resultado esperado

Ao final deste MVP, uma pessoa acessará uma interface web local, criará um projeto, informará um roteiro e executará cada etapa separadamente:

1. estruturar o roteiro com LLM;
2. revisar as cenas;
3. gerar a voz;
4. gerar uma imagem para cada cena;
5. animar as imagens selecionadas;
6. gerar legendas;
7. montar a timeline;
8. renderizar o vídeo;
9. assistir e baixar o MP4 final.

Cada etapa deve mostrar entrada, saída, duração, status, erro e arquivos produzidos. O propósito inicial é avaliar a qualidade real, não esconder o processo em um botão único.

## 2. Escopo deliberadamente simples

Incluído:

- uma instalação local;
- um usuário, sem login da aplicação;
- interface web responsiva simples;
- projetos persistidos em SQLite;
- arquivos salvos no disco local;
- uma execução por vez;
- roteiro fornecido pelo usuário;
- vídeo `16:9` ou `9:16`;
- Codex autenticado via login do ChatGPT para o LLM;
- Agnes para imagem e vídeo;
- ElevenLabs para voz;
- FFmpeg para montagem e renderização;
- execução, retry e aprovação manual por etapa;
- logs e manifestos de artefatos.

Não incluído:

- cadastro, equipe ou permissões;
- pagamentos e créditos;
- storage em nuvem;
- publicação social;
- API pública;
- MCP;
- filas distribuídas;
- múltiplos workers;
- clonagem de voz;
- clonagem ou treinamento de estilo;
- editor de timeline livre;
- processamento simultâneo de vários vídeos.

## 3. Provedores iniciais

| Função | Provedor | Modelo/configuração inicial | Observação |
|---|---|---|---|
| LLM | Codex local | modelo configurável pelo Codex | autenticação com `codex login` |
| Imagem | Agnes AI | `agnes-image-2.1-flash` | texto→imagem e edição |
| Vídeo | Agnes AI | `agnes-video-v2.0` | imagem→vídeo, assíncrono |
| Voz | ElevenLabs | voz e modelo configuráveis | gerar MP3 por cena ou bloco |
| Render | FFmpeg local | H.264 + AAC | sem API externa |

### 3.1 Codex OAuth

O fluxo local previsto é:

```bash
codex login
codex login status
```

O backend utilizará `@openai/codex-sdk` no servidor local. A sessão é mantida pelo próprio Codex; tokens OAuth não serão copiados para o `.env`, banco ou logs.

A documentação oficial informa que Codex CLI aceita login pelo ChatGPT para uso local e que o SDK pode integrar Codex a aplicações internas. Também informa que, para chamadas gerais à API OpenAI, a credencial indicada continua sendo uma API key. Portanto:

- `codex_oauth` será o modo experimental principal deste protótipo local;
- o sistema verificará `codex login status` na inicialização;
- o adaptador LLM não acessará diretamente arquivos de credenciais;
- `openai_api` ficará previsto como fallback futuro;
- nenhuma tela web receberá ou exibirá token OAuth.

Fontes oficiais:

- [Autenticação do Codex](https://developers.openai.com/codex/auth)
- [Codex SDK](https://developers.openai.com/codex/sdk)
- [Codex App Server](https://developers.openai.com/codex/app-server)

### 3.2 Agnes

Configuração inicialmente planejada:

- base: `https://apihub.agnes-ai.com`;
- imagem: `POST /v1/images/generations`;
- vídeo: `POST /v1/videos`;
- consulta de vídeo: polling pelo `video_id`;
- imagem: `agnes-image-2.1-flash`;
- vídeo: `agnes-video-v2.0`.

O contrato exato será confirmado por smoke test, pois os modelos e limites podem mudar. A página oficial apresenta modelos de imagem e vídeo; a referência técnica encontrada detalha geração de imagem e processamento assíncrono de vídeo.

Fontes:

- [Agnes AI](https://agnes-ai.com/)
- [Referência comunitária da API Agnes](https://github.com/1038lab/Agnes-AI/blob/main/references/api.md)

### 3.3 ElevenLabs

O MVP usará uma voz definida no `.env`. A primeira implementação deve:

- gerar MP3;
- salvar a resposta original;
- validar duração com `ffprobe`;
- permitir ouvir antes de continuar;
- registrar caracteres enviados e tempo de resposta;
- aceitar retry sem regenerar outras etapas.

## 4. Arquitetura local

```text
Browser
   │
   ▼
React + Vite
   │ HTTP + polling
   ▼
Fastify / Node.js
   ├── SQLite
   ├── Job Runner local (concorrência 1)
   ├── Codex SDK / OAuth local
   ├── Agnes API
   ├── ElevenLabs API
   └── FFmpeg / ffprobe
            │
            ▼
       ./storage/projects
```

### Escolhas técnicas

| Camada | Escolha |
|---|---|
| Linguagem | TypeScript |
| Gerenciador | pnpm |
| Interface | React + Vite |
| Componentes | Tailwind CSS + shadcn/ui |
| Backend | Fastify |
| Validação | Zod |
| Banco | SQLite + Drizzle ORM |
| Jobs | runner local persistido no SQLite |
| Progresso | polling HTTP a cada 2 segundos |
| Mídia | FFmpeg, ffprobe e Sharp |
| LLM | `@openai/codex-sdk` |
| Testes | Vitest + Playwright |

Fastify e Vite mantêm o protótipo explícito: um servidor controla jobs longos e a interface apenas acompanha. Não usaremos Redis, Temporal ou Docker como requisito inicial.

## 5. Estrutura proposta

```text
videosub/
├── apps/
│   ├── web/                  # React/Vite
│   └── server/               # Fastify e Job Runner
├── packages/
│   ├── core/                 # tipos, schemas e regras
│   ├── providers/            # Codex, Agnes e ElevenLabs
│   └── media/                # FFmpeg, ffprobe e legendas
├── data/
│   └── videosub.sqlite
├── storage/
│   └── projects/
├── docs/
├── .env.example
├── package.json
└── pnpm-workspace.yaml
```

Artefatos de um projeto:

```text
storage/projects/<project-id>/
├── input/
│   └── script.txt
├── plan/
│   └── scenes.json
├── audio/
│   ├── narration.mp3
│   └── scene-001.mp3
├── images/
│   └── scene-001.png
├── clips/
│   └── scene-001.mp4
├── subtitles/
│   ├── captions.srt
│   └── captions.ass
├── renders/
│   ├── preview.mp4
│   └── final.mp4
├── logs/
└── manifest.json
```

## 6. Configuração `.env`

O repositório terá apenas `.env.example`. O `.env` real ficará ignorado pelo Git.

```dotenv
APP_PORT=3333
WEB_PORT=5173
DATA_DIR=./data
STORAGE_DIR=./storage
DATABASE_URL=file:./data/videosub.sqlite

LLM_PROVIDER=codex_oauth
CODEX_MODEL=
OPENAI_API_KEY=

AGNES_API_KEY=
AGNES_API_BASE=https://apihub.agnes-ai.com
AGNES_IMAGE_MODEL=agnes-image-2.1-flash
AGNES_VIDEO_MODEL=agnes-video-v2.0
AGNES_POLL_INTERVAL_MS=5000
AGNES_TIMEOUT_MS=900000

ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_MODEL_ID=eleven_multilingual_v2

FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
JOB_CONCURRENCY=1
LOG_LEVEL=info
```

Notas:

- OAuth do Codex não será armazenado no `.env`.
- `OPENAI_API_KEY` fica vazio e reservado para fallback.
- o servidor deve falhar com mensagem clara quando uma configuração obrigatória estiver ausente;
- segredos nunca devem aparecer em responses, manifests ou logs.

## 7. Modelo de dados mínimo

### `projects`

- `id`;
- `title`;
- `script`;
- `aspect_ratio`;
- `status`;
- `current_step`;
- `created_at`;
- `updated_at`.

### `scenes`

- `id`;
- `project_id`;
- `position`;
- `narration`;
- `visual_prompt`;
- `animation_prompt`;
- `duration_ms`;
- `image_path`;
- `audio_path`;
- `clip_path`;
- `status`.

### `jobs`

- `id`;
- `project_id`;
- `scene_id` opcional;
- `type`;
- `status`;
- `progress`;
- `attempt`;
- `input_json` sanitizado;
- `output_json` sanitizado;
- `error`;
- `started_at`;
- `finished_at`.

### `artifacts`

- `id`;
- `project_id`;
- `scene_id` opcional;
- `kind`;
- `path`;
- `mime_type`;
- `size_bytes`;
- `checksum`;
- `provider`;
- `model`;
- `created_at`.

## 8. Interface web

### Tela inicial

- lista de projetos;
- botão “Novo vídeo”;
- status e última etapa;
- abrir, duplicar ou excluir projeto.

### Novo projeto

- título;
- roteiro;
- proporção;
- duração estimada;
- voz;
- opção de animar todas, nenhuma ou cenas selecionadas.

### Workspace do projeto

Um stepper exibirá:

```text
Roteiro → Cenas → Voz → Imagens → Animação → Legendas → Render → Pronto
```

Cada etapa terá:

- status `pending`, `running`, `needs_review`, `completed` ou `failed`;
- botão executar;
- botão tentar novamente;
- entrada utilizada;
- resultado visual ou sonoro;
- duração e provedor;
- erro detalhado;
- botão aprovar e avançar.

### Storyboard

Cada card de cena mostrará:

- número;
- narração;
- prompt de imagem;
- prompt de movimento;
- duração;
- player de áudio;
- imagem;
- clip animado;
- botões editar, gerar e repetir.

### Resultado

- player do vídeo final;
- caminho local;
- download;
- resumo dos artefatos;
- tempos por etapa;
- quantidade de chamadas por provedor;
- botão renderizar novamente sem regenerar mídia.

## 9. Contrato do plano de cenas

O Codex deve retornar somente JSON validável:

```json
{
  "title": "Título",
  "language": "pt-BR",
  "scenes": [
    {
      "position": 1,
      "narration": "Texto narrado da cena.",
      "visualPrompt": "Descrição visual detalhada.",
      "animationPrompt": "Movimento sutil de câmera e elementos.",
      "estimatedDurationSeconds": 5
    }
  ]
}
```

O backend validará com Zod. Se a resposta falhar:

1. salvar resposta sanitizada no job;
2. tentar uma correção estruturada uma vez;
3. falhar de forma visível se continuar inválida;
4. permitir edição manual do JSON/cenas na interface.

## 10. Pipeline ponto a ponto

### P0 — diagnóstico local

Verificar:

- Node e pnpm;
- `codex login status`;
- FFmpeg e ffprobe;
- conexão Agnes;
- conexão ElevenLabs;
- diretórios graváveis.

Aceite: tela `/diagnostics` com todos os itens verdes ou instrução de correção.

### P1 — roteiro para cenas

- enviar roteiro ao adaptador Codex;
- exigir JSON;
- validar e persistir;
- mostrar cenas para revisão.

Aceite: cenas podem ser editadas e aprovadas sem gerar mídia.

### P2 — voz

- gerar áudio por cena inicialmente;
- concatenar em narração completa;
- medir duração real;
- atualizar duração das cenas;
- ouvir na interface.

Aceite: todos os áudios tocam e o `ffprobe` reconhece duração/codec.

### P3 — imagens

- gerar uma imagem por cena com Agnes;
- salvar localmente;
- criar thumbnail;
- permitir editar prompt e repetir apenas uma cena.

Aceite: todas as cenas aprovadas possuem imagem válida na proporção desejada.

### P4 — animação

- usar a imagem como entrada de image-to-video;
- registrar `video_id`;
- fazer polling até conclusão, falha ou timeout;
- baixar o clip;
- normalizar codec, dimensão e FPS.

Aceite: o clip toca localmente e sua duração é conhecida. A cena pode continuar estática se a animação falhar.

### P5 — legendas

- obter timing a partir das durações e texto;
- gerar SRT e ASS;
- aplicar estilo simples;
- permitir ativar/desativar.

Aceite: preview confirma sincronização aceitável. Alinhamento palavra a palavra fica fora do primeiro ciclo.

### P6 — timeline

- escolher clip animado quando existir;
- usar imagem estática com movimento Ken Burns nos demais casos;
- ajustar cada visual à duração do áudio;
- adicionar legendas;
- concatenar cenas.

Aceite: preview cobre 100% da narração sem tela preta.

### P7 — render final

- render H.264/AAC;
- validar streams;
- gerar thumbnail;
- registrar checksum e manifesto;
- mostrar no player.

Aceite: MP4 toca no navegador e em player externo, com áudio e duração corretos.

## 11. Estratégia de falhas e retry

- cada etapa cria um job independente;
- etapas concluídas nunca são repetidas automaticamente;
- retry cria nova tentativa e preserva a anterior;
- uma cena com falha não apaga as demais;
- polling Agnes deve ter backoff e timeout;
- downloads externos devem validar status, MIME e tamanho;
- render pode ser repetido sem usar APIs;
- reiniciar o servidor converte jobs `running` abandonados para `interrupted`;
- o usuário escolhe retomar ou cancelar.

## 12. Ordem de implementação

### Marco 1 — spikes isolados

Criar scripts de diagnóstico para:

1. Codex → JSON de cenas;
2. ElevenLabs → MP3;
3. Agnes → PNG;
4. Agnes → MP4 com polling;
5. FFmpeg → MP4 com imagem e áudio.

Não iniciar a interface completa antes de os cinco testes funcionarem.

### Marco 2 — fundação local

- workspace pnpm;
- Fastify;
- React/Vite;
- SQLite/Drizzle;
- diretórios e manifests;
- diagnósticos;
- `.env.example`.

### Marco 3 — projeto e cenas

- CRUD de projeto;
- adaptador Codex;
- schema de cenas;
- stepper;
- revisão manual.

### Marco 4 — mídia

- ElevenLabs;
- Agnes Image;
- Agnes Video;
- players e retry por cena.

### Marco 5 — composição

- SRT/ASS;
- timeline FFmpeg;
- preview;
- render final;
- página de resultado.

### Marco 6 — validação

- três roteiros de 30–60 segundos;
- um vídeo horizontal e dois verticais;
- teste com cenas estáticas;
- teste com algumas cenas animadas;
- medição de tempo, chamadas e qualidade;
- relatório de limitações antes de ampliar o produto.

## 13. Critério de conclusão do MVP

O MVP estará validado quando:

- uma instalação limpa puder ser configurada pelo `.env.example` e `codex login`;
- o diagnóstico detectar dependências e credenciais;
- um roteiro produzir cenas editáveis;
- voz, imagens e clips puderem ser aprovados individualmente;
- falhas puderem ser repetidas sem reiniciar todo o projeto;
- o FFmpeg produzir um MP4 final;
- o vídeo puder ser assistido e baixado pela interface;
- arquivos e decisões de cada etapa permanecerem auditáveis;
- três vídeos de teste forem concluídos do início ao fim.

## 14. Riscos conhecidos

| Risco | Tratamento inicial |
|---|---|
| Codex é orientado a tarefas de código | prompts curtos, JSON estrito e adapter substituível |
| OAuth Codex não é credencial de API geral | uso apenas local via SDK; fallback futuro por API key |
| Agnes mudar endpoint/modelo | configuração no `.env`, smoke test e adapter |
| geração de vídeo demorar ou falhar | polling, timeout e fallback para cena estática |
| voz não fornecer timing por palavra | legenda por cena no primeiro ciclo |
| processos longos interrompidos | jobs persistidos e retomada explícita |
| arquivos crescerem rapidamente | botão de limpeza e política local configurável |

## 15. Próxima versão prevista

`v1.02.00` poderá adicionar, somente após a validação do MVP:

- upload de áudio próprio;
- alinhamento palavra a palavra;
- música e ducking;
- múltiplas opções de imagem;
- templates visuais reutilizáveis;
- geração completa em um clique;
- relatório real de custo e qualidade por provedor.

## 16. Histórico

| Versão | Data | Alteração |
|---|---|---|
| `v1.01.00` | 2026-08-30 | plano do MVP local, integração Codex OAuth, Agnes, ElevenLabs e validação ponto a ponto |

