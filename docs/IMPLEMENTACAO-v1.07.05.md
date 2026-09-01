# Reconstrução por camada — v1.07.05

## Novo comando

A bancada possui o controle **Refazer camada em diante**. Ele atua no projeto inteiro e permite escolher:

- **Roteiro em diante:** roteiro, vozes, imagens, clipes, legendas e render;
- **Voz em diante:** vozes, imagens, clipes, legendas e render;
- **Imagem em diante:** imagens, clipes, legendas e render;
- **Clipes em diante:** clipes, legendas e render;
- **Legendas em diante:** legendas e render;
- **Somente render:** apenas o MP4 final.

## Segurança e execução

Antes de começar, a interface informa as camadas afetadas, alerta sobre possíveis cobranças dos provedores e pede confirmação. A reconstrução executa uma etapa por vez e atualiza o projeto após cada resposta.

Se uma etapa falhar, a sequência para nesse ponto. Os resultados concluídos antes da falha permanecem disponíveis, permitindo inspeção e nova tentativa. Ao reconstruir o roteiro, os artefatos antigos são mantidos até o Codex devolver um novo plano válido.

Projetos sem animação pulam automaticamente a geração de clipes e seguem para legendas e render.

## Validação

- invalidação parcial coberta por teste de API;
- preservação das camadas anteriores verificada;
- sequências com e sem animação cobertas por testes da interface;
- 12 testes aprovados;
- TypeScript e build de produção validados.
