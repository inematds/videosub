# Catálogo de Provedores e Ferramentas — VideoSub

**Versão:** `v1.01.00`  
**Status:** catálogo de planejamento; nenhuma contratação está implícita

## 1. Provedores escolhidos para o MVP local

| Capacidade | Escolha inicial | Configuração |
|---|---|---|
| LLM | Codex OAuth local | `codex login` + `@openai/codex-sdk` |
| Imagens | Agnes AI | `agnes-image-2.1-flash` |
| Vídeos | Agnes AI | `agnes-video-v2.0` |
| Voz | ElevenLabs | modelo/voz definidos no `.env` |
| Render | FFmpeg | executável local |
| Banco | SQLite | arquivo local |
| Arquivos | filesystem | `./storage/projects` |

## 2. Provedores previstos para evolução

| Categoria | Principal previsto | Alternativas | Momento |
|---|---|---|---|
| LLM geral | OpenAI Responses API | Anthropic, Gemini | quando sair do modo local |
| Transcrição | OpenAI | Deepgram, AssemblyAI, Google STT | upload de áudio |
| TTS | ElevenLabs | OpenAI TTS, Azure Speech, Google TTS | MVP e produção |
| Imagens | Agnes no MVP | OpenAI Images, Imagen, FLUX, Stability, Replicate | benchmark/fallback |
| Imagem→vídeo | Agnes no MVP | Runway, Kling, Luma, Veo, fal.ai, Replicate | benchmark/fallback |
| Treinamento de estilo | fal.ai ou Replicate | RunPod/GPU própria | pós-MVP |
| Moderação | OpenAI Moderation | AWS Rekognition, Google Vision | antes de uso público |
| Pagamento global | Stripe | Paddle | SaaS online |
| Pagamento Brasil | Mercado Pago | Pagar.me, Asaas | SaaS online/Pix |
| E-mail | Resend | Postmark, Amazon SES | SaaS online |
| Autenticação do SaaS | Auth.js | Clerk, Supabase Auth | SaaS online |
| Storage/CDN | Cloudflare R2 | S3/CloudFront, Google Cloud Storage | SaaS online |
| PostgreSQL | serviço gerenciado | Neon, Supabase, RDS | SaaS online |
| Redis | Upstash | Redis Cloud, ElastiCache | filas/cache online |
| Workflows | Temporal Cloud | BullMQ, Inngest | processamento distribuído |
| Erros | Sentry | Rollbar | MVP e produção |
| Observabilidade | OpenTelemetry + Grafana | Datadog, New Relic | produção |
| Analytics | PostHog | Plausible, Amplitude | beta |
| Frontend | Vercel | Cloudflare Pages, containers | deploy futuro |
| API/workers | Cloud Run ou ECS | Fly.io, Render, Kubernetes | deploy futuro |
| Segredos | secret manager da nuvem | Doppler, Infisical | produção |
| Publicação social | APIs oficiais | Ayrshare | pós-MVP |

## 3. Ferramentas do MVP local

| Área | Ferramentas |
|---|---|
| Monorepo | pnpm workspaces |
| Web | React, Vite, TypeScript |
| UI | Tailwind CSS, shadcn/ui |
| API | Fastify, Zod |
| Persistência | SQLite, Drizzle ORM |
| LLM | Codex CLI, Codex SDK |
| Imagem/vídeo | Agnes REST API |
| Voz | ElevenLabs REST API |
| Mídia | FFmpeg, ffprobe, Sharp, libass |
| Estado remoto | TanStack Query |
| Estado local | Zustand quando necessário |
| Testes | Vitest, Playwright, Supertest |
| Qualidade | ESLint, Prettier |
| Logs | Pino |

## 4. Interfaces para evitar acoplamento

```text
LLMProvider
TranscriptionProvider
TTSProvider
ImageProvider
VideoProvider
MediaRenderer
StorageProvider
```

O código de projeto e cenas depende dessas interfaces, não do formato bruto de cada API. Assim, Agnes ou Codex poderão ser substituídos sem reescrever a interface e o pipeline.

## 5. Política de credenciais

- `.env` real nunca entra no Git;
- `.env.example` contém apenas nomes e valores não secretos;
- Codex OAuth permanece no armazenamento gerenciado pelo Codex;
- o sistema verifica a sessão com `codex login status`;
- tokens não aparecem em logs ou erros;
- arquivos de resultado não guardam headers de autenticação;
- cada provedor terá timeout e mensagens de configuração próprias.

## 6. Critérios de avaliação de provedor

- qualidade final;
- consistência entre cenas;
- qualidade PT-BR;
- custo por minuto de vídeo concluído;
- latência e taxa de falha;
- limites de concorrência;
- licença comercial;
- retenção e uso dos dados;
- estabilidade e clareza da API;
- suporte a seed, referência e edição;
- capacidade de retry idempotente.

## 7. Histórico

| Versão | Data | Alteração |
|---|---|---|
| `v1.01.00` | 2026-08-30 | catálogo separado e seleção dos provedores do MVP local |

