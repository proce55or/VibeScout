#!/bin/bash
# VibeScout — uruchomienie dla macOS. Można kliknąć dwukrotnie w Finderze.
# Buduje (jeśli trzeba) i uruchamia program, otwiera panel w przeglądarce.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Nie znaleziono Node.js. Zainstaluj wersję LTS (20 lub 22) z https://nodejs.org, potem spróbuj ponownie."
  echo "Naciśnij Enter, aby zamknąć."
  read -r _
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Wykryto Node.js $(node -v). Wymagana wersja 20 lub nowsza (zalecana 22 LTS)."
  echo "Naciśnij Enter, aby zamknąć."
  read -r _
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Instaluję zależności (jednorazowo)…"
  npm install
fi

if [ ! -f dist/server/index.js ] || [ ! -f web/dist/index.html ]; then
  echo "Buduję aplikację…"
  npm run build
fi

PORT="${VIBESCOUT_PORT:-4317}"
echo "Uruchamiam VibeScout na http://127.0.0.1:${PORT} …"
node dist/server/index.js &
echo $! > vibescout.pid
sleep 2
open "http://127.0.0.1:${PORT}" 2>/dev/null || true
echo "Działa. To okno można zostawić otwarte. Zatrzymanie: ./stop.command lub Ctrl+C."
wait
