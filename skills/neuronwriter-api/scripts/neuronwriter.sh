#!/usr/bin/env bash
# NeuronWriter API helper - bundled script for the neuronwriter-api skill
# Usage: ./neuronwriter.sh <endpoint> [args as JSON]
# Reads NW_API_KEY from env or .env files

set -euo pipefail

BASE="https://app.neuronwriter.com/neuron-api/0.5/writer"

# Locate API key
find_key() {
  if [ -n "${NW_API_KEY:-}" ]; then
    echo "$NW_API_KEY"
    return
  fi
  for f in ".env" "../.env" "$(dirname "$0")/../.env"; do
    if [ -f "$f" ]; then
      local val
      val=$(grep -o 'NEURONWRITER_API_KEY=[^[:space:]]*' "$f" 2>/dev/null | head -1 | cut -d= -f2)
      [ -n "$val" ] && echo "$val" && return
      val=$(grep -o 'NW_API_KEY=[^[:space:]]*' "$f" 2>/dev/null | head -1 | cut -d= -f2)
      [ -n "$val" ] && echo "$val" && return
    fi
  done
  echo "ERROR: No API key found. Set NW_API_KEY env var or add NEURONWRITER_API_KEY to .env" >&2
  exit 1
}

API_KEY=$(find_key)

call() {
  local endpoint=$1
  shift
  curl -s --max-time 120 "$BASE/$endpoint" \
    -H "X-API-KEY: $API_KEY" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    "$@"
}

usage() {
  cat <<'USAGE'
NeuronWriter API Helper

Commands:
  list-projects                    List all projects
  new-query <json>                 Create new query (pass JSON payload)
  get-query <query_id>             Get query recommendations
  list-queries <json>              List/filter queries in project
  get-content <query_id>           Get saved content revision
  import-content <json>            Import content into editor
  evaluate-content <json>          Evaluate content score (no save)
  wait-and-get <query_id> [poll_s] Poll until ready, then get recommendations (default: poll every 30s, max 5min)
USAGE
}

cmd=${1:-help}
shift || true

case "$cmd" in
  list-projects)
    call list-projects -d '{}'
    ;;
  new-query)
    call new-query -d "$1"
    ;;
  get-query)
    call get-query -d "{\"query\": \"$1\"}"
    ;;
  list-queries)
    call list-queries -d "$1"
    ;;
  get-content)
    call get-content -d "{\"query\": \"$1\"}"
    ;;
  import-content)
    call import-content -d "$1"
    ;;
  evaluate-content)
    call evaluate-content -d "$1"
    ;;
  wait-and-get)
    local query_id="$1"
    local poll_seconds="${2:-30}"
    local max_attempts=10
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
      resp=$(call get-query -d "{\"query\": \"$query_id\"}")
      status=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','not found'))" 2>/dev/null)
      if [ "$status" = "ready" ]; then
        echo "$resp"
        exit 0
      fi
      attempt=$((attempt + 1))
      sleep "$poll_seconds"
    done
    echo '{"status": "timeout", "message": "Query not ready after max attempts"}' 
    exit 1
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    echo "Unknown command: $cmd"
    usage
    exit 1
    ;;
esac
