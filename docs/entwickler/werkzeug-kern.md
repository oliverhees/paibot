<!--
PaiBot – Entwickler-Doku: Verträge für Werkzeuge (Beschreibung, Hülle, Abdrücke, Pflicht-Fakten) und Tor-Fassung 2.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Werkzeug-Kern (Vertrag) – für Entwickler

**Anwender-Doku:** [Das Tor und die Regeln](../funktion-tor.md) (Werkzeuge selbst gibt es noch nicht, deshalb keine eigene Anwender-Seite)

## Zweck und Entscheidung

Bevor es ein Werkzeug gibt, stehen die Verträge dafür fest: wie ein Werkzeug beschrieben wird, in welcher Hülle sein Ergebnis an das Modell geht, wie Aufruf, Beschreibung und Ergebnis abgedruckt werden und welche Fakten das Tor für einen Werkzeug-Aufruf verlangt (`packages/shared/src/werkzeug.ts`, `packages/shared/src/actions.ts#TOOL_GATE_ACTIONS`, `packages/gate/src/abdruck.ts`).

- **Vertrag zuerst, Fassung 2 eingefroren:** Die Fakten gehören zur Auswertung des Tors. Mit ihnen steht die Tor-Fassung 2 fest (`packages/gate/src/fassungen/fassung-2.ts#GATE_FORMAT_2`); was später am Tor anders entscheiden soll, braucht eine neue Fassung (`docs/entwickler/tor.md`, Abschnitt „Fassungen“).
- In dieser Fassung gibt es für keine Aktion eine Freigabe-Karte. Ergibt das Tor für einen Werkzeug-Aufruf ‚fragen‘, behandelt die Steuerung ihn als abgelehnt; es entsteht kein wartender Zustand, weder am Aufruf noch am Lauf (`packages/gate/src/gate.ts#GateDenied`, `toolCallDecision`).
- Der heutige Chat läuft mit festen Übergangswerten weiter: ein Schritt, keine Werkzeuge (`packages/agents/src/run/kontext.ts#modelFacts`, `packages/agents/src/run/vertrag.ts#TRANSITION_MAX_RUN_TOKENS`).

## Aufbau

| Datei                                      | Aufgabe                                                                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/werkzeug.ts`          | `ToolDefinition`, `ToolContext`, `ToolOutcome`, `toolEnvelopeSchema`, `ToolResultMessage`; gibt `toolKeySchema` weiter                             |
| `packages/shared/src/objects.ts`           | `TOOL_KEY_PATTERN`, `toolKeySchema` (hier, weil die Fakten der Aktionen sie brauchen), `MESSAGE_ORIGINS`                                           |
| `packages/shared/src/actions.ts`           | `TOOL_GATE_ACTIONS`, `TOOL_REACHES`, `RUN_TRIGGERS`, `UNKNOWN_TOOL_NAME`, Pflicht-Fakten von `werkzeug.aufrufen`, neue Fakten an `modell.anfragen` |
| `packages/shared/src/gate.ts`              | `LIMITS_BY_ID` (G-16 bis G-18), `PRECONDITIONS` (V-12 bis V-14), `CAPS` (D-01), `UNSTORED_STANDARD_RULE_VERSIONS` (R-010)                          |
| `packages/shared/src/bindung.ts`           | Vorsätze `TOOL_CALL_DIGEST_PREFIX`, `TOOL_DEFINITION_DIGEST_PREFIX`, `TOOL_RESULT_DIGEST_PREFIX`                                                   |
| `packages/gate/src/abdruck.ts`             | `toolCallDigestText`, `toolDefinitionDigest`, `toolResultDigestText`                                                                               |
| `packages/gate/src/fassungen/fassung-2.ts` | eingefrorene Auswertung mit den Werkzeug-Verträgen                                                                                                 |
| `packages/shared/src/events.ts`            | `STEP_EVENT_DATA`, `toolRequestedDataV2`                                                                                                           |
| `packages/shared/src/motor.ts`             | `ToolCall` mit `invalid?` und `rawInput?`                                                                                                          |
| `packages/agents/src/motor-aisdk.ts`       | setzt `invalid` und `rawInput` aus dem Teil `tool-call` der Bibliothek                                                                             |

## Datenmodell und Migrationen

Keine eigenen Tabellen; sie kommen mit der Migration für Werkzeug-Aufrufe. Die neuen Ereignisse stehen deshalb nur als Daten-Schema fest und nicht in `CONVERSATION_EVENT_TYPES`, weil die Datenbank die Arten der Ereignisse gegen diese Liste prüft (`packages/shared/src/events.ts#STEP_EVENT_DATA`, `packages/db/src/schema/unterhaltungen.ts`).

## Schnittstellen

| Art      | Name                                                                                                                                                                                                 | Datei                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Typ      | `ToolDefinition<I, O>`                                                                                                                                                                               | `packages/shared/src/werkzeug.ts` |
| Schema   | `toolEnvelopeSchema` (Daten oder Fehler/Ablehnung)                                                                                                                                                   | `packages/shared/src/werkzeug.ts` |
| Schema   | `toolKeySchema` (Quelle/Name, höchstens 140 Zeichen)                                                                                                                                                 | `packages/shared/src/objects.ts`  |
| Aktion   | `werkzeug.aufrufen` mit Pflicht-Fakten                                                                                                                                                               | `packages/shared/src/actions.ts`  |
| Abdruck  | `toolCallDigestText`, `toolDefinitionDigest`, `toolResultDigestText`                                                                                                                                 | `packages/gate/src/abdruck.ts`    |
| Fehler   | `freigabe_noetig`, `werkzeug_unbekannt`, `werkzeug_eingabe_ungueltig`, `werkzeug_zeitgrenze`, `werkzeug_fehler`, `ausgang_unbekannt`, `schritte_aufgebraucht`, `zu_viele_aufrufe`, `regel_unbekannt` | `packages/shared/src/errors.ts`   |
| Ereignis | `tool.started`, `step.finished`, `draft.delta` (nur Daten)                                                                                                                                           | `packages/shared/src/events.ts`   |
| Funktion | `GateDenied.toolCallDecision()`                                                                                                                                                                      | `packages/gate/src/gate.ts`       |

- **Pflicht-Fakten eines Werkzeug-Wunschs** (`packages/shared/src/actions.ts#ACTIONS`, Aktion `werkzeug.aufrufen`): `toolName`, `toolSource`, `toolServer` (nur bei Quelle `mcp`), `toolKind`, `toolKey`, `toolDigest`, `toolReach`, `toolForeign`, `toolRegistered`, `toolOffered`, `inputValid`, `untrustedInput`, `step`, `callIndexInStep`, `maxCallsPerStep`, `callsInRun`, `maxCallsPerRun`, `killSwitch`, `trigger`, dazu `botOfConversation`, `runRunning`, `argsDigest`. Alle sind flach (Text, Ganzzahl, Schalter).
- **Abdrücke** (`packages/shared/src/bindung.ts`): Aufruf `pb-werkzeug/v2` über `{ actionId, args, chainRootRunId, conversationId, toolDigest, toolKey }` (HMAC mit `context-v1`), Beschreibung `pb-werkzeugdef/v1` (SHA-256), Ergebnis `pb-werkzeugergebnis/v1` über genau die Hülle (HMAC). Das Tor rechnet nur die Texte; den Schlüssel bekommt es nie, die HMAC rechnet der Aufrufer mit `contextDigest` (`packages/crypto/src/token.ts`). `TOOL_ARGS_DIGEST_PREFIX` (v1) bleibt zum Nachrechnen.
- **`toolCallDecision()`**: bei `ask` `{ outcome: "deny", errorCode: "freigabe_noetig", output: <fester Text> }` mit beiden Belegen, sonst der Grund und Code des Tors (`packages/gate/src/gate.ts#DeniedToolCall`).

## Sicherheit

- **Hülle nur als `role: "tool"`:** `ToolResultMessage.role` ist nur `"tool"`; ein Typ-Test prüft, dass eine Hülle nicht in einer Nachricht des Systems stehen kann (`packages/shared/src/werkzeug.test.ts`). Der Inhalt ist begrenztes JSON (`packages/shared/src/receipts.ts#boundedJsonSchema`).
- **Deckel nicht abschaltbar:** D-01 greift nach den Regeln; keine Regel und keine Einstellung hebt ihn auf (`packages/gate/src/fassungen/fassung-2.ts#GATE_FORMAT_2`).
- **Name und Eingabe prüft die Steuerung selbst:** `invalid` und `rawInput` am `ToolCall` sind nur Auskunft der Bibliothek (`packages/shared/src/motor.ts`); `rawInput` ist auf 2 000 Zeichen gekürzt, `input` dann `null` (`packages/agents/src/motor-aisdk.ts`).
- **R-010 nur im Code:** Die Regel zum Nachschlagen in der Doku steht in `UNSTORED_STANDARD_RULE_VERSIONS`, nicht in der Datenbank; mit den Regeln aus der Datenbank fragt R-005, und der Aufruf ist abgelehnt (`packages/shared/src/tor.test.ts`).

## Tests

| Test                                                   | Prüft                                                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `packages/gate/src/fassungen/fassung-2.korpus.test.ts` | feste Fälle der Fassung 2; Datei mit gemeinsamen Regel-Sätzen (`ruleSets`) und Grenzen-Fällen (`limitCases`) für fehlende Fakten |
| `packages/gate/src/fassungen/obermenge.test.ts`        | Korpus 1 unter Fassung 2                                                                                                         |
| `packages/gate/src/fassungen/wertebereich.test.ts`     | Verträge und Fassung 2 mit gleichem Wertebereich                                                                                 |
| `packages/receipts/src/l1-liest-l2.test.ts`            | ein Stand mit Fassung 1 liest Belege der Fassung 2                                                                               |
| `packages/gate/src/abdruck.test.ts`                    | Abdrücke: Vorsätze, jedes Feld zählt, feste Beispielwerte                                                                        |
| `packages/shared/src/werkzeug.test.ts`                 | Pflicht-Fakten, Formen, Hülle                                                                                                    |
| `packages/shared/src/nummern.test.ts`                  | eindeutige Nummern                                                                                                               |
| `packages/agents/src/motor-aisdk.test.ts`              | kaputtes JSON in den Argumenten                                                                                                  |

Ausführen:

```bash
pnpm --filter @paibot/gate test
pnpm --filter @paibot/shared test
```

## Bekannte Schwächen

- **Übergangswerte:** `step` 0, `maxSteps` 1, `runTokens` 0, `maxRunTokens` 500 000, `toolCount` 0, `untrustedInput` `false`, `trigger` `"chat"` sind fest (`packages/agents/src/run/kontext.ts#modelFacts`).
- **G-16 und G-18 ohne Wirkung:** Ein Lauf macht heute genau einen Schritt; beide Grenzen sind deshalb immer eingehalten (`packages/agents/src/run/vertrag.ts#MAX_MOTOR_STEPS`).
- **`untrustedInput` heute immer `false`:** Der Deckel D-01 greift im Chat deshalb nie (`packages/agents/src/run/kontext.ts#modelFacts`).
- **Abdruck v2 nur mit Ganzzahlen:** Gleitkommazahlen in den Argumenten werfen beim Abdruck (`packages/gate/src/abdruck.ts#toolCallDigestText`).
- **Abdruck der Beschreibung asynchron:** Er nutzt nur Web Crypto und gibt ein `Promise` zurück (`packages/gate/src/abdruck.ts#toolDefinitionDigest`).
