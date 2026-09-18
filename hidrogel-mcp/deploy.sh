#!/usr/bin/env bash
# Publica el conector en la VM de Oracle: copia los archivos, reconstruye la imagen y reinicia.
# Uso: hidrogel-mcp/deploy.sh   (desde cualquier carpeta)
set -euo pipefail

cd "$(dirname "$0")/.."
VM="${VM:-ubuntu@160.34.222.215}"
LLAVE="${LLAVE:-$HOME/.ssh/oracle_chavarria_vm}"

rsync -az --relative -e "ssh -i $LLAVE" \
    analytics/hidrogel-core.js \
    hidrogel-mcp/Dockerfile hidrogel-mcp/docker-compose.yml hidrogel-mcp/server.js hidrogel-mcp/src \
    "$VM:hidrogel-mcp/"

ssh -i "$LLAVE" "$VM" '
    cd hidrogel-mcp
    test -f .env || { echo "Falta ~/hidrogel-mcp/.env (MCP_TOKEN, FIREBASE_PROJECT_ID, FIREBASE_API_KEY)"; exit 1; }
    docker compose -f hidrogel-mcp/docker-compose.yml up -d --build
    docker image prune -f > /dev/null
    docker ps --filter name=hidrogel-mcp --format "{{.Names}}: {{.Status}}"
'
