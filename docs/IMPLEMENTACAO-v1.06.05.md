# Clipes orientados pela locução — v1.06.05

## Problema corrigido

O planejamento anterior criava prompts ligeiramente diferentes, mas enviava a mesma imagem inicial da cena para todos os clipes. Como a Agnes Video trabalha em modo keyframe, o resultado tendia a repetir a mesma composição.

## Nova estratégia

Ao refazer o movimento de uma cena, o VideoSub agora:

1. calcula quantos clipes a duração real da voz exige;
2. divide a narração em trechos contíguos e preserva a ordem da fala;
3. cria um prompt visual específico para cada trecho;
4. gera uma imagem Agnes exclusiva para cada clipe;
5. anima cada imagem com Agnes Video 2.5 Flash;
6. monta os clipes na ordem e mantém a voz contínua na prévia da cena.

O manifesto no inspetor mostra o trecho da locução associado a cada clipe e informa se ele já possui um quadro próprio. Assim, o operador consegue validar a relação entre fala e visual antes da montagem final.

## Compatibilidade

Clipes gerados em versões anteriores continuam preservados. Eles aparecem como **sem quadro próprio**. Para aplicar a nova estratégia, use **Refazer movimento** na cena; isso recria o conjunto de clipes com imagens específicas.

## Validação

- segmentação da narração coberta por teste automatizado;
- prompts distintos verificados para todos os clipes planejados;
- migração automática e não destrutiva das colunas de clipe;
- TypeScript, testes e build de produção validados.
