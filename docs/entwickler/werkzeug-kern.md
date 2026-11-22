<!--
PaiBot – Entwickler-Doku: Verträge für Werkzeuge (Beschreibung, Hülle, Abdrücke, Pflicht-Fakten), Tor-Fassung 2 und die Datenbank für Werkzeug-Aufrufe.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Werkzeug-Kern (Vertrag und Datenbank) – für Entwickler

**Anwender-Doku:** [Das Tor und die Regeln](../funktion-tor.md) (Werkzeuge selbst gibt es noch nicht, deshalb keine eigene Anwender-Seite)

## Zweck und Entscheidung

Bevor es ein Werkzeug gibt, stehen die Verträge dafür fest: wie ein Werkzeug beschrieben wird, in welcher Hülle sein Ergebnis an das Modell geht, wie Aufruf, Beschreibung und Ergebnis abgedruckt werden und welche Fakten das Tor für einen Werkzeug-Aufruf verlangt (`packages/shared/src/werkzeug.ts`, `packages/shared/src/actions.ts#TOOL_GATE_ACTIONS`, `packages/gate/src/abdruck.ts`).

- **Vertrag zuerst, Fassung 2 eingefroren:** Die Fakten gehören zur Auswertung des Tors. Mit ihnen steht die Tor-Fassung 2 fest (`packages/gate/src/fassungen/fassung-2.ts#GATE_FORMAT_2`); was später am Tor anders entscheiden soll, braucht eine neue Fassung (`docs/entwickler/tor.md`, Abschnitt „Fassungen“).
- In dieser Fassung gibt es für keine Aktion eine Freigabe-Karte. Ergibt das Tor für einen Werkzeug-Aufruf ‚fragen‘, behandelt die Steuerung ihn als abgelehnt; es entsteht kein wartender Zustand, weder am Aufruf noch am Lauf (`packages/gate/src/gate.ts#GateDenied`, `toolCallDecision`).
- Die Fakten je Schritt eines Laufs entstehen in `packages/agents/src/run/nahtstellen.ts#schrittFakten`; die Schleife steht in `packages/agents/src/run/schleife.ts#runLoop`.

## Aufbau

| Datei                                        | Aufgabe                                                                                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/werkzeug.ts`            | `ToolDefinition`, `ToolContext`, `ToolOutcome`, `toolEnvelopeSchema`, `ToolResultMessage`; gibt `toolKeySchema` weiter                                                |
| `packages/shared/src/objects.ts`             | `TOOL_KEY_PATTERN`, `toolKeySchema` (hier, weil die Fakten der Aktionen sie brauchen), `MESSAGE_ORIGINS`                                                              |
| `packages/shared/src/actions.ts`             | `TOOL_GATE_ACTIONS`, `TOOL_REACHES`, `RUN_TRIGGERS`, `UNKNOWN_TOOL_NAME`, Pflicht-Fakten von `werkzeug.aufrufen`, neue Fakten an `modell.anfragen`                    |
| `packages/shared/src/gate.ts`                | `LIMITS_BY_ID` (G-16 bis G-18), `PRECONDITIONS` (V-12 bis V-14), `CAPS` (D-01), `UNSTORED_STANDARD_RULE_VERSIONS` (R-010)                                             |
| `packages/shared/src/bindung.ts`             | Vorsätze `TOOL_CALL_DIGEST_PREFIX`, `TOOL_DEFINITION_DIGEST_PREFIX`, `TOOL_RESULT_DIGEST_PREFIX`                                                                      |
| `packages/gate/src/abdruck.ts`               | `toolCallDigestText`, `toolDefinitionDigest`, `toolResultDigestText`                                                                                                  |
| `packages/gate/src/fassungen/fassung-2.ts`   | eingefrorene Auswertung mit den Werkzeug-Verträgen                                                                                                                    |
| `packages/shared/src/events.ts`              | `STEP_EVENT_DATA`, `toolRequestedDataV2`                                                                                                                              |
| `packages/shared/src/motor.ts`               | `ToolCall` mit `invalid?` und `rawInput?`                                                                                                                             |
| `packages/agents/src/motor-aisdk.ts`         | setzt `invalid` und `rawInput` aus dem Teil `tool-call` der Bibliothek                                                                                                |
| `packages/db/drizzle/0014_werkzeug_kern.sql` | Migration: Spalten, CHECKs, Indizes, R-010, Trigger `tool_calls_regeln`, `messages_unveraenderlich`, `runs_regeln`, neuer Rumpf von `paibot_ereignisse_nur_anhaengen` |
| `packages/db/src/schema/werkzeuge.ts`        | Tabelle `tool_calls` mit den neuen Spalten und CHECKs                                                                                                                 |
| `packages/db/src/schema/unterhaltungen.ts`   | `messages.step`, `messages.origin`, eindeutige Indizes; Index zum Aufräumen für `text.delta` und `draft.delta`                                                        |
| `packages/db/src/schema/settings.ts`         | sechs Grenzen für Läufe mit Werkzeugen                                                                                                                                |
| `packages/db/src/repo/werkzeuge.ts`          | Zugriff auf Werkzeug-Aufrufe, `TOOL_CALL_TRANSITIONS` (Spiegel des Triggers), `endOpenForRun`                                                                         |
| `packages/agents/src/run/aufraeumen.ts`      | Aufräumen nach einem Absturz: offene Aufrufe und offene Entscheidungen                                                                                                |

## Datenmodell und Migrationen

Migration `packages/db/drizzle/0014_werkzeug_kern.sql`. Erzeugt mit `drizzle-kit`, von Hand ergänzt (Kommentar im Kopf der Datei).

**`tool_calls`** (`packages/db/src/schema/werkzeuge.ts#toolCalls`). In der Tabelle dürfen die neuen Spalten leer sein (Zeilen aus der Zeit davor); beim Anlegen sind die ersten sechs Pflicht (Trigger).

| Spalte             | Zweck                                                                                 | CHECK                                                                               |
| ------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `tool_key`         | Kennung des Werkzeugs (Quelle/Name, z. B. für die Doku: eingebaut, doku.nachschlagen) | `tool_calls_tool_key_format` (Muster wie `TOOL_KEY_PATTERN`, höchstens 140 Zeichen) |
| `tool_digest`      | Abdruck der Beschreibung, die das Modell sah                                          | `tool_calls_tool_digest_format`                                                     |
| `reach`            | Wirkung: `intern` oder `nach_aussen`                                                  | `tool_calls_reach_werte`                                                            |
| `foreign_content`  | liefert Inhalte von außerhalb                                                         | –                                                                                   |
| `step`             | Schritt des Laufs, ab 0                                                               | `tool_calls_step_nicht_negativ`                                                     |
| `untrusted_input`  | der Lauf hatte vorher schon fremde Inhalte gelesen                                    | –                                                                                   |
| `raw_name`         | roher Name des Modells, wenn `name` der Platzhalter ist                               | `tool_calls_raw_name_laenge` (1–64)                                                 |
| `output_truncated` | Ergebnis für das Modell gekürzt                                                       | –                                                                                   |
| `output_chars`     | Zeichen des Ergebnisses vor dem Kürzen                                                | `tool_calls_output_chars_nicht_negativ`                                             |

**Trigger `tool_calls_regeln`** (`paibot_tool_calls_regeln`, vor `INSERT` und `UPDATE`): Ein Aufruf beginnt als `requested` mit Kennung, Abdruck, Wirkung, Herkunft, Schritt und Kennzeichen. Danach unveränderlich: `input`, `args_digest`, `name`, `raw_name`, `source`, `server`, `kind`, `tool_key`, `tool_digest`, `reach`, `foreign_content`, `step`, `untrusted_input`. Erlaubte Wege: `requested` → `running` | `denied` | `cancelled`, `running` → `succeeded` | `failed` | `cancelled`; jedes andere `UPDATE` (auch ohne Zustandswechsel) ist abgewiesen. Kein Weg nach `waiting_approval` oder `approved`; beide stehen weiter im CHECK `tool_calls_status_werte`. Der Code spiegelt die Wege in `packages/db/src/repo/werkzeuge.ts#TOOL_CALL_TRANSITIONS`.

**`messages`** (`packages/db/src/schema/unterhaltungen.ts#messages`): `step` (leer = Nachricht der Person oder End-Antwort, sonst Zwischentext eines Schritts) und `origin` (`modell` oder `fest`, Standard `modell`). CHECKs `messages_step_nicht_negativ`, `messages_origin_werte`, `messages_fest_nur_bot` (fester Text nur vom Bot), `messages_schritt_nur_bot` (Schritt nur bei Antworten des Bots mit Lauf). Eindeutige Indizes `messages_eine_antwort_je_lauf` (eine End-Antwort je Lauf; „neu erzeugen“ ist ein neuer Lauf) und `messages_ein_schritt` (ein Zwischentext je Lauf und Schritt). Trigger `messages_unveraenderlich`: Schritt, Herkunft, Rolle, Lauf und Unterhaltung bleiben nach dem Anlegen gleich. Findet das Update einen Lauf mit mehr als einer Antwort des Bots, hält es mit einer Meldung an, bevor es etwas ändert.

**`runs`**: Trigger `runs_regeln` (vor `INSERT` und `UPDATE`): kein Lauf kommt nach `waiting_approval`, weder beim Anlegen noch durch einen Wechsel. Herzschlag, Stopp-Vermerk, `running` → `running` (Zurückspielen einer Sicherung) und `on delete set null` an `resumes_run_id` gehen weiter. Der Code: `packages/db/src/repo/laeufe.ts#RUN_TRANSITIONS`.

**`settings`** (`packages/db/src/schema/settings.ts#settings`): `max_steps_per_run` (8, 1–16), `max_tool_calls_per_step` (8, 1–16), `max_tool_calls_per_run` (16, 1–64), `max_tokens_per_run` (60 000, 1 000–500 000), `tool_result_max_chars` (16 000, 1 000–24 000), `tool_results_max_chars_per_step` (24 000, 1 000–24 000); `settings_werkzeug_zeichen_passen` verlangt Zeichen je Ergebnis ≤ Zeichen je Schritt. Beim Update setzt die Migration `max_tokens_per_run` auf die höchste Ausgabegrenze der Bots plus 30 000, mindestens 60 000, höchstens 500 000.

**`bots`**: CHECK `bots_max_output_tokens_hoechstens` (≤ 200 000); höhere Werte setzt die Migration vorher auf 200 000 (`packages/db/src/schema/anbieter.ts#bots`).

**`rules`**: R-010 („Bot liest in der Doku seiner Version“) ist gespeichert und aktiv (`packages/shared/src/gate.ts#STANDARD_RULE_VERSIONS`, `ACTIVE_STANDARD_RULES`). Code und Migration kommen zusammen: Ohne die Zeile in der Datenbank wirft `packages/db/src/repo/regeln.ts#verifyStandardRules` `intern`.

**Ereignisse**: `tool.started`, `step.finished`, `draft.delta` stehen in `EVENT_DATA` und damit im CHECK `conversation_events_type_werte` (`packages/shared/src/events.ts`). `draft.delta` ist vorläufiger Text eines Schritts und wird wie `text.delta` aufgeräumt: der Trigger `paibot_ereignisse_nur_anhaengen` lässt beide löschen, der Index `conversation_events_aufraeumen_idx` gilt für beide, `packages/db/src/repo/ereignisse.ts#pruneTextDeltas` löscht beide (nicht bei aktivem Lauf).

**Rechte der App-Rolle** (`packages/db/src/rollen.ts#APP_TABLE_RIGHTS`): `messages` nur noch `select, insert, update` auf Text, Zustand, Herkunft des Modells und Verbrauch (die Spalten, die `packages/db/src/repo/nachrichten.ts#finalize` setzt), kein `delete` – Nachrichten verschwinden nur mit ihrer Unterhaltung. `tool_calls` dazu `output_truncated`, `output_chars`.

### Migrationen anlegen

Drizzle wendet eine Migration nur an, wenn ihr Zeitstempel `when` größer ist als der der zuletzt angewandten; eine Migration mit kleinerem `when` wird auf bestehenden Installationen still übersprungen. `packages/db/src/journal.test.ts` prüft: `when` streng steigend, Nummern lückenlos, Snapshot-Kette, Dateien = Journal. Landet vor dem Zusammenführen eine andere Migration auf `main`:

1. Den von Hand ergänzten Teil der eigenen Migration sichern (außerhalb des Repos).
2. Den Zweig auf `main` setzen; Konflikte in `packages/db/drizzle/meta/_journal.json` zugunsten von `main` lösen.
3. Die eigene Migration löschen (SQL, Snapshot, Eintrag im Journal) und `pnpm --filter @paibot/db exec drizzle-kit generate --name <name>` erneut ausführen.
4. Den Hand-Teil wieder einsetzen; `journal.test.ts`, die Migrations-Tests, den Aufwärts-Test (`tools/durchstich/src/aufstieg-0014.test.ts`) und `tools/durchstich/src/sicherung.test.ts` laufen lassen; neue Funktions-Rümpfe in `deploy/sicherung-db.sh` eintragen.

## Schnittstellen

| Art         | Name                                                                                                                                                                                                                    | Datei                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Typ         | `ToolDefinition<I, O>`                                                                                                                                                                                                  | `packages/shared/src/werkzeug.ts`                                     |
| Schema      | `toolEnvelopeSchema` (Daten oder Fehler/Ablehnung)                                                                                                                                                                      | `packages/shared/src/werkzeug.ts`                                     |
| Schema      | `toolKeySchema` (Quelle/Name, höchstens 140 Zeichen)                                                                                                                                                                    | `packages/shared/src/objects.ts`                                      |
| Aktion      | `werkzeug.aufrufen` mit Pflicht-Fakten                                                                                                                                                                                  | `packages/shared/src/actions.ts`                                      |
| Abdruck     | `toolCallDigestText`, `toolDefinitionDigest`, `toolResultDigestText`                                                                                                                                                    | `packages/gate/src/abdruck.ts`                                        |
| Fehler      | `freigabe_noetig`, `werkzeug_unbekannt`, `werkzeug_eingabe_ungueltig`, `werkzeug_zeitgrenze`, `werkzeug_fehler`, `ausgang_unbekannt`, `schritte_aufgebraucht`, `zu_viele_aufrufe`, `regel_unbekannt`                    | `packages/shared/src/errors.ts`                                       |
| Ereignis    | `tool.started`, `step.finished`, `draft.delta`                                                                                                                                                                          | `packages/shared/src/events.ts`                                       |
| Funktion    | `GateDenied.toolCallDecision()`                                                                                                                                                                                         | `packages/gate/src/gate.ts`                                           |
| Funktion    | `toolCalls.create` (neue Pflichtfelder), `recordDecision` (nur `allow`/`deny`), `finish` (mit `outputTruncated`, `outputChars`), `cancel` (`unterbrochen` oder `ausgang_unbekannt`), `endOpenForRun`, `openCallEndCode` | `packages/db/src/repo/werkzeuge.ts`                                   |
| Funktion    | `messages.insert` mit `step`, `origin`; `listForConversation` mit `nurAntworten`                                                                                                                                        | `packages/db/src/repo/nachrichten.ts`                                 |
| Stillgelegt | `toolCalls.approve`, `toolCalls.markRunning`, `toolCalls.rejectByOwner`, `runs.markWaiting`, `runs.resume`: werfen sofort `intern`, ohne Abfrage                                                                        | `packages/db/src/repo/werkzeuge.ts`, `packages/db/src/repo/laeufe.ts` |

- **Pflicht-Fakten eines Werkzeug-Wunschs** (`packages/shared/src/actions.ts#ACTIONS`, Aktion `werkzeug.aufrufen`): `toolName`, `toolSource`, `toolServer` (nur bei Quelle `mcp`), `toolKind`, `toolKey`, `toolDigest`, `toolReach`, `toolForeign`, `toolRegistered`, `toolOffered`, `inputValid`, `untrustedInput`, `step`, `callIndexInStep`, `maxCallsPerStep`, `callsInRun`, `maxCallsPerRun`, `killSwitch`, `trigger`, dazu `botOfConversation`, `runRunning`, `argsDigest`. Alle sind flach (Text, Ganzzahl, Schalter).
- **Abdrücke** (`packages/shared/src/bindung.ts`): Aufruf `pb-werkzeug/v2` über `{ actionId, args, chainRootRunId, conversationId, toolDigest, toolKey }` (HMAC mit `context-v1`), Beschreibung `pb-werkzeugdef/v1` (SHA-256), Ergebnis `pb-werkzeugergebnis/v1` über genau die Hülle (HMAC). Das Tor rechnet nur die Texte; den Schlüssel bekommt es nie, die HMAC rechnet der Aufrufer mit `contextDigest` (`packages/crypto/src/token.ts`). `TOOL_ARGS_DIGEST_PREFIX` (v1) bleibt zum Nachrechnen.
- **Stillgelegte Wege:** Es gibt in dieser Fassung keine Freigaben, also auch keinen wartenden Lauf und keinen wartenden Aufruf. Die alten Funktionen bleiben mit ihren Parametern stehen (eine spätere Fassung mit Freigaben stellt sie wieder her), werfen aber, bevor eine Abfrage läuft; Spalten und Zustände bleiben (`packages/db/src/repo/werkzeuge.ts`, `packages/db/src/repo/laeufe.ts`).
- **Aufräumen** (`packages/agents/src/run/aufraeumen.ts#failStaleRuns`): Endet ein hängender Lauf, enden seine offenen Aufrufe in derselben Transaktion (`endOpenForRun`): `requested` → `cancelled`/`unterbrochen`; `running` → `cancelled`/`ausgang_unbekannt`, wenn das Werkzeug schreibt, nach außen wirkt oder keine Wirkung gespeichert ist, sonst `unterbrochen`; das Modell bekommt die feste Hülle mit Code und Text. Offene Entscheidungen von `modell.anfragen` und `werkzeug.aufrufen` bekommen ein Ergebnis: nach Ablehnung oder „fragen“ `denied` mit dem Code des Tors (`denialCode`), nach Erlaubnis `error` mit `unterbrochen` bzw. `ausgang_unbekannt` (Fakten `toolKind = schreiben` oder `toolReach = nach_aussen`).
- **`toolCallDecision()`**: bei `ask` `{ outcome: "deny", errorCode: "freigabe_noetig", output: <fester Text> }` mit beiden Belegen, sonst der Grund und Code des Tors (`packages/gate/src/gate.ts#DeniedToolCall`).

## Sicherheit

- **Hülle nur als `role: "tool"`:** `ToolResultMessage.role` ist nur `"tool"`; ein Typ-Test prüft, dass eine Hülle nicht in einer Nachricht des Systems stehen kann (`packages/shared/src/werkzeug.test.ts`). Der Inhalt ist begrenztes JSON (`packages/shared/src/receipts.ts#boundedJsonSchema`).
- **Deckel nicht abschaltbar:** D-01 greift nach den Regeln; keine Regel und keine Einstellung hebt ihn auf (`packages/gate/src/fassungen/fassung-2.ts#GATE_FORMAT_2`).
- **Name und Eingabe prüft die Steuerung selbst:** `invalid` und `rawInput` am `ToolCall` sind nur Auskunft der Bibliothek (`packages/shared/src/motor.ts`); `rawInput` ist auf 2 000 Zeichen gekürzt, `input` dann `null` (`packages/agents/src/motor-aisdk.ts`).
- **R-010 gespeichert:** Die Regel zum Nachschlagen in der Doku steht in der Datenbank und wirkt, sobald es das Werkzeug gibt; für jedes andere Werkzeug fragt weiter R-005, und der Aufruf ist abgelehnt (`tools/durchstich/src/aufstieg-0014.test.ts`).
- **Zwei Hürden für unveränderliche Felder:** Die App-Rolle darf die Spalten gar nicht ändern (Rechte, Fehler `42501`); jede andere Rolle hält der Trigger auf (`packages/db/src/werkzeug-kern-postgres.test.ts`, `packages/db/src/werkzeug-kern.test.ts`).
- **Ehrlich:** Wer die App-Rolle hat, kann `runs` und `settings` frei ändern (`packages/db/src/rollen.ts#APP_TABLE_RIGHTS`). Die harte Sicherung bleiben das Tor, die signierten Belege und die unveränderlichen Spalten.

## Tests

| Test                                                                       | Prüft                                                                                                                            |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `packages/gate/src/fassungen/fassung-2.korpus.test.ts`                     | feste Fälle der Fassung 2; Datei mit gemeinsamen Regel-Sätzen (`ruleSets`) und Grenzen-Fällen (`limitCases`) für fehlende Fakten |
| `packages/gate/src/fassungen/obermenge.test.ts`                            | Korpus 1 unter Fassung 2                                                                                                         |
| `packages/gate/src/fassungen/wertebereich.test.ts`                         | Verträge und Fassung 2 mit gleichem Wertebereich                                                                                 |
| `packages/receipts/src/l1-liest-l2.test.ts`                                | ein Stand mit Fassung 1 liest Belege der Fassung 2                                                                               |
| `packages/gate/src/abdruck.test.ts`                                        | Abdrücke: Vorsätze, jedes Feld zählt, feste Beispielwerte                                                                        |
| `packages/shared/src/werkzeug.test.ts`                                     | Pflicht-Fakten, Formen, Hülle                                                                                                    |
| `packages/shared/src/nummern.test.ts`                                      | eindeutige Nummern                                                                                                               |
| `packages/agents/src/motor-aisdk.test.ts`                                  | kaputtes JSON in den Argumenten                                                                                                  |
| `packages/db/src/werkzeug-kern.test.ts`                                    | Trigger, CHECKs, Indizes, Startwerte, Aufräumen der Aufrufe, Abbildung (PGlite und Postgres)                                     |
| `packages/db/src/werkzeug-kern-postgres.test.ts`                           | Rechte der App-Rolle, Löschen nur mit der Unterhaltung, Stand ohne 0014 gilt als veraltet                                        |
| `packages/db/src/journal.test.ts`                                          | Reihenfolge der Migrationen                                                                                                      |
| `packages/db/src/werkzeuge.test.ts`, `packages/db/src/repo/laeufe.test.ts` | stillgelegte Wege werfen ohne Abfrage                                                                                            |
| `packages/db/src/repo/nachrichten.test.ts`                                 | `nurAntworten`                                                                                                                   |
| `packages/agents/src/run/aufraeumen-postgres.test.ts`                      | Absturz an jeder Stelle, auch mit einer Entscheidung der Fassung 1; Kette bleibt vertrauenswürdig                                |
| `tools/durchstich/src/aufstieg-0014.test.ts`                               | Aufstieg mit Bestandsdaten zweier Stände (`tools/durchstich/src/testdaten/`), Kette und neue Entscheidungen                      |
| `apps/web/src/lib/belege/aufstieg-0014.test.ts`                            | dieselben Bestandsdaten auf der Belege-Seite                                                                                     |
| `tools/durchstich/src/sicherung.test.ts`                                   | Sichern und Zurückspielen mit dem neuen Stand und vom Stand 0013                                                                 |

Ausführen:

```bash
pnpm --filter @paibot/gate test
pnpm --filter @paibot/shared test
pnpm --filter @paibot/db test
PAIBOT_TEST_DATABASE_URL=postgres://… pnpm --filter @paibot/durchstich test
```

## Bekannte Schwächen

- **Abdruck v2 nur mit Ganzzahlen:** Gleitkommazahlen in den Argumenten werfen beim Abdruck (`packages/gate/src/abdruck.ts#toolCallDigestText`).
- **Abdruck der Beschreibung asynchron:** Er nutzt nur Web Crypto und gibt ein `Promise` zurück (`packages/gate/src/abdruck.ts#toolDefinitionDigest`).
- **Aufräumen und Reihenfolge Beleg ↔ Zeile:** Stirbt der Worker, nachdem das Ergebnis `ok` belegt ist, aber bevor die Zeile `succeeded` wurde, endet die Zeile als `cancelled`, der Beleg bleibt `ok` (`packages/db/src/repo/werkzeuge.ts#endOpenForRun`). Die Reihenfolge legt erst die Werkzeug-Schleife fest.
- **Altzeilen in Warte-Zuständen:** Zeilen in `tool_calls.waiting_approval`/`approved` oder `runs.waiting_approval` erzeugt der Code nicht. Gäbe es sie, könnte der Trigger einen solchen Aufruf nicht mehr beenden; ein wartender Lauf kann noch enden (`packages/db/src/werkzeug-kern.test.ts`).
