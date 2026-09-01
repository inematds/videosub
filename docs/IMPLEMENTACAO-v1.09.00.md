# Composição editorial vertical — v1.09.00

## Regra do formato 9:16

Projetos verticais passam a usar uma composição editorial fixa:

- canvas final de `1080×1920`;
- faixa superior de `1080×840` reservada para texto e legendas;
- imagem ou animação quadrada de `1080×1080` alinhada à base;
- separador visual entre texto e mídia;
- legendas alinhadas ao topo, dentro da área segura.

## Pipeline coerente

A regra não é apenas uma máscara no render:

1. o Codex planeja composições quadradas para os projetos 9:16;
2. Agnes Imagem recebe `1024×1024`;
3. Agnes Video recebe `aspect_ratio: 1:1`;
4. FFmpeg normaliza a mídia quadrada e monta o canvas vertical;
5. a interface reproduz a mesma divisão durante a revisão do storyboard.

Os formatos 16:9 e 1:1 mantêm o comportamento anterior. Projetos verticais antigos podem ser renderizados no novo layout, mas o melhor enquadramento é obtido ao refazer o storyboard para gerar mídias quadradas nativas.

## Validação

Os testes verificam que a mídia intermediária vertical é quadrada (`1080×1080`) e que a saída final permanece vertical (`1080×1920`).
