#!/bin/bash
# VibeScout — zatrzymanie dla macOS. Zatrzymuje WYŁĄCZNIE proces tej aplikacji
# (na podstawie zapisanego PID). Nie dotyka innych procesów Node.
cd "$(dirname "$0")"

if [ -f vibescout.pid ]; then
  PID="$(cat vibescout.pid)"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Zatrzymano VibeScout (PID $PID)."
  else
    echo "Proces o PID $PID już nie działa."
  fi
  rm -f vibescout.pid
else
  echo "Brak pliku vibescout.pid — VibeScout prawdopodobnie nie jest uruchomiony tym skryptem."
fi
