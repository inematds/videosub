# Inspeção de clipes e cena completa — v1.05.05

## Novo recurso

O monitor da cena agora permite selecionar e reproduzir cada clipe Agnes individualmente. Os mesmos comandos aparecem acima do monitor e no manifesto de clipes.

O comando **Cena completa** monta uma prévia local em MP4 com FFmpeg. A prévia:

- coloca todos os clipes prontos na ordem definida pela estratégia do provedor;
- distribui o tempo proporcionalmente à duração planejada de cada clipe;
- mantém a duração real da narração e inclui a voz completa;
- não executa novamente Agnes, ElevenLabs ou Codex;
- não altera a etapa atual nem substitui o vídeo final do projeto.

O comando fica indisponível enquanto faltar voz, visual ou algum dos clipes planejados. Isso evita apresentar uma montagem parcial como cena completa.

## Validação

- TypeScript verificado no servidor e na interface.
- 9 testes aprovados, incluindo a geração e exposição HTTP da prévia da cena.
- Builds de produção do servidor e da interface concluídos.
