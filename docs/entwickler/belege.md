<!--
PaiBot – Entwickler-Doku: Belege (Kette, Signatur, Prüfer, Anker, Export).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Belege – für Entwickler

**Anwender-Doku:** [Belege](../funktion-belege.md)

## Zweck und Entscheidung

Das Paket `packages/receipts/` baut, verkettet, signiert, hängt an, prüft und exportiert Belege (Beschreibung in `packages/receipts/package.json`). Jeder Beleg „Entscheidung“ und „Ergebnis“ entsteht im Tor; der Schreiber erfüllt dessen Anschluss `ReceiptWriter` (`packages/receipts/src/writer.ts#ReceiptChainWriter`).

Belegte Entscheidungen im Code:

- **Prüfer ohne Node und ohne Datenbank:** Der Prüfer läuft ohne Node-APIs, also auch im Browser (`packages/receipts/src/verify.ts`). Signieren und die Kontext-Prüfung brauchen Schlüssel und liegen getrennt in `packages/receipts/src/server.ts`. Ein Test stellt sicher, dass sich der Prüfer ohne Node-APIs, Datenbank und Krypto-Paket bündeln lässt (`packages/receipts/src/bundle.test.ts`).
- **Schlüssel nur aus der Kette:** Die Schlüssel der Kopfzeile des Exports dienen nur dem Vergleich; geprüft wird mit den Schlüsseln aus der Kette (Kommentar an `runCli` in `packages/receipts/src/cli.ts`).
- **Rohdaten statt Urteil vom Server:** Die Lese-Routen liefern nur Rohdaten, geprüft wird im Browser; der Server prüft nur als gekennzeichneter Rückfall (`apps/web/src/lib/belege/routen.ts`, Kopfkommentar).
- **Kanonische Form ohne Gleitkommazahlen:** RFC 8785, `CanonicalizeError` bei Gleitkommazahlen, `NaN`, `undefined`, `bigint` u. a. (`packages/receipts/src/canonical.ts#canonicalize`).

## Aufbau

| Datei                                      | Aufgabe                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `packages/receipts/src/build.ts`           | Körper eines Belegs aus den Angaben des Tors bzw. der Einrichtung (`buildReceipt`)         |
| `packages/receipts/src/canonical.ts`       | kanonische JSON-Form (`canonicalize`)                                                      |
| `packages/receipts/src/hash.ts`            | Prüfsumme über Präfix `pb-beleg/v1` und Zeilenumbruch plus kanonische Form (`hashReceipt`) |
| `packages/receipts/src/server.ts`          | `signReceipt`, `checkContext` (nur Server)                                                 |
| `packages/receipts/src/writer.ts`          | `createReceiptWriter`, `cachedReceiptKeys`: Anhängen unter Sperre                          |
| `packages/receipts/src/verify.ts`          | `verifyReceipt`, `verifyChain`, `createAnchor`, `keyChangeSigner`; Prüfungen `CHECK_NAMES` |
| `packages/receipts/src/nachrechnen.ts`     | Entscheidungen mit dem damaligen Regelstand nachrechnen (`reevaluate`, `rulesAsOf`)        |
| `packages/receipts/src/export.ts`          | Anker und Kopfzeile des Exports aus der Datenbank (`currentAnchor`, `exportHeader`)        |
| `packages/receipts/src/jsonl.ts`           | Export schreiben und lesen (`parseJsonl`)                                                  |
| `packages/receipts/src/cli.ts`             | Befehl `belege:pruefen` (`runCli`, Exit-Codes `CLI_EXIT`)                                  |
| `packages/receipts/src/bin.ts`             | Startpunkt des Befehls in Node                                                             |
| `packages/crypto/src/signing.ts`           | Ed25519: erzeugen, signieren, prüfen, Kurzform (`fingerprint`)                             |
| `packages/db/src/repo/belege.ts`           | Belege lesen (`listPage`, `get`, `getBySeq`, `head`, `listFrom`)                           |
| `apps/web/src/lib/belege/routen.ts`        | Aktionen der Beleg- und Regel-Routen, Export durch das Tor (`belegeExportieren`)           |
| `apps/web/src/lib/belege/lesen.ts`         | Lesen auf dem Server: Liste, Beleg mit Umfeld, Kette in Stücken, Regel-Fassungen           |
| `apps/web/src/lib/belege/pruefung.ts`      | Prüf-Logik der Seite als reine Funktionen (`pruefeKette`, `pruefeEinzeln`)                 |
| `apps/web/src/lib/belege/pruefer-laden.ts` | lädt `@paibot/receipts/pruefen` erst beim Prüfen; prüft, ob der Browser Ed25519 kann       |
| `apps/web/src/app/(app)/belege/page.tsx`   | Seite „Belege“; ein Beleg unter `apps/web/src/app/(app)/belege/[id]/page.tsx`              |

Datenfluss beim Anhängen (`packages/receipts/src/writer.ts#createReceiptWriter`, Kommentar):

1. Signaturschlüssel vor der Transaktion über `keys.current()` holen, nie unter der Sperre.
2. Transaktion mit `pg_advisory_xact_lock(RECEIPT_LOCK_ID)`; höchstens `RECEIPT_LOCK_WAIT_MS` (10 000 ms) warten, sonst `PaiBotError("intern")`.
3. Kopf lesen, Körper bauen (`buildReceipt`), hashen, signieren, einfügen.
4. Gehört der Beleg zu einer Unterhaltung: Ereignis `beleg.created` über `repo.events.append`.

Sperr-Reihenfolge: erst die Beleg-Sperre, dann die Zeile der Unterhaltung (Kommentar an `createReceiptWriter`). Die Nummer der Sperre steht in `packages/db/src/sperren.ts#BELEGE_LOCK_KEY`.

In der Web-App liest `belegSchluesselAus` den aktiven Schlüssel aus `installation_keys` und entschlüsselt ihn, gebunden an Kennung und öffentlichen Teil (`apps/web/src/lib/gate.ts#belegSchluesselAus`).

### Lesen, Schreiben und Inhalt je Fassung des Tors

Jede Entscheidung gehört zu einer eingefrorenen Fassung der Tor-Auswertung (`GATE_FORMAT`, `GATE_FORMATS`, siehe [Das Tor – für Entwickler](tor.md)). Belege werden nach ihrer eigenen Fassung behandelt, auch Belege aus einer neueren PaiBot-Fassung:

| Schritt   | Schema bzw. Funktion                                                                                                       | Prüft                                                                                                                                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lesen     | `packages/shared/src/receipts.ts#receiptEntryReadSchema`, `receiptBodyReadSchema`                                          | nur die **Form**: gemeinsame Felder streng, Aktion nach `actionReadSchema`, `decision.gateFormat` Ganzzahl 1–1000, unbekannte Schlüssel nur als `boundedJsonSchema` (Tiefe ≤ 8, Text ≤ 4 000, Liste ≤ 256, Objekt ≤ 64 Schlüssel) |
| Schreiben | `packages/shared/src/receipts.ts#receiptBodyWriteSchema` in `packages/receipts/src/build.ts#buildReceipt`                  | streng, nur `GATE_FORMAT`; `buildReceipt` weist jede Entscheidung mit `decision.gateFormat !== GATE_FORMAT` ab                                                                                                                    |
| Inhalt    | `packages/receipts/src/nachrechnen.ts#decisionFormat`, `resultFitsFormat` in `packages/receipts/src/verify.ts#verifyChain` | Entscheidung streng nach `GATE_FORMATS[gateFormat ?? 1]`; Ergebnis nach der Fassung der Entscheidung mit derselben `action.actionId`                                                                                              |

- **Fassung 1 ohne Feld:** Solange `GATE_FORMAT` 1 ist, schreibt `buildReceipt` kein `gateFormat` in den Beleg (fehlend heißt 1). Ein Beleg sieht damit Byte für Byte so aus wie vorher; ein Test prüft jeden geschriebenen Beleg gegen eine feste Kopie des alten Lese-Schemas (`packages/receipts/src/testdaten/altes-lese-schema.ts`).
- **Unbekannte Fassung:** Problem `fassung_unbekannt`, Stufe `nicht_pruefbar` (`packages/shared/src/receipts.ts#CHAIN_PROBLEM_LEVEL`). Das Nachrechnen meldet dann `nicht_pruefbar`, nicht `fehler` (`packages/receipts/src/nachrechnen.ts#reevaluate`). Ein Ergebnis zu einer solchen Entscheidung wird nur auf seine Form geprüft.
- **Passt nicht zur Fassung:** unbekanntes Feld, Aktion außerhalb der Fassung, Fehlercode außerhalb von `errorCodes`: Problem `fassung_unpassend`, Stufe `ungueltig`.
- **Rangfolge der Stufen:** `ungueltig` vor `nicht_pruefbar` vor `vertrauen_gebrochen` vor `vertrauenswuerdig` (`packages/shared/src/receipts.ts#chainTrustLevel`).
- **Hinweis `fassung_rueckschritt`:** Folgt auf eine Entscheidung mit Feld `gateFormat` eine ohne, steht das in `verdict.notes` (`packages/shared/src/receipts.ts#chainVerdictSchema`); die Stufe ändert sich nie. In dieser Fassung schreibt PaiBot das Feld noch nicht; der Hinweis ist für die nächste Fassung schon da.
- **Ein Ort für alle Wege:** Die Inhalts-Prüfung liegt in `verifyChain` (Klasse `ActionLedger`), nicht in `parseJsonl`. Damit urteilen Export, Befehl und Belege-Seite (`apps/web/src/lib/belege/pruefung.ts#pruefeKette`, Einträge direkt aus der Datenbank) gleich.
- **Beleg prüfen (einzeln):** Bei einem Ergebnis nur die Form und der Hinweis, dass es mit der Kette geprüft wird (`apps/web/src/lib/belege/pruefung.ts#pruefeEinzeln`).

## Datenmodell und Migrationen

| Tabelle             | Schema                          | Wofür                                                                                |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| `belege`            | `packages/db/src/schema/tor.ts` | die Kette: `seq`, `body`, `prev_hash`, `hash`, `key_id`, `signature` und Suchspalten |
| `installation_keys` | `packages/db/src/schema/tor.ts` | Signaturschlüssel, privater Teil nur verschlüsselt                                   |
| `rules`             | `packages/db/src/schema/tor.ts` | Regel-Fassungen zum Nachrechnen                                                      |

Eindeutige Indizes in `packages/db/src/schema/tor.ts#belege`: `belege_prev_hash_eindeutig` (die Kette verzweigt sich nicht) und `belege_aktion_einmal`.

Migrationen:

- `packages/db/drizzle/0001_basis.sql`: Tabellen.
- `packages/db/drizzle/0002_nur_anhaengen.sql`: Trigger `belege_kein_update_delete` und `belege_kein_truncate`.
- `packages/db/drizzle/0005_haertung.sql`: CHECK `belege_spalten_aus_koerper` (Suchspalten passen zum Körper), Trigger `schluessel_nur_anhaengen`.
- `packages/db/drizzle/0006_regeln_und_belege.sql`: Trigger `belege_ergebnis_nach_entscheidung`.
- Neue Aktionen erweitern `belege_action_werte` (zuletzt `packages/db/drizzle/0011_chat_ergaenzungen.sql`).

Rechte der App-Rolle: `belege` nur lesen und anhängen (`packages/db/src/rollen.ts`).

## Schnittstellen

| Art       | Name                                                                                       | Datei                                                |
| --------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Aktion    | `belege.exportieren`                                                                       | `packages/shared/src/actions.ts`                     |
| Route     | `GET /api/belege`                                                                          | `apps/web/src/app/api/belege/route.ts`               |
| Route     | `GET /api/belege/:id`                                                                      | `apps/web/src/app/api/belege/[id]/route.ts`          |
| Route     | `GET /api/belege/:id/pruefung` (Rückfall)                                                  | `apps/web/src/app/api/belege/[id]/pruefung/route.ts` |
| Route     | `GET /api/belege/kette`                                                                    | `apps/web/src/app/api/belege/kette/route.ts`         |
| Route     | `GET /api/belege/schluessel`                                                               | `apps/web/src/app/api/belege/schluessel/route.ts`    |
| Route     | `POST /api/belege/export` (Download)                                                       | `apps/web/src/app/api/belege/export/route.ts`        |
| Route     | `GET /api/regeln`                                                                          | `apps/web/src/app/api/regeln/route.ts`               |
| Ereignis  | `beleg.created`                                                                            | `packages/receipts/src/writer.ts`                    |
| Unterpfad | `@paibot/receipts/pruefen` (Prüfer für den Browser)                                        | `packages/receipts/package.json`                     |
| Befehl    | `pnpm belege:pruefen <datei.jsonl> [--anker …]`, `pnpm belege:pruefen anker <datei.jsonl>` | `packages/receipts/src/cli.ts`                       |

Exit-Codes des Befehls (`packages/receipts/src/cli.ts#CLI_EXIT`): 0 gültig, 1 ungültig, 2 Aufruf, Datei oder Anker fehlerhaft, 3 Vertrauenskette gebrochen, 4 mit dieser Fassung nicht prüfbar (Belege aus einer neueren PaiBot-Fassung; nie 0).

Prüfungen je Beleg: `inhalt`, `signatur`, `kette`, `entscheidung`, `kontext` (`packages/receipts/src/verify.ts#CHECK_NAMES`); `kontext` nur auf dem Server (`packages/receipts/src/server.ts#checkContext`).

## Sicherheit

- **Unveränderlich in der Datenbank:** Trigger gegen `UPDATE`, `DELETE` und `TRUNCATE` (`packages/db/drizzle/0002_nur_anhaengen.sql`); ein Ergebnis nur nach der Entscheidung derselben Aktion (`packages/db/drizzle/0006_regeln_und_belege.sql`).
- **Keine Inhalte:** Belege enthalten nie Inhalte von Nachrichten (Zusage im Kommentar an `createReceiptWriter`); der Bezug zum Inhalt ist eine Kontext-Prüfsumme, die nur der Server gegen den gespeicherten Inhalt prüfen kann (`packages/receipts/src/server.ts#checkContext`).
- **Lesen ohne Beleg, Export mit Beleg:** Die Lese-Routen sind nicht verändernd; der Export geht als `belege.exportieren` durch das Tor (`apps/web/src/lib/routen.ts#API_ROUTEN`, `apps/web/src/lib/belege/routen.ts#belegeExportieren`).
- **Schlüsselwechsel:** `keyChangeSigner` liest `facts.signedBy` (`previous` oder `new`); ein nur vom neuen Schlüssel signierter Wechsel bricht die Vertrauenskette (Exit-Code 3) (`packages/receipts/src/verify.ts#keyChangeSigner`, `packages/receipts/src/cli.ts#CLI_EXIT`).
- **Grenze des Schutzes:** Ohne aufbewahrten Anker ist eine vollständig neu signierte Kette nicht von der echten zu unterscheiden; der Anker-Test zeigt das (`packages/receipts/src/anker.test.ts`).

## Tests

| Test                                                                                       | Prüft                                                                                                                                                              |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/receipts/src/verify.test.ts`                                                     | gültige Kette und Manipulationen an der richtigen Stelle                                                                                                           |
| `packages/receipts/src/anker.test.ts`                                                      | gekürzte, umgeschriebene, ausgetauschte Kette mit und ohne Anker                                                                                                   |
| `packages/receipts/src/writer.test.ts`                                                     | Anhängen unter Sperre                                                                                                                                              |
| `packages/receipts/src/postgres.test.ts`                                                   | gleichzeitiges Anhängen über zwei Verbindungen (nur mit `PAIBOT_TEST_DATABASE_URL`)                                                                                |
| `packages/receipts/src/tor.test.ts`                                                        | Tor mit echtem Schreiber gegen PGlite                                                                                                                              |
| `packages/receipts/src/nachrechnen.test.ts`                                                | damaliger Regelstand, geänderte Regeln, ältere Belege ohne Regelstand                                                                                              |
| `packages/receipts/src/canonical.test.ts`, `packages/receipts/src/hash.test.ts`            | kanonische Form und Prüfsumme                                                                                                                                      |
| `packages/receipts/src/jsonl.test.ts`, `packages/receipts/src/cli.test.ts`                 | Export und Befehl                                                                                                                                                  |
| `packages/receipts/src/bundle.test.ts`                                                     | Prüfer bündelbar für den Browser                                                                                                                                   |
| `packages/receipts/src/geraet-fakt.test.ts`                                                | Fakt `device` in Belegen, ältere Belege ohne ihn bleiben gültig                                                                                                    |
| `apps/web/src/lib/belege/routen.test.ts`                                                   | Routen: nur mit Sitzung, Blättern, 404, Kette, Server-Prüfung, Export                                                                                              |
| `apps/web/src/lib/belege/pruefung.test.ts`                                                 | Prüf-Logik der Seite mit echten Ketten                                                                                                                             |
| `apps/web/src/lib/belege/oberflaeche.test.ts`                                              | Browser-Module laden weder Zod noch Server-Code                                                                                                                    |
| `packages/receipts/src/feste-kette.test.ts`, `apps/web/src/lib/belege/feste-kette.test.ts` | feste Kette vom Stand vor der Tor-Fassung (`packages/receipts/src/testdaten/kette-vor-fassung.jsonl`) bleibt über Export, Befehl und Belege-Seite vertrauenswürdig |
| `packages/receipts/src/alte-fassung-lesen.test.ts`                                         | jeder neu geschriebene Beleg besteht das Lese-Schema von vorher                                                                                                    |
| `packages/receipts/src/fassung.test.ts`, `packages/receipts/src/build-fassung.test.ts`     | Schreiben nur in `GATE_FORMAT`, Lesen nach der Form, Inhalt je Fassung, Ausgang 4, Hinweis Rückschritt                                                             |
| `apps/web/src/lib/belege/fassung.test.ts`                                                  | Belege-Seite urteilt wie Export und Befehl                                                                                                                         |
| `packages/shared/src/belege-lesen.test.ts`                                                 | Lese-Form, feste Grenzen, strenge Schreib-Form                                                                                                                     |

Ausführen:

```bash
pnpm --filter @paibot/receipts test
pnpm --filter @paibot/web test
```

## Bekannte Schwächen

- **Abgeschnittenes Ende ohne Anker nicht erkennbar** und mit Anker nur bis zu dessen Stand (`packages/receipts/src/anker.test.ts`).
- **Kontext-Prüfung nur, solange der Inhalt gespeichert ist:** Ohne Inhalt ergibt Prüfung 5 `entfaellt` (`packages/receipts/src/server.ts#checkContext`).
- **Ältere PaiBot-Fassungen:** Eine ältere Fassung kann Belege einer neueren nicht vollständig prüfen; sie meldet „nicht prüfbar“ (ab dieser Fassung) oder lehnt sie als „kein Beleg“ ab (Fassungen davor) (`packages/receipts/src/cli.ts#CLI_EXIT`).
- **Wartezeit auf die Sperre begrenzt:** Hält jemand die Beleg-Sperre länger als `RECEIPT_LOCK_WAIT_MS`, scheitert das Anhängen und damit die Aktion (`packages/receipts/src/writer.ts#RECEIPT_LOCK_WAIT_MS`).
