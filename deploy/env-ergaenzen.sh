#!/bin/sh
# PaiBot – ergänzt eine bestehende deploy/.env um Werte, die neuere Fassungen brauchen.
#
# Autor:     Oliver Hees
# Website:   https://paibot.de
# Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
# Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
# Seit:      2026-11-28

# Aufruf:  sh deploy/env-ergaenzen.sh [Datei]   (Standard: deploy/.env)
# Hängt nur fehlende Einträge an, mit zufälligen Werten; vorhandene Zeilen bleiben unverändert.
# Die Werte erscheinen nicht auf dem Bildschirm. Ein zweiter Aufruf ändert nichts mehr.
set -eu

ziel="${1:-$(dirname "$0")/.env}"
if [ ! -f "$ziel" ]; then
  echo "Abbruch: $ziel gibt es nicht. Für eine neue Installation: sh deploy/env-erzeugen.sh" >&2
  exit 1
fi

# 32 zufällige Byte als Hex (nur 0-9 und a-f, damit sie gefahrlos in einer Datenbank-Adresse stehen).
zufall_hex() {
  od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
}

# 0, wenn die Datei eine Zeile NAME=… enthält (auch mit leerem Wert).
vorhanden() {
  grep -q "^$1=" "$ziel"
}

# Leer gelassene Werte füllt das Skript nicht: Wer eine Zeile angelegt hat, entscheidet selbst.
ergaenzt=""
anhaengen() {
  # Zeilenende sichern, damit die neue Zeile nicht an die letzte angehängt wird.
  if [ -s "$ziel" ] && [ "$(tail -c 1 "$ziel" | od -An -c | tr -d ' ')" != '\n' ]; then
    printf '\n' >> "$ziel"
  fi
  printf '%s=%s\n' "$1" "$2" >> "$ziel"
  ergaenzt="$ergaenzt $1"
}

umask 077
vorhanden POSTGRES_WORKER_USER || anhaengen POSTGRES_WORKER_USER paibot_worker
vorhanden POSTGRES_WORKER_PASSWORD || anhaengen POSTGRES_WORKER_PASSWORD "$(zufall_hex)"

if [ -z "$ergaenzt" ]; then
  echo "Nichts zu ergänzen: $ziel enthält schon alle Einträge."
else
  echo "Ergänzt in $ziel:$ergaenzt (Werte nicht angezeigt). Danach: docker compose … up -d"
fi
