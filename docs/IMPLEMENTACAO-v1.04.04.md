# Implementação v1.04.04 — direção por prompt, trilhas e clipes adaptativos

## Entrega

A versão `v1.04.04` acrescenta quatro recursos ao produto local sem remover a edição direta existente:

1. edição por prompt da cena selecionada ou do roteiro completo, usando Codex OAuth;
2. linha de voz e linha de música separadas, com volume independente;
3. planejamento automático de um ou mais clipes a partir da duração real da narração;
4. painel de provedores com estado, modelos, recursos e estratégia de vídeo.

## Fluxo editorial

Depois de criar o roteiro, o operador pode escrever uma instrução e escolher o escopo `Cena selecionada` ou `Projeto inteiro`. Uma edição de narração invalida voz, clipes, legendas e render relacionados. Uma edição visual invalida imagem, clipes e render. A edição manual da cena continua disponível no monitor lateral.

## Sincronização e estratégia de clipes

A duração medida pelo `ffprobe` no arquivo produzido pelo ElevenLabs é a fonte de verdade da cena. O adaptador do provedor recebe essa duração e cria o plano de clipes.

- `agnes-video-2.5-flash`: contrato por segundos, clipes inteiros de 4 a 12 segundos, 720P e proporções permitidas pela API;
- `agnes-video-v2.0`: contrato por quadros, com cálculo no padrão `8n+1` e até 441 quadros;
- estratégia `provider`: divide a narração em até `AGNES_MAX_CLIPS_PER_SCENE` clipes;
- estratégia `single`: solicita um único clipe e o renderizador ajusta localmente a cobertura visual.

Cada clipe persiste modelo, provedor, prompt, posição, duração planejada, duração real, arquivo, estado e erro. Projetos antigos que possuam somente `video_path` continuam válidos.

## Áudio

A voz e a música aparecem como pistas distintas. A música é enviada pelo navegador como arquivo de áudio e armazenada somente no projeto local. Durante o render:

- a voz mantém a duração do vídeo;
- a música é repetida se for menor que o projeto;
- há entrada e saída suaves;
- a música sofre redução automática enquanto existe voz;
- `voiceVolume` e `musicVolume` permanecem nas configurações do projeto.

## Banco e API

A migração é aditiva: `projects` recebe `music_path` e `music_duration`; `scene_clips` guarda os clipes. Novas rotas:

- `POST /api/projects/:id/edit-prompt`;
- `POST /api/projects/:id/music`;
- `DELETE /api/projects/:id/music`.
- `POST /api/clips/:clipId/animate` para repetir somente um segmento.

`GET /api/health` expõe capacidades sem retornar credenciais.

## Validação

- typecheck de servidor e web;
- build de produção;
- 9 testes automatizados;
- render vertical H.264/AAC com legenda, voz e música;
- edição por prompt em modo de teste;
- planejamento de três clipes para uma narração de 26 segundos;
- inspeção visual desktop e mobile;
- detector Impeccable sem achados mecânicos.
