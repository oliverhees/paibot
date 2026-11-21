#!/bin/sh
# PaiBot – Installation sichern, in eine frische Installation zurückspielen und nachprüfen.
#
# Autor:     Oliver Hees
# Website:   https://paibot.de
# Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
# Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
# Seit:      2026-11-21

# Aufruf (auf dem Server, im Ordner von PaiBot; braucht nur Docker, kein Node und kein pnpm):
#
#   sh deploy/sicherung.sh sichern [--ziel <ordner>]
#   sh deploy/sicherung.sh zurueckspielen <sicherungs-ordner> [--ohne-start]
#   sh deploy/sicherung.sh pruefen <sicherungs-ordner>
#
# Optionen:
#   --image                  fertiges Image: deploy/docker-compose.image.yml
#   --compose-datei <datei>  andere Compose-Datei (mehrfach möglich; ersetzt die Standard-Datei)
#   --env-datei <datei>      Einstellungen (Standard: deploy/.env)
#   --container <name>       ohne Compose-Datei, direkt der Container der Datenbank (z. B. mit
#                            Coolify); web, worker und migrate findet das Skript über dessen
#                            Compose-Projekt
#   --ziel <ordner>          sichern: wohin (Standard: ~/paibot-sicherungen)
#   --ohne-start             zurueckspielen: nur einspielen, nichts starten
#
# Eine Sicherung ist ein Ordner mit zwei Dateien, nur für dich lesbar:
#   datenbank.dump  die Datenbank (pg_dump, eigenes Format), ohne die Warteschlange
#   begleit.json    Version, Zeitpunkt, Stand der Migrationen, Zeilen je Tabelle, Anker der
#                   Belege-Kette und Prüfsumme (SHA-256) der Datei datenbank.dump
# PAIBOT_SECRET und deploy/.env sind NICHT enthalten: getrennt und sicher aufbewahren.
#
# Exit-Code: 0 in Ordnung, 1 Fehler, 2 falscher Aufruf, 3 Ziel-Datenbank ist nicht frisch.
set -eu
umask 077

HIER=$(cd "$(dirname "$0")" && pwd)
WURZEL=$(cd "$HIER/.." && pwd)
DB_SKRIPT="$HIER/sicherung-db.sh"
# Gleiches Basis-Image wie apps/web/Dockerfile: Node für den Prüfer der Belege.
NODE_IMAGE=node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
WARTEZEIT=${PAIBOT_SICHERUNG_WARTEZEIT:-240}

meldung() { printf '%s\n' "$*" >&2; }
abbruch() {
  code=$1
  shift
  printf 'FEHLER: %s\n' "$*" >&2
  exit "$code"
}
aufruf() {
  sed -n '10,31p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

# Ein Wert in einfachen Anführungszeichen, sicher für eval.
zitiere() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

befehl=""
ordner=""
ziel="${HOME:-.}/paibot-sicherungen"
container=""
env_datei="$WURZEL/deploy/.env"
compose_dateien=""
ohne_start=0
while [ $# -gt 0 ]; do
  case "$1" in
    sichern | zurueckspielen | pruefen)
      [ -z "$befehl" ] || aufruf
      befehl=$1
      ;;
    --image) compose_dateien="$compose_dateien -f $(zitiere "$WURZEL/deploy/docker-compose.image.yml")" ;;
    --compose-datei)
      [ $# -ge 2 ] || aufruf
      compose_dateien="$compose_dateien -f $(zitiere "$2")"
      shift
      ;;
    --env-datei)
      [ $# -ge 2 ] || aufruf
      env_datei=$2
      shift
      ;;
    --container)
      [ $# -ge 2 ] || aufruf
      container=$2
      shift
      ;;
    --ziel)
      [ $# -ge 2 ] || aufruf
      ziel=$2
      shift
      ;;
    --ohne-start) ohne_start=1 ;;
    -h | --hilfe | --help) aufruf ;;
    -*) aufruf ;;
    *)
      [ -z "$ordner" ] || aufruf
      ordner=$1
      ;;
  esac
  shift
done
[ -n "$befehl" ] || aufruf
[ -f "$DB_SKRIPT" ] || abbruch 1 "$DB_SKRIPT fehlt."
command -v docker > /dev/null 2>&1 || abbruch 1 "docker ist nicht installiert oder nicht im Pfad."
[ -n "$compose_dateien" ] || compose_dateien="-f $(zitiere "$WURZEL/deploy/docker-compose.yml")"
if [ -z "$container" ]; then
  [ -f "$env_datei" ] || abbruch 1 "$env_datei fehlt (Einstellungen der Installation). Mit --env-datei eine andere Datei angeben."
  COMPOSE_ARGS="$compose_dateien --env-file $(zitiere "$env_datei")"
fi
SKRIPT_TEXT=$(cat "$DB_SKRIPT")

compose() { eval "docker compose $COMPOSE_ARGS" '"$@"'; }

# Führt sicherung-db.sh im Container der Datenbank aus; Ein- und Ausgabe werden durchgereicht.
db() {
  if [ -n "$container" ]; then
    docker exec -i "$container" sh -c "$SKRIPT_TEXT" sicherung-db "$@"
  else
    compose exec -T postgres sh -c "$SKRIPT_TEXT" sicherung-db "$@"
  fi
}

# Container-Kennung eines Dienstes (leer, wenn es ihn nicht gibt).
dienst() {
  if [ -n "$container" ]; then
    projekt=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container" 2> /dev/null || true)
    [ -n "$projekt" ] || return 0
    docker ps -a -q --filter "label=com.docker.compose.project=$projekt" \
      --filter "label=com.docker.compose.service=$1" | head -n 1
  else
    compose ps -a -q "$1" 2> /dev/null | head -n 1
  fi
}

zustand_von() { docker inspect --format '{{.State.Status}}' "$1" 2> /dev/null || true; }
gesundheit_von() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}ohne{{end}}' "$1" 2> /dev/null || true
}

warte_gesund() {
  name=$1
  id=$(dienst "$name")
  [ -n "$id" ] || abbruch 1 "Dienst $name nicht gefunden."
  i=0
  while [ "$i" -lt "$WARTEZEIT" ]; do
    status=$(gesundheit_von "$id")
    case "$status" in
      healthy | ohne) return 0 ;;
    esac
    if [ "$(zustand_von "$id")" = "exited" ]; then break; fi
    sleep 2
    i=$((i + 2))
  done
  docker logs --tail 40 "$id" >&2 || true
  abbruch 1 "Dienst $name ist nicht gesund (Zustand: $(zustand_von "$id"), $(gesundheit_von "$id"))."
}

sha256_von() {
  if command -v sha256sum > /dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  else
    shasum -a 256 "$1" | cut -d ' ' -f 1
  fi
}

# Feld aus der Begleit-Datei, die dieses Skript selbst schreibt (feste Form).
begleit_feld() {
  sed -n "s/^.*\"$2\":\"\([^\"]*\)\".*$/\1/p" "$1" | head -n 1
}

version_der_app() {
  id=$(dienst web)
  [ -n "$id" ] && [ "$(zustand_von "$id")" = "running" ] || {
    echo unbekannt
    return 0
  }
  wert=$(docker exec "$id" wget -qO- http://127.0.0.1:3000/api/health 2> /dev/null |
    sed -n 's/^.*"version":"\([^"]*\)".*$/\1/p' | tr -cd 'A-Za-z0-9.+-')
  echo "${wert:-unbekannt}"
}

ordner_pruefen() {
  [ -n "$ordner" ] || abbruch 2 "Welche Sicherung? Ordner angeben, z. B. ~/paibot-sicherungen/paibot-sicherung-<Zeit>."
  [ -f "$ordner/begleit.json" ] || abbruch 1 "$ordner/begleit.json fehlt. Ist das ein Ordner von sh deploy/sicherung.sh sichern?"
  grep -q '"format":"pb-sicherung","v":1' "$ordner/begleit.json" ||
    abbruch 1 "$ordner/begleit.json ist keine Begleit-Datei einer Sicherung von PaiBot."
}

pruefsumme_pruefen() {
  [ -f "$ordner/datenbank.dump" ] || abbruch 1 "$ordner/datenbank.dump fehlt."
  soll=$(begleit_feld "$ordner/begleit.json" sha256)
  ist=$(sha256_von "$ordner/datenbank.dump")
  if [ -z "$soll" ] || [ "$soll" != "$ist" ]; then
    meldung "✗ Prüfsumme der Datei datenbank.dump stimmt nicht mit der Begleit-Datei überein."
    abbruch 1 "Die Sicherung ist beschädigt oder verändert. Nimm eine andere Sicherung."
  fi
  echo "✓ Prüfsumme der Datei datenbank.dump stimmt (SHA-256)."
}

# Bewertet die Zeilen von „sicherung-db.sh vergleichen“. Modus genau: direkt nach dem Einspielen,
# alles muss gleich sein. Modus danach: im Betrieb, Neues darf dazukommen.
bewerten() {
  modus=$1
  datei=$2
  fehler=0
  tabellen=0
  gleich=0
  while IFS='|' read -r art a b c d e f; do
    case "$art" in
      T)
        tabellen=$((tabellen + 1))
        if [ -z "$b" ]; then
          if [ "$modus" = genau ]; then
            echo "✗ Tabelle $a ist nicht in der Sicherung."
            fehler=1
          else
            echo "  Hinweis: Tabelle $a ist neu ($c Zeilen)."
          fi
        elif [ -z "$c" ]; then
          if [ "$modus" = genau ]; then
            echo "✗ Tabelle $a fehlt."
            fehler=1
          else
            echo "  Hinweis: Tabelle $a gibt es nicht mehr (neuere Version)."
          fi
        elif [ "$b" = "$c" ]; then
          gleich=$((gleich + 1))
        elif [ "$modus" = genau ]; then
          echo "✗ Tabelle $a: $c Zeilen statt $b."
          fehler=1
        elif [ "$c" -lt "$b" ]; then
          echo "  Hinweis: Tabelle $a hat jetzt $c Zeilen, in der Sicherung $b."
        fi
        ;;
      M)
        if { [ "$modus" = genau ] && [ "$a" = "$b" ] && [ "$c" = "$d" ]; } ||
          { [ "$modus" = danach ] && [ "${b:-0}" -ge "${a:-0}" ] && [ "${d:-0}" -ge "${c:-0}" ]; }; then
          echo "✓ Migrationen: $a in der Sicherung, $b in der Datenbank."
        else
          echo "✗ Migrationen: $a in der Sicherung, $b in der Datenbank."
          fehler=1
        fi
        ;;
      B)
        if [ "${a:-0}" = 0 ]; then
          echo "✓ Belege: keine in der Sicherung."
        elif [ -n "$d" ] && [ "$d" = "$e" ] && [ "$f" = true ] &&
          { { [ "$modus" = genau ] && [ "$a" = "$b" ]; } || { [ "$modus" = danach ] && [ "${b:-0}" -ge "$a" ]; }; }; then
          echo "✓ Belege: Anfang und Beleg Nr. $c wie in der Sicherung ($b Belege)."
        else
          echo "✗ Belege: Anfang oder Beleg Nr. ${c:-?} weichen von der Sicherung ab ($b statt $a Belege)."
          fehler=1
        fi
        ;;
    esac
  done < "$datei"
  if [ "$modus" = genau ] && [ "$fehler" = 0 ]; then
    echo "✓ Tabellen: $tabellen verglichen, gleiche Zeilen wie in der Sicherung."
  elif [ "$modus" = danach ]; then
    echo "✓ Tabellen: $tabellen verglichen, $gleich mit gleicher Zahl an Zeilen."
  fi
  return "$fehler"
}

# Pfad zum eigenständigen Prüfer der Belege (belege-pruefen.mjs, eine Datei ohne Abhängigkeiten).
# Fehlt er oder ist er älter als der Code, baut ihn ein Wegwerf-Container aus diesem Ordner.
pruefer_bereitstellen() {
  if [ -n "${PAIBOT_BELEGE_PRUEFER:-}" ]; then
    [ -f "$PAIBOT_BELEGE_PRUEFER" ] || abbruch 1 "PAIBOT_BELEGE_PRUEFER zeigt auf keine Datei."
    echo "$PAIBOT_BELEGE_PRUEFER"
    return 0
  fi
  buendel="$WURZEL/packages/receipts/dist/belege-pruefen.mjs"
  [ -d "$WURZEL/packages/receipts/src" ] || abbruch 1 "Quellcode des Prüfers fehlt ($WURZEL/packages/receipts)."
  if [ -f "$buendel" ] && [ -z "$(find "$WURZEL/packages/receipts/src" "$WURZEL/packages/shared/src" \
    "$WURZEL/packages/crypto/src" -name '*.ts' -newer "$buendel" 2> /dev/null | head -n 1)" ]; then
    echo "$buendel"
    return 0
  fi
  meldung "Baue den Prüfer der Belege in einem Wegwerf-Container (beim ersten Mal, braucht Internet) …"
  mkdir -p "$WURZEL/packages/receipts/dist"
  if ! docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e COREPACK_HOME=/tmp/corepack \
    -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 -v "$WURZEL:/repo:ro" \
    -v "$WURZEL/packages/receipts/dist:/aus" "$NODE_IMAGE" sh -c '
      set -eu
      mkdir /tmp/bau
      cp -a /repo/. /tmp/bau/
      find /tmp/bau -name node_modules -prune -exec rm -rf {} +
      rm -rf /tmp/bau/.git
      cd /tmp/bau
      corepack pnpm install --frozen-lockfile --filter "@paibot/receipts..." > /tmp/install.log 2>&1 ||
        { tail -n 40 /tmp/install.log; exit 1; }
      corepack pnpm --filter @paibot/receipts build > /tmp/build.log 2>&1 ||
        { tail -n 40 /tmp/build.log; exit 1; }
      cp packages/receipts/dist/belege-pruefen.mjs /aus/belege-pruefen.mjs
    ' >&2; then
    return 1
  fi
  echo "$buendel"
}

kette_pruefen() {
  arbeit=$1
  db anker < "$ordner/begleit.json" > "$arbeit/anker.json"
  anzahl=$(sed -n 's/^.*"belege" : {"anzahl" : \([0-9]*\).*$/\1/p' "$ordner/begleit.json")
  if [ ! -s "$arbeit/anker.json" ]; then
    if [ "${anzahl:-0}" = 0 ]; then
      echo "✓ Belege-Kette: keine Belege in der Sicherung, nichts zu prüfen."
      return 0
    fi
    echo "✗ Belege-Kette: der Anker fehlt in der Begleit-Datei."
    return 1
  fi
  db export < /dev/null > "$arbeit/belege.jsonl"
  if ! pruefer=$(pruefer_bereitstellen); then
    echo "✗ Belege-Kette NICHT geprüft: Der Prüfer ließ sich nicht bauen (Meldung oben)."
    echo "  Ausweg: in der App unter Belege exportieren und auf deinem Rechner mit pnpm belege:pruefen prüfen."
    return 1
  fi
  set +e
  docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    -u "$(id -u):$(id -g)" -v "$pruefer:/pruefer/belege-pruefen.mjs:ro" -v "$arbeit:/pruefung:ro" \
    "$NODE_IMAGE" node /pruefer/belege-pruefen.mjs /pruefung/belege.jsonl \
    --anker "$(cat "$arbeit/anker.json")" > "$arbeit/kette.txt" 2>&1
  code=$?
  set -e
  sed 's/^/  /' "$arbeit/kette.txt"
  if [ "$code" = 0 ] && grep -qF "Kette gültig" "$arbeit/kette.txt"; then
    echo "✓ Belege-Kette geprüft, gegen den Anker aus der Begleit-Datei."
    return 0
  fi
  echo "✗ Belege-Kette: Prüfung fehlgeschlagen (Exit-Code $code)."
  return 1
}

pruefen() {
  ordner_pruefen
  echo "PaiBot – Sicherung prüfen: $ordner"
  ergebnis=0
  arbeit=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf '$arbeit'" EXIT
  if [ -f "$ordner/datenbank.dump" ]; then
    pruefsumme_pruefen || ergebnis=1
  fi
  db vergleichen < "$ordner/begleit.json" > "$arbeit/vergleich.txt"
  bewerten danach "$arbeit/vergleich.txt" || ergebnis=1
  kette_pruefen "$arbeit" || ergebnis=1
  if [ "$ergebnis" = 0 ]; then
    echo "Ergebnis: Alles aus der Sicherung ist da."
  else
    echo "Ergebnis: Abweichungen gefunden (siehe ✗)."
  fi
  return "$ergebnis"
}

sichern() {
  [ -z "$ordner" ] || abbruch 2 "sichern nimmt keinen Ordner; Ziel mit --ziel <ordner>."
  mkdir -p "$ziel"
  ziel=$(cd "$ziel" && pwd)
  neu="$ziel/paibot-sicherung-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir "$neu" || abbruch 1 "$neu gibt es schon."
  chmod 700 "$neu"
  echo "PaiBot – sichern nach $neu"
  if ! db sichern < /dev/null > "$neu/datenbank.dump" 2> "$neu/meldungen.txt"; then
    grep -v '^PAIBOT-STAND ' "$neu/meldungen.txt" >&2 || true
    rm -rf "$neu"
    abbruch 1 "Sichern gescheitert. Läuft der Dienst postgres? (docker compose … ps)"
  fi
  grep -v '^PAIBOT-STAND ' "$neu/meldungen.txt" >&2 || true
  stand=$(sed -n 's/^PAIBOT-STAND //p' "$neu/meldungen.txt")
  rm -f "$neu/meldungen.txt"
  [ -n "$stand" ] || {
    rm -rf "$neu"
    abbruch 1 "Der Stand der Datenbank fehlt; Sicherung verworfen."
  }
  db liste < "$neu/datenbank.dump" || {
    rm -rf "$neu"
    abbruch 1 "Die eben geschriebene Datei ist nicht lesbar; Sicherung verworfen."
  }
  summe=$(sha256_von "$neu/datenbank.dump")
  groesse=$(wc -c < "$neu/datenbank.dump" | tr -d ' ')
  printf '{"format":"pb-sicherung","v":1,"paibot":"%s","datei":"datenbank.dump","sha256":"%s","bytes":%s,"warteschlange":"nicht enthalten","geheimnisse":"nicht enthalten: PAIBOT_SECRET und deploy/.env getrennt aufbewahren","stand":%s}\n' \
    "$(version_der_app)" "$summe" "$groesse" "$stand" > "$neu/begleit.json"
  chmod 600 "$neu/datenbank.dump" "$neu/begleit.json"
  echo "✓ Datenbank gesichert: $groesse Byte, SHA-256 $summe"
  echo "✓ Begleit-Datei: $neu/begleit.json"
  echo "  Die Sicherung enthält deine Unterhaltungen lesbar und ist nicht verschlüsselt."
  echo "  PAIBOT_SECRET und deploy/.env sind nicht enthalten: getrennt und sicher aufbewahren."
  echo "  Zurückspielen: sh deploy/sicherung.sh zurueckspielen $neu"
}

zurueckspielen() {
  ordner_pruefen
  echo "PaiBot – zurückspielen aus $ordner"
  pruefsumme_pruefen
  if [ -z "$container" ]; then
    # Nur die Datenbank starten (falls sie noch nicht läuft); web und worker bleiben aus.
    compose up -d postgres > /dev/null
  fi
  warte_gesund postgres
  zustand=$(db zustand < /dev/null)
  case "$zustand" in
    leer | frisch) echo "✓ Ziel-Datenbank ist $zustand." ;;
    *)
      meldung "Die Datenbank dieser Installation ist nicht leer (${zustand#benutzt: })."
      meldung "Zurückspielen geht nur in eine frische Installation, damit nichts überschrieben wird."
      meldung "Ausweg: 1. diese Installation erst sichern (sh deploy/sicherung.sh sichern),"
      meldung "        2. Stack samt Volume löschen: docker compose … down -v,"
      meldung "        3. die Sicherung erneut zurückspielen (startet die Datenbank selbst)."
      exit 3
      ;;
  esac
  for name in web worker; do
    id=$(dienst "$name")
    if [ -n "$id" ] && [ "$(zustand_von "$id")" = "running" ]; then
      docker stop "$id" > /dev/null
      echo "✓ Dienst $name angehalten."
    fi
  done
  id=$(dienst migrate)
  if [ -n "$id" ]; then
    i=0
    while [ "$(zustand_von "$id")" = "running" ] && [ "$i" -lt "$WARTEZEIT" ]; do
      sleep 2
      i=$((i + 2))
    done
  fi
  db zurueckspielen < "$ordner/datenbank.dump"
  arbeit=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf '$arbeit'" EXIT
  db vergleichen < "$ordner/begleit.json" > "$arbeit/vergleich.txt"
  if ! bewerten genau "$arbeit/vergleich.txt"; then
    abbruch 1 "Die eingespielte Datenbank weicht von der Begleit-Datei ab; nichts gestartet."
  fi
  if [ "$ohne_start" = 1 ]; then
    echo "Eingespielt, nichts gestartet (--ohne-start). Danach: Stack starten; migrate bringt die"
    echo "Datenbank auf Stand und setzt die Rechte der App-Rolle. Dann: sh deploy/sicherung.sh pruefen $ordner"
    return 0
  fi
  if [ -n "$container" ]; then
    mig=$(dienst migrate)
    [ -n "$mig" ] || abbruch 1 "Dienst migrate nicht gefunden. Stelle die Anwendung neu bereit (in Coolify: Redeploy), danach: sh deploy/sicherung.sh pruefen $ordner --container $container"
    if ! docker start -a "$mig" > "$arbeit/migrate.log" 2>&1; then
      tail -n 40 "$arbeit/migrate.log" >&2
      abbruch 1 "Migrations-Schritt gescheitert (Log oben)."
    fi
    for name in web worker; do
      id=$(dienst "$name")
      [ -z "$id" ] || docker start "$id" > /dev/null
    done
  else
    compose up -d > /dev/null
    mig=$(dienst migrate)
    i=0
    while [ "$(zustand_von "$mig")" != "exited" ] && [ "$i" -lt "$WARTEZEIT" ]; do
      sleep 2
      i=$((i + 2))
    done
    docker logs "$mig" > "$arbeit/migrate.log" 2>&1 || true
    if [ "$(docker inspect --format '{{.State.ExitCode}}' "$mig")" != 0 ]; then
      tail -n 40 "$arbeit/migrate.log" >&2
      abbruch 1 "Migrations-Schritt gescheitert (Log oben)."
    fi
  fi
  grep -qF "Migrations-Schritt fertig." "$arbeit/migrate.log" ||
    abbruch 1 "Im Log von migrate fehlt die Zeile: Migrations-Schritt fertig."
  echo "✓ Migrations-Schritt fertig: Datenbank auf Stand, Rechte der App-Rolle gesetzt."
  warte_gesund web
  warte_gesund worker
  echo "✓ web und worker laufen."
  rm -rf "$arbeit"
  trap - EXIT
  pruefen
}

case "$befehl" in
  sichern) sichern ;;
  zurueckspielen) zurueckspielen ;;
  pruefen) pruefen ;;
esac
