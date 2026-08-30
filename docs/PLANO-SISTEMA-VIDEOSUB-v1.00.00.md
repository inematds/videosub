# Plano do Sistema VideoSub

**Versão do documento:** `v1.00.00`  
**Status:** planejamento inicial  
**Data-base da análise:** 30 de agosto de 2026  
**Produto de referência:** [Vsub](https://vsub.io/)  
**Escopo:** plataforma SaaS para criação, edição, renderização e publicação de vídeos faceless com IA

> Este documento descreve um produto similar em categoria e fluxo ao Vsub. Ele não autoriza copiar marca, identidade visual, código, textos, templates proprietários ou outros ativos protegidos.

## 1. Regra de versionamento do documento

O relatório usa o formato `vX.XX.YY`:

| Parte | Significado | Quando incrementar | Exemplo |
|---|---|---|---|
| `X` | versão principal | mudança estrutural, de estratégia ou arquitetura incompatível | `v1.09.03` → `v2.00.00` |
| `XX` | recursos | inclusão ou alteração relevante de funcionalidades planejadas | `v1.00.00` → `v1.01.00` |
| `YY` | correções | correção textual, esclarecimento ou ajuste que não adiciona recurso | `v1.01.00` → `v1.01.01` |

Regras complementares:

- O número principal permanecerá `v1` enquanto o produto mantiver a mesma visão e arquitetura-base.
- Ao incrementar `X`, `XX` e `YY` voltam para `00`.
- Ao incrementar `XX`, `YY` volta para `00`.
- Toda mudança deve ser registrada no histórico ao final deste arquivo.
- O nome do arquivo acompanha a versão vigente.
- Versões antigas devem ser preservadas quando houver mudança de `X`; alterações menores podem ser acompanhadas pelo Git.

## 2. Resumo executivo

O produto será um SaaS capaz de transformar roteiro, artigo ou narração em vídeo faceless editável e pronto para YouTube, TikTok, Instagram Reels e Shorts.

O núcleo não é apenas um gerador de vídeo. É uma orquestração de serviços que inclui:

1. entrada e preparação do roteiro;
2. divisão em cenas;
3. geração ou transcrição de voz;
4. criação de imagens;
5. animação opcional;
6. legendas sincronizadas;
7. edição por cena;
8. renderização;
9. cobrança por créditos;
10. armazenamento, download e publicação.

A estratégia recomendada é lançar primeiro o fluxo **roteiro/áudio → storyboard → vídeo ilustrado**, validar custo e qualidade e só depois adicionar clonagem de estilo, animação generativa ampla, API pública, MCP e automação de canais.

## 3. Funcionalidades observadas no produto de referência

As áreas públicas do Vsub indicam:

- geração de vídeo a partir de roteiro;
- uso de narração enviada pelo usuário;
- divisão automática do texto em cenas;
- geração de imagens por cena;
- estilos visuais prontos e personalizados;
- clonagem de aparência baseada em vídeo de referência;
- vozes sintéticas configuráveis;
- legendas e templates de legenda;
- edição/regeneração de cenas;
- animação opcional de imagens;
- renderização assíncrona;
- retomada a partir da etapa que falhou;
- vídeos verticais e horizontais;
- templates como documentário, stickman, quiz, Roblox rant e fake text;
- biblioteca de vídeos e séries;
- colaboração por workspace;
- agendamento e contas sociais;
- cobrança por assinatura e créditos;
- API HTTP, webhooks e servidor MCP.

Referências públicas consultadas:

- [Página principal](https://vsub.io/)
- [Preços](https://vsub.io/pricing)
- [Documentação da API](https://vsub.io/docs/api)
- [AI Video V3](https://vsub.io/docs/api/ai-videos-v3)
- [Status de vídeos](https://vsub.io/docs/api/videos)
- [MCP](https://assets.vsub.io/docs/api/mcp)

Detalhes internos do Vsub que não são públicos não devem ser tratados como fatos. As decisões de arquitetura deste documento são recomendações independentes.

## 4. Proposta de produto

### 4.1 Posicionamento

Plataforma brasileira para transformar roteiro, áudio ou conteúdo escrito em vídeos faceless ilustrados, narrados, legendados e prontos para publicação.

Possíveis diferenciais:

- experiência inteiramente em português;
- vozes PT-BR selecionadas por caso de uso;
- templates voltados ao público brasileiro;
- cobrança em reais e suporte a Pix;
- geração de títulos, descrições, thumbnails e hashtags;
- operação simples para criadores sem experiência em edição;
- automação para agências e canais de alto volume;
- API e MCP em etapas posteriores.

### 4.2 Promessa do MVP

> Cole um roteiro ou envie uma narração e receba um vídeo vertical ou horizontal, ilustrado, legendado, editável e pronto para exportação.

## 5. Escopo funcional

### 5.1 MVP obrigatório

#### Conta e workspace

- login por Google e e-mail;
- onboarding;
- perfil do usuário;
- workspace individual ou de equipe;
- papéis de proprietário, administrador e editor;
- preferências de idioma e fuso horário;
- exportação e exclusão da conta.

#### Criação

- entrada por roteiro;
- upload de áudio próprio;
- título e idioma do projeto;
- proporções `9:16` e `16:9`;
- resoluções 720p e 1080p;
- seleção e preview de voz;
- velocidade e expressividade da voz;
- seleção de template visual;
- ativação e estilo das legendas;
- estimativa de duração, custo e créditos antes de iniciar.

#### Templates iniciais

1. documentário ilustrado;
2. stickman;
3. história sombria;
4. lista/ranking;
5. quiz.

Cada template deve versionar:

- proporção e resolução;
- paleta e tipografia;
- prompt visual-base;
- regras de enquadramento;
- componentes de cena;
- transições;
- estilo de legenda;
- trilha e volume padrão;
- intro, outro e marca opcional;
- safe areas por rede social.

#### Storyboard/editor

- cenas ordenadas;
- texto narrado por cena;
- duração e timestamps;
- imagem, vídeo ou fundo da cena;
- prompt visual editável;
- regeneração de imagem individual;
- edição de imagem por instrução;
- upload de mídia própria;
- reordenação, divisão e união de cenas;
- troca de voz, legenda e música;
- preview de baixa resolução;
- histórico básico de versões;
- salvamento automático.

#### Renderização

- MP4 com H.264 e AAC;
- 30 FPS no MVP;
- 720p e 1080p;
- preview de baixa resolução;
- progresso por etapa;
- retry a partir da etapa que falhou;
- preservação de áudio e imagens já concluídos;
- cancelamento seguro;
- thumbnail automática;
- download por URL assinada e temporária.

#### Cobrança

- plano gratuito limitado;
- assinatura mensal;
- pacotes adicionais de créditos;
- reserva antes do processamento;
- débito pelo consumo efetivo;
- estorno automático do que não foi consumido;
- ledger imutável;
- histórico detalhado por projeto e fornecedor;
- limites de concorrência por plano.

#### Administração

- gestão de usuários e workspaces;
- visualização de projetos e jobs;
- consumo por fornecedor e modelo;
- créditos, reservas e estornos;
- bloqueio e moderação;
- reprocessamento de etapas;
- gestão e versionamento de templates;
- feature flags;
- métricas de custo, qualidade e falhas.

### 5.2 Pós-MVP

- séries recorrentes;
- calendário editorial;
- publicação em YouTube, TikTok e Instagram;
- API pública e webhooks;
- MCP para agentes;
- colaboração avançada;
- clonagem de estilo;
- animação generativa por cena;
- marketplace de templates;
- white-label para agências;
- exportação 2K/4K e 60 FPS;
- aplicativo móvel.

## 6. Provedores previstos

Os provedores abaixo estão **previstos para avaliação**. Nenhum deve ficar acoplado diretamente às regras de negócio. Cada categoria terá uma interface interna e pelo menos uma alternativa viável.

### 6.1 Matriz de provedores

| Categoria | Principal previsto | Alternativas | Uso planejado | Fase |
|---|---|---|---|---|
| LLM/roteiro | OpenAI | Anthropic, Google Gemini | roteiro, cenas, prompts, metadados e moderação contextual | MVP |
| Transcrição | OpenAI Whisper/API de transcrição | Deepgram, AssemblyAI, Google Speech-to-Text | áudio próprio, timestamps e legendas | MVP |
| TTS | ElevenLabs | OpenAI TTS, Azure Speech, Google Cloud TTS | narração e vozes PT-BR | MVP |
| Imagens | OpenAI Images | Google Imagen, Black Forest Labs/FLUX, Stability AI, Replicate | arte por cena e edição de imagem | MVP |
| Animação imagem→vídeo | Runway | Kling, Luma, Google Veo, fal.ai, Replicate | animação opcional de cenas | pós-MVP |
| Treinamento de estilo | fal.ai ou Replicate | infraestrutura GPU própria, RunPod | LoRA/adaptador por workspace | pós-MVP |
| Moderação | OpenAI Moderation | AWS Rekognition, Google Vision SafeSearch | texto e mídia potencialmente abusivos | MVP |
| Pagamentos globais | Stripe | Paddle | assinatura, cartão, invoices e webhooks | MVP |
| Pagamentos Brasil | Mercado Pago | Pagar.me, Asaas | Pix, cartão nacional e boleto | pós-MVP próximo |
| E-mail transacional | Resend | Postmark, Amazon SES | login, conclusão, falha e cobrança | MVP |
| Autenticação | Auth.js | Clerk, Supabase Auth, Keycloak | Google OAuth, sessões e contas | MVP |
| Storage/CDN | Cloudflare R2 | Amazon S3 + CloudFront, Google Cloud Storage | uploads, intermediários e MP4 final | MVP |
| Banco de dados | PostgreSQL gerenciado | Neon, Supabase, AWS RDS | dados transacionais e ledger | MVP |
| Redis | Upstash Redis | Redis Cloud, AWS ElastiCache | cache, locks e filas auxiliares | MVP |
| Workflows | Temporal Cloud | BullMQ + Redis, Inngest | jobs longos, retry e compensações | MVP |
| Erros | Sentry | Rollbar | exceções de frontend, API e workers | MVP |
| Observabilidade | OpenTelemetry + Grafana | Datadog, New Relic | logs, métricas e traces | MVP |
| Analytics | PostHog | Plausible, Amplitude | funil, retenção e feature flags | MVP |
| Hospedagem web | Vercel | Cloudflare Pages, container próprio | frontend Next.js | MVP |
| API/workers | Google Cloud Run ou AWS ECS | Fly.io, Render, Kubernetes futuro | API e processamento em containers | MVP |
| Segredos | secret manager da nuvem | Doppler, Infisical | chaves e credenciais | MVP |
| Redes sociais | APIs oficiais | Ayrshare como agregador | publicação e agendamento | pós-MVP |

### 6.2 Estratégia de abstração

Interfaces internas previstas:

```text
LLMProvider
TranscriptionProvider
TTSProvider
ImageProvider
ImageAnimationProvider
ModerationProvider
StorageProvider
PaymentProvider
SocialPublishingProvider
```

Cada operação deve registrar:

- provedor e modelo;
- quantidade faturável;
- custo real;
- duração;
- request ID do provedor;
- projeto, cena e tentativa;
- resultado ou erro normalizado.

Critérios para selecionar o provedor definitivo:

- qualidade em português;
- consistência visual;
- latência;
- preço por unidade;
- limites e concorrência;
- estabilidade da API;
- licença de uso comercial;
- política de retenção dos dados;
- disponibilidade regional;
- suporte a webhooks e processamento assíncrono.

## 7. Ferramentas e tecnologias previstas

### 7.1 Aplicação

| Camada | Ferramenta prevista | Responsabilidade |
|---|---|---|
| Monorepo | pnpm + Turborepo | apps e pacotes compartilhados |
| Linguagem | TypeScript | frontend, API e workers de aplicação |
| Frontend | Next.js + React | site, dashboard e editor |
| UI | Tailwind CSS + shadcn/ui | componentes e design system |
| Estado remoto | TanStack Query | cache e comunicação com API |
| Estado do editor | Zustand | storyboard e edição local |
| Formulários | React Hook Form + Zod | validação no cliente e servidor |
| API | NestJS com Fastify | REST, auth, billing e webhooks |
| Documentação | OpenAPI/Swagger | contrato e SDK futuro |
| ORM | Prisma | acesso tipado ao PostgreSQL |
| Banco | PostgreSQL | entidades, billing e auditoria |
| Workflows | Temporal | pipeline durável de geração |
| Cache/locks | Redis | rate limit, cache e coordenação |
| Tempo real | SSE inicialmente | progresso dos jobs |

### 7.2 Mídia

| Ferramenta | Responsabilidade |
|---|---|
| FFmpeg/ffprobe | composição, codecs, áudio, concatenação e validação |
| Remotion | templates programáticos e renderização React quando necessário |
| Sharp | resize, crop, thumbnails e conversão de imagens |
| libass | renderização avançada de legendas ASS |
| Web Audio API | preview e controles simples de áudio no navegador |
| WaveSurfer.js | waveform e seleção temporal no editor |
| ExifTool opcional | inspeção e limpeza de metadados |

O FFmpeg será a base do render. Remotion deve ser usado onde componentes e animações declarativas trouxerem vantagem, não como dependência obrigatória de cada transformação.

### 7.3 Qualidade e desenvolvimento

| Ferramenta | Uso |
|---|---|
| Vitest | testes unitários |
| Playwright | testes ponta a ponta e regressão visual |
| Supertest | testes da API |
| Testcontainers | PostgreSQL/Redis reais em integração |
| ESLint + Prettier | qualidade e formatação |
| Husky + lint-staged | validações antes do commit |
| GitHub Actions | CI/CD |
| Docker | ambiente reproduzível e workers |
| Renovate ou Dependabot | atualização de dependências |
| k6 | testes de carga da API |
| Trivy | vulnerabilidades em imagens e dependências |

### 7.4 Operação

- infraestrutura como código com Terraform;
- ambientes local, staging e produção;
- deploy gradual com feature flags;
- backups automáticos e testes de restauração;
- logs estruturados em JSON;
- tracing distribuído do request ao render;
- alertas de custo, fila, erros e indisponibilidade de fornecedor;
- painel de status interno e, posteriormente, público.

## 8. Arquitetura recomendada

```text
Navegador / Editor
        │
        ▼
API, autenticação e billing
        │
        ├── PostgreSQL
        ├── Redis
        ├── Storage S3/R2
        ├── SSE de progresso
        └── Temporal
                │
                ├── roteiro e divisão em cenas
                ├── TTS ou transcrição
                ├── prompts e memória visual
                ├── geração de imagens
                ├── animação opcional
                ├── alinhamento e legendas
                ├── render com FFmpeg/Remotion
                ├── controle de qualidade
                └── cobrança, upload e notificação
```

Princípios:

- API não renderiza vídeo no processo web;
- toda etapa longa roda em worker;
- cada etapa é idempotente;
- arquivos intermediários têm checksum e versão;
- retry reutiliza resultados já válidos;
- falha de fornecedor pode acionar fallback controlado;
- custo máximo é reservado antes do job;
- jobs e cobranças permanecem auditáveis.

## 9. Pipeline de geração

### 9.1 Validação

- validar plano, limites e duração;
- moderar texto e uploads;
- calcular custo máximo;
- reservar créditos;
- criar projeto, versão e workflow;
- aplicar chave de idempotência.

### 9.2 Preparação

- normalizar roteiro;
- detectar idioma;
- gerar ou revisar estrutura;
- dividir em cenas;
- retornar JSON validado com narração, visual e duração.

### 9.3 Áudio

- gerar TTS em blocos ou receber áudio;
- transcrever quando necessário;
- obter timestamps por palavra;
- normalizar loudness;
- inserir pausas;
- compor a faixa de narração.

### 9.4 Visuais

- combinar template, cena e memória de personagens;
- gerar prompts;
- produzir imagens;
- registrar modelo, seed e custo;
- permitir regeneração isolada;
- animar somente cenas selecionadas.

### 9.5 Legendas e composição

- quebrar legendas semanticamente;
- gerar ASS/SRT/VTT;
- respeitar safe areas;
- aplicar música e ducking;
- compor imagens, movimentos, transições e overlays;
- renderizar preview e arquivo final.

### 9.6 Controle de qualidade e finalização

- validar streams, codec, duração e resolução;
- detectar frames vazios;
- garantir cobertura de áudio e mídia;
- gerar thumbnail;
- publicar o arquivo em storage;
- confirmar cobrança e estornar reserva excedente;
- emitir notificação e webhook assinado.

## 10. Clonagem de estilo

### 10.1 Versão leve

- extrair frames representativos;
- remover duplicados;
- analisar paleta, textura, composição e iluminação;
- identificar personagens e elementos recorrentes;
- criar um perfil de estilo em JSON;
- gerar prompts-base;
- produzir imagens de teste para aprovação.

Essa abordagem não treina um modelo e deve ser lançada primeiro.

### 10.2 Versão avançada

- criar dataset autorizado;
- selecionar e descrever frames;
- treinar LoRA/adaptador isolado por workspace;
- avaliar consistência;
- versionar modelo e dataset;
- permitir exclusão completa;
- operar fila de GPU;
- registrar consentimento e direitos do usuário.

## 11. Modelo de dados inicial

Entidades previstas:

```text
users
accounts
sessions
workspaces
workspace_members
plans
subscriptions
credit_wallets
credit_reservations
credit_ledger
projects
project_versions
scenes
scene_assets
templates
template_versions
art_styles
style_training_jobs
voices
caption_styles
media_assets
generation_jobs
workflow_steps
renders
provider_usage
api_keys
webhooks
webhook_deliveries
social_accounts
scheduled_posts
audit_logs
notifications
```

Toda entidade de cliente deve carregar `workspace_id`. O ledger de créditos será append-only: correções geram movimentos compensatórios, nunca alteração de registros passados.

## 12. API inicial

```text
POST   /v1/projects
GET    /v1/projects
GET    /v1/projects/:id
PATCH  /v1/projects/:id
DELETE /v1/projects/:id

POST   /v1/projects/:id/generate
POST   /v1/projects/:id/render
GET    /v1/jobs/:id
POST   /v1/jobs/:id/retry
POST   /v1/jobs/:id/cancel

GET    /v1/projects/:id/scenes
PATCH  /v1/scenes/:id
POST   /v1/scenes/:id/regenerate-image

POST   /v1/uploads/presign
GET    /v1/templates
GET    /v1/voices
GET    /v1/caption-styles

GET    /v1/workspace
GET    /v1/workspace/credits
GET    /v1/workspace/credit-ledger
```

Requisitos:

- tokens armazenados como hash;
- escopos por chave;
- `Idempotency-Key` em operações de escrita;
- rate limiting;
- paginação;
- URLs assinadas;
- webhooks assinados, repetíveis e auditáveis;
- versionamento público da API.

## 13. Custos e créditos

Fórmula-base:

```text
custo do vídeo =
  LLM
  + transcrição/TTS
  + quantidade de imagens
  + segundos de animação
  + CPU/GPU de render
  + armazenamento
  + tráfego
```

Metas:

- custo variável abaixo de 25% a 35% da receita;
- preview de baixo custo;
- animação cobrada separadamente;
- margem para regenerações;
- limite de concorrência por plano;
- alerta quando o custo de um job divergir do estimado.

Faixas iniciais de planejamento, ainda não contratuais:

- infraestrutura sem consumo de IA: US$ 300–1.000/mês;
- beta com fornecedores de IA: US$ 1.500–6.000/mês;
- equipe de 3 a 5 pessoas por 4 a 5 meses para um MVP comercial;
- animação generativa ampla pode multiplicar várias vezes o custo por minuto.

O orçamento definitivo depende de benchmarks com os modelos escolhidos.

## 14. Segurança, LGPD e direitos

- criptografia em trânsito e repouso;
- URLs temporárias e assinadas;
- segredo fora de código e logs;
- isolamento de workspaces no backend;
- auditoria de ações sensíveis;
- backups e restauração testada;
- política de retenção;
- exportação e exclusão de dados;
- consentimento para voz ou estilo personalizado;
- confirmação de direitos sobre referências e uploads;
- moderação de texto, imagem, áudio e vídeo;
- processo de denúncia e remoção;
- prevenção de impersonação, fraude e exploração infantil;
- termos específicos para conteúdo gerado por IA.

Remoção de logos ou marcas d'água não está prevista no MVP devido ao risco de abuso.

## 15. Testes e critérios de qualidade

### Testes

- unitários de billing, duração e permissões;
- integração de cada provedor;
- workflows com falhas simuladas;
- idempotência e concorrência;
- reservas, débitos e estornos;
- segurança entre workspaces;
- contratos de API;
- regressão visual dos templates;
- sincronização de voz e legenda;
- arquivos corrompidos e codecs incomuns;
- carga de API e filas;
- retry após reinício de worker.

### Critérios iniciais

- mais de 60% dos projetos iniciados chegam à exportação;
- menos de 5% de falhas definitivas;
- nenhuma cobrança duplicada em retry;
- primeiro vídeo curto estático em menos de 15 minutos em operação normal;
- todos os passos e custos auditáveis;
- margem bruta superior a 65% após estabilização.

## 16. Roadmap

| Período | Entrega |
|---|---|
| Semanas 1–2 | protótipo técnico, benchmarks de IA, UX e custo por minuto |
| Semanas 3–5 | autenticação, workspace, banco, storage, dashboard e CI/CD |
| Semanas 6–9 | cenas, TTS, imagens, legendas e workflow resiliente |
| Semanas 10–13 | storyboard, edição, preview e render 720p/1080p |
| Semanas 14–16 | billing, créditos, administração, segurança e observabilidade |
| Semanas 17–18 | beta fechado, métricas, correções e lançamento controlado |
| Meses 5–7 | API, séries, calendário, publicação e equipes |
| Meses 7–9 | clonagem de estilo, animação, MCP e marketplace |

## 17. Decisões a validar antes da implementação

1. Público inicial: criador individual, agência ou ambos.
2. Prioridade: vídeos curtos, longos ou um formato por lançamento.
3. Provedor de imagem com melhor relação custo/consistência.
4. Provedor de voz com melhor PT-BR.
5. Temporal Cloud ou BullMQ no MVP.
6. Cloud Run ou ECS para API e workers.
7. Stripe apenas ou Stripe mais Pix desde o lançamento.
8. Remotion combinado com FFmpeg ou pipeline predominantemente FFmpeg.
9. Limites do plano gratuito.
10. Política de retenção de arquivos intermediários.

## 18. Ordem de execução recomendada

1. medir qualidade e custo com pipeline manual;
2. criar cinco templates excelentes;
3. implementar workflow idempotente e retomável;
4. entregar storyboard editável;
5. concluir créditos e cobrança;
6. lançar beta;
7. adicionar API e publicação social;
8. implementar clonagem leve de estilo;
9. adicionar treinamento, animação avançada e MCP.

## 19. Histórico de versões

| Versão | Data | Tipo | Alterações |
|---|---|---|---|
| `v1.00.00` | 2026-08-30 | inicial | criação do relatório, arquitetura, roadmap, provedores e ferramentas previstas |

