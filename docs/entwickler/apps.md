<!--
PaiBot – Entwickler-Seite: die MCP-Schicht in `packages/mcp` (fremde MCP-Server nur lesend ansprechen); noch nicht angeschlossen.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-22
-->

# Apps (MCP-Schicht) – für Entwickler

**Anwender-Doku:** noch keine. Die Schicht ist gebaut und getestet, aber an keine Stelle von PaiBot angeschlossen: kein Tor, keine Datenbank, kein Worker, keine Route der Web-App benutzt sie (`packages/mcp/src/index.ts`; kein anderes Paket und keine App hat `@paibot/mcp` als Abhängigkeit). Die Anwender-Seite kommt mit der Funktion, die sie benutzt.

## Zweck und Entscheidung

`packages/mcp` ist die Schicht, über die PaiBot später fremde MCP-Server nur lesend ansprechen soll: verbinden, die Liste der Werkzeuge holen, Namen und Texte bereinigen, jedes Werkzeug abdrucken, die Eingaben prüfen, ein Werkzeug aufrufen und sein Ergebnis in Text verwandeln. Sie entscheidet nichts darüber, ob ein Werkzeug laufen darf; das bleibt dem Tor überlassen.

Entscheidungen, wie sie im Code stehen:

- **Nur über das hineingereichte `fetch`.** Die Schicht hat keinen eigenen Netz-Zugriff; jede Anfrage der Bibliothek geht durch `optionen.fetch` (`packages/mcp/src/verbindung.ts#oeffneVerbindung`). Gedacht ist die Ausgangs-Hülle des Systems (`packages/llm/src/egress.ts#createEgressFetch`); `packages/mcp` darf `@paibot/llm` nicht importieren und bekommt sie deshalb hineingereicht. Eine Lint-Regel verbietet `fetch`, `globalThis`, `XMLHttpRequest` und `WebSocket` in der Schicht (`tools/lint-regeln/mcp-kein-eigenes-fetch.grit`, eingetragen in `biome.json`).
- **Die Bibliothek nur in einer Datei.** `@ai-sdk/mcp` wird allein in `packages/mcp/src/verbindung.ts` geladen (Ausnahme in `biome.json` für genau diese Datei und für Tests). Genutzt werden nur `createMCPClient`, `listTools`, `callTool` und `close`, nie `tools()` (das folgt jeder Seite ohne Grenze) und nie der stdio-Einstieg.
- **Ein Werkzeug ist nicht „lesend“, nur weil der Server es sagt.** Die Hinweise des Servers (`readOnlyHint` u. a.) kommen nur als Anzeige „laut App“ zurück (`packages/mcp/src/werkzeug.ts#McpHinweise`); das Ergebnis der Aufbereitung hat keine Angabe „liest/schreibt“ (`packages/mcp/src/werkzeug.test.ts`, Test „zeigt readOnlyHint als laut App“). Wer ein Werkzeug als lesend gelten lässt, entscheidet der Besitzer an anderer Stelle.
- **Was nicht sicher prüfbar ist, wird abgewiesen, nicht geraten.** Ein Werkzeug, dessen Schema Stichwörter enthält, die die Schicht nicht prüfen kann (`$ref`, `pattern`, `oneOf`, `not` …), kommt mit `bestaetigbar: false` und einem Grund zurück (`packages/mcp/src/schema.ts#verarbeiteSchema`, `packages/mcp/src/werkzeug.ts#McpWerkzeugProblem`).
- **Gespeichert, gezeigt und gesendet wird dieselbe Form.** `modellDefinition` liefert Name, Beschreibung und gekürztes Schema aus einer Stelle (`packages/mcp/src/werkzeug.ts#modellDefinition`); der Abdruck dagegen geht über die Rohform (`packages/mcp/src/abdruck.ts#abdruckVonWert`), damit schon ein unsichtbares Zeichen ein Werkzeug als geändert erscheinen lässt.
- **Eine Verbindung je Aufgabe.** Das Protokoll ist zustandslos; `holeWerkzeuge` und `rufeWerkzeugAuf` öffnen, arbeiten und schließen selbst (`packages/mcp/src/verbindung.ts#holeWerkzeuge`, `packages/mcp/src/verbindung.ts#rufeWerkzeugAuf`).

## Aufbau

| Datei                            | Aufgabe                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `packages/mcp/src/verbindung.ts` | Verbindung: `oeffneVerbindung`, `holeWerkzeuge`, `rufeWerkzeugAuf`, `pruefeAdresse`, das erzwungene `fetch` (`baueSicheresFetch`) |
| `packages/mcp/src/werkzeug.ts`   | Werkzeuge aufbereiten (`bereiteWerkzeugeAuf`), Modell-Form (`modellDefinition`), Abgleich der Liste (`vergleicheWerkzeuge`)       |
| `packages/mcp/src/schema.ts`     | Schema prüfen, für das Modell kürzen, Prüf-Schema für Argumente bauen (`verarbeiteSchema`)                                        |
| `packages/mcp/src/namen.ts`      | Namen für das Modell: `<app-kurzname>__<name>`, höchstens 64 Zeichen, eindeutig (`vergebeModellNamen`)                            |
| `packages/mcp/src/abdruck.ts`    | kanonische Form und SHA-256 über die Rohform, ohne Rekursion (`kanonischeForm`, `abdruckVonWert`)                                 |
| `packages/mcp/src/ergebnis.ts`   | Ergebnis eines Werkzeugs in Text (`ergebnisZuText`)                                                                               |
| `packages/mcp/src/bereinigen.ts` | Bereinigung fremden Texts (`bereinigeText`, `entferneMarkdownBilder`)                                                             |
| `packages/mcp/src/struktur.ts`   | Prüfung fremder Werte vor jeder Verarbeitung, ohne Rekursion (`pruefeStruktur`, `OBJEKT_NAMEN`)                                   |
| `packages/mcp/src/fehler.ts`     | feste Fehlercodes und Texte, Zuordnung fremder Fehler (`McpSchichtFehler`, `ordneFehlerZu`)                                       |
| `packages/mcp/src/grenzen.ts`    | alle Grenzen und ihre Standardwerte (`STANDARD_GRENZEN`, `mitStandardGrenzen`)                                                    |
| `packages/mcp/src/index.ts`      | Ausgang des Pakets: alles oben                                                                                                    |

Datenfluss einer Liste (`holeWerkzeuge`):

1. `oeffneVerbindung` prüft Adresse (`pruefeAdresse`) und Zugangsdatum, baut das erzwungene `fetch` und verbindet (`createMCPClient`).
2. `listeRoh` holt Seite für Seite (`maxSeiten`, `maxWerkzeuge`) die rohen Werkzeuge.
3. `bereiteWerkzeugeAuf` prüft jedes Werkzeug zuerst mit `pruefeStruktur`, bildet den Abdruck der Rohform, bereinigt Name, Titel und Beschreibung, verarbeitet das Schema und vergibt die Modell-Namen.
4. `schliesse` beendet die Verbindung; danach geht keine Anfrage mehr hinaus.

Datenfluss eines Aufrufs (`rufeWerkzeugAuf`): Der Prüfer des Werkzeugs (`pruefer`) prüft die Argumente, noch bevor eine Verbindung entsteht; erst danach wird verbunden, aufgerufen (`callTool`) und `ergebnisZuText` angewendet. Die Funktion wirft nie: jedes Problem kommt als Ergebnis mit `status: "fehler"`, festem Satz und `fehlercode` zurück.

## Datenmodell und Migrationen

Keine eigenen Tabellen, keine Migration. Die Schicht liest und schreibt keine Datenbank; was sie liefert (Abdruck, Modell-Form, Status-Gründe), soll eine spätere Anbindung speichern.

## Schnittstellen

| Art         | Name                                                      | Datei                            |
| ----------- | --------------------------------------------------------- | -------------------------------- |
| Funktion    | `holeWerkzeuge(optionen)` → Werkzeuge, Servername, Seiten | `packages/mcp/src/verbindung.ts` |
| Funktion    | `rufeWerkzeugAuf(optionen)` → `McpErgebnis`               | `packages/mcp/src/verbindung.ts` |
| Funktion    | `oeffneVerbindung(optionen)` → `McpVerbindung`            | `packages/mcp/src/verbindung.ts` |
| Funktion    | `pruefeAdresse(adresse, erlaubeHttp)`                     | `packages/mcp/src/verbindung.ts` |
| Funktion    | `bereiteWerkzeugeAuf(liste, optionen)`                    | `packages/mcp/src/werkzeug.ts`   |
| Funktion    | `modellDefinition(werkzeug)`                              | `packages/mcp/src/werkzeug.ts`   |
| Funktion    | `vergleicheWerkzeuge(gespeichert, frisch)`                | `packages/mcp/src/werkzeug.ts`   |
| Funktion    | `verarbeiteSchema(roh, grenzen)`                          | `packages/mcp/src/schema.ts`     |
| Funktion    | `ergebnisZuText(ergebnis, grenzen)`                       | `packages/mcp/src/ergebnis.ts`   |
| Funktion    | `vergebeModellNamen(kurzname, namen, vergeben)`           | `packages/mcp/src/namen.ts`      |
| Funktion    | `abdruckVonWert(wert)`, `kanonischeForm(wert)`            | `packages/mcp/src/abdruck.ts`    |
| Funktion    | `bereinigeText(text, optionen)`                           | `packages/mcp/src/bereinigen.ts` |
| Funktion    | `pruefeStruktur(wert, grenzen)`                           | `packages/mcp/src/struktur.ts`   |
| Fehlercodes | `MCP_FEHLERCODES` mit festen Texten in `MCP_FEHLERTEXTE`  | `packages/mcp/src/fehler.ts`     |

Die Optionen einer Verbindung (`McpVerbindungOptionen`): `adresse`, `fetch`, `token` (nur als `Authorization: Bearer …`), `grenzen`, `signal` (bricht die ganze Verbindung ab), `erlaubeHttp` (nur für Tests und lokale Entwicklung). Die Fehlercodes liegen vorerst nur in dieser Schicht (`packages/mcp/src/fehler.ts#MCP_FEHLERCODES`), nicht im gemeinsamen Vertrag.

## Sicherheit

- **Jede Anfrage geht über das hineingereichte `fetch`** und trägt `redirect: "error"`, `credentials: "omit"` und ein Signal; die Schicht erzwingt das selbst, nicht über eine Einstellung der Bibliothek (`packages/mcp/src/verbindung.ts#baueSicheresFetch`). Eine Weiterleitung auf eine zweite App führt zum Fehler, ohne dass dort eine Anfrage ankommt (`packages/mcp/src/verbindung.test.ts`, Gruppe „Weiterleitung auf eine zweite App“).
- **Nur genau die eine Adresse der App:** gleicher Origin, gleicher Pfad, kein Abfrage-Teil, keine Zugangsdaten in der Adresse; ein `Request`-Objekt wird abgelehnt (`baueSicheresFetch`). `pruefeAdresse` verlangt `https`, ohne Benutzer-, Abfrage- und Fragment-Teil. Ob das Ziel öffentlich ist, prüft die Ausgangs-Hülle, nicht die Schicht.
- **Kein eigener Ereignis-Strom:** `GET` beantwortet die Schicht selbst mit 405, ohne etwas zu senden; damit gibt es nichts, was sich nach dem Schließen neu verbinden könnte (`baueSicheresFetch`). Nach `schliesse()` geht keine Anfrage mehr hinaus (`packages/mcp/src/verbindung.ts#oeffneVerbindung`, Test „Nach dem Schließen“).
- **Grenzen:** Zeit für Liste (10 s) und Aufruf (30 s), Antwort höchstens 2 MB nach Bytes, höchstens 10 Seiten und 200 Werkzeuge, Argumente höchstens 8 KB, Schema höchstens 16 KB und 8 Ebenen, Ergebnis-Text höchstens 16 000 Zeichen (`packages/mcp/src/grenzen.ts#STANDARD_GRENZEN`). Dazu die Grenzen der Ausgangs-Hülle; empfohlene Werte stehen in `MCP_EMPFOHLENE_ANTWORT_BYTES` und `MCP_EMPFOHLENES_LEERLAUF_MS`.
- **Fremde Werte zuerst prüfen, dann verarbeiten:** Tiefe, Zahl der Knoten, Kreise, Typen und verbotene Schlüsselnamen werden mit einem eigenen Stapel geprüft, bevor etwas rekursiv läuft; auch ein Objekt mit einer Million Schlüsseln hält den Prozess nur so lange fest, wie die Grenze Schritte erlaubt (`packages/mcp/src/struktur.ts#pruefeStruktur`). Schlüssel mit Namen aus `Object.prototype` (`constructor`, `toString`, `__proto__` …) weist die Schicht in Schemas auf jeder Ebene und in Argumenten ab (`packages/mcp/src/struktur.ts#OBJEKT_NAMEN`, `packages/mcp/src/schema.ts#verarbeiteSchema`).
- **Fremder Text ist nie eine Anweisung:** Steuer-, Umkehr- und unsichtbare Zeichen und Markdown-Bilder fallen weg, Texte werden gekürzt (`packages/mcp/src/bereinigen.ts#bereinigeText`). Ans Modell geht ein gekürztes Schema mit einer festen Liste von Stichwörtern (`packages/mcp/src/schema.ts#MODELL_STICHWORTE`), Titel, Vorgabewerte und Beispiele fallen weg. Ein Feld-Name oder Aufzählungswert, der sich bei der Bereinigung ändern würde, macht das Werkzeug nicht bestätigbar.
- **Ein Fehler des Werkzeugs zeigt nie den Text des Servers:** `isError` wird zu einem festen Satz (`packages/mcp/src/ergebnis.ts#ergebnisZuText`); `McpErgebnis.enthaeltFremdenText` sagt, ob irgendein Text des Servers im Ergebnis steckt.
- **Zugangsdaten:** Das Zugangsdatum geht nur als `Authorization: Bearer …` hinaus, ist auf sichtbare ASCII-Zeichen ohne Leerzeichen begrenzt (`packages/mcp/src/verbindung.ts#oeffneVerbindung`) und steht in keinem Fehler, keinem Rückgabewert und keinem Objekt der Verbindung. Fehler tragen nur feste Texte; die Ursache der Bibliothek wird nicht weitergegeben (`packages/mcp/src/fehler.ts#McpSchichtFehler`, `ordneFehlerZu`). Eine eigene Kopfzeile für das Zugangsdatum gibt es in dieser Fassung nicht.
- **Keine Rückfragen des Servers:** Die Schicht meldet keine Fähigkeiten an und registriert keinen Handler; eine Rückfrage endet als `app_braucht_eingabe` (`packages/mcp/src/fehler.ts#ordneFehlerZu`).
- **Keine fremden Prozesse:** In `packages/mcp`, `packages/agents` und `apps/web` sind `child_process`, `cross-spawn` und der stdio-Einstieg der Bibliothek verboten (`biome.json`, Test `tools/lint-regeln/src/mcp-schicht.test.ts`).

## Tests

| Test                                        | Prüft                                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/mcp/src/verbindung.test.ts`       | Liste und Aufruf in beiden Protokoll-Fassungen gegen den Test-Server, Zugang, Adresse, erzwungenes `fetch`, Zeit, Abbruch, Größe, Hülle |
| `packages/mcp/src/struktur.test.ts`         | 10 000 Ebenen, eine Million Schlüssel, Kreis, Typen, verbotene Schlüssel; die Verarbeiter werfen nie                                    |
| `packages/mcp/src/schema.test.ts`           | Kürzung, Bereinigung, abgewiesene Stichwörter, Namen aus `Object.prototype`, Prüf-Schema für Argumente                                  |
| `packages/mcp/src/werkzeug.test.ts`         | Beschreibung, Hinweise nur als Anzeige, Namen, Abgleich der Liste                                                                       |
| `packages/mcp/src/ergebnis.test.ts`         | fester Satz bei `isError`, Kürzung, Medien, strukturierter Inhalt                                                                       |
| `packages/mcp/src/bereinigen.test.ts`       | unsichtbare Zeichen, Bilder, Länge, Zeit bei verwinkelten Eingaben                                                                      |
| `packages/mcp/src/abdruck.test.ts`          | Abdruck stabil bei anderer Reihenfolge, empfindlich schon bei einem unsichtbaren Zeichen                                                |
| `packages/mcp/src/namen.test.ts`            | eindeutige Namen, Kollisionen, 64 Zeichen                                                                                               |
| `packages/mcp/src/fehler.test.ts`           | feste Texte, Zuordnung, kein Text des Servers und kein Zugangsdatum                                                                     |
| `tools/lint-regeln/src/mcp-schicht.test.ts` | Importsperren und Regel gegen eigenen Netz-Zugriff (Biome läuft wirklich, mit Gegenproben)                                              |

Ausführen:

```bash
pnpm --filter @paibot/mcp test
pnpm --filter @paibot/lint-regeln test
```

Der Test-Server (`tools/test-mcp-server/src/index.ts#createTestMcpServer`) ist nur Entwicklungs-Abhängigkeit des Pakets (`packages/mcp/package.json`); die Tests mit Ausgangs-Hülle laden sie über einen relativen Pfad (`packages/mcp/src/verbindung.test.ts`), weil `packages/mcp` `@paibot/llm` nicht importieren darf.

## Bekannte Schwächen

- **Nicht angeschlossen:** Weder Tor, Datenbank, Worker noch Oberfläche benutzen die Schicht; Fakten für das Tor, Tabellen, Routen und Belege gibt es noch nicht.
- **Fehlercodes nur lokal:** Die Codes stehen in `packages/mcp/src/fehler.ts`, nicht im gemeinsamen Vertrag; ebenso die Namensmuster (`packages/mcp/src/namen.ts#MODELL_NAME_MUSTER`).
- **Nur ein Zugang:** Persönlicher Token als `Authorization: Bearer …`. Kein OAuth, keine eigene Kopfzeile (`packages/mcp/src/verbindung.ts#oeffneVerbindung`).
- **Schemas:** Werkzeuge mit `$ref`, `pattern`, `oneOf`, `allOf`, `not`, `patternProperties` oder einem Schema als `additionalProperties` sind nicht bestätigbar (`packages/mcp/src/schema.ts#verarbeiteSchema`). `anyOf`, `const` und `exclusiveMinimum`/`exclusiveMaximum` prüft die Schicht, zeigt sie dem Modell aber nicht. Ob die Schemas echter Anbieter-Server umwandelbar sind, wurde nicht geprüft; die Tests laufen nur gegen den Test-Server.
- **Kein echter Anbieter-Server geprüft:** Alle Läufe gegen `tools/test-mcp-server`; Verhalten gegen andere Server, Kompression und sehr große Zeilen im Ereignis-Strom sind nicht gemessen.
- **Unicode:** Texte werden nicht normalisiert (kein NFKC); nur die Namensteile für das Modell werden zerlegt und auf `A-Z a-z 0-9 _ -` gebracht (`packages/mcp/src/namen.ts#bereinigeNamensteil`).
- **Datenschleuse und Argumente:** Ob die Datenschleuse Platzhalter in Werkzeug-Argumenten zurücktauscht, ist offen; die Schicht prüft das nicht.
- **Keine Wiederverwendung der Verbindung:** Jeder Abruf und jeder Aufruf öffnet und schließt neu (`packages/mcp/src/verbindung.ts#holeWerkzeuge`).
- **Importsperre für `apps/worker` fehlt:** Dort startet eine Test-Datei einen Prozess (`apps/worker/src/schleife-absturz-postgres.test.ts`); deshalb gibt es die Sperre für `child_process` nur in `packages/mcp`, `packages/agents` und `apps/web` (`biome.json`).
- **Frühere Prüf-Tests bleiben:** Die Tests der Bibliothek selbst liegen weiter unter `packages/mcp/src/spike/ueber-fetch.test.ts` (und den Dateien daneben) mit eigener Ausnahme in `biome.json`.
