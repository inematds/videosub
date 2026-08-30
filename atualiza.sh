#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

cd "$PROJECT_DIR"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Existem alterações locais. Atualização cancelada para não sobrescrevê-las." >&2
    echo "Revise com: git status" >&2
    exit 1
  fi
  echo "Baixando atualizações..."
  git pull --ff-only
else
  echo "Diretório sem repositório Git; etapa de download ignorada."
fi

echo "Atualizando dependências..."
pnpm install --frozen-lockfile

echo "Validando e compilando..."
pnpm typecheck
pnpm test
pnpm build

"$PROJECT_DIR/stop.sh"
"$PROJECT_DIR/start.sh"

echo "VideoSub atualizado e reiniciado."
