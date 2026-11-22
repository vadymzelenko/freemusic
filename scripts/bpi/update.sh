#!/usr/bin/env bash
# Nightly: pull the latest vzMusic from GitHub and rebuild if something changed.
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OWNER="$(stat -c %U "$APP_DIR")"
cd "$APP_DIR"
run() { sudo -u "$OWNER" bash -c "cd '$APP_DIR' && $*"; }

run "git fetch --quiet origin main"
if [ "$(run 'git rev-parse HEAD')" = "$(run 'git rev-parse origin/main')" ]; then
  echo "vzMusic: уже последняя версия"
  exit 0
fi
lock_before="$(run 'git rev-parse HEAD:package-lock.json')"
run "git reset --hard --quiet origin/main"
if [ "$lock_before" != "$(run 'git rev-parse HEAD:package-lock.json')" ]; then
  run "npm ci --no-audit --no-fund"
fi
run "NODE_OPTIONS=--max-old-space-size=1536 NEXT_TELEMETRY_DISABLED=1 npm run build"
systemctl restart vzmusic
echo "vzMusic: обновлено до $(run 'git rev-parse --short HEAD')"
