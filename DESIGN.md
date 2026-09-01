---
name: VideoSub Exposure Grid
description: Bancada editorial local que torna cada artefato da produção audiovisual visível e revisável.
colors:
  paper: "#f2efe5"
  paper-deep: "#e8e3d6"
  canvas: "#d9d5ca"
  ink: "#172327"
  muted: "#687276"
  registration-line: "#b9b7ae"
  process-blue: "#2d6f8e"
  process-blue-pale: "#d7e5e9"
  selection-orange: "#b94f2d"
  rail-graphite: "#1c292d"
typography:
  display:
    fontFamily: "Public Sans Variable, Segoe UI, sans-serif"
    fontSize: "clamp(30px, 5vw, 52px)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Public Sans Variable, Segoe UI, sans-serif"
    fontSize: "clamp(20px, 2vw, 28px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Public Sans Variable, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.55
  metadata:
    fontFamily: "ui-monospace, monospace"
    fontSize: "9px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  square: "0px"
  status: "50%"
spacing:
  compact: "8px"
  standard: "16px"
components:
  button-primary:
    backgroundColor: "{colors.process-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.square}"
    padding: "0 14px"
    height: "38px"
  field:
    backgroundColor: "#f7f2e7"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    padding: "0 10px"
    height: "36px"
---

# Sistema visual — Exposure Grid

## Overview

**Creative North Star: “Folha de exposição em uma bancada de produção”.**

A interface transforma o pipeline audiovisual em matéria visível: cenas ocupam colunas e roteiro, voz, quadro e clipe ocupam linhas persistentes. A linguagem é editorial, técnica e compacta, com papel quente, grafite e linhas de registro; controles avançados ampliam a bancada sem transformar a tela principal em um painel genérico de configurações.

O sistema privilegia inspeção, consequência e continuidade. Toda edição deve indicar seu escopo, artefatos dependentes e duração; estados de provedor e estratégia aparecem como informação operacional, nunca como decoração.

## Colors

Papel quente e grafite definem a bancada; azul indica processo, conclusão e ação principal; laranja marca seleção e entrada de nova produção.

- **Papel principal** (`#f2efe5`) e **papel secundário** (`#e8e3d6`): superfícies de trabalho.
- **Grafite** (`#172327`) e **grafite do trilho** (`#1c292d`): texto e infraestrutura lateral.
- **Linha de registro** (`#b9b7ae`): divisores de um pixel e estrutura da folha.
- **Azul de processo** (`#2d6f8e`) e **azul pálido** (`#d7e5e9`): progresso, pronto, foco e ação primária.
- **Laranja de seleção** (`#b94f2d`): seleção, nova produção e pontos de edição contextual.

## Typography

Public Sans Variable, servida localmente, cobre títulos e texto operacional. Metadados, códigos, durações, estados e rótulos curtos usam `ui-monospace` em caixa alta quando reforçam a leitura de ficha técnica. A escala é deliberadamente compacta na bancada; títulos maiores ficam reservados à entrada de projeto e ao nome da ordem de produção.

## Layout

No desktop, a superfície se divide em trilho de projetos, área central de produção e inspetor independente. A faixa de oito etapas preserva a sequência do conteúdo ao MP4; a matriz mantém cada cena na mesma coluna em todas as linhas de artefato.

O comando por prompt fica entre as etapas e o conteúdo, pois modifica o material contextual corrente. A linha de áudio fica depois da folha e antes da ação principal: blocos de voz têm largura proporcional à duração de cada cena, enquanto a música ocupa a duração total do vídeo. Essas pistas são uma visão de tempo e mixagem, não uma segunda matriz de cenas.

Em até `1040px`, o trilho vira barra superior, o seletor de projeto substitui a lista, a matriz continua rolável e o inspetor desce para depois da área de trabalho. Em até `600px`, prompt e pistas quebram em linhas, controles acionáveis preservam pelo menos `44px` de altura e o drawer lateral pode ocupar toda a largura.

## Elevation & Depth

Linhas de um pixel e diferenças tonais estruturam a interface. Sombras ficam restritas à folha inicial e ao drawer modal de provedores, onde comunicam sobreposição real; células, pistas e painéis em repouso permanecem planos.

## Shapes

Controles, campos, cartões e painéis são ortogonais, sem arredondamento decorativo. Círculos são reservados às lâmpadas e marcas de status. O monitor ganha moldura física escura; a matriz e as pistas usam bordas finas e recortes retangulares de ficha técnica.

## Components

- **`project-rail`:** projetos e diagnóstico resumido dos provedores; em telas estreitas, reduz-se a marca, nova produção e seletor atual.
- **`stage-strip`:** oito etapas fixas do conteúdo ao MP4, com azul para etapa ativa e concluída.
- **`prompt-command`:** edição contextual com escopo explícito de cena ou projeto. O texto auxiliar deve antecipar quais dependências serão recriadas; alterações destrutivas em todo o projeto exigem confirmação.
- **`exposure-grid`:** matriz canônica de cenas e artefatos. Selecionar qualquer célula mantém a mesma cena no inspetor.
- **`track-board`:** pistas proporcionais de voz e música, volumes legíveis, upload/troca/remoção de trilha e estado vazio explícito.
- **`inspector`:** monitor, roteiro, áudio, direção visual, edição da cena e manifesto dos clipes. O manifesto lista posição, duração, modelo, estado e regeneração individual sem competir com o monitor.
- **`provider-panel`:** drawer modal acionado pelo cabeçalho; reúne diagnóstico, capacidades e estratégia de clipes. Fecha por botão, scrim ou `Escape`, conserva as credenciais no servidor e mantém o foco inicial no fechamento.
- **`command-bar`:** única ação principal que aprova a etapa corrente e avança o pipeline.

## Do's and Don'ts

### Do

- **Do** manter escopo, consequências e estado ao lado de qualquer comando que invalide artefatos.
- **Do** representar tempo por proporção real nas pistas e duração numérica no manifesto.
- **Do** manter diagnóstico resumido no trilho e detalhes/configuração no drawer.
- **Do** preservar uma única ação primária de avanço, mesmo quando existirem ações locais de edição e regeneração.

### Don't

- **Don't** transformar prompt, pistas ou manifesto em etapas adicionais do pipeline.
- **Don't** misturar credenciais ou contratos de provedor à matriz de cenas.
- **Don't** usar sombras, arredondamentos ou cores extras para substituir hierarquia e linhas de registro.
- **Don't** ocultar a invalidação de dependências causada por edição de cena ou de projeto.

O tema permanece desacoplado dos provedores, banco e pipeline de mídia; mudanças visuais não devem alterar contratos de geração ou renderização.
