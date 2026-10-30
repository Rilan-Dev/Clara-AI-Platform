#!/usr/bin/env bash
# Controlled reranker A/B against two sequential disposable backend containers.
# Both arms use the same local origin and Docker image; production is not restarted.
set -Eeuo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'HELP'
Usage:
  RAG_AB_KB_ID=<your-kb-id> bash scripts/run-rag-ab-controlled.sh

Requires a fresh exported CLARA_DEBUG_TOKEN (or CLARA_DEBUG_COOKIE), the existing
rag-ab-queries.json in the current directory, and a built clara-backend image.
Before running, execute: docker compose build clara-backend
Optional: RAG_AB_QUERIES, RAG_AB_PREFIX, RAG_AB_SCOPE (default draft),
          RAG_AB_PORT (default 4001), RAG_AB_MAX_READINESS_CHECKS (default 50),
          RAG_AB_LANGUAGE_POLICY (default latin-only; "all" for a verified multilingual model),
          RAG_AB_MAX_CANDIDATES (default 8), RAG_AB_MAX_TEXT_CHARS (default 2000),
          RAG_AB_TIMEOUT_MS (default 6000), RAG_AB_REPEAT (default 3), RAG_AB_WARMUP (default 1).
Output JSON files are PRIVATE; never commit or share raw questions/source metadata.
Each default arm makes 8 questions * (1 warmup + 3 measured) = 32 RAG requests.
HELP
  exit 0
fi

command -v docker >/dev/null || { echo 'Docker not available' >&2; exit 1; }
command -v node >/dev/null || { echo 'Node not available' >&2; exit 1; }
command -v curl >/dev/null || { echo 'curl not available' >&2; exit 1; }
: "${RAG_AB_KB_ID:?Set RAG_AB_KB_ID to an authorized knowledge-base ID}"
if [[ -z "${CLARA_DEBUG_TOKEN:-}" && -z "${CLARA_DEBUG_COOKIE:-}" ]]; then
  echo 'Set CLARA_DEBUG_TOKEN or CLARA_DEBUG_COOKIE securely in your current shell first.' >&2
  exit 1
fi

queries="${RAG_AB_QUERIES:-rag-ab-queries.json}"
prefix="${RAG_AB_PREFIX:-rag-ab-v2}"
scope="${RAG_AB_SCOPE:-draft}"
port="${RAG_AB_PORT:-4001}"
checks="${RAG_AB_MAX_READINESS_CHECKS:-50}"
language_policy="${RAG_AB_LANGUAGE_POLICY:-latin-only}"
max_candidates="${RAG_AB_MAX_CANDIDATES:-8}"
max_text_chars="${RAG_AB_MAX_TEXT_CHARS:-2000}"
timeout_ms="${RAG_AB_TIMEOUT_MS:-6000}"
repeat="${RAG_AB_REPEAT:-3}"
warmup="${RAG_AB_WARMUP:-1}"
container='clara-rag-bench'
origin="http://127.0.0.1:${port}"
base="${prefix}-off.json"
candidate="${prefix}-on.json"
report="${prefix}-report.json"
owned=0
started_reranker=0

[[ "$scope" == 'draft' || "$scope" == 'live' ]] || { echo 'RAG_AB_SCOPE must be draft or live' >&2; exit 1; }
[[ "$language_policy" == 'all' || "$language_policy" == 'latin-only' ]] || { echo 'RAG_AB_LANGUAGE_POLICY must be all or latin-only' >&2; exit 1; }
[[ "$max_candidates" =~ ^[0-9]+$ ]] && (( max_candidates >= 2 && max_candidates <= 30 )) || { echo 'RAG_AB_MAX_CANDIDATES must be 2..30' >&2; exit 1; }
[[ "$max_text_chars" =~ ^[0-9]+$ ]] && (( max_text_chars >= 128 && max_text_chars <= 2000 )) || { echo 'RAG_AB_MAX_TEXT_CHARS must be 128..2000' >&2; exit 1; }
[[ "$timeout_ms" =~ ^[0-9]+$ ]] && (( timeout_ms >= 100 && timeout_ms <= 15000 )) || { echo 'RAG_AB_TIMEOUT_MS must be 100..15000' >&2; exit 1; }
[[ "$repeat" =~ ^[0-9]+$ ]] && (( repeat >= 1 && repeat <= 10 )) || { echo 'RAG_AB_REPEAT must be 1..10' >&2; exit 1; }
[[ "$warmup" =~ ^[0-9]+$ ]] && (( warmup >= 0 && warmup <= 3 )) || { echo 'RAG_AB_WARMUP must be 0..3' >&2; exit 1; }
[[ "$port" =~ ^[0-9]+$ ]] && (( port >= 1 && port <= 65535 )) || { echo 'Invalid RAG_AB_PORT' >&2; exit 1; }
[[ "$checks" =~ ^[0-9]+$ ]] && (( checks >= 1 && checks <= 180 )) || { echo 'Invalid RAG_AB_MAX_READINESS_CHECKS' >&2; exit 1; }
[[ -r "$queries" ]] || { echo "Missing query file: $queries" >&2; exit 1; }
for output in "$base" "$candidate" "$report"; do
  [[ ! -e "$output" ]] || { echo "Existing output: $output; set a new RAG_AB_PREFIX" >&2; exit 1; }
done
if docker inspect "$container" >/dev/null 2>&1; then
  echo "Refusing to replace existing container '$container'. Inspect/remove it manually." >&2
  exit 1
fi

cleanup() {
  if (( owned )); then
    docker rm -f "$container" >/dev/null 2>&1 || true
    owned=0
  fi
  if (( started_reranker )); then
    docker compose --profile rerank stop clara-reranker >/dev/null 2>&1 || true
    started_reranker=0
  fi
}
trap cleanup EXIT

wait_healthy() {
  local i status
  for (( i=1; i<=checks; i++ )); do
    # A connection reset during Next.js startup is transient. Poll explicitly;
    # curl --retry-connrefused alone does not cover all such failures.
    if curl --silent --fail --max-time 3 "${origin}/api/health" >/dev/null 2>&1; then
      echo "Temporary backend healthy on ${origin} (attempt ${i}/${checks})."
      return 0
    fi
    status="$(docker inspect --format '{{.State.Status}}' "$container" 2>/dev/null || printf missing)"
    if [[ "$status" == exited || "$status" == dead || "$status" == missing ]]; then
      echo "Temporary backend is ${status}; startup logs follow:" >&2
      docker logs --tail=70 "$container" >&2 || true
      return 1
    fi
    sleep 2
  done
  echo 'Temporary backend never became healthy; startup logs follow:' >&2
  docker logs --tail=70 "$container" >&2 || true
  return 1
}

start_backend() {
  local enabled="$1" url="$2"
  echo "Starting isolated backend (reranking=${enabled})."
  docker compose run -d --no-deps \
    --name "$container" \
    -p "127.0.0.1:${port}:3000" \
    -e RUN_MIGRATIONS_ON_START=false \
    -e INGEST_POLLER_ENABLED=false \
    -e LOCAL_INIT_SECRET= \
    -e RAG_RERANK_ENABLED="$enabled" \
    -e RAG_RERANK_URL="$url" \
    -e RAG_RERANK_TIMEOUT_MS="$timeout_ms" \
    -e RAG_RERANK_MAX_CANDIDATES="$max_candidates" \
    -e RAG_RERANK_MAX_TEXT_CHARS="$max_text_chars" \
    -e RAG_RERANK_LANGUAGE_POLICY="$language_policy" \
    clara-backend >/dev/null
  owned=1
  wait_healthy
}

run_arm() {
  local label="$1" destination="$2"
  node scripts/benchmark-rag-ab.mjs \
    --base-url "$origin" \
    --kb-id "$RAG_AB_KB_ID" \
    --scope "$scope" \
    --queries "$queries" \
    --label "$label" \
    --top-k 6 --repeat "$repeat" --warmup "$warmup" --gap-ms 250 \
    --preflight-auth --out "$destination"
}

if [[ "$(docker inspect --format '{{.State.Running}}' clara-reranker 2>/dev/null || true)" != true ]]; then
  started_reranker=1
fi

echo 'Starting optional TEI service...'
docker compose --profile rerank up -d clara-reranker

echo 'ARM A: reranking disabled'
start_backend false ''
image_id="$(docker inspect --format '{{.Image}}' "$container")"
run_arm rerank-off "$base"
if (( owned )); then
  docker rm -f "$container" >/dev/null
  owned=0
fi

echo 'ARM B: reranking enabled'
start_backend true 'http://clara-reranker:80/rerank'
[[ "$image_id" == "$(docker inspect --format '{{.Image}}' "$container")" ]] || {
  echo 'Image changed between arms; refusing an invalid A/B.' >&2
  exit 1
}
docker exec "$container" node scripts/probe-rag-reranker.mjs
run_arm rerank-on "$candidate"

echo 'COMPARING...'
node scripts/benchmark-rag-ab.mjs --compare "$base" "$candidate" --out "$report"
echo 'Controlled A/B completed. Outputs are private operator artifacts.'
