# Recuperação da fila Agnes — v1.07.06

## Falha observada

A reconstrução de clipes recebeu `503` da Agnes com a mensagem `text image queue is full, please retry later`. O servidor apresentava a falha como **Internal Server Error** e deixava o primeiro clipe em estado de execução, bloqueando a retomada correta.

## Correções

- respostas `429`, `502`, `503` e `504` da Agnes agora têm até cinco tentativas automáticas com espera progressiva;
- se todas as tentativas falharem, a interface recebe o status e a mensagem reais do provedor;
- o clipe atual passa para `error`, em vez de permanecer indefinidamente como `working`;
- uma nova execução retoma clipes incompletos e preserva os que já ficaram prontos;
- clipes encontrados como `working` após uma reinicialização são marcados automaticamente como retomáveis.

Nenhuma chamada paga foi repetida durante o diagnóstico.
