# Storyboard semântico e revisão por clipe — v1.08.00

## Objetivo

Cada clipe de uma mesma cena passa a representar exclusivamente o trecho de locução que ocupa seu tempo. A continuidade entre os planos é estética; assunto, ação, ambiente e enquadramento precisam variar para evitar a repetição de uma mesma imagem durante toda a narração.

## Novo fluxo

O pipeline ganhou a etapa **Storyboard**, posicionada entre Imagem e Movimento:

1. a duração real da voz define quantos clipes o perfil Agnes comporta;
2. a locução é dividida em trechos temporais completos;
3. o Codex cria uma intenção visual em português e um prompt visual em inglês para cada trecho;
4. Agnes Imagem gera um quadro específico para cada plano;
5. a execução para para o operador revisar todos os quadros;
6. somente após aprovação, Agnes Video anima os quadros existentes.

Gerar ou refazer um quadro não envia uma tarefa de vídeo. Refazer apenas **Movimento em diante** preserva o storyboard aprovado.

## Regras editoriais

- o quadro deve explicar o conteúdo falado, não apenas preencher tempo;
- assunto principal, ação, ambiente e câmera não se repetem dentro da cena;
- paleta, iluminação e materiais mantêm continuidade visual;
- cérebro brilhante, robô genérico, cristal, esfera flutuante e abstrações decorativas são proibidos quando não forem exigidos pela locução;
- imagens não contêm texto, interface, marca ou logotipo;
- composição vertical exige sujeitos em pé, gravidade correta, horizonte nivelado e área central segura.

O planejador determinístico usado em modo simulado aplica padrões de câmera distintos. No modo real, o Codex produz o storyboard estruturado com as mesmas restrições.
O servidor valida a unicidade dos quatro eixos antes de gerar imagens, solicita uma segunda versão automaticamente quando encontra repetição e interrompe a etapa sem enviar animações se a repetição persistir.

## Interface e render

- cada plano mostra miniatura, trecho falado, duração e intenção visual;
- qualquer quadro pode ser visto no monitor antes de existir vídeo;
- quadro e animação possuem ações separadas por clipe;
- os formatos aparecem com destino explícito: horizontal 16:9, vertical 9:16 e quadrado 1:1;
- as legendas finais usam DejaVu Sans Bold, tamanho legível, fundo semitransparente e margens seguras maiores, especialmente em 9:16.

## Persistência e compatibilidade

A tabela `scene_clips` recebe o campo `visual_intent` por migração automática. Projetos antigos continuam abrindo; clipes antigos recebem uma descrição de compatibilidade até o storyboard ser recriado.

## Provedores usados

- **Codex OAuth:** decomposição semântica e prompts distintos;
- **Agnes Imagem:** quadros revisáveis por trecho;
- **Agnes Video 2.5 Flash:** animação somente após aprovação;
- **ElevenLabs:** duração real da narração que governa a divisão;
- **FFmpeg:** montagem, mixagem e tipografia das legendas.
