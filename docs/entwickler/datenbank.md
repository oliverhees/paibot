<!--
PaiBot – Entwickler-Seite: Abgleich-Klasse je Tabelle der Datenbank (Vertrag und Test).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-23
-->

# Datenbank: Abgleich-Klasse je Tabelle – für Entwickler

**Anwender-Doku:** keine eigene Seite. Es gibt heute keinen Abgleich zwischen Orten; die Zuordnung ist ein Vertrag im Code und hat keine Wirkung für Nutzer.

## Zweck und Entscheidung

Jede Tabelle der Datenbank trägt eine Klasse dafür, wie sie zwischen zwei Orten einer Installation abgeglichen würde. Eine Tabelle, die später dazukommt, muss nicht nachträglich eingeordnet werden, weil schon beim Anlegen eine Klasse feststeht (`packages/db/src/schema/abgleich-klassen.ts`). Ein Test sorgt dafür, dass keine Tabelle ohne Klasse bleibt (`packages/db/src/abgleich-klassen.test.ts`).

Die drei Klassen:

- **A, nur anhängen:** Zeilen kommen dazu und ändern sich nicht (oder nur auf festen, einseitigen Wegen).
- **B, letzter Stand:** Zeilen werden geändert; es zählt der neueste Stand je Zeile.
- **C, bleibt am Ort:** Zeilen gelten nur dort, wo sie entstanden sind.

## Aufbau

| Datei                                        | Aufgabe                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/db/src/schema/abgleich-klassen.ts` | die Zuordnung `ABGLEICH_KLASSEN` (Tabelle → Klasse und Grund), `ABGLEICH_KLASSEN_FREMDE_SCHEMAS`, die Prüffunktion `abgleichKlassenFehler` |
| `packages/db/src/abgleich-klassen.test.ts`   | liest die Tabellen aus dem Drizzle-Schema und prüft die Zuordnung                                                                          |

## Datenmodell und Migrationen

Keine eigene Tabelle, keine Migration: Die Zuordnung ist reiner Code. Die Klassen im Überblick (die Begründung je Tabelle steht in `packages/db/src/schema/abgleich-klassen.ts`):

| Klasse | Tabellen                                                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | `belege`, `rules`, `installation_keys`, `app_tools`, `bot_app_grants`, `conversation_events`                                                   |
| B      | `settings`, `providers`, `models`, `bots`, `conversations`, `messages`, `runs`, `tool_calls`, `apps`, `owner`                                  |
| C      | `sessions`, `geraete`, `rate_limits`, `schleuse_zustand`; außerhalb des Schemas `pgboss` (Warteschlange) und `drizzle` (Stand der Migrationen) |

**Regel für jede neue Migration:** Legt sie eine Tabelle an, trägt dieselbe Änderung die Tabelle mit Klasse und einem Satz Begründung in `ABGLEICH_KLASSEN` ein. Sonst ist `packages/db/src/abgleich-klassen.test.ts` rot. Wird eine Tabelle entfernt, fällt auch ihr Eintrag weg (der Test meldet eine Klasse ohne Tabelle).

## Schnittstellen

| Art       | Name                                         | Datei                                        |
| --------- | -------------------------------------------- | -------------------------------------------- |
| Konstante | `ABGLEICH_KLASSEN`                           | `packages/db/src/schema/abgleich-klassen.ts` |
| Konstante | `ABGLEICH_KLASSEN_FREMDE_SCHEMAS`            | `packages/db/src/schema/abgleich-klassen.ts` |
| Funktion  | `abgleichKlassenFehler(tabellen, zuordnung)` | `packages/db/src/schema/abgleich-klassen.ts` |

Alles steht auch im Index von `@paibot/db` (`packages/db/src/schema/index.ts`). Es gibt keine Aktion des Tors und keine Route.

## Sicherheit

- Die Klasse ändert nichts an den Rechten: Welche Rolle eine Tabelle ändern darf, steht weiter in `packages/db/src/rollen.ts#APP_TABLE_RIGHTS` und in den Triggern der Migrationen. Der Test verlangt nur, dass Tabellen, in denen die App-Rolle laut `APP_TABLE_RIGHTS` nur lesen und anlegen darf, Klasse A haben.
- Tabellen mit verschlüsselten Geheimnissen (`providers`, `apps`, `installation_keys`, `owner`) tragen eine Klasse wie die übrigen. Ob und wie ein Abgleich sie überträgt, ist damit nicht entschieden; das gehört zum Abgleich selbst.

## Tests

| Test                                       | Prüft                                                                                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/abgleich-klassen.test.ts` | jede Tabelle des Schemas hat eine Klasse; keine Klasse ohne Tabelle; Klassen A bis C mit Begründung; Warteschlange und Migrations-Stand sind C; Tabellen, in denen die App nur lesen und anlegen darf, sind A; Gegenproben der Prüffunktion |

Ausführen:

```bash
pnpm --filter @paibot/db exec vitest run src/abgleich-klassen.test.ts
```

## Bekannte Schwächen

- **Nur die Zuordnung, kein Abgleich:** Es gibt keinen Dienst, der Klassen auswertet. Die Klasse sagt nichts über Fremdschlüssel zwischen Tabellen verschiedener Klassen (zum Beispiel `messages` in B mit Bezug auf `conversations` in B, aber `sessions` in C mit Bezug auf `owner` in B).
- **Zweifelsfälle:** `owner`, `runs`, `messages`, `tool_calls`, `conversation_events` und die Tabellen mit Geheimnissen sind nach dem heutigen Verhalten eingeordnet (Begründung je Eintrag); ob der Abgleich sie so behandeln soll, entscheidet erst der Abgleich.
- **Tabellen außerhalb des Schemas:** `pgboss` und `drizzle` sind als Schemas eingetragen, nicht als einzelne Tabellen; ein Test gegen eine laufende Datenbank dafür gibt es nicht.
