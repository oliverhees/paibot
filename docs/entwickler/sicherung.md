<!--
PaiBot – Entwickler-Seite zur Sicherung und Wiederherstellung.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Sicherung und Wiederherstellung – für Entwickler

> **Regeln für diese Seite**
>
> - Nur Tatsachen: Jede Aussage ist am Code belegt, mit Pfad relativ zum Projektstamm in Backticks, wo sinnvoll mit Funktion oder Konstante (`deploy/sicherung-db.sh#inhalt_pruefen`). `pnpm doku:check` prüft, dass die Datei existiert und der Name nach `#` darin vorkommt.
> - Was sich nicht am Code belegen lässt, steht nicht hier. Geplantes heißt „geplant“.
> - Die Anwender-Seite erklärt die Bedienung; hier steht, wie es gebaut ist.

**Anwender-Doku:** [Sicherung und Wiederherstellung](../sicherung.md)

## Zweck und Entscheidung

Zwei Shell-Skripte sichern die Datenbank einer Installation, spielen sie in eine frische Installation zurück und prüfen danach nach. Sie brauchen auf dem Server nur Docker (`deploy/sicherung.sh`, Kopf der Datei).

Entscheidungen, die im Code stehen:

- **Zwei Skripte:** `deploy/sicherung.sh` läuft auf dem Server und steuert Docker (Dienste anhalten und starten, Prüfer der Belege ausführen). `deploy/sicherung-db.sh` läuft im Container der Datenbank (als Text über `docker exec`/`compose exec` hineingereicht, `deploy/sicherung.sh#db`) und macht alles, was `psql`, `pg_dump` und `pg_restore` braucht.
- **Nur lesen beim Sichern:** Die Sicherung nutzt die Rolle `paibot_sicherung` (ohne Anmeldung, nur Mitglied von `pg_read_all_data`) per `SET ROLE` (`deploy/sicherung-db.sh#rolle_einrichten`). Zählung der Zeilen und Dump kommen aus demselben Snapshot (`deploy/sicherung-db.sh#sichern`).
- **Nur die Schemas der App:** `public` und `drizzle` (`APP_SCHEMAS` in `deploy/sicherung-db.sh`). Die Warteschlange (`pgboss`), die Quarantäne und fremde Schemas gehören nicht dazu.
- **Zurückspielen nur in eine frische Datenbank** und ohne Superuser: Eine eigene Einmal-Rolle ohne Sonderrechte spielt die Datei ein (`deploy/sicherung-db.sh#zurueckspielen`); danach wird der Inhalt geprüft, bevor irgendetwas anderes mit der Datenbank arbeitet (`deploy/sicherung-db.sh#inhalt_pruefen`). Ein Dump kann Code mitbringen, den `pg_restore` sonst ausführen ließe; deshalb gilt, was die Migrationen von PaiBot anlegen, und sonst nichts.
- **Nachprüfen nach dem Einspielen:** Tabellen, Stand der Migrationen und die Belege-Kette werden gegen die Begleit-Datei verglichen (`deploy/sicherung.sh#bewerten`, `deploy/sicherung.sh#kette_pruefen`).

## Aufbau

| Datei                                    | Aufgabe                                                                                                                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy/sicherung.sh`                    | Befehle `sichern`, `zurueckspielen`, `pruefen`; Docker-Steuerung, Prüfsumme, Bewertung des Vergleichs, Aufruf des Prüfers der Belege                                                      |
| `deploy/sicherung-db.sh`                 | Teil im Container der Datenbank: `sichern`, `stand`, `zustand`, `liste`, `zurueckspielen`, `vergleichen`, `anker`, `export`, `inhalt`                                                     |
| `packages/receipts/src/bin.ts`           | Einstieg des Prüfers der Belege-Kette (Befehl `pnpm belege:pruefen`); `packages/receipts/build.mjs` bündelt ihn zu einer einzelnen Datei `belege-pruefen.mjs` im Ordner `dist` des Pakets |
| `scripts/sicherung-probe.mjs`            | Probe gegen die laufende Web-App für den Lauf in der CI (einrichten, anmelden)                                                                                                            |
| `tools/durchstich/src/sicherung.test.ts` | Tests gegen echtes Postgres                                                                                                                                                               |

Datenfluss beim Sichern (`deploy/sicherung.sh#sichern`):

1. Ziel-Ordner `paibot-sicherung-<Zeit>` mit Rechten 700 anlegen.
2. `sicherung-db.sh sichern` schreibt den Dump (`pg_dump -Fc`) nach `datenbank.dump` und den Stand als Zeile `PAIBOT-STAND {…}` auf den Fehlerkanal.
3. `sicherung-db.sh liste` liest das Inhaltsverzeichnis (ist die Datei lesbar?); sonst wird die Sicherung verworfen.
4. SHA-256 der Dump-Datei und der Stand gehen in `begleit.json` (`"format":"pb-sicherung","v":1`, Version laut Start-Zeile des Workers, `"warteschlange":"nicht enthalten"`, Hinweis auf PAIBOT_SECRET und `deploy/.env`).

Datenfluss beim Zurückspielen (`deploy/sicherung.sh#zurueckspielen`):

1. Prüfsumme von `datenbank.dump` gegen `begleit.json`.
2. Datenbank starten (ohne `--container`), Zustand lesen: `leer` oder `frisch` geht, sonst Exit-Code 3 mit Ausweg.
3. `web` und `worker` anhalten, auf einen laufenden `migrate` warten.
4. `sicherung-db.sh zurueckspielen`: Einmal-Rolle anlegen, `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges`, Inhalt prüfen (Funde: Exit-Code 4, Datenbank wieder leer), Objekte an den Benutzer des Skripts übergeben, Rolle löschen.
5. Aktive Läufe (`queued`, `running`) bekommen einen alten Herzschlag; der Worker beendet sie beim Start als „unterbrochen“ (`deploy/sicherung-db.sh#zurueckspielen`, `packages/agents/src/run/aufraeumen.ts#failStaleRuns`).
6. Vergleich „genau“ (alle Tabellen mit gleicher Zeilenzahl, Migrationen und Belege gleich); danach Stack starten (`migrate` stellt die Rechte der App-Rolle her), auf `web` und `worker` warten und `pruefen` ausführen.

## Datenmodell und Migrationen

Keine eigenen Tabellen. Gelesen werden alle Tabellen der Schemas `public` und `drizzle`; die Zeilen je Tabelle stehen in `begleit.json` unter `stand.tabellen`, dazu die Zahl und der Zeitstempel der Migrationen (`drizzle.__drizzle_migrations`) und, wenn es Belege gibt, ein Anker der Kette (Format `pb-anker`, Version 1: Installations-Kennung, laufende Nummer und Prüfsumme des letzten Belegs, Schlüssel des ersten) (`deploy/sicherung-db.sh#STAND_SQL`).

Die Rolle `paibot_sicherung` legt `rolle_einrichten` bei Bedarf an; sie ist keine Migration.

Neue Migrationen mit Funktionen oder Triggern verlangen eine Anpassung: Der erlaubte Rumpf jeder Funktion steht als Name und MD5 in `ERLAUBTE_FUNKTIONEN` (`deploy/sicherung-db.sh`); ein Test vergleicht die Liste mit den Migrationen unter `packages/db/drizzle/` (`tools/durchstich/src/sicherung.test.ts`, Test „enthält genau die Funktions-Rümpfe aus allen Migrationen“).

## Schnittstellen

| Art      | Name                                                                           | Datei                 |
| -------- | ------------------------------------------------------------------------------ | --------------------- |
| Befehl   | `sh deploy/sicherung.sh sichern [--ziel <ordner>]`                             | `deploy/sicherung.sh` |
| Befehl   | `sh deploy/sicherung.sh zurueckspielen <ordner> [--ohne-start]`                | `deploy/sicherung.sh` |
| Befehl   | `sh deploy/sicherung.sh pruefen <ordner>`                                      | `deploy/sicherung.sh` |
| Optionen | `--image`, `--compose-datei`, `--env-datei`, `--container`                     | `deploy/sicherung.sh` |
| Dateien  | `datenbank.dump`, `begleit.json` (beide nur für den Benutzer lesbar)           | `deploy/sicherung.sh` |
| Ausgang  | 0 in Ordnung, 1 Fehler, 2 falscher Aufruf, 3 Ziel nicht frisch, 4 fremde Teile | `deploy/sicherung.sh` |

Eine Aktion über das Tor, eine Route oder ein Ereignis gibt es nicht: Die Skripte laufen außerhalb der App und schreiben keine Belege.

## Sicherheit

- **Nur Lesen beim Sichern:** eine Rolle ohne Anmeldung und ohne eigene Schreibrechte; sie ist Mitglied von `pg_read_all_data` (`deploy/sicherung-db.sh#rolle_einrichten`).
- **Zurückspielen ohne Superuser:** eine Einmal-Rolle (`login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls connection limit 1`, Einmal-Passwort) darf nur in dieser Datenbank und im Schema `public` anlegen (`deploy/sicherung-db.sh#zurueckspielen`). Sie wird danach gelöscht (`deploy/sicherung-db.sh#rolle_entfernen`).
- **Inhalt prüfen vor dem Gebrauch:** `inhalt_pruefen` liest nur Kataloge, führt dabei keinen Code aus der Datenbank aus und meldet unter anderem Funktionen, deren Name und Rumpf nicht in `ERLAUBTE_FUNKTIONEN` stehen, Trigger auf fremde Funktionen, Regeln, Policies, eigene Operatoren, Typen und Umwandlungen sowie Ausdrücke mit nicht erlaubten Funktionen. Bei einem Fund bleibt nichts eingespielt (Exit-Code 4).
- **Vollständig oder gar nicht:** `pg_restore --single-transaction --exit-on-error`; scheitert es, wird die Datenbank wieder geleert (`deploy/sicherung-db.sh#leeren`).
- **Prüfsumme:** SHA-256 von `datenbank.dump` in `begleit.json`; `zurueckspielen` und `pruefen` brechen bei Abweichung ab (`deploy/sicherung.sh#pruefsumme_pruefen`). Sie schützt vor Beschädigung, nicht vor einer absichtlich ausgetauschten Datei samt passender `begleit.json`.
- **Geheimnisse:** `PAIBOT_SECRET` und `deploy/.env` sind nicht Teil der Sicherung. Gespeicherte Schlüssel liegen verschlüsselt in der Datenbank und sind nur mit demselben `PAIBOT_SECRET` lesbar (Test „gespeicherte Schlüssel: mit demselben PAIBOT_SECRET lesbar, mit einem anderen nicht“).
- **Prüfer der Belege im Wegwerf-Container:** ohne Netz, schreibgeschützt, ohne Rechte (`--network none --read-only --cap-drop ALL`, `deploy/sicherung.sh#kette_pruefen`).
- **Rechte der Dateien:** `umask 077`, Ordner 700, Dateien 600.

## Tests

| Test                                     | Prüft                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/durchstich/src/sicherung.test.ts` | gegen echtes Postgres: Sichern aus einem Snapshot ohne Warteschlange und Geheimnisse, Weigerung bei benutzter Datenbank, Einspielen mit gleichen Zeilen, frische Installation, Rechte der App-Rolle, Belege-Kette gegen den Anker, Schlüssel mit und ohne passendes `PAIBOT_SECRET`, aktive Läufe, Abweichung wird gemeldet, Code in der Sicherung wird nicht eingespielt, Quarantäne und fremde Schemas |
| `.github/workflows/ci.yml`               | Lauf im echten Docker-Stack mit `scripts/sicherung-probe.mjs`: einrichten, sichern, Stack samt Volume löschen, zurückspielen, anmelden, Unterhaltung wiederfinden, dazu zwei Gegenproben                                                                                                                                                                                                                 |

Ausführen (braucht Postgres-Programme und eine Test-Datenbank-URL, siehe [Entwickeln und Testen](../entwickeln.md)):

```bash
PAIBOT_TEST_DATABASE_URL=postgres://… PAIBOT_TEST_PG_BIN=/usr/lib/postgresql/16/bin \
  pnpm --filter @paibot/durchstich exec vitest run src/sicherung.test.ts
```

Ohne `PAIBOT_TEST_DATABASE_URL` überspringt sich die Datei bis auf einen Test; in der CI erzwingt `PAIBOT_TEST_SICHERUNG_PFLICHT=1`, dass die Tests laufen.

## Bekannte Schwächen

- **Nicht verschlüsselt:** Die Sicherung enthält Unterhaltungen lesbar; die Skripte weisen am Ende darauf hin (`deploy/sicherung.sh#sichern`). Verschlüsselung ist nicht eingebaut.
- **Keine Warteschlange:** Offene Aufträge werden nicht zurückgespielt; aktive Läufe endet der Worker nach dem Einspielen als „unterbrochen“.
- **Nur in eine frische Datenbank:** Ein Zurückspielen in eine benutzte Installation gibt es nicht (Exit-Code 3); der Ausweg ist Sichern, Volume löschen, Zurückspielen.
- **Liste der erlaubten Funktionen von Hand gepflegt:** Eine neue Migration mit einer Funktion ändert die Rümpfe; ohne Anpassung von `ERLAUBTE_FUNKTIONEN` weist `inhalt_pruefen` die Sicherung ab. Der Test „enthält genau die Funktions-Rümpfe aus allen Migrationen“ fängt das ab.
- **Prüfer braucht beim ersten Mal Internet:** Fehlt die gebaute Datei `belege-pruefen.mjs` (Ordner `dist` des Pakets `packages/receipts`), baut ein Wegwerf-Container ihn aus dem Quellcode (`deploy/sicherung.sh#pruefer_bereitstellen`); dafür sind Docker-Image und Pakete nötig. Ausweg: `PAIBOT_BELEGE_PRUEFER` auf eine fertige Datei zeigen lassen.
- **Version kann „unbekannt“ sein:** Sie stammt aus der Start-Zeile des Workers im Log (`deploy/sicherung.sh#version_der_app`).
- **Keine Oberfläche:** Sichern und Zurückspielen gibt es nur als Befehl auf dem Server.
- **Nicht in dieser Umgebung geprüft:** Der Lauf mit Docker (`deploy/sicherung.sh` im echten Stack) läuft in der CI; der Test gegen echtes Postgres wurde hier mit Postgres 16 ausgeführt, die CI nutzt die Werkzeuge von Postgres 17.
