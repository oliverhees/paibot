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

# 32 zufällige Byte als URL-sicheres Base64 mit Auffüllung (Format des Zwischenstand-Schlüssels
# der Datenschleuse).
zufall_base64url() {
  head -c 32 /dev/urandom | base64 | tr -d '\n' | tr '+/' '-_'
}

umask 077
# noclobber: Entsteht die Datei zwischen Prüfung und Schreiben, bricht das Schreiben ab, statt sie
# zu überschreiben.
set -C
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
# Speicher-Grenzen der Dienste (Standard: web 768m, worker 512m, migrate 384m):
# PAIBOT_WEB_SPEICHER=768m
# PAIBOT_WORKER_SPEICHER=512m
# PAIBOT_MIGRATE_SPEICHER=384m

# Datenschleuse (Standard: aus). Zum Einschalten die zwei Zeilen ohne # übernehmen,
# danach: pnpm schleuse:config --env-datei deploy/.env (siehe docs/funktion-datenschleuse.md).
# COMPOSE_PROFILES=schleuse
# SCHLEUSE_URL=http://datenschleuse:4000/v1
SCHLEUSE_KEY=sk-$(zufall_hex)
SCHLEUSE_STATE_KEY=$(zufall_base64url)
# Bleibt leer: PaiBot schickt den Schlüssel deines Anbieters mit jeder Anfrage mit. Nur beim
# Rückfall SCHLEUSE_SCHLUESSEL_WEG=umgebung liest die Datenschleuse ihn von hier.
SCHLEUSE_ANBIETER_SCHLUESSEL=
SCHLEUSE_SPRACHMODELL=de_core_news_md
VORLAGE

echo "Geschrieben: $ziel (nur für dich lesbar). Trage APP_URL ein, wenn PaiBot unter einer Domain läuft."
