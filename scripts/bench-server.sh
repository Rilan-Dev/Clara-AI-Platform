#!/bin/bash
# Local benchmark server runner — loads .env.bench and boots the standalone
# Next server with all voice relays attached (scripts/start.mjs).
cd /home/z/my-project/.worktrees/vc
set -a
source <(grep -vE '^#|^$' .env.bench | sed 's/^/export /')
set +a
exec node scripts/start.mjs >> /home/z/clara-server.log 2>&1
