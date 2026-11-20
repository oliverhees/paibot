#!/bin/sh
# PaiBot – erzeugt deploy/.env mit zufälligen Passwörtern und dem Wurzel-Geheimnis.
#
# Autor:     Oliver Hees
# Website:   https://paibot.de
# Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
# Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
# Seit:      2026-11-20

# Aufruf:  sh deploy/env-erzeugen.sh [Zieldatei]   (Standard: deploy/.env)
# Eine vorhandene Datei wird nie überschrieben. Die Werte erscheinen nicht auf dem Bildschirm.
set -eu

ziel="${1:-$(dirname "$0")/.env}"
if [ -e "$ziel" ]; then
  echo "Abbruch: $ziel gibt es schon. Diese Datei enthält deine Geheimnisse und wird nicht überschrieben." >&2
  exit 1
fi

# 32 zufällige Byte als Hex (nur 0-9 und a-f, damit sie gefahrlos in einer Datenbank-Adresse stehen).
zufall_hex() {
  od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
}

# 32 zufällige Byte als Base64 (Format von PAIBOT_SECRET).
zufall_base64() {
  head -c 32 /dev/urandom | base64 | tr -d '\n'
}

umask 077
cat > "$ziel" <<VORLAGE
# PaiBot – Einstellungen des Docker-Compose-Stacks (erzeugt von deploy/env-erzeugen.sh).
# Nie committen. PAIBOT_SECRET und die Passwörter getrennt sichern (z. B. im Passwort-Manager).
POSTGRES_USER=paibot
POSTGRES_PASSWORD=$(zufall_hex)
POSTGRES_APP_USER=paibot_app
POSTGRES_APP_PASSWORD=$(zufall_hex)
POSTGRES_DB=paibot
PAIBOT_SECRET=$(zufall_base64)
APP_URL=http://localhost:3000
WEB_PORT=3000
VORLAGE

echo "Geschrieben: $ziel (nur für dich lesbar). Trage APP_URL ein, wenn PaiBot unter einer Domain läuft."
