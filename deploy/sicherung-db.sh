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
#   sh sicherung-db.sh inhalt                       nennt, was in public/drizzle nicht von PaiBot ist
#
# Sichern liest nur: Rolle paibot_sicherung (ohne Anmeldung, nur Mitglied von pg_read_all_data),
# per SET ROLE. Zählung und Dump kommen aus demselben Snapshot. Gesichert und zurückgespielt werden
# nur die Schemas der App: public (Tabellen) und drizzle (Stand der Migrationen). Die Warteschlange
# (pgboss) gehört nicht dazu: Offene Aufträge werden nicht zurückgespielt. Die Quarantäne
# (paibot_quarantaene) und fremde Schemas gehören auch nicht dazu.
#
# Zurückspielen läuft nicht als Superuser: Eine eigene Rolle nur für diesen Lauf (Anmeldung mit
# Einmal-Passwort, keine Sonderrechte, nur CREATE in dieser Datenbank und im Schema public) spielt
# die Datei ein. Danach prüft das Skript, bevor irgendetwas anderes mit der Datenbank arbeitet, ob
# sie nur enthält, was die Migrationen von PaiBot anlegen (siehe inhalt_pruefen). Erst dann gehen
# die Objekte an den Benutzer dieses Skripts, und die Rolle wird gelöscht. Sonst wird die Datenbank
# wieder geleert.
set -eu

: "${PGUSER:=${POSTGRES_USER:-postgres}}"
: "${PGDATABASE:=${POSTGRES_DB:-$PGUSER}}"
export PGUSER PGDATABASE

SICHERUNGS_ROLLE=paibot_sicherung
WARTESCHLANGE=pgboss
# Schemas der App, als SQL-Liste und als Schalter für pg_dump/pg_restore.
APP_SCHEMAS="'public', 'drizzle'"
# Tabellen, die eine nie eingerichtete Installation selbst füllt (Standard-Regeln aus den
# Migrationen, Einrichtungs-Code, Fehlversuche bei der Einrichtung, Zustand der Datenschleuse,
# den der Worker beim Start meldet).
FRISCH_ERLAUBT="'rules', 'settings', 'rate_limits', 'schleuse_zustand'"

meldung() { printf '%s\n' "$*" >&2; }
abbruch() {
  code=$1
  shift
  printf 'FEHLER: %s\n' "$*" >&2
  exit "$code"
}

psql_q() { PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning" psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }

# Zeilen je Tabelle, als SQL-Ausdruck einer Abfrage mit den Spalten tabelle und zeilen. Ohne feste
# Liste: neue Tabellen zählen von allein mit. zaehlung <Bedingung an das Schema n>.
zaehlung() {
  printf '%s' "
  select n.nspname || '.' || c.relname as tabelle,
    (pg_catalog.xpath('/row/n/text()', pg_catalog.query_to_xml(
      pg_catalog.format('select count(*) as n from %I.%I', n.nspname, c.relname),
      false, true, '')))[1]::text::bigint as zeilen
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and not c.relispartition and $1"
}
# Für den Stand der Sicherung: nur die Schemas der App.
ZAEHLUNG=$(zaehlung "n.nspname in ($APP_SCHEMAS)")
# Für „ist die Ziel-Datenbank leer?“: alle Schemas außer System und Warteschlange.
ZAEHLUNG_ALLE=$(zaehlung "n.nspname <> all (array['information_schema', '$WARTESCHLANGE']) and n.nspname !~ '^pg_'")

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
  rolle_einrichten
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
    --schema=public --schema=drizzle -d "$PGDATABASE"; then
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
  rolle_einrichten
  psql_q -f - <<SQL
select count(*) > 0 as hat_tabellen from ($ZAEHLUNG_ALLE) t \\gset
\\if :hat_tabellen
select coalesce(pg_catalog.string_agg(tabelle || ' (' || zeilen || ')', ', ' order by tabelle), '') as belegt
  from ($ZAEHLUNG_ALLE) t
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

# Funktionen, die die Migrationen von PaiBot anlegen (je Fassung: Name und MD5 des Rumpfs). Ein
# Test vergleicht die Liste mit den Dateien unter packages/db/drizzle.
ERLAUBTE_FUNKTIONEN="
paibot_app_tools_regeln:017945a69bc1050072b6a0c87e3bf643
paibot_app_ziel_abdruck:bb283c9df8a97c32bc6bad4fae3ad974
paibot_apps_aenderung:74319cc2b88faab13e2dfca9b7bcd627
paibot_apps_nur_anhaengen:844ddadd8798cbc276a88491116b67b7
paibot_apps_regeln:0a90103ef3e5a2cd163f4df28f702966
paibot_belege_ergebnis_nach_entscheidung:0e255fd4fa78795ca8606e6cce38f3fb
paibot_belege_unveraenderlich:9a4a719b8e857d0770105952a0f99ef0
paibot_bot_app_grants_regeln:c9065a9ef62d9c4c36eee88987852d48
paibot_einrichtungs_code_ohne_besitzer:ba4e8930a0b42c5eb2c458292c647b6a
paibot_ereignisse_nur_anhaengen:056de2fc438f28fa50fe312633210aca
paibot_ereignisse_nur_anhaengen:5492408bdfc3f6124018a33d6d51bf25
paibot_ereignisse_nur_anhaengen:fd6138186985a287fd21b9bac8855341
paibot_installation_id_fest:692bc8b62955a5b48823b43e1fbfe37a
paibot_messages_erben:62621d7ec766529b9fdf94cbc1ed8443
paibot_messages_unveraenderlich:5b401d6ed844c763571359a56cb2fd73
paibot_messages_unveraenderlich:e68a063a311bfa103ade7dff3939463f
paibot_regeln_nummer:0e9820672d33e80a7578e4a8ca44c290
paibot_regeln_unveraenderlich:79d5e2e71fb891da2a560d8cd5f65671
paibot_runs_regeln:cfebdd4e9b6a02f5fa087f01f65991e2
paibot_schluessel_nur_anhaengen:7b14af8ca27cc0bcabbd5d475a024900
paibot_tool_calls_regeln:014fc466b90bb93c9853fc39d40f5813
paibot_tool_calls_regeln:39752de15adcb2192c9b5963a15245bc
paibot_tool_calls_regeln:7fccf7fb8dc74ba290a94ee0f4cdbc87
"
# Eingebaute Funktionen, die in Prüfregeln, Standardwerten, Indizes und Trigger-Bedingungen der
# Migrationen vorkommen (auch hinter Operatoren). Andere eingebaute Funktionen, die etwa Text als
# Abfrage ausführen, sind dort nicht erlaubt.
ERLAUBTE_AUSDRUCK_FUNKTIONEN="
booleq char_length int4 int4eq int4ge int4gt int4le int84eq int84ge jsonb_eq jsonb_object_field
jsonb_object_field_text jsonb_typeof nextval now texteq textne textregexeq timestamptz_gt to_jsonb
"
# Arten von Knoten in diesen Ausdrücken (wie Postgres sie speichert).
ERLAUBTE_KNOTEN="ARRAYEXPR BOOLEXPR CONST DISTINCTEXPR FUNCEXPR NULLTEST OPEXPR SCALARARRAYOPEXPR VAR"

# Wörter durch Leerzeichen oder Zeilen getrennt → SQL-Liste 'a', 'b'.
# shellcheck disable=SC2086
sql_liste() { printf "'%s'," $1 | sed 's/,$//'; }

# Prüft eine eingespielte Datenbank. Gibt je Fund eine Zeile aus; leer heißt: In den Schemas der
# App liegt nur, was die Migrationen von PaiBot anlegen, und die Rolle des Einspielens besitzt
# nichts anderes. Liest nur Kataloge; dabei läuft kein Code aus der Datenbank.
inhalt_pruefen() {
  psql_q -v rolle="${1:-}" -f - <<SQL
with ns as (
  select oid, nspname from pg_catalog.pg_namespace where nspname in ($APP_SCHEMAS)),
rolle as (
  select oid from pg_catalog.pg_roles where rolname = :'rolle'),
baeume as (
  select 'Prüfregel ' || k.conname || ' an ' || k.conrelid::pg_catalog.regclass::text as wo,
         k.conbin::text as t
    from pg_catalog.pg_constraint k join ns on ns.oid = k.connamespace where k.conbin is not null
  union all
  select 'Ausdruck an ' || d.adrelid::pg_catalog.regclass::text || '.' || a.attname, d.adbin::text
    from pg_catalog.pg_attrdef d
    join pg_catalog.pg_class c on c.oid = d.adrelid join ns on ns.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
  union all
  select 'Index ' || i.indexrelid::pg_catalog.regclass::text,
         coalesce(i.indexprs::text, '') || coalesce(i.indpred::text, '')
    from pg_catalog.pg_index i
    join pg_catalog.pg_class c on c.oid = i.indrelid join ns on ns.oid = c.relnamespace
   where i.indexprs is not null or i.indpred is not null
  union all
  select 'Trigger ' || g.tgname || ' an ' || g.tgrelid::pg_catalog.regclass::text, g.tgqual::text
    from pg_catalog.pg_trigger g
    join pg_catalog.pg_class c on c.oid = g.tgrelid join ns on ns.oid = c.relnamespace
   where g.tgqual is not null),
funde as (
  select 'Schema ' || n.nspname as fund from pg_catalog.pg_namespace n, rolle
   where n.nspowner = rolle.oid and n.nspname not in ($APP_SCHEMAS)
  union all
  select 'Objekt der Art ' || d.classid::pg_catalog.regclass::text
    from pg_catalog.pg_shdepend d, rolle
   where d.refobjid = rolle.oid and d.deptype = 'o'
     and d.dbid = (select oid from pg_catalog.pg_database where datname = pg_catalog.current_database())
     and d.classid not in ('pg_catalog.pg_class'::pg_catalog.regclass,
       'pg_catalog.pg_type'::pg_catalog.regclass, 'pg_catalog.pg_proc'::pg_catalog.regclass,
       'pg_catalog.pg_namespace'::pg_catalog.regclass)
  union all
  select 'Objekt ' || c.oid::pg_catalog.regclass::text || ' (Art ' || c.relkind::text || ')'
    from pg_catalog.pg_class c join ns on ns.oid = c.relnamespace
   where c.relkind not in ('r', 'S', 'i')
  union all
  select 'Objekt ' || c.oid::pg_catalog.regclass::text || ' außerhalb der Schemas der App'
    from pg_catalog.pg_class c, rolle
   where c.relowner = rolle.oid and c.relnamespace not in (select oid from ns)
     and c.relnamespace <> 'pg_toast'::pg_catalog.regnamespace
  union all
  select 'Zeilen-Regeln an ' || c.oid::pg_catalog.regclass::text
    from pg_catalog.pg_class c join ns on ns.oid = c.relnamespace
   where c.relrowsecurity or c.relforcerowsecurity
  union all
  select 'Policy ' || p.polname || ' an ' || p.polrelid::pg_catalog.regclass::text
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid join ns on ns.oid = c.relnamespace
  union all
  select 'Regel ' || r.rulename || ' an ' || r.ev_class::pg_catalog.regclass::text
    from pg_catalog.pg_rewrite r
    join pg_catalog.pg_class c on c.oid = r.ev_class join ns on ns.oid = c.relnamespace
  union all
  select 'Vererbung ' || i.inhrelid::pg_catalog.regclass::text || ' von '
         || i.inhparent::pg_catalog.regclass::text
    from pg_catalog.pg_inherits i
    join pg_catalog.pg_class c on c.oid in (i.inhrelid, i.inhparent) join ns on ns.oid = c.relnamespace
  union all
  select 'Statistik ' || s.stxname from pg_catalog.pg_statistic_ext s join ns on ns.oid = s.stxnamespace
  union all
  select 'Rechte an ' || c.oid::pg_catalog.regclass::text
    from pg_catalog.pg_class c join ns on ns.oid = c.relnamespace where c.relacl is not null
  union all
  select 'Rechte an Spalte ' || c.oid::pg_catalog.regclass::text || '.' || a.attname
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid join ns on ns.oid = c.relnamespace
   where a.attacl is not null
  union all
  select 'Rechte am Schema drizzle' from pg_catalog.pg_namespace
   where nspname = 'drizzle' and nspacl is not null
  union all
  select 'Funktion ' || p.oid::pg_catalog.regprocedure::text
    from pg_catalog.pg_proc p join ns on ns.oid = p.pronamespace
   where not (p.proname || ':' || pg_catalog.md5(p.prosrc) = any (array[$(sql_liste "$ERLAUBTE_FUNKTIONEN")])
              and p.prokind = 'f' and not p.prosecdef
              and (p.proconfig is null or p.proconfig = array['search_path=pg_catalog, public'])
              and p.proacl is null and p.proargdefaults is null
              and p.prolang = (select oid from pg_catalog.pg_language where lanname = 'plpgsql'))
  union all
  select 'Funktion ' || p.oid::pg_catalog.regprocedure::text || ' außerhalb der Schemas der App'
    from pg_catalog.pg_proc p, rolle
   where p.proowner = rolle.oid and p.pronamespace not in (select oid from ns)
  union all
  select 'Typ ' || t.oid::pg_catalog.regtype::text
    from pg_catalog.pg_type t join ns on ns.oid = t.typnamespace
   where t.typacl is not null
      or not ((t.typtype = 'c' and exists (select 1 from pg_catalog.pg_class r
                where r.oid = t.typrelid and r.relkind in ('r', 'S')))
           or (t.typcategory = 'A' and exists (select 1 from pg_catalog.pg_type e
                join pg_catalog.pg_class r on r.oid = e.typrelid
                where e.oid = t.typelem and e.typtype = 'c' and r.relkind in ('r', 'S'))))
  union all
  select 'Typ ' || t.oid::pg_catalog.regtype::text || ' außerhalb der Schemas der App'
    from pg_catalog.pg_type t, rolle
   where t.typowner = rolle.oid and t.typnamespace not in (select oid from ns)
  union all
  select 'Operator ' || o.oid::pg_catalog.regoperator::text
    from pg_catalog.pg_operator o join ns on ns.oid = o.oprnamespace
  union all
  select 'Operator-Klasse ' || o.opcname from pg_catalog.pg_opclass o join ns on ns.oid = o.opcnamespace
  union all
  select 'Operator-Familie ' || o.opfname
    from pg_catalog.pg_opfamily o join ns on ns.oid = o.opfnamespace
  union all
  select 'Sortierfolge ' || o.collname
    from pg_catalog.pg_collation o join ns on ns.oid = o.collnamespace
  union all
  select 'Umwandlung ' || c.castsource::pg_catalog.regtype::text || ' -> '
         || c.casttarget::pg_catalog.regtype::text
    from pg_catalog.pg_cast c where c.oid >= 16384
  union all
  select 'Index ' || i.indexrelid::pg_catalog.regclass::text || ' mit eigener Operator-Klasse'
    from pg_catalog.pg_index i
    join pg_catalog.pg_class c on c.oid = i.indrelid join ns on ns.oid = c.relnamespace
    cross join lateral pg_catalog.unnest(i.indclass::pg_catalog.oid[]) as k(oid)
    join pg_catalog.pg_opclass o on o.oid = k.oid
   where o.opcnamespace <> 'pg_catalog'::pg_catalog.regnamespace
  union all
  select 'Ausschluss-Regel ' || k.conname
    from pg_catalog.pg_constraint k join ns on ns.oid = k.connamespace where k.contype = 'x'
  union all
  select 'Trigger ' || g.tgname || ' an ' || g.tgrelid::pg_catalog.regclass::text
    from pg_catalog.pg_trigger g
    join pg_catalog.pg_class c on c.oid = g.tgrelid join ns on ns.oid = c.relnamespace
    join pg_catalog.pg_proc p on p.oid = g.tgfoid
   where p.pronamespace not in (select oid from ns)
     and not (g.tgisinternal and p.pronamespace = 'pg_catalog'::pg_catalog.regnamespace)
  union all
  select b.wo || ': ' || m[1]
    from baeume b cross join lateral pg_catalog.regexp_matches(b.t, '\\{([A-Z_]+)', 'g') m
   where m[1] <> all (array[$(sql_liste "$ERLAUBTE_KNOTEN")])
  union all
  select b.wo || ': Funktion ' || p.oid::pg_catalog.regprocedure::text
    from baeume b
    cross join lateral pg_catalog.regexp_matches(b.t,
      ':(?:funcid|opfuncid|hashfuncid|negfuncid|opno) ([0-9]+)', 'g') m
    join pg_catalog.pg_proc p on p.oid = m[1]::pg_catalog.oid
      or p.oid = (select o.oprcode from pg_catalog.pg_operator o where o.oid = m[1]::pg_catalog.oid)
   where not (p.pronamespace = 'pg_catalog'::pg_catalog.regnamespace
              and p.proname = any (array[$(sql_liste "$ERLAUBTE_AUSDRUCK_FUNKTIONEN")])))
select distinct fund from funde order by 1;
SQL
}

# Rolle nur für diesen Lauf: Anmeldung mit Einmal-Passwort, keine Sonderrechte.
zufall() { od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'; }

rolle_entfernen() {
  [ -n "${EINSPIEL_ROLLE:-}" ] || return 0
  psql_q -v rolle="$EINSPIEL_ROLLE" -f - <<'SQL' || meldung "Hinweis: Die Rolle $EINSPIEL_ROLLE ließ sich nicht löschen (ohne Anmeldung zurückgelassen)."
select pg_catalog.format('alter role %I nologin', :'rolle') where exists (
  select 1 from pg_catalog.pg_roles where rolname = :'rolle') \gexec
select pg_catalog.format('drop owned by %I', :'rolle') where exists (
  select 1 from pg_catalog.pg_roles where rolname = :'rolle') \gexec
select pg_catalog.format('drop role %I', :'rolle') where exists (
  select 1 from pg_catalog.pg_roles where rolname = :'rolle') \gexec
SQL
  EINSPIEL_ROLLE=""
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
  EINSPIEL_ROLLE="paibot_einspielen_$(zufall 6)"
  passwort=$(zufall 24)
  trap rolle_entfernen EXIT
  psql_q -v rolle="$EINSPIEL_ROLLE" -v passwort="$passwort" -f - <<'SQL'
select pg_catalog.format('create role %I login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls connection limit 1 password %L', :'rolle', :'passwort') \gexec
select pg_catalog.format('grant connect, create on database %I to %I', pg_catalog.current_database(), :'rolle') \gexec
select pg_catalog.format('grant usage, create on schema public to %I', :'rolle') \gexec
select pg_catalog.format('create schema drizzle authorization %I', :'rolle')
 where pg_catalog.to_regnamespace('drizzle') is null \gexec
select pg_catalog.format('grant usage, create on schema drizzle to %I', :'rolle')
 where pg_catalog.pg_get_userbyid((select nspowner from pg_catalog.pg_namespace where nspname = 'drizzle')) <> :'rolle' \gexec
SQL
  # Nur die Schemas der App; alles in einer Transaktion: bei einem Fehler bleibt nichts halb.
  # Ohne Besitzer und Rechte aus der Datei; die Rechte der App-Rolle setzt der Migrations-Schritt.
  if ! PGUSER="$EINSPIEL_ROLLE" PGPASSWORD="$passwort" pg_restore --schema=public --schema=drizzle \
    --no-owner --no-privileges --no-publications --no-subscriptions --no-security-labels \
    --no-tablespaces --single-transaction --exit-on-error --no-password -d "$PGDATABASE"; then
    leeren
    abbruch 1 "pg_restore ist gescheitert (Meldung oben). Die Datenbank ist leer."
  fi
  if ! funde=$(inhalt_pruefen "$EINSPIEL_ROLLE"); then
    leeren
    abbruch 1 "Der Inhalt ließ sich nicht prüfen (Meldung oben). Nichts eingespielt, die Datenbank ist wieder leer."
  fi
  if [ -n "$funde" ]; then
    meldung "Die Sicherung enthält Teile, die PaiBot nicht selbst anlegt:"
    printf '%s\n' "$funde" | head -n 20 | sed 's/^/  - /' >&2
    leeren
    abbruch 4 "Nichts eingespielt, die Datenbank ist wieder leer. Spiel nur Sicherungen zurück, die du selbst mit deploy/sicherung.sh angelegt und sicher aufbewahrt hast."
  fi
  psql_q -v rolle="$EINSPIEL_ROLLE" -f - <<'SQL'
select pg_catalog.format('reassign owned by %I to %I', :'rolle', current_user) \gexec
SQL
  rolle_entfernen
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
  # Nach dem Zurückspielen ist das ein anderer Postgres-Server: die Rolle gibt es dort noch nicht.
  rolle_einrichten
  psql_q -v begleit="$begleit" -c "set role $SICHERUNGS_ROLLE" -f - <<SQL
select pg_catalog.to_regclass('drizzle.__drizzle_migrations') is not null as hat_migrationen,
       pg_catalog.to_regclass('public.belege') is not null as hat_belege \\gset
with erwartet as (
  select key as tabelle, value::text::bigint as zeilen
  from pg_catalog.json_each(:'begleit'::json->'stand'->'tabellen')
  where pg_catalog.split_part(key, '.', 1) in ($APP_SCHEMAS)),
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
  rolle_einrichten
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
  inhalt) inhalt_pruefen ;;
  *)
    meldung "Aufruf: sh sicherung-db.sh sichern|stand|zustand|liste|zurueckspielen|vergleichen|anker|export|inhalt"
    exit 64
    ;;
esac
