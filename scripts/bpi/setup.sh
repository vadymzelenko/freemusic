#!/usr/bin/env bash
# vzMusic home server — one-shot setup for Banana Pi BPI-M4 Zero (or any arm64/x64 Debian/Ubuntu/Armbian box).
#
#   git clone https://github.com/vadymzelenko/freemusic.git && cd freemusic
#   sudo bash scripts/bpi/setup.sh
#
# What it does: Node.js 22, swap for the build, builds the app, runs it as a systemd service on
# port 3939 (auto-start after power loss), nightly auto-update from GitHub, and publishes it on the
# internet over HTTPS with Tailscale Funnel (no router setup, no public IP needed).
set -euo pipefail

PORT=3939
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Запустите через sudo: sudo bash scripts/bpi/setup.sh"; exit 1; }
say "Папка проекта: $APP_DIR (пользователь: $RUN_USER)"

say "1/7 Системные пакеты"
apt-get update -y
apt-get install -y git curl ca-certificates

say "2/7 Swap (сборке Next.js нужно ~1.5 ГБ памяти)"
total_kb=$(awk '/MemTotal|SwapTotal/ {s+=$2} END {print s}' /proc/meminfo)
if [ "$total_kb" -lt 3500000 ] && [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "swap 2G включён"
else
  echo "памяти достаточно / swap уже есть"
fi

say "3/7 Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

say "4/7 Сборка (на BPI займёт 5–15 минут)"
cd "$APP_DIR"
sudo -u "$RUN_USER" bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund && NODE_OPTIONS=--max-old-space-size=1536 NEXT_TELEMETRY_DISABLED=1 npm run build"

say "5/7 Сервис vzmusic (автозапуск)"
[ -f /etc/vzmusic.env ] || cat > /etc/vzmusic.env <<ENV
# vzMusic home server settings (после изменения: sudo systemctl restart vzmusic)
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
# Регион каталога YouTube Music (например PL, DE, UA, US)
YT_LOCATION=PL
ENV
cat > /etc/systemd/system/vzmusic.service <<UNIT
[Unit]
Description=vzMusic home server
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=/etc/vzmusic.env
ExecStart=$APP_DIR/node_modules/.bin/next start -p $PORT -H 0.0.0.0
Restart=always
RestartSec=5
Nice=-5

[Install]
WantedBy=multi-user.target
UNIT

say "6/7 Автообновление каждую ночь (04:30)"
cat > /etc/systemd/system/vzmusic-update.service <<UNIT
[Unit]
Description=vzMusic auto-update from GitHub

[Service]
Type=oneshot
ExecStart=/usr/bin/env bash $APP_DIR/scripts/bpi/update.sh
UNIT
cat > /etc/systemd/system/vzmusic-update.timer <<UNIT
[Unit]
Description=vzMusic nightly update

[Timer]
OnCalendar=*-*-* 04:30:00
RandomizedDelaySec=900
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now vzmusic.service vzmusic-update.timer

for i in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$PORT/api/warm" >/dev/null 2>&1 && break
  sleep 2
done
if curl -fsS "http://127.0.0.1:$PORT/api/warm" >/dev/null 2>&1; then
  echo "сервер отвечает на http://127.0.0.1:$PORT"
else
  echo "сервер пока не отвечает — смотрите: journalctl -u vzmusic -n 50"
fi

say "7/7 Публичный HTTPS-адрес через Tailscale Funnel"
if ! command -v tailscale >/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
if ! tailscale status >/dev/null 2>&1; then
  echo
  echo "Сейчас появится ссылка — откройте её на телефоне/ПК и войдите в Tailscale (бесплатно)."
  tailscale up
fi
echo
echo "Включаю Funnel. Если Tailscale попросит включить HTTPS/Funnel — откройте показанную ссылку,"
echo "нажмите Enable и снова выполните: sudo tailscale funnel --bg $PORT"
tailscale funnel --bg "$PORT" || true

host="$(tailscale status --json 2>/dev/null | sed -n 's/.*"DNSName": *"\([^"]*\)\.".*/\1/p' | head -1)"
echo
echo "════════════════════════════════════════════════════════════"
if [ -n "$host" ]; then
  echo " Адрес вашего сервера:  https://$host"
  echo
  echo " Vercel → Settings → Environment Variables:"
  echo "   NEXT_PUBLIC_STREAM_API_URL = https://$host"
  echo " затем Deployments → Redeploy."
  echo
  echo " Проверка: https://$host/api/debug  (клиенты должны быть ok)"
else
  echo " Адрес смотрите командой: tailscale funnel status"
fi
echo "════════════════════════════════════════════════════════════"
