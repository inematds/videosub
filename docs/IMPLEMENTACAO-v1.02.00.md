# Implementação local — v1.02.00

## Entregue

- aplicação React/Vite responsiva no conceito **Exposure Grid**;
- API Fastify e persistência SQLite local;
- planejamento de cenas com Codex SDK usando a sessão OAuth local no modo real, ou heurística local no modo simulado;
- voz com ElevenLabs;
- imagem e imagem→vídeo com Agnes;
- modo simulado para validar o produto sem chaves e sem consumo externo;
- legendas SRT e render H.264/AAC com FFmpeg;
- revisão por etapa, regeneração de imagem por cena e download do MP4;
- formatos 16:9, 9:16 e 1:1;
- testes, typecheck e build automatizados.

## Execução local

Na raiz do repositório:

```bash
cp .env.example apps/server/.env
pnpm install
pnpm dev
```

A interface de desenvolvimento fica em `http://localhost:5173` e encaminha `/api` e `/media` para a API em `http://localhost:3333`. O modo simulado vem ativado e ainda requer FFmpeg e FFprobe para produzir áudio, medir sua duração e renderizar o MP4.

Para servir a compilação web pela própria API:

```bash
pnpm build
pnpm start
```

Nesse caso, a interface fica em `http://localhost:3333` por padrão. A configuração completa está em [`.env.example`](../.env.example).

## Limites desta versão

- execução local e um operador;
- fila sequencial em processo, sem retomada automática após reiniciar durante uma chamada;
- edição textual de cenas e regeneração individual de voz ficam para o próximo recurso;
- APIs reais exigem chaves válidas; o OAuth do Codex vem de `codex login`;
- o contrato comunitário da Agnes deve ser confirmado com um smoke test quando a chave for configurada.

## Versionamento

Esta entrega adiciona um recurso completo ao plano anterior e recebe `v1.02.00`. Correções compatíveis avançam apenas `YY`; novos recursos avançam `XX`; uma quebra estrutural ou nova geração do produto avança `X`.

### Correções

- `v1.02.01` — corrige ações POST sem corpo que eram enviadas como JSON vazio e bloqueavam a criação do roteiro no Fastify.
- `v1.02.02` — torna a API compatível com clientes antigos em cache, corrige geração de voz pelo mesmo caso e isola o banco dos testes automatizados.
