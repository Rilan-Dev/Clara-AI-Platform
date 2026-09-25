#!/usr/bin/env sh
# ═══════════════════════════════════════════════════════════════════════════════
# Clara VPS doctor — read-only health report for the self-hosted deployment.
#
#   cd /path/to/Clara-AI-Platform && sh scripts/vps-doctor.sh | tee doctor.txt
#
# Changes nothing. Never prints secret values (only whether they are set).
# Explains the usual causes of "services go down, come back, go down again":
# container restarts / OOM kills, a full disk, publicly exposed Redis/Qdrant,
# pending database migrations, a 1-connection Postgres pool.
# ═══════════════════════════════════════════════════════════════════════════════

set -u
cd "$(dirname "$0")/.." || exit 1

ok()   { printf '  [ OK ] %s\n' "$*"; }
warn() { printf '  [WARN] %s\n' "$*"; }
bad()  { printf '  [FAIL] %s\n' "$*"; }
hdr()  { printf '\n== %s ==\n' "$*"; }

env_value() { # value of KEY from .env (quotes stripped), empty if unset
  [ -f .env ] || return 0
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" .env | tail -n 1 | sed 's/^["'\'']//; s/["'\'']$//'
}

hdr "Host"
uptime
free -m 2>/dev/null | sed -n '1,2p'
MEM_AVAIL=$(free -m 2>/dev/null | awk '/^Mem:/ {print $7}')
[ -n "${MEM_AVAIL:-}" ] && [ "$MEM_AVAIL" -lt 512 ] && bad "only ${MEM_AVAIL}MB memory available — containers will be OOM-killed"
df -h / . 2>/dev/null | awk 'NR==1 || !seen[$0]++'
DISK_PCT=$(df -P . | awk 'NR==2 {gsub("%","",$5); print $5}')
if [ "${DISK_PCT:-0}" -ge 90 ]; then bad "disk ${DISK_PCT}% full — Postgres/Redis/Qdrant fail writes when the disk fills"; else ok "disk ${DISK_PCT}% used"; fi
if dmesg 2>/dev/null | grep -qi "out of memory\|oom-kill"; then
  bad "kernel OOM kills found:"; dmesg 2>/dev/null | grep -i "killed process" | tail -n 5
else
  ok "no kernel OOM kills in dmesg"
fi

hdr "Containers"
docker compose ps 2>/dev/null || docker ps
for c in clara-backend clara-worker clara-postgres clara-redis clara-qdrant clara-rabbitmq clara-rabbitmq-bridge; do
  if ! docker inspect "$c" >/dev/null 2>&1; then warn "$c: not found"; continue; fi
  STATE=$(docker inspect -f '{{.State.Status}}' "$c")
  HEALTH=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$c")
  RESTARTS=$(docker inspect -f '{{.RestartCount}}' "$c")
  OOM=$(docker inspect -f '{{.State.OOMKilled}}' "$c")
  STARTED=$(docker inspect -f '{{.State.StartedAt}}' "$c")
  LINE="$c: $STATE/$HEALTH restarts=$RESTARTS oomKilled=$OOM started=$STARTED"
  if [ "$STATE" != "running" ] || [ "$OOM" = "true" ] || [ "$HEALTH" = "unhealthy" ] || [ "$RESTARTS" -gt 3 ]; then bad "$LINE"; else ok "$LINE"; fi
done
docker stats --no-stream --format '  {{.Name}}: CPU {{.CPUPerc}}  MEM {{.MemUsage}}' 2>/dev/null | grep clara

hdr "Publicly exposed infrastructure ports"
for port in 6379 6333 6334 1234 5432 5672 15672; do
  if ss -tlnH 2>/dev/null | awk '{print $4}' | grep -Eq "^(0\.0\.0\.0|\*|\[::\]):$port$"; then
    bad "port $port listens on ALL interfaces — reachable from the internet (Docker bypasses UFW). Rebuild with the updated docker-compose.yml (binds 127.0.0.1)."
  else
    ok "port $port not public"
  fi
done

hdr "Redis"
RPASS=$(env_value REDIS_PASSWORD)
if [ -n "$RPASS" ]; then ok "REDIS_PASSWORD is set"; else warn "REDIS_PASSWORD not set — Redis accepts any client"; fi
# REDISCLI_AUTH keeps the password off the command line and out of this report.
export REDISCLI_AUTH="$RPASS"
RCLI="docker exec -e REDISCLI_AUTH clara-redis redis-cli"
ROLE=$($RCLI INFO replication 2>/dev/null | tr -d '\r' | sed -n 's/^role://p')
case "$ROLE" in
  master) ok "role=master" ;;
  slave)  bad "role=slave — Redis was turned into a replica of another host (a known attack on exposed Redis). Run: docker exec clara-redis redis-cli REPLICAOF NO ONE (add -e REDISCLI_AUTH), then close the port." ;;
  *)      warn "could not read Redis role (auth or container issue)" ;;
esac
$RCLI INFO memory 2>/dev/null | tr -d '\r' | grep -E '^(used_memory_human|maxmemory_human):' | sed 's/^/  /'
$RCLI INFO clients 2>/dev/null | tr -d '\r' | grep -E '^connected_clients:' | sed 's/^/  /'

hdr "Qdrant"
QV=$(docker exec clara-qdrant sh -c 'cat /qdrant/.qdrant-version 2>/dev/null' 2>/dev/null)
if QOUT=$(curl -fsS -m 5 http://127.0.0.1:6333/ 2>/dev/null); then echo "  $QOUT"; else bad "Qdrant not reachable on 127.0.0.1:6333"; fi
[ -n "$QV" ] && echo "  storage version file: $QV"
curl -fsS -m 5 http://127.0.0.1:6333/collections 2>/dev/null | head -c 600 | sed 's/^/  /'; echo

hdr "PostgreSQL"
PGU=$(env_value POSTGRES_USER); PGU=${PGU:-clara}
PGD=$(env_value POSTGRES_DB); PGD=${PGD:-clara_platform}
PSQL="docker exec clara-postgres psql -U $PGU -d $PGD -tAc"
APPLIED=$($PSQL "SELECT count(*) FROM schema_migrations" 2>/dev/null)
FILES=$(ls src/lib/db/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
LATEST_FILE=$(ls src/lib/db/migrations/*.sql 2>/dev/null | tail -n 1 | xargs -n1 basename 2>/dev/null)
LATEST_DB=$($PSQL "SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1" 2>/dev/null)
if [ -z "$APPLIED" ]; then
  warn "could not query schema_migrations (DATABASE_URL may point to an external database)"
elif [ "$APPLIED" -lt "$FILES" ]; then
  bad "migrations: $APPLIED applied of $FILES in the repo (latest in DB: $LATEST_DB, repo: $LATEST_FILE) — the updated image applies them at startup"
else
  ok "migrations: $APPLIED applied (latest $LATEST_DB)"
fi
$PSQL "SELECT 'connections: ' || count(*) || ' of max ' || current_setting('max_connections') FROM pg_stat_activity" 2>/dev/null | sed 's/^/  /'
$PSQL "SELECT '  long-running: ' || pid || ' ' || state || ' ' || now()-query_start FROM pg_stat_activity WHERE state <> 'idle' AND now()-query_start > interval '5 seconds'" 2>/dev/null

hdr ".env (values hidden)"
for key in DATABASE_URL QDRANT_URL REDIS_HOST REDIS_URL RABBITMQ_URL CRON_SECRET PG_POOL_MAX NEXT_PUBLIC_APP_URL; do
  v=$(env_value "$key")
  if [ -n "$v" ]; then ok "$key is set"; else warn "$key not set"; fi
done
[ -z "$(env_value CRON_SECRET)" ] && bad "CRON_SECRET missing — scheduled jobs (onboarding reminders, health monitor) cannot run"
PUBLIC_IP=$(curl -fsS -m 5 https://api.ipify.org 2>/dev/null || true)
if [ -n "$PUBLIC_IP" ] && grep -Eq "^(DATABASE_URL|QDRANT_URL|REDIS_URL|REDIS_HOST|RABBITMQ_URL)=.*$PUBLIC_IP" .env 2>/dev/null; then
  bad ".env reaches infrastructure through the public IP $PUBLIC_IP — use the service names (postgres, qdrant, redis, rabbitmq) before binding ports to 127.0.0.1"
else
  ok "no infrastructure URL uses the public IP"
fi

hdr "App"
if HOUT=$(curl -fsS -m 10 http://127.0.0.1:3000/api/health 2>/dev/null); then echo "  $HOUT" | head -c 800; echo; else bad "/api/health not answering (or reports degraded) on 127.0.0.1:3000"; fi
echo "  recent backend errors:"
docker logs --since 6h clara-backend 2>&1 | grep -Ei "error|timed out|timeout|ECONN|FATAL|unhealthy" | tail -n 25 | sed 's/^/    /'
echo "  recent worker errors:"
docker logs --since 6h clara-worker 2>&1 | grep -Ei "error|timed out|ECONN|FATAL" | tail -n 10 | sed 's/^/    /'

printf '\nDone. Share this output (it contains no secret values) to diagnose further.\n'
