<!--
PaiBot – Entwickler-Doku: das Tor (Entscheidung, Regeln, Grenzen, Not-Aus).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Das Tor – für Entwickler

**Anwender-Doku:** [Das Tor und die Regeln](../funktion-tor.md)

## Zweck und Entscheidung

Das Tor ist der einzige Weg, eine Aktion auszuführen: `gate.run` prüft Eingabe, Vorbedingungen, Grenzen und Regeln, schreibt den Beleg „Entscheidung“, führt nur bei „erlaubt“ aus und schreibt den Beleg „Ergebnis“ (`packages/gate/src/gate.ts#createGate`, Kommentar an `Gate.run`).

Belegte Entscheidungen im Code:

- **Entscheidung ohne Nebenwirkung:** `evaluate` liest weder Uhr noch Datenbank noch Netz; Regelstand, Belege und Uhr kommen als Anschlüsse (`GatePorts`) von außen (`packages/gate/src/evaluate.ts#evaluate`, `packages/gate/src/gate.ts#GatePorts`). Die Paketbeschreibung sagt: „reine Regelprüfung ohne KI und ohne Netz“ (`packages/gate/package.json`).
- **Fail-closed statt „alles fragen“:** Ein leerer oder abweichender Regelstand bricht mit `PaiBotError("intern")` ab, ohne Beleg und ohne Ausführung (`packages/gate/src/gate.ts#verifyRuleSnapshot`, `packages/db/src/repo/regeln.ts#verifyStandardRules`).
- **Regeln nur anhängen:** Eine Änderung ist eine neue Fassung, alte Fassungen bleiben, „damit alte Belege nachrechenbar bleiben“ (`packages/shared/src/gate.ts#STANDARD_RULE_VERSIONS`); die Datenbank weist `UPDATE`, `DELETE` und `TRUNCATE` auf `rules` ab (`packages/db/drizzle/0005_haertung.sql`, Trigger `regeln_kein_update_delete`, `regeln_kein_truncate`).
- **Fassungen der Auswertung:** Das Tor entscheidet mit `GATE_FORMAT` (`packages/shared/src/gate.ts#GATE_FORMAT`, heute 2). Jede Fassung ist eine eingefrorene Beschreibung der ganzen Auswertung in `packages/gate/src/fassungen/index.ts#GATE_FORMATS`. Regel: Jede Änderung am Tor, die für gleiche Fakten ein anderes Ergebnis von `evaluate` geben kann, hebt `GATE_FORMAT`; eine Fassung wird nie geändert.
- **Abgelehnte Quelle ohne Stand:** Eine Regel-Quelle, die nur eine Liste liefert (frühere Form), nimmt das Tor nicht mehr an; jede Entscheidung trägt Regelstand und Prüfsummen (`packages/gate/src/gate.ts#loadRules`).

## Aufbau

| Datei                                      | Aufgabe                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `packages/gate/src/gate.ts`                | `createGate`, `gate.run`, `GateDenied`, `verifyRuleSnapshot`                                                                 |
| `packages/gate/src/evaluate.ts`            | `evaluate`, `checkPreconditions`, `denialCode`, `ruleApplies`, `conditionHolds`                                              |
| `packages/gate/src/limits/index.ts`        | Grenzen der aktuellen Fassung (G-01 bis G-05, G-16 bis G-18), `checkLimits`                                                  |
| `packages/gate/src/fassungen/index.ts`     | `GATE_FORMATS`, `KNOWN_GATE_FORMAT`, `gateFormatSpec`, `currentGateFormat`                                                   |
| `packages/gate/src/fassungen/typ.ts`       | `GateFormatSpec`: was eine Fassung beschreibt                                                                                |
| `packages/gate/src/fassungen/fassung-1.ts` | Fassung 1, eingefroren: Aktionen, Fakten, Ziele, Felder im Beleg, Fehlercodes, Vorbedingungen, Grenzen, Regel-Auswertung     |
| `packages/gate/src/fassungen/fassung-2.ts` | Fassung 2, eingefroren: wie Fassung 1 plus Werkzeug-Fakten, V-12 bis V-14, G-16 bis G-18, Deckel D-01, Fehlercode je Fassung |
| `packages/gate/src/abdruck.ts`             | Texte für die Abdrücke von Werkzeug-Aufruf, -Beschreibung und -Ergebnis (siehe [Werkzeug-Kern](werkzeug-kern.md))            |
| `packages/gate/src/regel-hash.ts`          | `hashRule` (Prüfsumme einer Regel), `ruleSnapshot`                                                                           |
| `packages/gate/src/permit-registry.ts`     | Berechtigungen ausstellen und zurückziehen (`issuePermit`, `revokePermit`), nicht exportiert                                 |
| `packages/gate/src/permit.ts`              | `isGatePermit`: erkennt eine echte, gerade gültige Berechtigung                                                              |
| `packages/gate/src/testing.ts`             | `withTestPermit` für Tests                                                                                                   |
| `packages/shared/src/gate.ts`              | Verträge: Stufen, Ergebnisse, Grenzen (`LIMITS_BY_ID`), Vorbedingungen (`PRECONDITIONS`), Standard-Regeln                    |
| `packages/shared/src/actions.ts`           | alle Aktionen mit Akteur, Ziel und Fakten (`ACTIONS`)                                                                        |
| `packages/db/src/repo/regeln.ts`           | Regelstand aus der Datenbank (`loadSnapshot`, `verifyStandardRules`)                                                         |
| `apps/web/src/lib/gate.ts`                 | `torAuf`: Tor der Web-App mit Regeln aus der Datenbank und Beleg-Schreiber                                                   |
| `apps/web/src/lib/api/route.ts`            | Rahmen jeder API-Route; verändernde Routen gehen über das Tor                                                                |
| `apps/web/src/lib/notaus/notaus.ts`        | Not-Aus lesen und umschalten                                                                                                 |
| `packages/agents/src/run/waechter.ts`      | Wächter eines Laufs: beendet ihn bei Not-Aus                                                                                 |

Datenfluss von `gate.run` (`packages/gate/src/gate.ts#createGate`):

1. Aktion gegen `actionRequestSchema` und Fakten gegen das Schema der Aktion aus `ACTIONS` prüfen; ungültig heißt Fehler ohne Beleg.
2. Läuft dieselbe Aktions-Kennung im selben Prozess schon durchs Tor, Abbruch mit `intern` (Menge `inFlight`).
3. Regelstand über den Anschluss `rules.load()` laden und mit `verifyRuleSnapshot` prüfen, dann `evaluate`.
4. Beleg „Entscheidung“ über `receipts.appendDecision`. Scheitert das, wird nichts ausgeführt.
5. Nicht erlaubt: Beleg „Ergebnis“ mit `status: "denied"` und Code aus `denialCode`, dann `GateDenied`.
6. Erlaubt: Berechtigung ausstellen (`issuePermit`), `execute(permit)` aufrufen, Berechtigung zurückziehen, Beleg „Ergebnis“ mit dem Ergebnis der Ausführung; bei einem Fehler `cancelled` (`AbortError`) oder `error` mit dem Fehlercode (`failureResult`).

Reihenfolge in `evaluate`: Eingabe, dann Vorbedingungen, dann Grenzen, dann Regeln, dann (ab Fassung 2, nur bei `werkzeug.aufrufen`) der Deckel. Eine verletzte Vorbedingung oder Grenze führt zu `deny`; von den passenden Regeln gewinnt die erste nach `compareRules`; ohne passende Regel `ask` (`packages/gate/src/evaluate.ts#evaluate`). Der Deckel D-01 greift, wenn `untrustedInput` gilt und das Werkzeug schreibt oder nach außen geht: aus `allow` wird `ask` (Stufe `ask`, Grund `tor.deckel.D-01`), sonst `nicht_noetig` bzw. `entfaellt`; `deny`, `ask` und `prepare` bleiben (`packages/gate/src/fassungen/fassung-2.ts#GATE_FORMAT_2`).

### Fassungen

- `GATE_FORMATS[n]` (`packages/gate/src/fassungen/typ.ts#GateFormatSpec`) beschreibt die ganze Auswertung einer Fassung: Aktionen, Fakten- und Ziel-Schema je Aktion, Akteur, die Felder der Entscheidung und des Ergebnisses im Beleg (streng), die erlaubten Fehlercodes, Vorbedingungen, Grenzen samt der Frage „kennt die Aktion den Fakt“ (G-05), Reihenfolge der Grenzen, Deckel (Fassung 1: keine) und die Regel-Auswertung.
- Fassung 1 ist eine Kopie, kein Verweis: Geteilte Teil-Schemas (z. B. Name eines Werkzeugs, Regionen, Nachweise) sind mitkopiert. Importiert werden nur Grund-Schemas, die per Definition nie geändert werden: `idSchema` und die Muster der Kennungen, `sha256DigestSchema`, `hmacDigestSchema` (`packages/gate/src/fassungen/fassung-1.ts`, Kopfkommentar). Die Begründungen (`reason`) kommen wie vorher aus den Texten.
- `evaluate(action, facts, rules, { format })` rechnet mit `GATE_FORMATS[format ?? GATE_FORMAT]`; eine unbekannte Fassung ist ein `RangeError` (`packages/gate/src/evaluate.ts#evaluate`). Nur das Nachrechnen eines Belegs wählt eine ältere Fassung (`packages/receipts/src/nachrechnen.ts#reevaluate`); `gate.run` hat dafür keine Option.
- Das Tor gibt dem Schreiber die Entscheidung mit `gateFormat: GATE_FORMAT` (`packages/gate/src/gate.ts#DecisionRecord`). Fassung 1 stand ohne Feld im Beleg (fehlend heißt 1); ab Fassung 2 steht das Feld immer darin (siehe [Belege – für Entwickler](belege.md)).
- **Fassung 2** (`packages/gate/src/fassungen/fassung-2.ts#GATE_FORMAT_2`): Aktionen = `STORED_ACTION_TYPES` (ohne `werkzeug.freigeben`, `werkzeug.ausfuehren`; eine Anfrage dafür ist ungültig). Fakten wie Fassung 1, dazu an `modell.anfragen` `step`, `maxSteps`, `runTokens`, `stepTokenEstimate`, `maxRunTokens`, `toolCount`, `untrustedInput`, `trigger`, an `werkzeug.aufrufen` die Pflicht-Fakten für Werkzeuge, an `anbieter.speichern` `managementKeySet?`. Vorbedingungen V-01 bis V-11 unverändert, dazu V-12 bis V-14. Grenzen G-01 bis G-05, danach G-16, G-17, G-18; fehlt ein nötiger Fakt oder ist er keine Ganzzahl, ist die Grenze `verletzt`, nie `entfaellt`. Liegt die Summe von G-18 außerhalb der sicheren Ganzzahlen, ist sie größer als jede zulässige Grenze: `verletzt` ohne Wert, der Beleg bleibt schreibbar (`packages/gate/src/fassungen/fassung-2.ts#limitLaufToken`, Test `packages/receipts/src/grosse-zahlen.test.ts`). G-16 und G-17 belegen nur Zählerstände, die schon sichere Ganzzahlen sind. Deckel D-01. Beleg: `gateFormat: 2` und `preconditions` Pflicht, `caps` genau bei Aktionen mit Deckel (`decisionFor`), Ergebnis zusätzlich `modelReported`, `docStand`, `found`.
- **Fehlercode je Fassung:** `GateFormatSpec.denialCode` (`packages/gate/src/fassungen/typ.ts#GateFormatSpec`). Fassung 2: verletzte Vorbedingung → deren Code (erste nach Kennung), G-05 → `angehalten`, G-16 bis G-18 → `limit_erreicht`, sonst `abgelehnt` (`deny`) bzw. `regel_fehlt` (`ask`, `prepare`, auch ein gedeckeltes `ask`). G-01 bis G-04 bleiben `abgelehnt`. `evaluate.ts#denialCode` nimmt den Code der aktuellen Fassung.
- **Regeln für Fassungen:**
  - Eine Fassung wird nie geändert; jede Änderung am Ergebnis von `evaluate` ist eine neue Fassung.
  - Ein Prüfsummen-Test hält die eingefrorenen Dateien fest: Fassung 1 und 2, ihre festen Fälle, die festen Ketten und die Lese-Schemata der alten Stände (`packages/gate/src/fassungen/unveraendert.test.ts`).
  - Jede neue Fassung bekommt einen Obermengen-Test gegen die Fälle der vorigen (`packages/gate/src/fassungen/obermenge.test.ts`).
  - Updates von Zod nur mit grünem Korpus aller Fassungen und grünen festen Ketten.
  - Texte (`reason`) gehören nicht zur Fassung; die Korpus-Tests vergleichen alles außer dem Grund.
- **Lebende Verträge = aktuelle Fassung:** Das Tor prüft Fakten zuerst mit den lebenden Verträgen (`packages/shared/src/actions.ts#ACTIONS`) und rechnet dann mit der Fassung; beide müssen denselben Wertebereich haben (`packages/gate/src/fassungen/wertebereich.test.ts`).
- **Typ `LimitName`:** Fassung 1 nennt `LimitName` und wird nie geändert; der Typ bleibt deshalb auf G-01 bis G-05 beschränkt, für alle Grenzen gilt `GateLimitName` (`packages/shared/src/gate.ts#GateLimitName`).
- Eine neue Fassung: Datei `fassung-<n>.ts` neben den vorhandenen anlegen, in `GATE_FORMATS` eintragen, `GATE_FORMAT` heben, einen eigenen Korpus und einen Obermengen-Test anlegen. Vorhandene Fassungen und Korpora bleiben unverändert.

In der Web-App baut `torAuf` das Tor auf eine Datenbank oder Transaktion: Regeln über `repo.rules.loadSnapshot`, Belege über `createReceiptWriter` (`apps/web/src/lib/gate.ts#torAuf`).

## Datenmodell und Migrationen

| Tabelle             | Schema                               | Wofür                                                            |
| ------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `rules`             | `packages/db/src/schema/tor.ts`      | Regeln, nur anhängen; `seq` nummeriert alle Zeilen               |
| `belege`            | `packages/db/src/schema/tor.ts`      | Belege „Entscheidung“ und „Ergebnis“ (siehe [Belege](belege.md)) |
| `installation_keys` | `packages/db/src/schema/tor.ts`      | Signaturschlüssel für die Belege                                 |
| `settings`          | `packages/db/src/schema/settings.ts` | Not-Aus (`killSwitch`) und Grenzen der Installation              |

Migrationen:

- `packages/db/drizzle/0001_basis.sql` legt `rules`, `belege` und `installation_keys` an.
- `packages/db/drizzle/0003_standard_regeln.sql` legt R-001, R-002 und R-999 an, `packages/db/drizzle/0005_haertung.sql` R-003 bis R-006 und die Trigger gegen Ändern und Löschen von Regeln.
- `packages/db/drizzle/0006_regeln_und_belege.sql` ergänzt CHECKs für Kennung je Quelle (`rules_kennung_passt_zur_quelle`), Prioritäten je Quelle (`rules_prioritaet_je_quelle`), „Vorschlag nie aktiv“ (`rules_vorschlag_nie_aktiv`) und den Trigger `regeln_nummer`.
- Mit jeder neuen Aktion erweitern spätere Migrationen die CHECKs `rules_action_werte` und `belege_action_werte` (zuletzt `packages/db/drizzle/0011_chat_ergaenzungen.sql`).

Rechte der App-Rolle: `rules` nur lesen, `belege` nur lesen und anhängen (`packages/db/src/rollen.ts`).

## Schnittstellen

| Art      | Name                                                                               | Datei                                    |
| -------- | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| Funktion | `createGate(ports).run(action, facts, execute, options)`                           | `packages/gate/src/gate.ts`              |
| Fehler   | `GateDenied` (mit `toolCallDecision()`: bei `ask` abgelehnt mit `freigabe_noetig`) | `packages/gate/src/gate.ts`              |
| Funktion | `isGatePermit(value, action)`                                                      | `packages/gate/src/permit.ts`            |
| Aktion   | `notaus.umschalten`                                                                | `packages/shared/src/actions.ts`         |
| Route    | `GET /api/regeln` (lesend, ohne Tor)                                               | `apps/web/src/app/api/regeln/route.ts`   |
| Route    | `PUT /api/notaus`                                                                  | `apps/web/src/app/api/notaus/route.ts`   |
| Seite    | `/regeln`                                                                          | `apps/web/src/app/(app)/regeln/page.tsx` |

Jede verändernde Route nennt ihre Aktion im Routen-Vertrag (`apps/web/src/lib/routen.ts#API_ROUTEN`, Feld `aktion`); der Rahmen ruft damit das Tor (`apps/web/src/lib/api/route.ts`).

Vorbedingungen `V-01` bis `V-14`, Grenzen `G-01` bis `G-05` und `G-16` bis `G-18` und der Deckel `D-01` stehen in `packages/shared/src/gate.ts#PRECONDITIONS`, `packages/shared/src/gate.ts#LIMITS_BY_ID` und `packages/shared/src/gate.ts#CAPS`.

Standard-Regeln in der Datenbank: R-001 bis R-006, R-010 und R-999 (`packages/shared/src/gate.ts#ACTIVE_STANDARD_RULES`); R-010 legt `packages/db/drizzle/0014_werkzeug_kern.sql` an. R-007 und R-008 stehen nur im Code (`packages/shared/src/gate.ts#UNSTORED_STANDARD_RULE_VERSIONS`).

Regeln gehören nicht zur Fassung: Eine neue Regel-Zeile ändert alte Entscheidungen nicht, sie bekommt eine größere Nummer im Regel-Protokoll (`seq`), und das Nachrechnen nimmt den Regelstand des Belegs (`packages/receipts/src/nachrechnen.ts#reevaluate`). Der feste Fall der Fassung 2 „R-010 nicht in den Regeln aus der Datenbank“ bleibt richtig, weil er seinen Regel-Satz selbst mitbringt (`packages/gate/src/fassungen/fassung-2.korpus.json`, `ruleSets.datenbank`).

## Sicherheit

- **Berechtigung nur aus dem Tor:** Nur Objekte in der internen `WeakSet` gelten; sie sind tief eingefroren und werden nach `execute` zurückgezogen. Kopien erkennt `isGatePermit` nicht an (`packages/gate/src/permit-registry.ts`, `packages/gate/src/permit.ts#isGatePermit`).
- **Nachweis an die Aktion gebunden:** R-003 erlaubt `einrichtung.abschliessen` nur mit Einrichtungs-Code, R-004 `zugang.anmelden` nur mit Passwort, R-006 lehnt jeden anderen Nachweis als die Sitzung ab, R-001 erlaubt danach alles mit Sitzung (`packages/shared/src/gate.ts#CREDENTIAL_SCOPE`).
- **Nachweis stammt aus der Anfrage:** Der Fakt `credential` kommt aus der geprüften Anfrage, nie aus dem Körper (`apps/web/src/lib/routen.ts`, Kommentar zu `nachweis`).
- **Regelstand gegen den Code geprüft:** Jede Standard-Regel muss genau der Fassung im Code gleichen, jede Prüfsumme zum Inhalt passen (`packages/gate/src/gate.ts#verifyRuleSnapshot`).
- **Doppelte Ausführung:** im Prozess über `inFlight`; über Prozesse hinweg nimmt die Datenbank je Aktion nur eine Entscheidung und ein Ergebnis an (Kommentar in `packages/gate/src/gate.ts#createGate`).
- **Not-Aus:** Die Fakten von `notaus.umschalten` enthalten kein `killSwitch`, deshalb trifft G-05 diese Aktion nicht; Aufheben braucht ein bestätigtes Passwort (V-10), Versuche zählen auf das Limit `passwortAendern` (`apps/web/src/lib/notaus/notaus.ts#notAusUmschalten`, `packages/gate/src/notaus.test.ts`). Ein laufender Lauf prüft den Schalter im Takt `cancelPollMs` (500 ms) und endet mit Grund `not_aus` (`packages/agents/src/run/waechter.ts`, `packages/agents/src/run/vertrag.ts`).
- **Test-Zugang nur in Tests:** `@paibot/gate/testing` lässt die Lint-Regel `tools/lint-regeln/nur-in-tests.grit` nur in Testdateien zu.

## Tests

| Test                                                      | Prüft                                                                                                                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/gate/src/evaluate.test.ts`                      | jede Aktion mit jeder Standard-Regel und Grenze, Rangfolge, Bedingungen, Reinheit                                                                                                                          |
| `packages/gate/src/fassungen/fassung-1.korpus.test.ts`    | fester Korpus `packages/gate/src/fassungen/fassung-1.korpus.json`, entstanden mit dem `evaluate` vor den Fassungen: Fassung 1 rechnet jeden Fall genau nach                                                |
| `packages/gate/src/fassungen/fassungen.test.ts`           | Fassung 2 ist die aktuelle und beschreibt die heutigen Verträge; Fassung 1 bleibt; unbekannte Fassung wird nicht gerechnet                                                                                 |
| `packages/gate/src/fassungen/fassung-2.korpus.test.ts`    | fester Korpus `packages/gate/src/fassungen/fassung-2.korpus.json` (Fälle mit gemeinsamen Regel-Sätzen `ruleSets` und Grenzen-Fällen `limitCases` für fehlende Fakten), festgelegt vor dem Code der Fassung |
| `packages/gate/src/fassungen/fassung-2.ablehnung.test.ts` | Fehlercode je Ursache und Reihenfolge (G-16 bis G-18, Not-Aus vor den Grenzen eines Laufs, V-12 vor G-17), gedeckeltes „fragen“, große Zahlen bei G-18, fehlender Fakt im Vergleich, fehlender Not-Aus     |
| `packages/receipts/src/grosse-zahlen.test.ts`             | Summe von G-18 außerhalb der sicheren Ganzzahlen: Ablehnung mit `limit_erreicht`, sauberer Beleg, Kette vertrauenswürdig                                                                                   |
| `packages/gate/src/fassungen/obermenge.test.ts`           | jeder Fall des Korpus 1 ergibt unter Fassung 2 dasselbe (einzige Ausnahme: die zwei Freigabe-Aktionen)                                                                                                     |
| `packages/gate/src/fassungen/wertebereich.test.ts`        | lebende Verträge und aktuelle Fassung haben denselben Wertebereich                                                                                                                                         |
| `packages/gate/src/fassungen/unveraendert.test.ts`        | Prüfsummen der eingefrorenen Dateien                                                                                                                                                                       |
| `packages/gate/src/abdruck.test.ts`                       | Abdrücke für Werkzeuge                                                                                                                                                                                     |
| `packages/gate/src/gate.test.ts`                          | Reihenfolge der Belege, Ausführung nur bei Erlaubnis, Berechtigungen, Fehlerfälle                                                                                                                          |
| `packages/gate/src/vorbedingungen.test.ts`                | jede Vorbedingung erfüllt, verletzt, ohne Fakt; Vorrang vor den Grenzen                                                                                                                                    |
| `packages/gate/src/limits/index.test.ts`                  | Grenzen G-01 bis G-05 und G-16 bis G-18                                                                                                                                                                    |
| `packages/gate/src/regel-hash.test.ts`                    | Prüfsumme einer Regel und Regelstand in der Entscheidung                                                                                                                                                   |
| `packages/gate/src/freigabe.test.ts`                      | aktuelle Fassung: keine Freigabe; Fassung 1: Freigabe und Ausführung (R-007)                                                                                                                               |
| `packages/gate/src/notaus.test.ts`                        | Not-Aus im Tor (G-05, V-10)                                                                                                                                                                                |
| `packages/gate/src/testing.test.ts`                       | `withTestPermit`                                                                                                                                                                                           |
| `packages/db/src/regeln.test.ts`                          | Standard-Regeln nach den Migrationen, gleich den Verträgen, nicht änderbar                                                                                                                                 |
| `apps/web/src/lib/notaus/notaus.test.ts`                  | Route `PUT /api/notaus`: Sitzung, CSRF, Beleg, Passwort beim Aufheben, Limit                                                                                                                               |
| `apps/web/src/gate-pflicht.test.ts`                       | jede verändernde Route schreibt genau Entscheidung und Ergebnis ihrer Aktion                                                                                                                               |
| `apps/web/src/gate-pflicht-quelltext.test.ts`             | Quelltext: schreibende Zugriffe nur in erlaubten Dateien                                                                                                                                                   |
| `tools/durchstich/src/regel-pruefsumme.test.ts`           | Tor und Belege rechnen für jede Regel dieselbe Prüfsumme                                                                                                                                                   |

Ausführen:

```bash
pnpm --filter @paibot/gate test
pnpm --filter @paibot/web test
```

## Bekannte Schwächen

- **Keine Freigabe in Fassung 2:** `werkzeug.freigeben` und `werkzeug.ausfuehren` stehen in den Verträgen, die aktuelle Fassung kennt sie nicht (Anfrage ungültig, `deny`); die Datenbank nimmt sie ebenfalls nicht an (`packages/shared/src/actions.ts#UNSTORED_ACTION_TYPES`). R-007 und R-008 stehen nur im Code (`packages/shared/src/gate.ts#UNSTORED_STANDARD_RULE_VERSIONS`); das Nachrechnen kennt ungespeicherte Standard-Regeln nicht (`packages/receipts/src/nachrechnen.ts#reevaluate`).
- **Deckel mit Standard-Regeln wirkungslos:** R-005 fragt vor jeder eigenen Regel; „gedeckelt“ entsteht heute nur mit einem Regelstand aus eigenen Regeln (Tests).
- **`ask` und `prepare` führen nie aus:** In dieser Fassung gibt es weder Freigabe noch Vorbereitung im Tor; beide enden als `GateDenied` (Kommentar an `Gate.run` in `packages/gate/src/gate.ts`).
- **Keine eigenen Regeln:** `verifyStandardRules` lässt nur Regeln der Quelle `standard` zu (`packages/db/src/repo/regeln.ts#verifyStandardRules`), die App-Rolle darf `rules` nur lesen (`packages/db/src/rollen.ts`).
- **Sperre gegen Doppel nur je Prozess:** `inFlight` gilt für einen Prozess; über Prozesse hinweg schützt allein die Datenbank (`packages/gate/src/gate.ts`).
