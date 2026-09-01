# Limite da espera de fila Agnes — v1.07.08

## Falha observada

A Agnes respondeu que sua fila estava ocupada e incluiu um cabeçalho `Retry-After` muito alto. O VideoSub respeitava esse valor sem impor um teto e podia ficar mais de uma hora aguardando antes da próxima tentativa. Nesse período não havia `video_id`: a geração ainda não tinha sido aceita pelo provedor.

## Correções

- a espera indicada por `Retry-After` agora é limitada a 12 segundos;
- continuam existindo no máximo cinco tentativas de envio;
- cada tentativa mantém o limite HTTP de 30 segundos;
- se a fila continuar indisponível, a etapa termina com o erro real e fica pronta para nova tentativa;
- enquanto ainda não existe `video_id`, a interface informa que está solicitando uma vaga na fila e que a tarefa não foi aceita;
- depois que existe `video_id`, a interface diferencia claramente a tarefa aceita do simples envio à fila.

## Contrato conferido no projeto `videos-agnes`

O envio do `agnes-video-2.5-flash` já usava corretamente `mode: "keyframe"`, `first_frame`, `seconds` como texto, `size: "720P"` e `aspect_ratio`. A consulta de status, porém, ainda usava o endpoint legado do v2.0. Foi corrigida para `GET /v1/videos/<task_id>`, conforme as medições em `videos-agnes/MODELOS.md` de 2026-09-01.

O intervalo de consulta também passou de 5 para 15 segundos, pois o projeto `videos-agnes` registra que as consultas de status compartilham o limite de taxa do provedor. O painel de provedores agora expõe endpoint, intervalo, medição de referência de 62 segundos, limite local de 10 minutos e a fonte dessas informações.

Durante a execução, a faixa de progresso informa a fase real, cena e clipe atuais, tempo decorrido, referência de duração e limite aplicado.

A execução presa foi interrompida sem iniciar automaticamente uma nova geração paga.
