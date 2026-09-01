# Progresso persistente da geração — v1.08.01

## Problema

O andamento aparecia somente em uma faixa próxima ao topo da bancada. Em telas menores ou após rolar a produção, o operador não conseguia confirmar o que o servidor estava fazendo.

## Correção

- o rodapé de comando permanece visível durante a rolagem;
- a operação mostra cena atual, clipe atual e quantidade total de clipes;
- são exibidos clipes concluídos, tempo decorrido e identificador da tarefa Agnes;
- cada célula de movimento apresenta `concluídos/total` e anima o indicador enquanto trabalha;
- o mesmo conteúdo permanece legível em tela móvel;
- a atualização continua automática e sobrevive ao refresh.

A correção altera somente a interface e pode ser publicada durante uma geração ativa sem reiniciar o servidor ou interromper a tarefa remota.
