# Tratamento da cota diária Agnes — v1.07.09

## Falha observada

A Agnes respondeu `429 Daily API usage limit reached` e informou a próxima liberação. O VideoSub tratava todo `429` como um limite temporário por minuto e repetia o envio cinco vezes, embora nenhuma tentativa pudesse funcionar antes da renovação diária.

## Correções

- o limite diário agora é distinguido do rate limit temporário;
- a falha diária interrompe imediatamente, sem repetir chamadas inúteis;
- o horário UTC informado pelo provedor é convertido para o horário de Brasília;
- a interface mostra o horário de liberação e o tempo aproximado restante;
- limites temporários por minuto continuam usando espera progressiva e limitada.
- o servidor pode selecionar com segurança um token numerado de um arquivo externo usando `AGNES_TOKEN_FILE` e `AGNES_TOKEN_SLOT`, sem copiar ou exibir a chave;
- o painel informa apenas o número do token ativo e sua origem, nunca o valor secreto.

Na ocorrência de 2026-09-01, a Agnes informou renovação em `2026-09-02 00:00 UTC`, equivalente a 01/09/2026 às 21:00 em Brasília.
