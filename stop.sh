#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$PROJECT_DIR/.runtime/videosub.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "VideoSub não está registrado como ativo."
  exit 0
fi

SERVER_PID="$(tr -cd '0-9' < "$PID_FILE")"
if [[ -z "$SERVER_PID" ]] || ! kill -0 "$SERVER_PID" 2>/dev/null; then
  rm -f "$PID_FILE"
  echo "VideoSub já estava parado."
  exit 0
fi

PROCESS_COMMAND="$(ps -p "$SERVER_PID" -o args= 2>/dev/null || true)"
if [[ "$PROCESS_COMMAND" != *"dist/index.js"* ]]; then
  echo "O PID $SERVER_PID não pertence ao VideoSub; nenhuma ação foi realizada." >&2
  exit 1
fi

echo "Parando VideoSub (PID $SERVER_PID)..."
kill "$SERVER_PID"
for _ in {1..20}; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "VideoSub parado."
    exit 0
  fi
  sleep 0.25
done

echo "O processo não encerrou no prazo; enviando encerramento forçado."
kill -KILL "$SERVER_PID"
rm -f "$PID_FILE"
echo "VideoSub parado."
