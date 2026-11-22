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
- **Was nicht sicher prüfbar ist, wird abgewiesen, nicht geraten.** Ein Werkzeug, dessen Schema Stichwörter enthält, die die Schicht nicht prüfen kann (`$ref`, `pattern`, `oneOf`, `not` …), kommt mit `bestaetigbar: false` und einem Grund zurück (`packages/mcp/src/schema.ts#verarbeiteSchema`, `packages/mcp/src/werkzeug.ts#McpWerkzeugProblem`). Das Prüf-Schema ist dabei nie lockerer als die Rohform: `anyOf` ist wie `oneOf` nicht bestätigbar, jeder Name in `required` muss unter `properties` stehen, und zusätzliche Felder sind in jedem Objekt verboten, außer das Schema erlaubt sie ausdrücklich mit `additionalProperties: true`. Dazu gilt für jedes Teilschema: Es hat einen `type` oder besteht nur aus `enum` bzw. `const` (die Bibliothek liest ein Teilschema ohne `type` als „alles erlaubt“ und prüft bei `enum` oder `const` nur diese Werte); `enum` und `const` stehen nie zusammen; typ-eigene Stichwörter wie `minLength`, `minimum`, `items` oder `properties` stehen nur mit dem passenden `type`; ein `array` hat `items`; und jeder Wert aus `enum` bzw. `const` erfüllt die übrigen Regeln des Teilschemas. Leere Teilschemas (`{}`, nur `description`) nähmen beliebiges JSON an und werden abgewiesen (`packages/mcp/src/schema.ts#pruefeNieLockerAlsRohform`, Test „Prüfer nie lockerer als die Rohform“ in `packages/mcp/src/schema.test.ts`). Die Bestätigung echter Server mit solchen Schemas ist nicht geprüft; ein Werkzeug, das daran scheitert, kommt mit `bestaetigbar: false` zurück. Das Schema, das das Modell sieht, nennt dasselbe `additionalProperties` (`packages/mcp/src/schema.ts#schliesseObjektAb`) und zeigt jede Regel, die der Prüfer anwendet: `const` als `enum` mit einem Wert, dazu `exclusiveMinimum` und `exclusiveMaximum` (Test „Das Modell sieht, was geprüft wird“ in `packages/mcp/src/schema.test.ts`).
- **Gespeichert, gezeigt und gesendet wird dieselbe Form.** `modellDefinition` liefert Name, Beschreibung und gekürztes Schema aus einer Stelle (`packages/mcp/src/werkzeug.ts#modellDefinition`); der Abdruck dagegen geht über die Rohform (`packages/mcp/src/abdruck.ts#abdruckVonWert`), damit schon ein unsichtbares Zeichen ein Werkzeug als geändert erscheinen lässt.
- **Modell-Namen bleiben stabil.** Ein Name für das Modell wird beim ersten Sehen eines Werkzeugs vergeben und danach nie neu berechnet: `holeWerkzeuge`, `bereiteWerkzeugeAuf` und `vergebeModellNamen` bekommen die gespeicherte Zuordnung Original-Name → Modell-Name (`bekannteNamen`) und ändern sie nicht; nur neue Werkzeuge bekommen einen frischen Namen. Die Zuordnung ist **Pflicht** (beim ersten Abruf eine leere); fehlt sie, gibt es keine Vergabe. Alle gespeicherten Namen gelten als vergeben, auch wenn ihr Werkzeug in der Liste fehlt, damit ein neues Werkzeug (`a.b`) ein bestätigtes (`a_b`) nie von seinem Namen verdrängt, auch nicht nach einer Pause des Servers. Eine gespeicherte Zuordnung, die nicht stimmt (Name einer anderen App, außerhalb des Namensmusters, doppelt vergeben, schon in `bereitsVergeben` oder mehr als 2 000 Einträge), wird nie still geändert: `holeWerkzeuge` prüft sie und `bereitsVergeben` mit `pruefeNamenZuordnung` **vor dem Verbinden** und wirft einen `McpSchichtFehler` mit dem Code `namen_ungueltig`; dann geht keine Anfrage hinaus. `bereiteWerkzeugeAuf` und `vergebeModellNamen` weisen sie mit einem `RangeError` ab. Die Zuordnung zum Speichern liefert `namenZumSpeichern(werkzeuge)`: nur bestätigbare Werkzeuge mit einem Namen, nie einen leeren. Im Ergebnis von `bereiteWerkzeugeAuf` steht bei doppelten, zu langen oder leeren Namen ein leerer `modellName`; wer die Zuordnung selbst aus allen Einträgen baut, speichert leere Namen, und danach scheitert jeder Abruf. Wer die Zuordnung speichert und **immer aus der Datenbank** liest, ist Sache des Anschlusses (mit eindeutigem Index); die Schicht speichert nichts (`packages/mcp/src/namen.ts#vergebeModellNamen`, `packages/mcp/src/namen.ts#pruefeNamenZuordnung`, `packages/mcp/src/werkzeug.ts#namenZumSpeichern`, `packages/mcp/src/verbindung.ts#holeWerkzeuge`, Tests in `namen.test.ts`, `werkzeug.test.ts` und `verbindung.test.ts`).
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
| `packages/mcp/src/bereinigen.ts` | Bereinigung fremden Texts (`bereinigeText`, `entferneMarkdownBilder`, `entschaerfeBildAnfaenge`)                                  |
| `packages/mcp/src/struktur.ts`   | Prüfung fremder Werte vor jeder Verarbeitung, ohne Rekursion (`pruefeStruktur`, `OBJEKT_NAMEN`)                                   |
| `packages/mcp/src/fehler.ts`     | feste Fehlercodes und Texte, Zuordnung fremder Fehler (`McpSchichtFehler`, `ordneFehlerZu`)                                       |
| `packages/mcp/src/grenzen.ts`    | alle Grenzen und ihre Standardwerte (`STANDARD_GRENZEN`, `mitStandardGrenzen`)                                                    |
| `packages/mcp/src/index.ts`      | Ausgang des Pakets: alles oben, aus der Verbindungs-Datei nur `holeWerkzeuge`, `rufeWerkzeugAuf`, `pruefeAdresse` und die Typen   |

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
| Funktion    | `pruefeAdresse(adresse)`                                  | `packages/mcp/src/verbindung.ts` |
| Funktion    | `bereiteWerkzeugeAuf(liste, optionen)`                    | `packages/mcp/src/werkzeug.ts`   |
| Funktion    | `modellDefinition(werkzeug)`                              | `packages/mcp/src/werkzeug.ts`   |
| Funktion    | `vergleicheWerkzeuge(gespeichert, frisch)`                | `packages/mcp/src/werkzeug.ts`   |
| Funktion    | `verarbeiteSchema(roh, grenzen)`                          | `packages/mcp/src/schema.ts`     |
| Funktion    | `ergebnisZuText(ergebnis, grenzen)`                       | `packages/mcp/src/ergebnis.ts`   |
| Funktion    | `vergebeModellNamen(kurzname, namen, vergeben)`           | `packages/mcp/src/namen.ts`      |
| Funktion    | `pruefeNamenZuordnung(kurzname, bekannt, vergeben)`       | `packages/mcp/src/namen.ts`      |
| Funktion    | `namenZumSpeichern(werkzeuge)`                            | `packages/mcp/src/werkzeug.ts`   |
| Funktion    | `abdruckVonWert(wert)`, `kanonischeForm(wert)`            | `packages/mcp/src/abdruck.ts`    |
| Funktion    | `bereinigeText(text, optionen)`                           | `packages/mcp/src/bereinigen.ts` |
| Funktion    | `pruefeStruktur(wert, grenzen)`                           | `packages/mcp/src/struktur.ts`   |
| Fehlercodes | `MCP_FEHLERCODES` mit festen Texten in `MCP_FEHLERTEXTE`  | `packages/mcp/src/fehler.ts`     |

Von außen gibt es nur `holeWerkzeuge` und `rufeWerkzeugAuf` (mit Prüfung der Argumente); `oeffneVerbindung`, `McpVerbindung.rufeAuf` und `baueSicheresFetch` stehen nur innerhalb des Pakets und in dessen Tests zur Verfügung (`packages/mcp/src/index.ts`, `packages/mcp/src/index.test.ts` prüft die Liste der Exporte).

Die Optionen einer Verbindung (`McpVerbindungOptionen`): `adresse`, `fetch`, `token` (nur als `Authorization: Bearer …`), `grenzen`, `signal` (bricht die ganze Verbindung ab), `holeWerkzeuge` braucht zusätzlich `appKurzname` und `bekannteNamen` (siehe „Modell-Namen bleiben stabil“). Einen Schalter für `http`, IP-Adressen oder andere Ports gibt es **in den Optionen nicht**. Für Tests der Schicht gibt es die Funktionen `oeffneVerbindungIntern`, `holeWerkzeugeIntern` und `rufeWerkzeugAufIntern` in `packages/mcp/src/verbindung.ts`, die den Schalter als zweiten Parameter nehmen (`InterneOptionen`). Weder ein Objekt aus einer Eingabe noch ein Spread noch ein `Proxy` als Optionen erreicht ihn, und `pruefeAdresse` nimmt keinen zweiten Wert. Die Funktionen sind aus Code erreichbar, der die Datei kennt: `index.ts` exportiert sie nicht und `package.json` lässt nur den einen Einstieg zu, aber ein relativer Import in die Datei würde sie finden. Ein Test sucht deshalb im ganzen Quelltext nach ihren Namen und nach relativen Importen in dieses Paket (`tools/lint-regeln/src/mcp-schicht.test.ts`); er ist eine Suche nach Namen und hält keinen entschlossenen Entwickler auf. Der eigentliche Schutz bleibt die Ausgangs-Hülle, die `http` und private Ziele nach dem Auflösen der Adresse abweist. Die Fehlercodes liegen vorerst nur in dieser Schicht (`packages/mcp/src/fehler.ts#MCP_FEHLERCODES`), nicht im gemeinsamen Vertrag.

## Sicherheit

- **Jede Anfrage geht über das hineingereichte `fetch`** und trägt `redirect: "error"`, `credentials: "omit"` und ein Signal; die Schicht erzwingt das selbst, nicht über eine Einstellung der Bibliothek (`packages/mcp/src/verbindung.ts#baueSicheresFetch`). Eine Weiterleitung auf eine zweite App führt zum Fehler, ohne dass dort eine Anfrage ankommt (`packages/mcp/src/verbindung.test.ts`, Gruppe „Weiterleitung auf eine zweite App“).
- **Nur genau die eine Adresse der App:** gleicher Origin, gleicher Pfad, kein Abfrage-Teil, keine Zugangsdaten in der Adresse; ein `Request`-Objekt wird abgelehnt (`baueSicheresFetch`). `pruefeAdresse` verlangt `https` auf dem Standard-Port 443, ohne Benutzer-, Abfrage- und Fragment-Teil, und weist IP-Adressen (v4 und v6, auch Zahlen-Formen wie `0x7f.1`), `localhost` und Namen ohne Punkt ab. Das ist nur ein grober Filter: **Ob das Ziel öffentlich ist** (private, Link-lokale und Loopback-Adressen, Namen, die dorthin auflösen, DNS-Rebinding), **prüft allein die Ausgangs-Hülle** beim Verbinden; die Schicht prüft keine Adress-Klassen. Aufrufer geben darum immer eine Hülle mit genau einem erlaubten Ziel hinein, nie das globale `fetch`.
- **Nur eigene Anfragen gehen hinaus:** Ein Server kann im Ereignis-Strom tausende eigene Anfragen an den Client stellen; die Bibliothek würde jede mit einem eigenen POST samt Zugangsdatum beantworten. Das erzwungene `fetch` lässt deshalb nur POSTs mit den Methoden hinaus, die die Schicht selbst braucht (`initialize`, `notifications/initialized`, `server/discover`, `tools/list`, `tools/call`; dazu `DELETE` zum Beenden der Sitzung). Antworten auf Anfragen des Servers und alles andere bleiben lokal (`packages/mcp/src/verbindung.ts#ERLAUBTE_AUSGEHENDE_METHODEN`). Dazu gelten je Verbindung höchstens `maxAnfragen` tatsächlich gesendete Anfragen und je Antwort höchstens `maxEreignisse` Ereignisse im Strom; darüber endet die Verbindung mit `app_zu_viele_anfragen` (`packages/mcp/src/grenzen.ts`, Test „Flut von Anfragen des Servers im Ereignis-Strom“ in `packages/mcp/src/verbindung.test.ts`).
- **Kein eigener Ereignis-Strom:** `GET` beantwortet die Schicht selbst mit 405, ohne etwas zu senden; damit gibt es nichts, was sich nach dem Schließen neu verbinden könnte (`baueSicheresFetch`). Nach `schliesse()` geht keine Anfrage mehr hinaus (`packages/mcp/src/verbindung.ts#oeffneVerbindung`, Test „Nach dem Schließen“).
- **Grenzen:** Zeit für Liste (10 s) und Aufruf (30 s), Antwort höchstens 2 MB nach Bytes, höchstens 32 gesendete Anfragen und 2 000 Ereignisse je Antwort (gezählt werden Leerzeilen mit jedem Zeilenende, das SSE kennt: `\r\n`, `\n` und `\r` allein), höchstens 10 Seiten und 200 Werkzeuge, Argumente höchstens 8 KB, Schema höchstens 16 KB und 8 Ebenen, Ergebnis-Text höchstens 16 000 Zeichen (`packages/mcp/src/grenzen.ts#STANDARD_GRENZEN`). Dazu die Grenzen der Ausgangs-Hülle; empfohlene Werte stehen in `MCP_EMPFOHLENE_ANTWORT_BYTES` und `MCP_EMPFOHLENES_LEERLAUF_MS`.
- **Fremde Werte zuerst prüfen, dann verarbeiten:** Tiefe, Zahl der Knoten, Kreise, Typen und verbotene Schlüsselnamen werden mit einem eigenen Stapel geprüft, bevor etwas rekursiv läuft; auch ein Objekt mit einer Million Schlüsseln hält den Prozess nur so lange fest, wie die Grenze Schritte erlaubt (`packages/mcp/src/struktur.ts#pruefeStruktur`). Schlüssel mit Namen aus `Object.prototype` (`constructor`, `toString`, `__proto__` …) weist die Schicht in Schemas auf jeder Ebene und in Argumenten ab (`packages/mcp/src/struktur.ts#OBJEKT_NAMEN`, `packages/mcp/src/schema.ts#verarbeiteSchema`).
- **Fremder Text ist nie eine Anweisung:** Steuer-, Umkehr- und unsichtbare Zeichen (auch Formatzeichen, private und nicht vergebene Code-Punkte, Nicht-Zeichen und die Steuer-Zeichen ab U+13430) fallen weg, mehr als vier Kombinationszeichen hintereinander ebenso, Markdown-Bilder werden entfernt und jeder verbleibende Bild-Anfang `![` wird zu `! [` entschärft, Texte werden gekürzt (`packages/mcp/src/bereinigen.ts#bereinigeText`). Der eigentliche Schutz vor Bildern und HTML bleibt, fremden Text nie als Markdown oder HTML darzustellen. Ans Modell geht ein gekürztes Schema mit einer festen Liste von Stichwörtern (`packages/mcp/src/schema.ts#MODELL_STICHWORTE`), Titel, Vorgabewerte und Beispiele fallen weg. Ein Feld-Name oder Aufzählungswert, der sich bei der Bereinigung ändern würde, macht das Werkzeug nicht bestätigbar.
- **Ein Fehler des Werkzeugs zeigt nie den Text des Servers:** `isError` wird zu einem festen Satz (`packages/mcp/src/ergebnis.ts#ergebnisZuText`); `McpErgebnis.enthaeltFremdenText` sagt, ob irgendein Text des Servers im Ergebnis steckt.
- **Zugangsdaten:** Das Zugangsdatum geht nur als `Authorization: Bearer …` hinaus, ist auf sichtbare ASCII-Zeichen ohne Leerzeichen begrenzt (`packages/mcp/src/verbindung.ts#oeffneVerbindung`) und steht in keinem Fehler, keinem Rückgabewert und keinem Objekt der Verbindung. Fehler tragen nur feste Texte; die Ursache der Bibliothek wird nicht weitergegeben (`packages/mcp/src/fehler.ts#McpSchichtFehler`, `ordneFehlerZu`). Der Text des Servers steuert den Fehlercode nicht: Maßgeblich sind Statuscode, Zahlencode einer Fehler-Antwort, Fehlerart und die festen Anfänge der Meldungen der Bibliothek; was sich so nicht einordnen lässt, wird zu einem allgemeinen Code (`ordneStatusZu`, `ordneFehlerZu`). Trotzdem löst kein Fehlercode von sich aus etwas Sicherheitsrelevantes aus (Zugang löschen, App sperren). Eine eigene Kopfzeile für das Zugangsdatum gibt es in dieser Fassung nicht.
- **Keine Rückfragen des Servers:** Die Schicht meldet keine Fähigkeiten an und registriert keinen Handler; eine Rückfrage endet als `app_braucht_eingabe` (`packages/mcp/src/fehler.ts#ordneFehlerZu`).
- **Keine fremden Prozesse:** In `packages/mcp`, `packages/agents` und `apps/web` sind `child_process`, `cross-spawn` und der stdio-Einstieg der Bibliothek verboten (`biome.json`, Test `tools/lint-regeln/src/mcp-schicht.test.ts`). In `packages/mcp` sind zusätzlich die Wege an den Sperren vorbei gesperrt: `node:module` und `createRequire`, `node:vm`, `node:inspector`, `process`, `Function`, `eval`, `require` und ein `import()` mit etwas anderem als einer festen Zeichenkette (`biome.json`, `tools/lint-regeln/mcp-kein-eigenes-fetch.grit`).
- **Die Liste nicht im Web-Prozess abrufen:** Das ist eine Anforderung an den Anschluss, kein vorhandener Zustand: Der Anschluss ruft die Liste nicht im Web-Prozess ab, sondern im Worker. Ein Abruf mit vielen Seiten kostet messbar Rechenzeit; die Grenzen der Schicht (Seitenzahl, Größe, Zeit) begrenzen es.
- **Der Strom wird nach dem Ergebnis geschlossen:** `holeWerkzeuge` und `rufeWerkzeugAuf` schließen die Verbindung immer, auch im Fehlerfall; ein Server, der nach dem Ergebnis weitersendet, sieht das Ende (`packages/mcp/src/verbindung.ts#rufeWerkzeugAuf`, Test „Verbindung nach dem Ergebnis schließen“).

## Tests

| Test                                        | Prüft                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/mcp/src/verbindung.test.ts`       | Liste und Aufruf in beiden Protokoll-Fassungen gegen den Test-Server, Zugang, Adresse, erzwungenes `fetch`, Zeit, Abbruch, Größe, Hülle                 |
| `packages/mcp/src/struktur.test.ts`         | 10 000 Ebenen, eine Million Schlüssel, Kreis, Typen, verbotene Schlüssel; die Verarbeiter werfen nie                                                    |
| `packages/mcp/src/schema.test.ts`           | Kürzung, Bereinigung, abgewiesene Stichwörter, Namen aus `Object.prototype`, Prüf-Schema für Argumente                                                  |
| `packages/mcp/src/werkzeug.test.ts`         | Beschreibung, Hinweise nur als Anzeige, Namen, Abgleich der Liste                                                                                       |
| `packages/mcp/src/ergebnis.test.ts`         | fester Satz bei `isError`, Kürzung, Medien, strukturierter Inhalt                                                                                       |
| `packages/mcp/src/bereinigen.test.ts`       | unsichtbare Zeichen, Bilder und ihre Umgehungen, Länge, Kombinationszeichen, Zeit bei verwinkelten Eingaben                                             |
| `packages/mcp/src/index.test.ts`            | Liste der Exporte: kein Aufruf ohne Prüfung der Argumente                                                                                               |
| `packages/mcp/src/abdruck.test.ts`          | Abdruck stabil bei anderer Reihenfolge, empfindlich schon bei einem unsichtbaren Zeichen                                                                |
| `packages/mcp/src/namen.test.ts`            | eindeutige Namen, Kollisionen, 64 Zeichen, bekannte Namen bleiben stabil                                                                                |
| `packages/mcp/src/fehler.test.ts`           | feste Texte, Zuordnung, kein Text des Servers und kein Zugangsdatum                                                                                     |
| `tools/lint-regeln/src/mcp-schicht.test.ts` | Importsperren, Regel gegen eigenen Netz-Zugriff und gegen Umgehungen, Test-Schalter nur in Definition und Tests (Biome läuft wirklich, mit Gegenproben) |

Ausführen:

```bash
pnpm --filter @paibot/mcp test
pnpm --filter @paibot/lint-regeln test
```

Der Test-Server (`tools/test-mcp-server/src/index.ts#createTestMcpServer`) ist nur Entwicklungs-Abhängigkeit des Pakets (`packages/mcp/package.json`); die Tests mit Ausgangs-Hülle laden sie über einen relativen Pfad (`packages/mcp/src/verbindung.test.ts`), weil `packages/mcp` `@paibot/llm` nicht importieren darf.

## Bekannte Schwächen

- **Nicht angeschlossen:** Weder Tor, Datenbank, Worker noch Oberfläche benutzen die Schicht; Fakten für das Tor, Tabellen, Routen und Belege gibt es noch nicht.
- **Modell-Namen vergibt die Schicht nur für die ganze Liste:** `vergebeModellNamen` sortiert nach dem Original-Namen und zählt bei Kollisionen; kommt später ein Werkzeug hinzu, kann ein bestätigtes seinen Namen an das neue verlieren. Der Anschluss muss den Modell-Namen deshalb beim ersten Sehen einmal speichern (`namenZumSpeichern`) und nie neu berechnen; die Schicht nimmt die gespeicherte Zuordnung als `bekannteNamen` entgegen (`packages/mcp/src/namen.ts#vergebeModellNamen`, `packages/mcp/src/werkzeug.ts#bereiteWerkzeugeAuf`). Die Zuordnung Modell-Name zu Werkzeug darf nur aus der gespeicherten Liste kommen.
- **Adress-Klassen prüft die Hülle:** Private und interne Ziele sperrt allein die Ausgangs-Hülle; ohne sie (mit dem globalen `fetch`) wären sie offen (`packages/mcp/src/verbindung.ts#pruefeAdresse`).
- **Rechenzeit:** Der schlimmste Fall beim Aufbereiten einer Liste liegt bei etwa einer Sekunde (gemessen mit 200 Werkzeugen zu je 15 KB Schema, synchron). Die Aufbereitung gehört deshalb nicht in den Web-Prozess, sondern in den Worker oder mit einer Grenze je Anfrage.
- **Fehlercodes nur lokal:** Die Codes stehen in `packages/mcp/src/fehler.ts`, nicht im gemeinsamen Vertrag; ebenso die Namensmuster (`packages/mcp/src/namen.ts#MODELL_NAME_MUSTER`).
- **Nur ein Zugang:** Persönlicher Token als `Authorization: Bearer …`. Kein OAuth, keine eigene Kopfzeile (`packages/mcp/src/verbindung.ts#oeffneVerbindung`).
- **Schemas:** Werkzeuge mit `$ref`, `pattern`, `oneOf`, `anyOf`, `allOf`, `not`, `patternProperties` oder einem Schema als `additionalProperties` sind nicht bestätigbar (`packages/mcp/src/schema.ts#verarbeiteSchema`); ebenso ein `required` mit Namen, die nicht unter `properties` stehen. Zusätzliche Felder weist der Prüfer in jedem Objekt ab, auch wenn das Rohschema sie erlauben würde (außer bei ausdrücklichem `additionalProperties: true`); ein Werkzeug mit frei geformten Objekten ist so nur nutzbar, wenn es das ausdrücklich erlaubt. `const` und `exclusiveMinimum`/`exclusiveMaximum` prüft die Schicht, zeigt sie dem Modell aber nicht. Ob die Schemas echter Anbieter-Server umwandelbar sind, wurde nicht geprüft; die Tests laufen nur gegen den Test-Server.
- **Kein echter Anbieter-Server geprüft:** Alle Läufe gegen `tools/test-mcp-server`; Verhalten gegen andere Server, Kompression und sehr große Zeilen im Ereignis-Strom sind nicht gemessen.
- **Unicode:** Texte werden nicht normalisiert (kein NFKC); nur die Namensteile für das Modell werden zerlegt und auf `A-Z a-z 0-9 _ -` gebracht (`packages/mcp/src/namen.ts#bereinigeNamensteil`).
- **Datenschleuse und Argumente:** Ob die Datenschleuse Platzhalter in Werkzeug-Argumenten zurücktauscht, ist offen; die Schicht prüft das nicht.
- **Keine Wiederverwendung der Verbindung:** Jeder Abruf und jeder Aufruf öffnet und schließt neu (`packages/mcp/src/verbindung.ts#holeWerkzeuge`).
- **Importsperre für `apps/worker` fehlt:** Dort startet eine Test-Datei einen Prozess (`apps/worker/src/schleife-absturz-postgres.test.ts`); deshalb gibt es die Sperre für `child_process` nur in `packages/mcp`, `packages/agents` und `apps/web` (`biome.json`).
- **Frühere Prüf-Tests bleiben:** Die Tests der Bibliothek selbst liegen weiter unter `packages/mcp/src/spike/ueber-fetch.test.ts` (und den Dateien daneben) mit eigener Ausnahme in `biome.json`.
