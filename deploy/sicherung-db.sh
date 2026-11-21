#!/bin/sh
# PaiBot – Sicherung und Wiederherstellung: der Teil, der direkt bei der Datenbank läuft.
#
# Autor:     Oliver Hees
# Website:   https://paibot.de
# Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
# Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
# Seit:      2026-11-21

# Läuft im Container postgres (oder überall, wo psql, pg_dump und pg_restore liegen). Die
# Verbindung kommt aus den üblichen Variablen von libpq (PGHOST, PGPORT, PGUSER, PGDATABASE,
# PGPASSWORD); im Container gelten POSTGRES_USER und POSTGRES_DB über den lokalen Socket.
# Normalerweise ruft es deploy/sicherung.sh auf und reicht es als Text in den Container.
#
#   sh sicherung-db.sh sichern > datenbank.dump    Stand als Zeile „PAIBOT-STAND {…}“ auf stderr
#   sh sicherung-db.sh stand                        Stand der Datenbank als eine Zeile JSON
#   sh sicherung-db.sh zustand                      leer | frisch | benutzt: <Tabellen>
#   sh sicherung-db.sh liste < datenbank.dump       liest das Inhaltsverzeichnis (Datei lesbar?)
#   sh sicherung-db.sh zurueckspielen < datenbank.dump
#   sh sicherung-db.sh vergleichen < begleit.json   Zeilen T|…, M|…, B|… zum Vergleich
#   sh sicherung-db.sh anker < begleit.json         Anker der Belege-Kette aus der Begleit-Datei
#   sh sicherung-db.sh export > belege.jsonl        Beleg-Export für den Prüfer (belege-pruefen.mjs)
#
# Sichern liest nur: Rolle paibot_sicherung (ohne Anmeldung, nur Mitglied von pg_read_all_data),
# per SET ROLE. Zählung und Dump kommen aus demselben Snapshot. Das Schema der Warteschlange
# (pgboss) gehört nicht zur Sicherung: Offene Aufträge werden nicht zurückgespielt.
set -eu

: "${PGUSER:=${POSTGRES_USER:-postgres}}"
: "${PGDATABASE:=${POSTGRES_DB:-$PGUSER}}"
export PGUSER PGDATABASE

SICHERUNGS_ROLLE=paibot_sicherung
WARTESCHLANGE=pgboss
# Tabellen, die eine nie eingerichtete Installation selbst füllt (Standard-Regeln aus den
# Migrationen, Einrichtungs-Code, Fehlversuche bei der Einrichtung).
FRISCH_ERLAUBT="'rules', 'settings', 'rate_limits'"

meldung() { printf '%s\n' "$*" >&2; }
abbruch() {
  code=$1
  shift
  printf 'FEHLER: %s\n' "$*" >&2
  exit "$code"
}

psql_q() { PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning" psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }

# Zeilen je Tabelle (alle Schemas außer System und Warteschlange), als SQL-Ausdruck einer Abfrage
# mit den Spalten tabelle und zeilen. Ohne feste Liste: neue Tabellen zählen von allein mit.
ZAEHLUNG="
  select n.nspname || '.' || c.relname as tabelle,
    (pg_catalog.xpath('/row/n/text()', pg_catalog.query_to_xml(
      pg_catalog.format('select count(*) as n from %I.%I', n.nspname, c.relname),
      false, true, '')))[1]::text::bigint as zeilen
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and not c.relispartition
    and n.nspname <> all (array['information_schema', '$WARTESCHLANGE'])
    and n.nspname !~ '^pg_'"

# Stand der Datenbank als eine Zeile JSON: Zeit, Version von Postgres, Migrationen, Zeilen je
# Tabelle, Belege mit Anker (Format pb-anker, wie ihn der Prüfer liest).
STAND_SQL="
select pg_catalog.to_char(pg_catalog.statement_timestamp() at time zone 'UTC',
         'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as zeit,
       pg_catalog.to_regclass('drizzle.__drizzle_migrations') is not null as hat_migrationen,
       pg_catalog.to_regclass('public.belege') is not null as hat_belege \\gset
\\if :hat_migrationen
select pg_catalog.json_build_object('anzahl', count(*),
         'neueste', coalesce(max(created_at)::text, ''),
         'hash', coalesce((select hash from drizzle.__drizzle_migrations
                           order by created_at desc, id desc limit 1), '')) as migrationen
  from drizzle.__drizzle_migrations \\gset
\\else
select pg_catalog.json_build_object('anzahl', 0, 'neueste', '', 'hash', '') as migrationen \\gset
\\endif
\\if :hat_belege
select pg_catalog.json_build_object(
         'anzahl', (select count(*) from public.belege),
         'anker', (
           select pg_catalog.json_build_object('format', 'pb-anker', 'v', 1,
                    'installationId', s.body->'facts'->>'installationId',
                    'seq', h.seq, 'hash', h.hash, 'keyId', h.key_id,
                    'startKeyId', s.body->>'keyId',
                    'startPublicKey', s.body->'facts'->>'publicKey',
                    'time', :'zeit')
           from public.belege s
           cross join lateral (select seq, hash, key_id from public.belege
                               order by seq desc limit 1) h
           where s.seq = 1)) as belege \\gset
\\else
select pg_catalog.json_build_object('anzahl', 0, 'anker', null) as belege \\gset
\\endif
select coalesce(pg_catalog.json_object_agg(tabelle, zeilen order by tabelle), '{}'::json) as tabellen
  from ($ZAEHLUNG) t \\gset
select pg_catalog.json_build_object('zeit', :'zeit',
         'postgres', pg_catalog.current_setting('server_version'),
         'migrationen', :'migrationen'::json,
         'tabellen', :'tabellen'::json,
         'belege', :'belege'::json);
"

rolle_einrichten() {
  # Nur lesen: keine Anmeldung, kein Passwort; benutzt wird sie mit SET ROLE.
  psql_q <<SQL
do \$\$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = '$SICHERUNGS_ROLLE') then
    create role $SICHERUNGS_ROLLE nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not pg_catalog.pg_has_role('$SICHERUNGS_ROLLE', 'pg_read_all_data', 'MEMBER') then
    grant pg_read_all_data to $SICHERUNGS_ROLLE;
  end if;
end
\$\$;
SQL
}

stand() {
  psql_q -c "set role $SICHERUNGS_ROLLE" -f - <<SQL
$STAND_SQL
SQL
}

sichern() {
  rolle_einrichten
  arbeit=$(mktemp -d)
  trap 'rm -rf "$arbeit"' EXIT
  mkfifo "$arbeit/befehle"
  # Eine Sitzung hält den Snapshot offen; pg_dump liest denselben Stand.
  psql_q < "$arbeit/befehle" > "$arbeit/ausgabe" 2> "$arbeit/fehler" &
  sitzung=$!
  exec 3> "$arbeit/befehle"
  printf '%s\n' "set role $SICHERUNGS_ROLLE;" \
    "begin isolation level repeatable read read only;" \
    "select pg_catalog.pg_export_snapshot();" >&3
  snapshot=""
  i=0
  while [ $i -lt 300 ]; do
    snapshot=$(head -n 1 "$arbeit/ausgabe" 2> /dev/null || true)
    [ -n "$snapshot" ] && break
    if ! kill -0 "$sitzung" 2> /dev/null; then break; fi
    sleep 0.1
    i=$((i + 1))
  done
  if [ -z "$snapshot" ]; then
    exec 3>&-
    cat "$arbeit/fehler" >&2
    abbruch 1 "Die Datenbank liefert keinen Snapshot (Verbindung oder Rechte prüfen)."
  fi
  if ! pg_dump -Fc --no-password --role="$SICHERUNGS_ROLLE" --snapshot="$snapshot" \
    --exclude-schema="$WARTESCHLANGE" -d "$PGDATABASE"; then
    exec 3>&-
    abbruch 1 "pg_dump ist gescheitert (Meldung oben)."
  fi
  printf '%s\n' "$STAND_SQL" "commit;" >&3
  exec 3>&-
  if ! wait "$sitzung"; then
    cat "$arbeit/fehler" >&2
    abbruch 1 "Der Stand der Datenbank ließ sich nicht lesen."
  fi
  zeile=$(sed -n '2p' "$arbeit/ausgabe")
  case "$zeile" in
    "{"*) printf 'PAIBOT-STAND %s\n' "$zeile" >&2 ;;
    *) abbruch 1 "Der Stand der Datenbank fehlt in der Ausgabe." ;;
  esac
}

zustand() {
  psql_q -f - <<SQL
select count(*) > 0 as hat_tabellen from ($ZAEHLUNG) t \\gset
\\if :hat_tabellen
select coalesce(pg_catalog.string_agg(tabelle || ' (' || zeilen || ')', ', ' order by tabelle), '') as belegt
  from ($ZAEHLUNG) t
  where zeilen > 0 and tabelle not like 'drizzle.%'
    and tabelle not in (select 'public.' || x from pg_catalog.unnest(array[$FRISCH_ERLAUBT]) x) \\gset
select exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'settings' and column_name = 'setup_completed_at') as hat_abschluss \\gset
\\if :hat_abschluss
select exists (select 1 from public.settings where setup_completed_at is not null) as eingerichtet \\gset
\\else
select false as eingerichtet \\gset
\\endif
\\if :eingerichtet
select 'benutzt: Einrichtung abgeschlossen' || case when :'belegt' = '' then '' else ', ' || :'belegt' end;
\\else
select case when :'belegt' = '' then 'frisch' else 'benutzt: ' || :'belegt' end;
\\endif
\\else
select 'leer';
\\endif
SQL
}

leeren() {
  # Nur für eine frische Installation (nie eingerichtet): alles weg, Schema public wie neu.
  psql_q -1 <<'SQL'
do $$
declare
  s record;
begin
  for s in
    select nspname from pg_catalog.pg_namespace
    where nspname !~ '^pg_' and nspname <> 'information_schema'
  loop
    execute pg_catalog.format('drop schema %I cascade', s.nspname);
  end loop;
end
$$;
create schema public authorization pg_database_owner;
grant usage on schema public to public;
comment on schema public is 'standard public schema';
SQL
}

zurueckspielen() {
  ergebnis=$(zustand)
  case "$ergebnis" in
    leer) ;;
    frisch)
      meldung "Datenbank ist frisch (nie eingerichtet); sie wird vor dem Einspielen geleert."
      leeren
      ;;
    *)
      meldung "Die Datenbank ist nicht leer (${ergebnis#benutzt: })."
      abbruch 3 "Zurückspielen nur in eine frische Installation. Ausweg: erst diese Installation sichern, dann Stack samt Volume löschen (docker compose … down -v), neu starten und die Sicherung einspielen."
      ;;
  esac
  # Besitzer wird die Migrations-Rolle dieser Installation; die Rechte der App-Rolle setzt der
  # Migrations-Schritt danach neu. Alles in einer Transaktion: bei einem Fehler bleibt nichts halb.
  if ! pg_restore --no-owner --no-privileges --single-transaction --exit-on-error \
    --no-password -d "$PGDATABASE"; then
    abbruch 1 "pg_restore ist gescheitert (Meldung oben). Die Datenbank ist unverändert bzw. leer."
  fi
  # Aufträge der Warteschlange sind nicht in der Sicherung. Läufe, die beim Sichern aktiv waren,
  # bekommen einen alten Herzschlag; der Worker beendet sie beim Start als „unterbrochen“ (und
  # schreibt zu einer offenen Entscheidung das Ergebnis). Ein wartender Lauf ohne Auftrag würde
  # sonst die Unterhaltung sperren.
  markiert=$(psql_q -f - <<'SQL'
select pg_catalog.to_regclass('public.runs') is not null as hat_laeufe \gset
\if :hat_laeufe
with alt as (
  update public.runs
     set status = 'running',
         started_at = coalesce(started_at, pg_catalog.statement_timestamp() - interval '1 day'),
         heartbeat_at = pg_catalog.statement_timestamp() - interval '1 day'
   where status in ('queued', 'running')
  returning 1)
select count(*) from alt;
\else
select 0;
\endif
SQL
)
  meldung "Eingespielt. Aktive Läufe, die der Worker beim Start als unterbrochen beendet: $markiert."
}

liste() {
  pg_restore --list > /dev/null || abbruch 1 "Die Sicherungs-Datei ist nicht lesbar."
}

vergleichen() {
  begleit=$(cat)
  psql_q -v begleit="$begleit" -c "set role $SICHERUNGS_ROLLE" -f - <<SQL
select pg_catalog.to_regclass('drizzle.__drizzle_migrations') is not null as hat_migrationen,
       pg_catalog.to_regclass('public.belege') is not null as hat_belege \\gset
with erwartet as (
  select key as tabelle, value::text::bigint as zeilen
  from pg_catalog.json_each(:'begleit'::json->'stand'->'tabellen')),
jetzt as ($ZAEHLUNG)
select 'T|' || coalesce(e.tabelle, j.tabelle) || '|' || coalesce(e.zeilen::text, '')
       || '|' || coalesce(j.zeilen::text, '')
from erwartet e full join jetzt j on j.tabelle = e.tabelle
order by coalesce(e.tabelle, j.tabelle);
\\if :hat_migrationen
select 'M|' || (:'begleit'::json->'stand'->'migrationen'->>'anzahl') || '|' || count(*)
       || '|' || coalesce(:'begleit'::json->'stand'->'migrationen'->>'neueste', '')
       || '|' || coalesce(max(created_at)::text, '')
from drizzle.__drizzle_migrations;
\\else
select 'M|' || (:'begleit'::json->'stand'->'migrationen'->>'anzahl') || '|0|'
       || coalesce(:'begleit'::json->'stand'->'migrationen'->>'neueste', '') || '|';
\\endif
\\if :hat_belege
with a as (select :'begleit'::json->'stand'->'belege'->'anker' as anker)
select 'B|' || (:'begleit'::json->'stand'->'belege'->>'anzahl')
       || '|' || (select count(*) from public.belege)
       || '|' || coalesce(a.anker->>'seq', '')
       || '|' || coalesce(a.anker->>'hash', '')
       || '|' || coalesce((select hash from public.belege where seq = (a.anker->>'seq')::bigint), '')
       || '|' || coalesce((select (s.body->'facts'->>'installationId') = a.anker->>'installationId'
                             and (s.body->>'keyId') = a.anker->>'startKeyId'
                             and (s.body->'facts'->>'publicKey') = a.anker->>'startPublicKey'
                           from public.belege s where s.seq = 1)::text, '')
from a;
\\else
select 'B|' || (:'begleit'::json->'stand'->'belege'->>'anzahl') || '|0||||';
\\endif
SQL
}

anker() {
  begleit=$(cat)
  psql_q -v begleit="$begleit" -f - <<'SQL'
select coalesce((:'begleit'::json->'stand'->'belege'->'anker')::text, '')
where pg_catalog.json_typeof(:'begleit'::json->'stand'->'belege'->'anker') = 'object';
SQL
}

export_jsonl() {
  # Gleiches Format wie der Export der App: Kopfzeile, danach je Beleg eine Zeile. Die Reihenfolge
  # der Schlüssel spielt für den Prüfer keine Rolle; er rechnet über die kanonische Form.
  psql_q -c "set role $SICHERUNGS_ROLLE" -f - <<'SQL'
select pg_catalog.to_regclass('public.belege') is not null as hat_belege \gset
\if :hat_belege
select count(*) > 0 as hat_eintraege from public.belege \gset
\if :hat_eintraege
select pg_catalog.json_build_object('format', 'pb-belege', 'v', 1,
         'installationId', (select body->'facts'->>'installationId' from public.belege where seq = 1),
         'publicKeys', (select pg_catalog.json_agg(pg_catalog.json_build_object(
                          'keyId', id, 'publicKey', public_key, 'fingerprint', fingerprint)
                          order by created_at, id)
                        from public.installation_keys));
select pg_catalog.json_build_object('seq', seq, 'id', id, 'hash', hash, 'signature', signature,
         'keyId', key_id, 'body', body)
  from public.belege order by seq;
\endif
\endif
SQL
}

befehl=${1:-}
case "$befehl" in
  sichern) sichern ;;
  stand) stand ;;
  zustand) zustand ;;
  liste) liste ;;
  zurueckspielen) zurueckspielen ;;
  vergleichen) vergleichen ;;
  anker) anker ;;
  export) export_jsonl ;;
  *)
    meldung "Aufruf: sh sicherung-db.sh sichern|stand|zustand|liste|zurueckspielen|vergleichen|anker|export"
    exit 64
    ;;
esac
