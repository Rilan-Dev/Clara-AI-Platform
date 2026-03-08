#!/usr/bin/env bash
echo "============================================================"
echo "  Clara AI Platform — Starting All Applications"
echo "============================================================"
echo ""
echo "  clara-backend        → http://localhost:3010"
echo "  clara-omen-insurance → http://localhost:3001"
echo "  clara-techvision     → http://localhost:3002"
echo ""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
(cd "$SCRIPT_DIR/clara-backend" && npm run dev) &
sleep 4
(cd "$SCRIPT_DIR/clara-omen-insurance" && npm run dev) &
sleep 2
(cd "$SCRIPT_DIR/clara-techvision" && npm run dev) &
echo "All 3 apps started. Press Ctrl+C to stop all."
wait
