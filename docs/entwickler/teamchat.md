<!--
PaiBot – Entwickler-Seite: Regeln für Teams aus Bots (feste Zeilen, Staffelstab, Zähl-Fakten).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Teamchat: Regeln für Teams – für Entwickler

**Anwender-Doku:** keine eigene Seite. Dieser Stand enthält nur reine Funktionen ohne Oberfläche und ohne Anschluss an Datenbank, Worker oder Lauf-Steuerung. Die Anwender-Seite entsteht mit der Funktion, die sie benutzt.

## Zweck und Entscheidung

In einem Team arbeiten mehrere Bots an einem Auftrag. Die Funktionen in `packages/agents/src/raum/` beantworten dafür vier Fragen, jeweils ohne Modell, ohne Datenbank und ohne Uhr: Wer antwortet auf eine Nachricht der Person (`packages/agents/src/raum/regeln.ts#bestimmeAntworter`)? Welche Wünsche stehen in der fertigen Antwort eines Bots (`packages/agents/src/raum/zeilen.ts#erkenneZeilen`)? Wer hat danach den Staffelstab (`packages/agents/src/raum/regeln.ts#ermittleNaechstenSchritt`)? Welche Zahlen gibt es zu Aufträgen, Bitten und Breite (`packages/agents/src/raum/zaehlen.ts`)?

Entscheidungen, die im Code belegt sind:

- **Nur feste Zeilen wirken.** Ein Bot reagiert nicht auf die bloße Erwähnung eines anderen Bots. Was ein Bot weitergeben will, steht allein in einer festen Zeile seiner eigenen, normal beendeten Antwort (`packages/agents/src/raum/zeilen.ts#erkenneZeilen`). Nachrichten, die nicht vom Besitzer stammen, werden von `bestimmeAntworter` nicht einmal nach `@` durchsucht.
- **Die Funktionen entscheiden nichts.** Sie liefern Wünsche und Fakten (Weg, Länge des Zettels, Breite, Zahlen). Ob etwas gilt, entscheidet allein das Tor; so gibt es keinen zweiten Weg ohne Beleg (Kommentar in `packages/agents/src/raum/grenzen.ts#messeAuftragsGrenzen`). `erkenneZeilen` wirft nie, auch nicht bei Eingaben, die nicht passen (Test „wirft nie“ in `packages/agents/src/raum/zeilen.test.ts`). `bestimmeAntworter` wirft bei einer Höchstzahl der Erwähnungen außerhalb des erlaubten Bereichs einen `RangeError` (`packages/agents/src/raum/erwaehnungen.ts#erkenneErwaehnungen`).
- **Ohne Erwähnung ist die Leitung dran**, mit Erwähnung die Genannten nacheinander und danach die Leitung (`packages/agents/src/raum/regeln.ts#bestimmeAntworter`). Wer dran ist, bestimmt nie ein Modell.

## Aufbau

| Datei                                      | Aufgabe                                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `packages/agents/src/raum/zeilen.ts`       | `erkenneZeilen`: feste Zeilen in einer Bot-Antwort, Zettel, Weg, Möglichkeiten, Breite                               |
| `packages/agents/src/raum/regeln.ts`       | `bestimmeAntworter`, `ermittleNaechstenSchritt` (Staffelstab), `bewerteBesitzerNachricht`, `ermittleSammelAusloeser` |
| `packages/agents/src/raum/zaehlen.ts`      | Zähl-Fakten: Aufträge je Mitglied und Wurzel, Bitten je Auftrag, Breite                                              |
| `packages/agents/src/raum/erwaehnungen.ts` | `erkenneErwaehnungen` für Nachrichten der Person, `ohneCodeUndZitate`                                                |
| `packages/agents/src/raum/namen.ts`        | `vergleichsName`, `aehnlichkeitsForm`, `namensKonflikte`                                                             |
| `packages/agents/src/raum/grenzen.ts`      | `messeAuftragsGrenzen`: Fakten zu Tiefe, Anzahl, Token, Zeit                                                         |
| `packages/agents/src/raum/kreis.ts`        | `ermittleKreisFakten`: Empfänger ist Geber oder Vorfahre                                                             |
| `packages/agents/src/raum/verlauf.ts`      | `baueRaumVerlauf`: Beiträge anderer Bots als fremde Beiträge mit Namen, Lauf-Kennung und Kennzeichen                 |
| `packages/agents/src/raum/index.ts`        | Sammelexport innerhalb des Ordners                                                                                   |

Die Funktionen sind nicht aus `packages/agents/src/index.ts` exportiert und werden außerhalb des Ordners noch nicht aufgerufen. Die Typen sind eigene Typen des Ordners; es gibt keinen Import aus `packages/shared`.

### Feste Zeilen (`erkenneZeilen`)

Erkannt werden `@Name: …`, `Zurück an @Name: …`, `Fertig: …`, `Frage an dich: …` und direkt darunter `Möglichkeiten: a | b | c`. Bei Pai heißt die Zeile `@Team Teamname: …`. Die Regeln im Einzelnen (`packages/agents/src/raum/zeilen.ts#erkenneZeilen`):

| Regel                                                                                                                                                                                                           | Wirkung                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Die Zeile beginnt in Spalte 0 mit ASCII `@` bzw. dem festen Wort (Groß/Klein genau) und hat einen ASCII-`:`                                                                                                     | `＠`, `：`, ein Leerzeichen davor oder `fertig:` sind keine Zeile                |
| Es wird nichts normalisiert; nur der Name wird mit `vergleichsName` verglichen (Groß/Klein, Unicode-Form)                                                                                                       | ähnlich aussehende Buchstaben treffen nie einen Bot (Hinweis `aehnlicher_name`)  |
| Zaun-Code, eingerückter Code, Zitate, Listen und deren Fortsetzungszeilen zählen nicht                                                                                                                          | keine Zeile                                                                      |
| HTML außerhalb von Code (`<` vor Buchstabe, `/`, `!`, `?`), Bidi-Steuerzeichen, andere Zeilentrenner als `\n` (`\r`, U+0085, U+000B, U+000C, U+2028, U+2029) oder ein unsichtbares Zeichen im Namen einer Zeile | aus der ganzen Antwort keine Wünsche; `grund` gesetzt, `unklar = true`           |
| Nur Antworten mit Lauf `succeeded` und Abschluss-Grund `stop`; nur im Faden und in Pais Direkt-Chat                                                                                                             | sonst keine Wünsche (`nicht_normal_beendet`, `kein_ort`)                         |
| Eine Antwort über der Höchstlänge (`MAX_ANTWORT_ZEICHEN`) wird nie teilweise gelesen                                                                                                                            | `antwort_zu_lang`                                                                |
| Zettel = Rest der Zeile bis zur nächsten festen Zeile, Leerzeile oder zum nächsten Block (Zaun, Zitat, Liste); Steuer- und Formatzeichen werden entfernt                                                        | `zettel`, `zettelLaenge`, `fertigWenn`                                           |
| Zettel länger als `MAX_ZETTEL_ZEICHEN` (2 000 Zeichen)                                                                                                                                                          | nicht gekürzt, kein Wunsch; die Zeile steht in `verworfen` mit der echten Länge  |
| `@Name:` und `Fertig:` oder andere Arten zusammen                                                                                                                                                               | `widerspruch`, keine Wünsche                                                     |
| dieselbe Art zweimal (`Fertig:`, `Frage an dich:`, `Zurück an`)                                                                                                                                                 | `mehrfach`                                                                       |
| zwei `@`-Zeilen eines Mitglieds, oder der Leitung ohne `faecher`                                                                                                                                                | `zwei_zeilen_mitglied`, `zwei_zeilen_leitung` (nicht „erste gewinnt“)            |
| `Möglichkeiten:` höchstens 3, je höchstens 120 Zeichen, ohne Link, keine leere; nur direkt unter der Frage                                                                                                      | sonst `moeglichkeiten = []` mit `moeglichkeitenGrund`; ohne Frage in `verworfen` |

Jeder Wunsch mit Ziel trägt einen Fakt `weg` mit festem Code (`WegCode`): erlaubt sind `pai_an_leitung`, `leitung_an_mitglied`, `leitung_gibt_zurueck`, `mitglied_bittet_kollegen`; jeder andere Weg hat einen eigenen Code mit Vorsatz `verboten_` (zum Beispiel `verboten_zulieferer`, `verboten_bitte_an_leitung`, `verboten_rueckgabe_von_nicht_leitung`). Dazu stehen im Fakt Rolle von Geber und Ziel, Art, Auftragsart, Art der Unterhaltung und „gleiches Team“. `Zurück an` wird nie als Bitte gelesen.

### Staffelstab (`ermittleNaechstenSchritt`)

Je Auftragsbaum arbeitet genau einer (`packages/agents/src/raum/regeln.ts#ermittleNaechstenSchritt`): Not-Aus und abgebrochene Wurzel stoppen alles, ein laufender Lauf lässt warten, ein fehlgeschlagener oder abgebrochener Lauf stoppt die Kette. Nach einem Mitglied geht der Stab an den Geber zurück (bei einer Bitte an den Bittenden; vorher kommt das nächste Mitglied eines Fächers). Endet die Leitung ohne gültige Zeile, geht der Stab an die Person, nicht wieder an die Leitung. `bewerteBesitzerNachricht` liefert, ob eine Nachricht der Person eine neue Wurzel beginnt (außer sie beantwortet eine offene Frage); `ermittleSammelAusloeser` sagt, wann ein Fächer gesammelt wird (alle im Endzustand oder Frist abgelaufen, nie nach Not-Aus oder nach dem Stoppen des Eltern-Fadens).

## Datenmodell und Migrationen

Keine eigenen Tabellen. Die Funktionen bekommen ihre Eingaben als Werte; die Liste der Aufträge für `packages/agents/src/raum/zaehlen.ts` ist ein Typ (`AuftragsEintrag`), keine Tabelle. Keine Migration.

## Schnittstellen

| Art      | Name                        | Datei                                 |
| -------- | --------------------------- | ------------------------------------- |
| Funktion | `erkenneZeilen`             | `packages/agents/src/raum/zeilen.ts`  |
| Funktion | `bestimmeAntworter`         | `packages/agents/src/raum/regeln.ts`  |
| Funktion | `ermittleNaechstenSchritt`  | `packages/agents/src/raum/regeln.ts`  |
| Funktion | `bewerteBesitzerNachricht`  | `packages/agents/src/raum/regeln.ts`  |
| Funktion | `ermittleSammelAusloeser`   | `packages/agents/src/raum/regeln.ts`  |
| Funktion | `zaehleAuftraegeJeMitglied` | `packages/agents/src/raum/zaehlen.ts` |
| Funktion | `zaehleBitten`              | `packages/agents/src/raum/zaehlen.ts` |
| Funktion | `zaehleBreite`              | `packages/agents/src/raum/zaehlen.ts` |

Keine Aktion, keine Route, kein Ereignis.

## Sicherheit

- Maßstab ist, was die Person in der Anzeige sieht: Die Anzeige blendet HTML aus (`packages/ui/src/chat/Markdown.tsx`), darum macht HTML in einer Antwort die ganze Antwort wirkungslos (`packages/agents/src/raum/zeilen.ts#enthaeltHtml`).
- Zeilen werden nur auf dem gespeicherten End-Text einer normal beendeten Antwort erkannt; der Aufrufer muss Lauf-Status und Abschluss-Grund mitgeben (`abschluss`). Fehlt die Angabe, gibt es keine Wünsche.
- Namen werden nie geraten: gleiche Namen sind mehrdeutig, ähnlich aussehende Zeichen treffen niemanden (`packages/agents/src/raum/zeilen.ts#suche`, `packages/agents/src/raum/namen.ts#aehnlichkeitsForm`).
- Gezählt wird aus der Liste der Aufträge, nie aus einem Zähler am Knoten; eine neue `@Name:`-Übergabe der Leitung zählt wie eine Rückgabe (`packages/agents/src/raum/zaehlen.ts#zaehleAuftraegeJeMitglied`). Bitten und vom Server angelegte Aufträge (`rueckkehr`, `sammeln`, `rueckmeldung`) zählen nicht mit.
- Beiträge anderer Bots gehen als gekennzeichnete, zitierte Beiträge mit Namen ans Modell, mit Lauf-Kennung und Kennzeichen „enthält fremden Text“ (`packages/agents/src/raum/verlauf.ts#baueRaumVerlauf`).
- Der Besitzer-Akteur kommt in diesen Dateien nicht vor; sie rufen das Tor nicht auf.

## Tests

| Test                                                                                 | Prüft                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/agents/src/raum/zeilen.test.ts`                                            | feste Zeilen: Spalte 0, Code, Zitat, Liste, HTML, Bidi, Zeilentrenner, `＠`/`：`, Namen, Zettel-Länge, Widersprüche, Möglichkeiten, Wege |
| `packages/agents/src/raum/regeln.test.ts`                                            | Antworter mit Leitung, Staffelstab, Nachricht der Person, Sammeln                                                                        |
| `packages/agents/src/raum/zaehlen.test.ts`                                           | Zähl-Fakten je Mitglied, Bitten, Breite                                                                                                  |
| `packages/agents/src/raum/erwaehnungen.test.ts`                                      | Erwähnungen in Nachrichten der Person                                                                                                    |
| `packages/agents/src/raum/verlauf.test.ts`                                           | Verlauf mit fremden Beiträgen                                                                                                            |
| `packages/agents/src/raum/grenzen.test.ts`, `packages/agents/src/raum/kreis.test.ts` | Fakten zu Grenzen und Kreis                                                                                                              |

Ausführen:

```bash
pnpm --filter @paibot/agents exec vitest run src/raum
```

## Bekannte Schwächen

- Die Funktionen sind noch nirgends angeschlossen; Abschluss-Grund und Lauf-Status müssen vom Lauf-Code gespeichert und übergeben werden (`messages` hat keine Spalte für den Abschluss-Grund, `packages/db/src/schema/unterhaltungen.ts`).
- HTML wird mit einfachen Mustern gefunden, nicht mit dem Markdown-Parser der Anzeige: Jedes `<` vor einem Buchstaben, `/`, `!` oder `?` außerhalb von Code zählt, auch in Fließtext wie `a<b`; ein mit Backslash entwertetes `\<b>` zählt ebenfalls. Das ist streng und sicher, kann aber eine harmlose Antwort verwerfen.
- Antworten mit `\r\n` ergeben keine Wünsche, auch wenn ein Anbieter sie so liefert.
- Beim Bereinigen des Zettels fallen auch Zeichen wie der Zero-Width-Joiner weg; zusammengesetzte Emoji im Zettel werden dadurch getrennt.
- Die Zählung kennt nur die Statuswerte, die in `packages/agents/src/raum/zaehlen.ts` als Endzustand stehen; ein anderer Wert gilt als offen.
- Das Schlüsselwort ist case-sensitiv und ohne Normalisierung: `Zurück` mit zerlegtem „ü“ (U+0075 U+0308) ist keine Zeile.
