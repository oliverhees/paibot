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

| Datei                                        | Aufgabe                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/abgleich-klassen.ts` | die Zuordnung `ABGLEICH_KLASSEN` (Tabelle → Klasse und Grund), `ABGLEICH_KLASSEN_FREMDE_SCHEMAS`, die Prüffunktion `abgleichKlassenFehler`                                                                                                                                                                                                                                                         |
| `packages/db/src/abgleich-klassen.test.ts`   | jede Tabelle des Schemas hat eine Klasse; keine Klasse ohne Tabelle; Klassen A bis C mit Begründung; Warteschlange und Migrations-Stand sind C; Tabellen aus `APPEND_ONLY_TABLES` sind A (außer `nie`-Geheimnisse: C); jede Spalte mit `_enc`, `_hash` oder `token` am Ende ist gekennzeichnet; Klassen und Kennzeichnung der Geheimnis-Tabellen sind festgenagelt; Gegenproben der Prüffunktionen |

## Datenmodell und Migrationen

Keine eigene Tabelle, keine Migration: Die Zuordnung ist reiner Code. Die Klassen im Überblick (die Begründung je Tabelle steht in `packages/db/src/schema/abgleich-klassen.ts`):

| Klasse | Tabellen                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | `belege`, `rules`, `app_tools`, `bot_app_grants`, `conversation_events`                                                                                             |
| B      | `settings`, `providers`, `models`, `bots`, `conversations`, `messages`, `runs`, `tool_calls`, `apps`, `owner`                                                       |
| C      | `installation_keys`, `sessions`, `geraete`, `rate_limits`, `schleuse_zustand`; außerhalb des Schemas `pgboss` (Warteschlange) und `drizzle` (Stand der Migrationen) |

**Regel für jede neue Migration:** Legt sie eine Tabelle an, trägt dieselbe Änderung die Tabelle mit Klasse und einem Satz Begründung in `ABGLEICH_KLASSEN` ein. Sonst ist `packages/db/src/abgleich-klassen.test.ts` rot. Wird eine Tabelle entfernt, fällt auch ihr Eintrag weg (der Test meldet eine Klasse ohne Tabelle).

## Für den künftigen Abgleich

Diese Punkte gelten für das Paket, das später Klassen auswertet. Sie stehen hier, damit sie nicht verloren gehen.

- **Geheimnisse:** Jeder Eintrag in `ABGLEICH_KLASSEN` sagt, ob er Geheimnisse enthält (`geheim`) und in welchen Spalten (`spalten`). `nie` heißt: verlässt den Ort nie, auch nicht verschlüsselt (`installation_keys`, `sessions`, `geraete`, `owner`, `settings.setup_code_hash`). `je-ort-neu-verschluesselt` heißt: nie als Geheimtext zu einem anderen Ort, nur auf ausdrückliche Wahl am Zielort, der den Wert mit seinem eigenen Schlüssel neu verschlüsselt (`providers`, `apps`). Der Abgleich überträgt gekennzeichnete Spalten nur so.
- **Kein reines „letzter Stand gewinnt“ für Rechte:** In Klasse B und bei „die neueste Fassung gilt“ (`rules`, `bot_app_grants`) würde sonst jede Änderung gewinnen, auch an Sicherheitsfeldern (Passwort-Abdruck, Abdruck des Einrichtungs-Codes, Adressen von Apps, `messages.untrusted`). Änderungen an Rechten und Sicherheitsfeldern nimmt ein Ort nur von einem gekoppelten Ort mit gültigem Staffelstab an, signiert und mit Beleg; `messages.untrusted` geht nur in Richtung „wahr“.
- **Geheimnisse je Ort:** Beide Orte hängen heute am selben `PAIBOT_SECRET`. Mit dem Abgleich braucht jeder Ort sein eigenes Geheimnis; das gemeinsame fällt weg.
- **Widerruf:** Sitzungen und Geräte sind Klasse C; ein Widerruf (Passwort ändern, „Alle Sitzungen beenden“, Gerät entfernen) gilt dort nur am eigenen Ort. Der Abgleich muss den Widerruf an alle Orte tragen, sonst bleibt eine Sitzung an einem anderen Ort gültig.
- **Löschen:** `conversation_events` ist Klasse A, wird aber durch Löschen verkürzt (Zwischenstücke der Antwort, `text.delta` und `draft.delta`; alles mit der Unterhaltung). Das Löschen einer Unterhaltung wird als Ereignis übertragen; die `*.delta`-Ereignisse gehen nie über den Abgleich.
- **Fremdschlüssel über Klassengrenzen:** Tabellen verschiedener Klassen verweisen aufeinander (zum Beispiel `sessions` in C auf `owner` in B). Der Abgleich hält eine feste Reihenfolge ein und weist eine Zeile ab, deren Bezug fehlt.

## Schnittstellen

| Art       | Name                                         | Datei                                        |
| --------- | -------------------------------------------- | -------------------------------------------- |
| Konstante | `ABGLEICH_KLASSEN`                           | `packages/db/src/schema/abgleich-klassen.ts` |
| Konstante | `ABGLEICH_KLASSEN_FREMDE_SCHEMAS`            | `packages/db/src/schema/abgleich-klassen.ts` |
| Funktion  | `abgleichKlassenFehler(tabellen, zuordnung)` | `packages/db/src/schema/abgleich-klassen.ts` |

Alles steht auch im Index von `@paibot/db` (`packages/db/src/schema/index.ts`). Es gibt keine Aktion des Tors und keine Route.

## Sicherheit

- Die Klasse ändert nichts an den Rechten: Welche Rolle eine Tabelle ändern darf, steht weiter in `packages/db/src/rollen.ts#APP_TABLE_RIGHTS` und in den Triggern der Migrationen. Der Test verlangt nur, dass jede Tabelle aus `packages/db/src/rollen.ts#APPEND_ONLY_TABLES` (die App-Rolle darf weder ändern noch löschen) Klasse A hat; nur ein Geheimnis, das den Ort nie verlässt (`installation_keys`), macht sie zu C.
- `installation_keys` ist Klasse C: Der private Signaturschlüssel verlässt den Ort nie; der öffentliche Teil wird später über die Tabelle der Orte verteilt. Die übrigen Tabellen mit verschlüsselten Geheimnissen (`providers`, `apps`, `owner`) tragen eine Klasse wie die anderen; ob und wie ein Abgleich sie überträgt, ist damit nicht entschieden.

## Tests

| Test                                       | Prüft                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/abgleich-klassen.test.ts` | jede Tabelle des Schemas hat eine Klasse; keine Klasse ohne Tabelle; Klassen A bis C mit Begründung; Warteschlange und Migrations-Stand sind C; Tabellen aus `APPEND_ONLY_TABLES` sind A (außer `nie`-Geheimnisse: C); jede Spalte mit `_enc`, `_hash` oder `token` am Ende ist gekennzeichnet; Klassen und Kennzeichnung der Geheimnis-Tabellen sind festgenagelt; Gegenproben der Prüffunktionen |

Ausführen:

```bash
pnpm --filter @paibot/db exec vitest run src/abgleich-klassen.test.ts
```

## Bekannte Schwächen

- **Nur die Zuordnung, kein Abgleich:** Es gibt keinen Dienst, der Klassen auswertet. Die Klasse sagt nichts über Fremdschlüssel zwischen Tabellen verschiedener Klassen (zum Beispiel `messages` in B mit Bezug auf `conversations` in B, aber `sessions` in C mit Bezug auf `owner` in B).
- **Zweifelsfälle:** `owner`, `runs`, `messages`, `tool_calls`, `conversation_events` und die Tabellen mit Geheimnissen sind nach dem heutigen Verhalten eingeordnet (Begründung je Eintrag); ob der Abgleich sie so behandeln soll, entscheidet erst der Abgleich.
- **Tabellen außerhalb des Schemas:** `pgboss` und `drizzle` sind als Schemas eingetragen, nicht als einzelne Tabellen; ein Test gegen eine laufende Datenbank dafür gibt es nicht.
