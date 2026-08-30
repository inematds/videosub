# Sistema visual — Exposure Grid

## Conceito

A interface se comporta como uma bancada de produção audiovisual. A metáfora principal é uma folha de exposição: cenas ocupam colunas e seus artefatos — roteiro, voz, quadro e clip — ocupam linhas. Isso torna progresso, lacunas e revisões imediatamente legíveis.

## Tokens

| Papel | Valor |
|---|---|
| Papel principal | `#f2efe5` |
| Papel secundário | `#e8e3d6` |
| Grafite | `#172327` |
| Linha de registro | `#b9b7ae` |
| Azul de processo | `#2d6f8e` |
| Laranja de seleção | `#d6633b` |

A tipografia é Public Sans Variable, servida localmente. Metadados usam o mesmo desenho em tamanho pequeno e aparência monoespaçada do sistema quando necessário.

## Regras de composição

- Linhas de um pixel estruturam a interface; sombras são reservadas à folha inicial.
- Azul significa processo, conclusão ou ação principal.
- Laranja marca seleção e entrada de nova produção.
- Cada cena conserva a mesma coluna ao atravessar as etapas.
- O monitor de inspeção permanece separado da matriz para não encobrir o estado do projeto.
- Em telas estreitas, a matriz continua rolável e o monitor desce para depois da folha.

## Componentes

- `project-rail`: projetos e diagnóstico dos provedores.
- `stage-strip`: oito etapas do conteúdo ao MP4.
- `exposure-grid`: matriz de cenas e artefatos.
- `inspector`: imagem/vídeo, narração, áudio e direção visual da cena.
- `command-bar`: única ação principal para avançar o pipeline.

O visual pode ser substituído depois: cores, tipografia e composição vivem na camada web; provedores, banco e pipeline de mídia não dependem desses estilos.
