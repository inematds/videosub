#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$PROJECT_DIR/.runtime"
PID_FILE="$RUNTIME_DIR/videosub.pid"
LOG_FILE="$RUNTIME_DIR/videosub.log"

mkdir -p "$RUNTIME_DIR"

if [[ -f "$PID_FILE" ]]; then
  RUNNING_PID="$(tr -cd '0-9' < "$PID_FILE")"
  if [[ -n "$RUNNING_PID" ]] && kill -0 "$RUNNING_PID" 2>/dev/null; then
    echo "VideoSub já está em execução (PID $RUNNING_PID)."
    echo "Log: $LOG_FILE"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if [[ ! -f "$PROJECT_DIR/apps/server/dist/index.js" || ! -f "$PROJECT_DIR/apps/web/dist/index.html" ]]; then
  echo "Build ausente. Executando pnpm build..."
  (cd "$PROJECT_DIR" && pnpm build)
fi

echo "Iniciando VideoSub..."
(
  cd "$PROJECT_DIR/apps/server"
  nohup node dist/index.js >> "$LOG_FILE" 2>&1 &
  echo "$!" > "$PID_FILE"
)

SERVER_PID="$(tr -cd '0-9' < "$PID_FILE")"
for _ in {1..20}; do
  if curl -fsS "http://127.0.0.1:${PORT:-3333}/api/health" >/dev/null 2>&1; then
    echo "VideoSub iniciado (PID $SERVER_PID)."
    echo "Local: http://localhost:${PORT:-3333}"
    echo "Rede: use http://IP-DA-MAQUINA:${PORT:-3333}"
    echo "Log: $LOG_FILE"
    exit 0
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "O servidor encerrou durante a inicialização. Consulte $LOG_FILE" >&2
    rm -f "$PID_FILE"
    exit 1
  fi
  sleep 0.25
done

echo "O processo iniciou, mas a verificação de saúde expirou. Consulte $LOG_FILE" >&2
exit 1
