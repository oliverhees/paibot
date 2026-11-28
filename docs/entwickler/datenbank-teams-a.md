<!--
PaiBot – Entwickler-Doku: Datenbank für Teams (Teil A, Migrationen 0017 und 0018).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-23
-->

# Datenbank für Teams (Teil A) – für Entwickler

**Anwender-Doku:** [Datenbank für Teams (Teil A)](../funktion-datenbank-teams-a.md)

Diese Seite fasst den Stand dieses Teils zusammen. Die Einzelheiten zu Tabellen, Löschregeln und Tests stehen in [Bots und Teams](bots-und-teams.md); das Tor in [Tor und Belege](tor.md).

## Zweck und Entscheidung

Die Datenbank trägt Bots mit Pause und Team, Teams, Entwürfe, deren Anlagen und Fäden, damit spätere Seiten darauf bauen können. Zwei Migrationen, getrennt, weil die zweite (die Aktionen) mit Fassung 4 des Tors zusammen in Kraft tritt (`packages/db/drizzle/0017_teams_a.sql`, `packages/db/drizzle/0018_fassung_4_aktionen.sql`).

## Aufbau

Verworfen wurde eine gemeinsame Migration: Die Datenbankänderungen und das Inkrafttreten der neuen Tor-Aktionen bleiben getrennt, damit das Update die beiden Schritte eindeutig zuordnen kann. Ebenfalls verworfen wurde, die Bedienung schon in diesem Teil mitzuliefern; Seiten und Routen kommen erst mit der Oberfläche.

| Datei                                        | Aufgabe                                        |
| -------------------------------------------- | ---------------------------------------------- |
| `packages/db/src/schema/teams.ts`            | die fünf neuen Tabellen                        |
| `packages/db/src/schema/abgleich-klassen.ts` | Abgleich-Klasse je Tabelle                     |
| `packages/db/src/schema/unterhaltungen.ts`   | `kind`, `team_id`, nullbares `bot_id`          |
| `packages/db/src/rollen.ts`                  | Rechte der App-Rolle                           |
| `deploy/sicherung-db.sh`                     | Erlaubnisliste der Funktionen in der Sicherung |
| `packages/shared/src/tor-fassung-4.ts`       | Aktionen der Fassung 4                         |
| `packages/gate/src/fassungen/fassung-4.ts`   | Entscheidung nach Fassung 4                    |

## Datenmodell und Migrationen

| Tabelle          | Klasse            | Schema                            |
| ---------------- | ----------------- | --------------------------------- |
| `teams`          | B (letzter Stand) | `packages/db/src/schema/teams.ts` |
| `team_entwuerfe` | B (letzter Stand) | `packages/db/src/schema/teams.ts` |
| `team_anlagen`   | A (nur anhängen)  | `packages/db/src/schema/teams.ts` |
| `faeden`         | A (nur anhängen)  | `packages/db/src/schema/teams.ts` |
| `faden_punkte`   | A (nur anhängen)  | `packages/db/src/schema/teams.ts` |

Die Klassen stehen in `packages/db/src/schema/abgleich-klassen.ts#ABGLEICH_KLASSEN`. Der Vertrags-Test (`packages/db/src/abgleich-klassen.test.ts`) wird rot, wenn eine Tabelle dort fehlt.

Migration 0017 setzt bei bestehenden Unterhaltungen `kind = direkt`. Beide Migrationen sind Einbahnstraßen.

## Schnittstellen

| Art      | Name                       | Datei                                                     |
| -------- | -------------------------- | --------------------------------------------------------- |
| Aktionen | dreizehn Besitzer-Aktionen | `packages/shared/src/tor-fassung-4.ts#TEAM_ACTION_SHAPES` |
| Zugriff  | `setPaused`, `remove`      | `packages/db/src/repo/bots.ts`                            |

Keine Aktion ist über eine Route erreichbar (`apps/web/src/lib/routen.test.ts`).

## Sicherheit

- Art und Team einer Unterhaltung lassen sich nicht ändern: Trigger `conversations_festhalten` mit der Funktion `paibot_unterhaltung_festhalten`; `faeden` gibt es nur für die Art `faden` (Trigger `faeden_nur_fuer_faden`). Test: `packages/db/src/unterhaltung-festhalten.test.ts`.
- Beide Trigger-Funktionen stehen in `ERLAUBTE_FUNKTIONEN` von `deploy/sicherung-db.sh`; eine unbekannte Funktion lehnt die Sicherung weiter ab (`tools/durchstich/src/sicherung.test.ts`).
- Belege älterer Fassungen bleiben prüfbar (`packages/receipts/src/alte-fassung-lesen.test.ts`).
- Der Worker hat eine eigene Datenbank-Rolle, die diese Tabellen nur liest (an `faeden` nur `stand`, `stab_bei`, `belastet` ändert): `packages/db/src/rollen.ts#WORKER_TABLE_RIGHTS`, Test `packages/db/src/worker-rolle-postgres.test.ts`. Dazu kommt der Quelltext-Test `packages/db/src/teams-nur-besitzer-weg.test.ts`.

## Tests

| Test                                              | Prüft                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/db/src/abgleich-klassen.test.ts`        | Klassen der Tabellen, Gegenprobe bei fehlendem Eintrag                    |
| `packages/db/src/teams-update-postgres.test.ts`   | Update von 0016, Löschregeln, Rechte (nur mit `PAIBOT_TEST_DATABASE_URL`) |
| `packages/db/src/unterhaltung-festhalten.test.ts` | Art und Team stehen fest                                                  |
| `packages/gate/src/fassungen/fassung-4.test.ts`   | Fassung 4 des Tors                                                        |

Ausführen:

```bash
pnpm --filter @paibot/db test
```

## Bekannte Schwächen

- Keine Bedienung: Teams, Entwürfe und Fäden lassen sich nur über Tor und Datenbank anlegen; Seiten fehlen.
- Eine Rolle für Web-App und Worker (siehe Sicherheit).
- Einzelheiten und weitere Punkte: [Bots und Teams](bots-und-teams.md#bekannte-schwächen).
