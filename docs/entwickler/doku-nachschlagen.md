<!--
PaiBot – Entwickler-Seite: das Werkzeug „In der Doku nachschlagen“ (Lader, Suche, Werkzeug, Kurzschluss, Anweisung, Belege).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-22
-->

# In der Doku nachschlagen – für Entwickler

**Anwender-Doku:** noch keine. Das Werkzeug ist gebaut, in der Auslieferung aber noch nicht eingeschaltet (`packages/agents/src/werkzeuge/eingebaut.ts#builtinTools` liefert eine leere Liste); die Anwender-Seite kommt mit dem Einschalten. Grundlage ist der [Doku-Index im Image](doku-index.md); die Schleife beschreibt der [Werkzeug-Kern](werkzeug-kern.md).

## Zweck und Entscheidung

Pai soll Fragen zu PaiBot aus der Doku der installierten Version beantworten, ohne Internet. Das Werkzeug `doku_nachschlagen` sucht dafür im Doku-Index, der beim Bau des Images entsteht, und liefert höchstens vier Abschnitte mit Seite, Anker und Titel. Findet keiner der ausgeführten Aufrufe eines Schritts etwas, fragt PaiBot das Modell in diesem Lauf nicht mehr und antwortet mit einem festen Satz.

Entscheidungen, wie sie im Code stehen:

- **Index über die Fabrik, nicht über einen Anschluss:** `ToolPorts` ist leer (`packages/shared/src/werkzeug.ts#ToolPorts`). Der Index kommt deshalb als Argument von `dokuNachschlagen(index)` (`packages/agents/src/werkzeuge/doku/werkzeug.ts#dokuNachschlagen`); `run` liest nur ihn.
- **Laden einmal, streng geprüft:** `ladeDokuIndex` (`packages/agents/src/werkzeuge/doku/index-laden.ts#ladeDokuIndex`) ist die einzige Datei des Werkzeugs, die eine Datei liest. Der Pfad kommt aus `PAIBOT_DOKU_INDEX`, sonst `doku-index/doku-index.json` im Projektstamm (`dokuIndexPfad`), nie aus einer Eingabe des Modells.
- **Höchstens drei Suchanfragen je Aufruf:** die Frage (3 bis 200 Zeichen) und bis zu zwei andere Begriffe (je 1 bis 80), je Anfrage höchstens 12 Wörter (`packages/agents/src/werkzeuge/doku/werkzeug.ts#dokuEingabeSchema`, `packages/agents/src/werkzeuge/doku/suche.ts#MAX_WOERTER_JE_ANFRAGE`).
- **Doku-Stand in Kurzform:** `<Version>+<erste 12 Hex der Prüfsumme>` (`packages/agents/src/werkzeuge/doku/suche.ts#kurzStand`); er passt in das Feld `docStand` des Belegs (höchstens 80 Zeichen, `packages/shared/src/receipts.ts#receiptResultSchema`).
- **Kurzschluss nur an einer Stelle:** `nachAufrufen` (`packages/agents/src/run/nahtstellen.ts#nachAufrufen`). Ein Werkzeug-Fehler oder die Zeitgrenze ist keine Meldung „nichts gefunden“.
- **„verworfen“ als zweites Schritt-Ende:** Beim Ende eines Schritts steht noch nicht fest, ob das Nachschlagen etwas findet; sein Text ist dann schon als Zwischentext gemeldet. Mit dem festen Satz folgt in derselben Transaktion `step.finished` mit `verworfen` (`packages/agents/src/run/schleife.ts#fixedAnswer`). Wer Schritte anzeigt, wertet das letzte `step.finished` je Schritt.
- **Anweisung abhängig vom Werkzeug:** Nur wenn der Lauf das Werkzeug anbietet, ersetzt `SATZ_DOKU` den Satz `SATZ_OHNE_WERKZEUGE` (`packages/agents/src/prompt.ts#buildSystemPrompt`). Maßgeblich sind die Werkzeuge des Laufs, nicht die des Schritts; so ist die Anweisung im letzten Schritt (ohne angebotene Werkzeuge) dieselbe.

## Aufbau

| Datei                                                   | Aufgabe                                                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `packages/agents/src/werkzeuge/doku/index-laden.ts`     | Index laden und prüfen (`ladeDokuIndex`, `dokuIndexAusText`, `dokuPruefsumme`, `DokuIndexFehler`)                           |
| `packages/agents/src/werkzeuge/doku/suche.ts`           | Normalisieren (`woerter`), Vorbereiten (`bereiteIndexVor`), Suche (`sucheImIndex`), Ausschnitt                              |
| `packages/agents/src/werkzeuge/doku/gleiche-woerter.ts` | feste Listen `STOPPWOERTER` und `GLEICHE_WOERTER`                                                                           |
| `packages/agents/src/werkzeuge/doku/werkzeug.ts`        | Eintrag fürs Register (`dokuNachschlagen`), Schemas, Beschreibung, Quellen (`dokuQuellen`)                                  |
| `packages/agents/src/werkzeuge/beleg-felder.ts`         | `docStand` und `found` aus der gespeicherten Hülle (`belegFelder`, `dokuAusHuelle`)                                         |
| `packages/agents/src/run/aufruf.ts`                     | setzt die Beleg-Felder in den Ergebnis-Beleg und meldet `ausgefuehrt` und `doku` an die Schleife                            |
| `packages/agents/src/run/nahtstellen.ts`                | `nachAufrufen`: weiter oder fester Satz                                                                                     |
| `packages/agents/src/run/schleife.ts`                   | füllt die Ergebnisse der Aufrufe, schreibt die feste Antwort mit `verworfen`, gibt die Werkzeuge des Laufs an die Anweisung |
| `packages/agents/src/prompt.ts`                         | `SATZ_DOKU`, `SATZ_OHNE_WERKZEUGE`, `buildSystemPrompt` mit den Werkzeugen des Laufs                                        |
| `packages/agents/src/werkzeuge/eingebaut.ts`            | `builtinTools`: nimmt den Doku-Index entgegen, liefert in dieser Fassung keine Werkzeuge                                    |
| `packages/shared/src/i18n/de.ts`                        | Texte `werkzeug.titel.doku_nachschlagen` und `werkzeug.doku.nichts_gefunden`                                                |

Datenfluss eines Aufrufs (sobald das Werkzeug im Register steht):

1. Das Modell wünscht `doku_nachschlagen`; die Schleife prüft Name und Eingabe (`packages/agents/src/run/aufruf.ts#prepareCalls`). Ungültige Eingabe endet abgelehnt mit `werkzeug_eingabe_ungueltig`, das Werkzeug läuft nicht.
2. `gate.run("werkzeug.aufrufen")` mit allen Standard-Regeln. Erlaubt wird das Nachschlagen nur über R-010 (`packages/shared/src/gate.ts#ACTIVE_STANDARD_RULES`): Kennung „eingebaut/doku.nachschlagen“, Quelle `eingebaut`, `lesen`, `intern`, Bot der Unterhaltung.
3. `run` ruft `sucheImIndex` mit der Frage und den anderen Begriffen auf und liefert `gefunden` mit Abschnitten oder `nichts_gefunden`, jeweils mit dem Doku-Stand.
4. Die Schleife prüft das Ergebnis gegen `dokuErgebnisSchema`, bereinigt es, kürzt es auf die Grenzen und baut die Hülle (`packages/agents/src/run/aufruf.ts`). Der Ergebnis-Beleg trägt Abdruck, `docStand` und `found` aus genau dieser Hülle.
5. `nachAufrufen` entscheidet nach allen Aufrufen des Schritts: weiter (nächster Modell-Schritt mit der Hülle als Nachricht `role: "tool"`) oder fester Satz.

### Suche

Die Regel, wörtlich wie im Code (`packages/agents/src/werkzeuge/doku/suche.ts#sucheImIndex`):

1. **Normalisieren** (Anfrage und Index gleich, `woerter`): bereinigen (`packages/agents/src/run/bereinigen.ts#cleanText`, NFC, ohne unsichtbare Zeichen), klein, `ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`, alles außer Buchstaben und Ziffern trennt Wörter. Wörter unter 2 Zeichen und Stoppwörter fallen weg; ab 5 Zeichen wird höchstens eine Endung abgeschnitten (`-ungen`, `-ung`, `-en`, `-er`, `-es`, `-e`, `-n`, `-s`, die längste zuerst). Das Stoppwort wird vor und nach dem Abschneiden geprüft.
2. **Begriffe:** je Anfrage höchstens die ersten 12 Wörter; ein Wort zählt mit allen Wörtern seiner Gruppe aus `GLEICHE_WOERTER` als ein Begriff. Ohne Begriff nach dem Normalisieren (nur Stoppwörter, nur Zeichen) gibt es keinen Treffer.
3. **Treffen:** Ein Begriff trifft ein Wort des Index, wenn es gleich ist; ab 5 Zeichen auch, wenn das Wort mit ihm beginnt oder endet (`WORTTEIL_AB`).
4. **Treffer:** Ein Abschnitt ist Treffer einer Anfrage, wenn **jeder** Begriff in ihm vorkommt. Je Begriff 3 Punkte, wenn er im Titel oder im Pfad der Überschriften darüber steht (`pfad` des Index, siehe [Doku-Index](doku-index.md)), sonst 1 Punkt für den Text (`PUNKTE_TITEL`, `PUNKTE_TEXT`); mindestens 1 Punkt (`SCHWELLE`). Je Abschnitt zählt die beste Anfrage.
5. **Ordnung:** Punkte absteigend, dann Zahl der Begriffe im Titel absteigend, dann kürzerer Text, zuletzt die Reihenfolge im Index. Nichts Zufälliges, keine Zeit.
6. **Auswahl:** höchstens 4 Abschnitte (`MAX_ABSCHNITTE`). Ein Text über 1 500 Zeichen wird ein Ausschnitt, der am Satz- bzw. Zeilenanfang vor dem ersten Treffer-Wort beginnt (liegt der mehr als 300 Zeichen davor, am Treffer-Wort), gekürzte Ränder tragen „…“ (`ausschnitt`). Titel und Texte zusammen höchstens 6 000 Zeichen und das Ergebnis als JSON höchstens die Ergebnis-Grenze des Werkzeugs (6 000); was nicht passt, fällt als ganzer Abschnitt von hinten weg.

Keine regulären Ausdrücke aus der Eingabe, kein `eval`, keine Datei, kein Netz. Vorbereitet wird einmal beim Laden: je Wort die Abschnitte mit Titel- bzw. Text-Treffer, dazu die Wörter sortiert und rückwärts sortiert für „beginnt mit“ und „endet mit“ (`bereiteIndexVor`).

Beleg am echten Index (`packages/agents/src/werkzeuge/doku/suche.test.ts`, Fragen in `packages/agents/src/werkzeuge/doku/testdaten/indizes.ts#GOLDEN_FAELLE`):

| Frage                                             | erwartet unter den gelieferten Abschnitten                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| Wie stelle ich das Tagesbudget ein?               | eine Seite `funktion-einstellungen.md`                                      |
| Was macht der Not-Aus?                            | `funktion-tor.md#not-aus-alle-bots-anhalten`                                |
| Was ist die Datenschleuse?                        | eine Seite `funktion-datenschleuse.md`                                      |
| Wie stelle ich eine Sicherung wieder her?         | eine Seite `sicherung.md`                                                   |
| Wie installiere ich die Web-App auf dem iPhone?   | `installation.md#auf-dem-iphone-und-ipad-safari`                            |
| Wie prüfe ich meine Belege ohne PaiBot?           | `funktion-belege.md#exportieren-und-ohne-paibot-prüfen`                     |
| Ich bin ausgesperrt, wie komme ich wieder hinein? | `funktion-einrichtung-und-zugang.md#ausgesperrt-so-kommst-du-wieder-hinein` |

Fragen ohne Treffer (`FALLEN`): Telegram, WhatsApp, Outlook-Kalender, Sprachausgabe. Ihre Kern-Wörter stehen in keinem Abschnitt des Index; der Test prüft das am gebauten Index (`packages/agents/src/werkzeuge/doku/testdaten/indizes.test.ts`).

## Datenmodell und Migrationen

Keine eigenen Tabellen, keine Migration. R-010 steht seit der Migration für Werkzeug-Aufrufe in der Datenbank (`packages/db/drizzle/0014_werkzeug_kern.sql`). Gelesen und geschrieben werden die Tabellen des Werkzeug-Kerns: `tool_calls` (Zeile je Aufruf, `output` ist genau die gesendete Hülle), `messages` (Zwischentext und feste Antwort mit Herkunft `fest`) und die Belege.

Ergebnis an das Modell (`inhalt` der Hülle, `packages/agents/src/werkzeuge/doku/werkzeug.ts#dokuErgebnisSchema`):

```ts
type DokuErgebnis =
  | {
      status: "gefunden";
      stand: string;
      abschnitte: Array<{ id: string; seite: string; anker: string; titel: string; text: string }>;
    }
  | { status: "nichts_gefunden"; stand: string };
```

## Schnittstellen

| Art        | Name                                                                                    | Datei                                               |
| ---------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Werkzeug   | „eingebaut/doku.nachschlagen“ (Name `doku_nachschlagen`), `DOKU_TOOL_KEY`               | `packages/agents/src/werkzeuge/doku/werkzeug.ts`    |
| Aktion     | `werkzeug.aufrufen`                                                                     | `packages/shared/src/actions.ts`                    |
| Regel      | R-010 „Bot liest in der Doku seiner Version“                                            | `packages/shared/src/gate.ts`                       |
| Funktion   | `ladeDokuIndex`, `dokuIndexPfad`, `INDEX_FASSUNG`                                       | `packages/agents/src/werkzeuge/doku/index-laden.ts` |
| Funktion   | `sucheImIndex`, `bereiteIndexVor`, `kurzStand`                                          | `packages/agents/src/werkzeuge/doku/suche.ts`       |
| Funktion   | `belegFelder`                                                                           | `packages/agents/src/werkzeuge/beleg-felder.ts`     |
| Nahtstelle | `nachAufrufen` mit `AufrufErgebnis` (`toolKey`, `ausgefuehrt`, `doku`) und `FestesEnde` | `packages/agents/src/run/nahtstellen.ts`            |
| Beleg      | Ergebnis mit `docStand`, `found`                                                        | `packages/shared/src/receipts.ts`                   |
| Ereignis   | `step.finished` mit `ending: "verworfen"`                                               | `packages/shared/src/events.ts`                     |
| Umgebung   | `PAIBOT_DOKU_INDEX`                                                                     | `apps/web/Dockerfile`                               |
| Text       | `werkzeug.doku.nichts_gefunden` (Platzhalter `stand` = Version ohne Prüfsumme)          | `packages/shared/src/i18n/de.ts`                    |

## Sicherheit

- **Nur über R-010 erlaubt:** Mit allen Standard-Regeln entscheidet bei `werkzeug.aufrufen` eines Bots sonst R-005 („fragen“), und „fragen“ ist in dieser Fassung abgelehnt (`packages/agents/src/run/nahtstellen.ts#nachFrage`). Der Test belegt das über das echte Tor und mit `evaluate` (`packages/agents/src/run/schleife-doku.test.ts`).
- **Eigener Inhalt nur unter Bedingungen:** `foreignContent: false` gilt, solange der Index nur beim Bau aus dem Repo entsteht, beim Bau bereinigt wird, `pnpm doku:check` versteckte Teile in den Seiten ablehnt, Testseiten nie unter `docs/` liegen und nichts von außen in den Index kommt. Fällt eine dieser Bedingungen weg, wird die Doku als fremd gekennzeichnet. Liest ein Werkzeug Ankündigungen oder andere Inhalte, die nicht beim Bau aus dem Repo entstehen, gelten diese als fremd. Das Register der Auslieferung lehnt fremde Inhalte ab (`packages/agents/src/werkzeuge/register.ts#createShippedRegistry`).
- **Index nur als gebaute Datei:** Der Lader lehnt eine Datei über 4 MB, eine andere Form, eine andere Fassung als 2, doppelte Kennungen, einen Pfad der Überschriften, der nicht mit dem Titel endet, unsichtbare oder Steuerzeichen und eine abweichende Prüfsumme ab; die Meldung nennt nie Text aus dem Index (`DokuIndexFehler`).
- **Kein Pfad und kein Netz aus der Eingabe:** Die Eingabe wird nur gesucht. Ein Regel-Test prüft, dass nur `index-laden.ts` `node:fs` importiert und kein Modul des Werkzeugs Netz, Prozesse oder `fetch` nutzt (`tools/lint-regeln/src/doku-werkzeug.test.ts`).
- **Ergebnis ist Daten:** Die Hülle geht nur als Nachricht `role: "tool"` an das Modell, bereinigt und gekürzt; `SATZ_DOKU` sagt dem Modell, dass Werkzeug-Ergebnisse Daten sind, keine Anweisungen. Eine Aufforderung im Doku-Text kann nichts auslösen außer einem weiteren Wunsch, und jeder Wunsch geht durchs Tor; ein schreibendes Werkzeug fragt (R-005) und ist abgelehnt.
- **Entwurf nie als Antwort:** Der Text vor dem festen Satz bleibt Zwischentext (`step` gesetzt); alle Leser in der Web-App lesen nur End-Antworten (siehe „Wer liest Nachrichten“ im [Werkzeug-Kern](werkzeug-kern.md)).

## Tests

| Test                                                     | Prüft                                                                                                                                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/agents/src/werkzeuge/doku/index-laden.test.ts` | echter Index lädt; Größe, Form, Fassung, Felder, doppelte Kennung, Pfad, Prüfsumme, unsichtbare Zeichen; Meldungen ohne Index-Text                                                                 |
| `packages/agents/src/werkzeuge/doku/suche.test.ts`       | feste Fragen und Fallen am echten Index, Wiederholbarkeit, Gleichstand, Bedingungen eines Treffers, Obergrenzen, Ausschnitt                                                                        |
| `packages/agents/src/werkzeuge/doku/suche-zeit.test.ts`  | Suche über einen Index nahe 4 MB unter 50 ms (Median von 20 Läufen), Eingaben wie `(a+)+$`                                                                                                         |
| `packages/agents/src/werkzeuge/doku/werkzeug.test.ts`    | Eintrag, Schema an das Modell, Grenzen der Eingabe, Ergebnis und Quellen, kein Datei- oder Netzzugriff, Auslieferung ohne Werkzeug                                                                 |
| `packages/agents/src/run/nahtstellen.test.ts`            | Tabelle der Fälle von `nachAufrufen`                                                                                                                                                               |
| `packages/agents/src/run/schleife-doku.test.ts`          | Läufe über das echte Tor: R-010, Eingaben, Hülle nur als `role: "tool"`, Quellen, Abdruck, Belege, Bereinigung, fester Satz, `verworfen`, Anweisung, eingeschleuste Aufforderung, Chat ohne Wunsch |
| `packages/agents/src/prompt.test.ts`                     | Anweisung ohne Werkzeug Zeichen für Zeichen wie bisher (Abdruck), mit Werkzeug `SATZ_DOKU`                                                                                                         |
| `tools/lint-regeln/src/doku-werkzeug.test.ts`            | nur der Lader liest Dateien; kein Netz                                                                                                                                                             |

Ausführen:

```bash
pnpm --filter @paibot/agents exec vitest run src/werkzeuge src/run/schleife-doku.test.ts src/run/nahtstellen.test.ts src/prompt.test.ts
pnpm --filter @paibot/lint-regeln exec vitest run src/doku-werkzeug.test.ts
```

## Bekannte Schwächen

- **Gebaut, in der Auslieferung noch nicht eingeschaltet** (`packages/agents/src/werkzeuge/eingebaut.ts`). Der Worker lädt den Index noch nicht (`apps/worker/src/abhaengigkeiten.ts`).
- **Wortsuche ohne Bedeutung:** Sie findet nur Wörter, die in der Doku stehen. Statt eines Wortstamms trifft ein Begriff ab 5 Zeichen auch Wörter, die mit ihm beginnen oder enden; gleiche Wörter kommen nur aus der festen Liste `GLEICHE_WOERTER`, Synonyme darüber hinaus gibt es nicht.
- **Jeder Begriff muss vorkommen:** Ein Füllwort, das nicht in der Stoppwort-Liste steht, kann einen passenden Abschnitt verhindern; die Liste ist fest (`STOPPWOERTER`).
- **Werkzeug-Fehler ohne Kurzschluss:** Meldet das Nachschlagen einen Fehler oder erreicht die Zeitgrenze, geht der Lauf weiter; das Modell sieht nur die Fehler-Hülle (`packages/agents/src/run/nahtstellen.ts#nachAufrufen`).
- **Zweite Frage in derselben Nachricht:** Findet das Nachschlagen nichts, endet die Antwort mit dem festen Satz, auch wenn die Nachricht noch etwas anderes fragte; der Satz bittet darum, es getrennt zu fragen.
- **Zahl der Fundstellen nach dem Kürzen:** `found` zählt die Abschnitte der gespeicherten Hülle. Das Kürzen entfernt Abschnitte erst, wenn alle Texte leer sind (`packages/agents/src/run/huelle.ts#truncateContent`); bei den Grenzen der Einstellungen bleibt die Zahl deshalb meist gleich, die Texte werden kürzer.
- **Ob das Modell das Werkzeug nutzt und sich an die Abschnitte hält,** ist nicht garantiert und noch nicht gemessen.
- **Test-Werkzeuge mit der Kennung von R-010:** Trägt ein Test-Werkzeug die Kennung „eingebaut/doku.nachschlagen“ (`packages/agents/src/testing/werkzeuge.ts#R010_TOOL_KEY`), bekommt sein Lauf ebenfalls `SATZ_DOKU` in der Anweisung.
