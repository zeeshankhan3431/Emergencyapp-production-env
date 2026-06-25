#!/usr/bin/env bash
# Start ERA local development (API + dashboard UI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DASH="$ROOT/asfand-dashboard"
SERVER_ENV="$DASH/server/.env"

if [[ ! -f "$SERVER_ENV" ]]; then
  echo "No server/.env — copying from .env.example"
  cp "$DASH/server/.env.example" "$SERVER_ENV"
  echo "Edit $SERVER_ENV or run ./scripts/configure-aws-env.sh for AWS integration"
fi

# Ensure dependencies
if [[ ! -d "$DASH/node_modules" ]]; then
  echo "Installing dashboard dependencies..."
  (cd "$DASH" && npm install)
fi
if [[ ! -d "$DASH/server/node_modules" ]]; then
  echo "Installing API dependencies..."
  (cd "$DASH/server" && npm install)
fi

cleanup() {
  echo ""
  echo "Stopping ERA dev servers..."
  kill "$API_PID" "$UI_PID" 2>/dev/null || true
  wait "$API_PID" "$UI_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting API on :3001..."
(cd "$DASH" && npm run dev:api) &
API_PID=$!

echo "Waiting for API health..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Starting dashboard UI on :5173..."
(cd "$DASH" && npm run dev) &
UI_PID=$!

echo ""
echo "════════════════════════════════════════════"
echo "  ERA Emergency Response — Local Dev"
echo "════════════════════════════════════════════"
echo "  Dashboard:  http://localhost:5173"
echo "  API health: http://localhost:3001/api/health"
echo "  Login:      admin@era.dev / EraAdmin123!"
echo "════════════════════════════════════════════"
echo "Press Ctrl+C to stop."

wait
