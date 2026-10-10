#!/usr/bin/env bash
# Kill any local Clara server (standalone server renames itself to "next-server")
pkill -f "standalone/server.js" 2>/dev/null
pkill -f "^next-server" 2>/dev/null
pkill -f "next-server (v" 2>/dev/null
sleep 2
cd /home/z/my-project/Clara-AI-Platform
# Sync fresh static + prerendered HTML into the standalone output
rm -rf .next/standalone/.next/static
cp -r .next/static .next/standalone/.next/static
set -a; source .env; set +a
PORT=3100 setsid nohup node .next/standalone/server.js > /home/z/my-project/scripts/clara-local.log 2>&1 < /dev/null & disown
sleep 5
curl -s -o /dev/null -w "health: %{http_code}\n" http://localhost:3100/api/health
