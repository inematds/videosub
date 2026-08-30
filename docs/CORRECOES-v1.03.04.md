# Correções da validação real — v1.03.04

Versão no padrão `v1.xx.yy`: três recursos acumulados e quatro correções acumuladas nesta linha principal.

## Bugs corrigidos

1. `AGNES_BASE_URL` agora aceita tanto a raiz `https://apihub.agnes-ai.com` quanto a forma terminada em `/v1`, sem produzir o caminho inválido `/v1/v1/...`.
2. A resposta assíncrona da Agnes agora é filtrada pelo tipo de mídia. A imagem de entrada não pode mais ser salva como `.mp4`; o download rejeita conteúdo incompatível e arquivos vazios.
3. As legendas verticais foram reduzidas, segmentadas em blocos menores e receberam margens laterais para não dominar nem ultrapassar o quadro.
4. A montagem agora mapeia explicitamente o vídeo da Agnes e o áudio do ElevenLabs, impedindo que a trilha embutida pela Agnes substitua a narração.

## Validação real executada

- Codex OAuth: roteiro factual com sete cenas.
- Agnes Image: imagem vertical gerada, baixada e inspecionada.
- Agnes Video: MP4 H.264 válido, 448×832, 24 fps e duração de aproximadamente 5 segundos.
- ElevenLabs: voz real validada com áudio MP3 audível.
- Pipeline completo: sete cenas renderizadas em um MP4 vertical final com voz, animação e legendas.
