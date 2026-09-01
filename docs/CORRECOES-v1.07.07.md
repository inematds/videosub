# Progresso persistente e retomada Agnes — v1.07.07

## Falha observada

Uma geração de vídeo permaneceu visualmente em execução por muito tempo. Ao atualizar a página, a interface perdeu o acompanhamento e parecia que nada havia sido feito. No servidor, a operação continuava presa em consultas de estado à Agnes: cada consulta podia repetir respostas `503` e a conexão HTTP não tinha limite próprio de espera.

## Correções

- o identificador remoto `video_id` é salvo no SQLite assim que a Agnes aceita a tarefa;
- a interface consulta o projeto a cada 3 segundos enquanto há uma etapa em execução;
- cena, clipe e identificador da tarefa ativa ficam visíveis mesmo após atualizar a página;
- cada chamada HTTP à Agnes tem limite de 30 segundos;
- o acompanhamento de um clipe tem limite total de 10 minutos;
- se o limite total for atingido, o clipe fica retomável e preserva o `video_id`;
- ao retomar, o sistema consulta a mesma tarefa, sem enviar outra geração paga;
- a ação explícita de refazer um clipe limpa o identificador anterior e cria uma nova tarefa, como esperado.

## Limitação da execução anterior

A operação que revelou a falha começou na v1.07.06, antes da persistência do `video_id`. Por isso, aquela tarefa remota específica não pode ser identificada ou retomada depois que o servidor for reiniciado. Os quadros já gerados continuam preservados; as novas execuções passam a ter retomada segura.

Nenhuma nova geração paga é iniciada automaticamente durante atualização, diagnóstico ou reinicialização.
