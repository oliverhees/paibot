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

**Verworfene Alternativen:**

- **Alles als Klasse B („letzter Stand gewinnt“):** verworfen. Bei Rechten und Sicherheitsfeldern würde jede neue Zeile gewinnen, auch eine unberechtigte. Deshalb sind `rules` und `bot_app_grants` Klasse A (nur anhängen, `packages/db/src/schema/abgleich-klassen.ts`, Einträge `rules` und `bot_app_grants`); siehe Abschnitt „Für den künftigen Abgleich“.
- **Geheimnisse als Geheimtext zu einem anderen Ort übertragen:** verworfen. Die Kennzeichnungen `nie` und `je-ort-neu-verschluesselt` in `ABGLEICH_GEHEIM_WERTE` (`packages/db/src/schema/abgleich-klassen.ts`, Kommentar an der Konstante) schließen das aus; nur `nur-gekoppelt-verschluesselt` lässt einen Hash über einen gekoppelten Kanal zu.
- **Warteschlange `pgboss` abgleichen:** verworfen. Sie ist Klasse C; der Grund steht im Eintrag `pgboss` in `ABGLEICH_KLASSEN` (`packages/db/src/schema/abgleich-klassen.ts`): laufende Läufe werden beim Wechsel beendet, nicht nachgeholt.

## Aufbau

| Datei                                        | Aufgabe                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/db/src/schema/abgleich-klassen.ts` | die Zuordnung `ABGLEICH_KLASSEN` (Tabelle → Klasse, Grund und Geheimnis-Kennzeichnung), `ABGLEICH_KLASSEN_FREMDE_SCHEMAS`, die Wertelisten `ABGLEICH_KLASSEN_WERTE` (A, B, C) und `ABGLEICH_GEHEIM_WERTE` (vier Kennzeichnungen), das Namensmuster `GEHEIMNIS_SPALTE`, die Prüffunktionen `abgleichKlassenFehler` und `abgleichGeheimFehler`                                                                                                                       |
| `packages/db/src/abgleich-klassen.test.ts`   | jede Tabelle des Schemas hat eine Klasse; keine Klasse ohne Tabelle; Klassen A bis C mit Begründung; Warteschlange und Migrations-Stand sind C; Tabellen aus `APPEND_ONLY_TABLES` sind A (außer `nie`-Geheimnisse: C); jede Spalte, die nach `GEHEIMNIS_SPALTE` aussieht (etwa `…_enc`, `…_hash`, `…token`, `…_key`, `secret`, `password`), ist gekennzeichnet; Klassen und Kennzeichnung der Geheimnis-Tabellen sind festgenagelt; Gegenproben der Prüffunktionen |

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

- **Geheimnisse:** Jeder Eintrag in `ABGLEICH_KLASSEN` sagt, ob er Geheimnisse enthält (`geheim`) und in welchen Spalten (`spalten`). `nie` heißt: verlässt den Ort nie, auch nicht verschlüsselt (`installation_keys`, `sessions`, `geraete`, `settings.setup_code_hash`). `nur-gekoppelt-verschluesselt` heißt: geht nur über einen gekoppelten, verschlüsselten Kanal zu einem anderen Ort, nie im Klartext, Änderungen nur als signiertes Ereignis (`owner.password_hash`, ein Hash, kein Geheimtext). `je-ort-neu-verschluesselt` heißt: nie als Geheimtext zu einem anderen Ort, nur auf ausdrückliche Wahl am Zielort, der den Wert mit seinem eigenen Schlüssel neu verschlüsselt (`providers`, `apps`). Der Abgleich überträgt gekennzeichnete Spalten nur so. Spalten, die nach einem Geheimnis heißen und keines sind, stehen unter `oeffentlich` (zum Beispiel `public_key`, `tool_key`, `prev_hash`, `password_changed_at`).
- **Kein reines „letzter Stand gewinnt“ für Rechte:** In Klasse B und bei „die neueste Fassung gilt“ (`rules`, `bot_app_grants`) würde sonst jede Änderung gewinnen, auch an Sicherheitsfeldern (Passwort-Abdruck, Abdruck des Einrichtungs-Codes, Adressen von Apps, `messages.untrusted`). Änderungen an Rechten und Sicherheitsfeldern nimmt ein Ort nur von einem gekoppelten Ort mit gültigem Staffelstab an, signiert und mit Beleg; `messages.untrusted` geht nur in Richtung „wahr“.
- **Geheimnisse je Ort:** Beide Orte hängen heute am selben `PAIBOT_SECRET`. Mit dem Abgleich braucht jeder Ort sein eigenes Geheimnis; das gemeinsame fällt weg.
- **Widerruf:** Sitzungen und Geräte sind Klasse C; ein Widerruf (Passwort ändern, „Alle Sitzungen beenden“, Gerät entfernen) gilt dort nur am eigenen Ort. Der Abgleich muss den Widerruf an alle Orte tragen, sonst bleibt eine Sitzung an einem anderen Ort gültig.
- **Löschen:** `conversation_events` ist Klasse A, wird aber durch Löschen verkürzt (Zwischenstücke der Antwort, `text.delta` und `draft.delta`; alles mit der Unterhaltung). Das Löschen einer Unterhaltung wird als Ereignis übertragen; die `*.delta`-Ereignisse gehen nie über den Abgleich.
- **Fremdschlüssel über Klassengrenzen:** Tabellen verschiedener Klassen verweisen aufeinander (zum Beispiel `sessions` in C auf `owner` in B). Der Abgleich hält eine feste Reihenfolge ein und weist eine Zeile ab, deren Bezug fehlt.

## Schnittstellen

| Art       | Name                                                  | Datei                                        |
| --------- | ----------------------------------------------------- | -------------------------------------------- |
| Konstante | `ABGLEICH_KLASSEN`                                    | `packages/db/src/schema/abgleich-klassen.ts` |
| Konstante | `ABGLEICH_KLASSEN_FREMDE_SCHEMAS`                     | `packages/db/src/schema/abgleich-klassen.ts` |
| Konstante | `ABGLEICH_KLASSEN_WERTE` (A, B, C)                    | `packages/db/src/schema/abgleich-klassen.ts` |
| Konstante | `ABGLEICH_GEHEIM_WERTE` (vier Kennzeichnungen)        | `packages/db/src/schema/abgleich-klassen.ts` |
| Konstante | `GEHEIMNIS_SPALTE` (Namensmuster für Geheimnisse)     | `packages/db/src/schema/abgleich-klassen.ts` |
| Funktion  | `abgleichKlassenFehler(tabellen, zuordnung)`          | `packages/db/src/schema/abgleich-klassen.ts` |
| Funktion  | `abgleichGeheimFehler(spaltenJeTabelle, zuordnung)`   | `packages/db/src/schema/abgleich-klassen.ts` |
| Typ       | `AbgleichKlasse`, `AbgleichGeheim`, `AbgleichEintrag` | `packages/db/src/schema/abgleich-klassen.ts` |
| Konstante | `APPEND_ONLY_TABLES` (für den Test)                   | `packages/db/src/rollen.ts`                  |

Alles steht auch im Index von `@paibot/db` (`packages/db/src/schema/index.ts`). Es gibt keine Aktion des Tors und keine Route.

## Sicherheit

- Die Klasse ändert nichts an den Rechten: Welche Rolle eine Tabelle ändern darf, steht weiter in `packages/db/src/rollen.ts#APP_TABLE_RIGHTS` und in den Triggern der Migrationen. Der Test verlangt nur, dass jede Tabelle aus `packages/db/src/rollen.ts#APPEND_ONLY_TABLES` (die App-Rolle darf weder ändern noch löschen) Klasse A hat; nur ein Geheimnis, das den Ort nie verlässt (`installation_keys`), macht sie zu C.
- `installation_keys` ist Klasse C: Der private Signaturschlüssel verlässt den Ort nie; der öffentliche Teil wird später über die Tabelle der Orte verteilt. `owner` ist Klasse B und trägt einen Passwort-Abdruck (einen Hash, nicht verschlüsselt), der nur über einen gekoppelten, verschlüsselten Kanal und nie im Klartext zu einem anderen Ort geht. `providers` und `apps` (verschlüsselte Schlüssel und Tokens) gehen nie als Geheimtext, nur auf ausdrückliche Wahl am Zielort neu verschlüsselt. Der Abgleich selbst, der das umsetzt, ist noch nicht gebaut.

## Tests

| Test                                                   | Prüft                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/abgleich-klassen.test.ts`             | jede Tabelle des Schemas hat eine Klasse und die Klasse jeder Tabelle ist festgenagelt; keine Klasse ohne Tabelle; Klassen A bis C mit Begründung; Warteschlange und Migrations-Stand sind C; Tabellen aus `APPEND_ONLY_TABLES` sind A (außer `nie`-Geheimnisse: C); jede Spalte mit einem Namen nach `GEHEIMNIS_SPALTE` ist gekennzeichnet, keine Spalte steht in `spalten` und `oeffentlich` zugleich; Gegenproben der Prüffunktionen und des Namensmusters |
| `apps/web/src/verwaltungsschluessel-quelltext.test.ts` | der verschlüsselte Schlüssel der Modell-Verwaltung (`management_key_enc`) steht nur in den genannten Dateien; `packages/db/src/schema/abgleich-klassen.ts` gehört dazu, weil dort seine Kennzeichnung (`je-ort-neu-verschluesselt`) steht                                                                                                                                                                                                                     |

Ausführen:

```bash
pnpm --filter @paibot/db exec vitest run src/abgleich-klassen.test.ts
```

## Bekannte Schwächen

- **Nur die Zuordnung, kein Abgleich:** Es gibt keinen Dienst, der Klassen auswertet. Die Klasse sagt nichts über Fremdschlüssel zwischen Tabellen verschiedener Klassen (zum Beispiel `messages` in B mit Bezug auf `conversations` in B, aber `sessions` in C mit Bezug auf `owner` in B).
- **Zweifelsfälle:** `owner`, `runs`, `messages`, `tool_calls`, `conversation_events` und die Tabellen mit Geheimnissen sind nach dem heutigen Verhalten eingeordnet (Begründung je Eintrag); ob der Abgleich sie so behandeln soll, entscheidet erst der Abgleich.
- **Tabellen außerhalb des Schemas:** `pgboss` und `drizzle` sind als Schemas eingetragen, nicht als einzelne Tabellen; ein Test gegen eine laufende Datenbank dafür gibt es nicht.
