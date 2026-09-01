# Provedores e ferramentas — v1.04.04

| Função | Provedor/ferramenta | Modelo ou contrato ativo | Recursos usados |
|---|---|---|---|
| Roteiro e edição | Codex OAuth local | modelo definido por `CODEX_MODEL` ou sessão ativa | roteiro estruturado, edição por prompt de cena/projeto |
| Voz | ElevenLabs | `eleven_multilingual_v2` | texto→voz, duração real por cena |
| Imagem | Agnes | `agnes-image-2.1-flash` | texto→imagem e quadro de referência |
| Vídeo | Agnes | `agnes-video-2.5-flash` | texto→vídeo, primeiro quadro, 4–12 s, 720P, até 5 referências |
| Persistência | SQLite | banco local | projetos, cenas, clipes, caminhos e estados |
| Composição | FFmpeg/ffprobe | H.264/AAC | duração, concatenação, legendas, mixagem e redução da música sob a voz |
| Interface | React + Vite | Exposure Grid | edição direta, prompt, pistas de áudio e painel de provedores |

## Perfis Agnes previstos

O adaptador decide o corpo da requisição pelo nome do modelo:

| Perfil | Duração | Geometria | Estratégia |
|---|---:|---|---|
| Agnes Video 2.5 Flash | 4–12 s inteiros | `aspect_ratio` + `720P` | divide pela duração da narração; envia `first_frame` quando existe imagem Agnes |
| Agnes Video 2.5 | 4–12 s inteiros | `aspect_ratio` + 720P/960P/2K | mesmo contrato, preparado para resolução superior |
| Agnes Video v2.0 | até 441 quadros no padrão `8n+1` | largura/altura + fps | converte segundos em quadros válidos |

O padrão atual é `agnes-video-2.5-flash`. A promoção/preço do provedor não é assumida pelo sistema; somente as capacidades técnicas fazem parte do perfil. Fontes consultadas: [modelos Agnes](https://github.com/AgnesAI-Labs/AgnesAI-Models), [contrato de integração 2.5](https://github.com/chaoliu615/dsh-agnes/blob/main/src/video.ts) e [comparação Video 2.5 Flash](https://video.lichuanyang.top/en/models/agnes-video-2-5-flash).

## Configuração

```dotenv
AGNES_VIDEO_MODEL=agnes-video-2.5-flash
AGNES_VIDEO_SECONDS=8
AGNES_MAX_CLIPS_PER_SCENE=4
```

As chaves continuam somente em `apps/server/.env`, ignorado pelo Git. O painel web mostra prontidão, modelos e capacidades, nunca o valor das credenciais.
