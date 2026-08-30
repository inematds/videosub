# Implementação real por provedor — v1.03.00

## Recurso

A versão `v1.03.00` remove o modo simulado global e torna os provedores independentes. O produto não apresenta mais placeholders como resultado real.

## Alterações

- Codex OAuth é o padrão para corrigir e desenvolver briefs curtos em roteiros de 4 a 8 cenas;
- ElevenLabs valida formato e conteúdo do áudio retornado;
- Agnes usa tamanhos suportados e preserva a URL original da imagem para imagem→vídeo;
- clips curtos podem repetir até o fim da narração sem truncar a voz;
- legendas são segmentadas e dimensionadas por 16:9, 9:16 ou 1:1;
- prompts técnicos não aparecem mais nos placeholders;
- interface distingue provedor real, simulado e não configurado;
- testes usam banco temporário isolado do banco do operador.

## Credenciais pendentes

O Codex já foi validado com OAuth local. O smoke test real de mídia exige `AGNES_API_KEY` e `ELEVENLABS_API_KEY` em `apps/server/.env`. As chaves não devem ser enviadas pelo chat nem adicionadas ao Git.
