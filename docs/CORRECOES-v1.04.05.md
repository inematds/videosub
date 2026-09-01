# Correções de visibilidade do prompt — v1.04.05

A edição por prompt funcionava no servidor, mas o andamento e o resultado não permaneciam visíveis na interface. Quando o Codex alterava apenas a direção visual e mantinha título/narração, o operador podia concluir incorretamente que nada aconteceu.

## Correções

- cronômetro e mensagem explícita enquanto o Codex processa;
- comprovante persistente após a conclusão;
- registro de escopo, cena, campos alterados, duração e artefatos invalidados;
- indicação direta das próximas mídias que precisam ser regeneradas;
- migração aditiva com `projects.last_prompt_edit`;
- backfill do comprovante da edição realizada em 1º de setembro de 2026 na cena “Uma inteligência para quase tudo”.

## Validação

- typecheck, 9 testes e build aprovados;
- comprovante confirmado na API e na interface;
- servidor local e rede respondendo como `v1.04.05`.
