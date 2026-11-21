<!--
PaiBot – Doku: den Bot einstellen (Name, Anweisung, Aussehen) und sehen, was er darf.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Bot

**Ergebnis:** Dein Bot hat den Namen, das Aussehen und die Anweisung, die du willst. Die Anweisung bekommt das Modell vor jeder Antwort mit, und du siehst jederzeit, was der Bot nach den geltenden Regeln darf.

## Wofür

Du willst, dass dein Bot in deinem Ton antwortet und weiß, wofür du ihn brauchst, zum Beispiel „Duze mich und schreib locker“. Oder du willst ihm einen anderen Namen und eine andere Farbe geben.

## So benutzt du es

1. Klick in der Seitenleiste unter „Dein Bot“ auf den Namen deines Bots (am Handy zuerst auf das Menü oben links). Es öffnet sich die Seite „Bot“ (Adresse `/bot`); in der Seitenleiste ist dein Bot dann hervorgehoben.
2. Ändere unter „Name“ den Namen deines Bots (höchstens 60 Zeichen).
3. Schreib unter „Anweisung“, wie dein Bot antworten soll und worauf er achten soll. Unter dem Feld zählt PaiBot mit, wie viele der 8000 Zeichen du schon nutzt.
4. Ein Klick auf eine der „Beispiel-Anweisungen“ hängt den Satz an deine Anweisung an. Gespeichert ist noch nichts.
5. Wähle unter „Aussehen“ eine Farbe. Jede Farbe gehört fest zu einer Form; die Vorschau oben zeigt das Ergebnis.
6. Sobald etwas geändert ist, steht oben „Ungespeicherte Änderungen“. Klicke „Speichern“ oder „Änderungen verwerfen“.
7. Nach dem Speichern steht „Gespeichert. … nutzt die neuen Angaben ab der nächsten Antwort.“ Der neue Name erscheint auch in der Navigation.
8. Unter „Modell“ steht, mit welchem Modell dein Bot arbeitet. „Modell ändern“ führt zur Seite „Modell und Anbieter“.
9. Unter „Was dein Bot darf“ siehst du, was er nach den geltenden Regeln darf, wofür er fragen muss und was er nie darf. „Regeln und Belege ansehen“ führt zu den Belegen.

Beispiel für eine Anweisung:

```text
Duze mich und schreib locker.
Fasse lange Texte in drei Sätzen zusammen.
```

## So sieht es aus

Folgt mit der Oberfläche. Die Aufnahmen entstehen per Skript aus der laufenden App mit Beispiel-Daten.

<!--
Gewünschte Aufnahmen (dunkel, Beispiel-Daten, Bot „Pai“):
1. bot-start · /bot · Rechner 1440 · nach der Einrichtung, Modell gewählt
2. bot-geaendert · /bot · Rechner · Name „Kai“, Beispiel „Duze mich und schreib locker.“ anklicken, Farbe Violett (Raute) wählen → „Ungespeicherte Änderungen“
3. bot-gespeichert · /bot · Rechner · „Speichern“ → Meldung, Navigation zeigt „Kai“
4. bot-darf · /bot · Rechner · nach unten gescrollt: „Was dein Bot darf“
5. bot-handy · /bot · Handy 390 · Startzustand
-->

## Einstellungen

| Einstellung | Wo                          | Bedeutung                                                | Standard                             |
| ----------- | --------------------------- | -------------------------------------------------------- | ------------------------------------ |
| Name        | Seite Bot                   | Name im Chat, in der Navigation und in der Systemvorgabe | aus der Einrichtung, Vorschlag „Pai“ |
| Anweisung   | Seite Bot                   | Text, den das Modell vor jeder Antwort bekommt           | leer                                 |
| Aussehen    | Seite Bot                   | Farbe und die fest dazugehörende Form des Avatars        | Limette (Blatt)                      |
| Modell      | Seite „Modell und Anbieter“ | Modell, mit dem der Bot antwortet                        | aus der Einrichtung                  |

## So funktioniert es

- „Speichern“ schickt die Angaben an `PUT /api/bot`. Die Aktion `bot.aendern` läuft durch das Tor und bekommt zwei Belege (Entscheidung und Ergebnis). Im Beleg stehen nur die Namen der geänderten Felder, nie die Anweisung selbst.
- Ohne Änderung speichert PaiBot nichts und meldet „Es gibt nichts zu speichern.“
- Ein Lauf liest Name und Anweisung beim Start aus der Datenbank; deshalb gilt eine Änderung ab der nächsten Antwort.
- „Was dein Bot darf“ entsteht aus den aktiven Regeln, die für den Bot gelten (erlauben, fragen, ablehnen), plus der festen Grenze G-01 (keine unmaskierten Nachrichten, wenn die Datenschleuse gefordert ist). Es ist eine Anzeige, keine Einstellung.

## Grenzen

- Es gibt einen Bot. Weitere Bots anlegen ist nicht Teil dieser Version.
- In dieser Version hat der Bot keine Werkzeuge: Er schreibt Antworten und führt selbst nichts aus.
- Eine kurze Rolle oder Beschreibung des Bots lässt sich noch nicht speichern; die Navigation zeigt „dein persönlicher Assistent“.
- Die Ausgabegrenze je Antwort bleibt auf dem Wert aus der Einrichtung; die Seite zeigt sie nicht.

## Fehlerbehebung

| Beobachtung                          | Ursache                                  | Was tun                                |
| ------------------------------------ | ---------------------------------------- | -------------------------------------- |
| „Speichern“ lässt sich nicht klicken | Nichts geändert oder Anweisung zu lang   | Etwas ändern bzw. die Anweisung kürzen |
| „Gib deinem Bot einen Namen.“        | Das Feld „Name“ ist leer                 | Einen Namen eintragen                  |
| Antwort klingt noch wie vorher       | Die Antwort lief schon vor dem Speichern | Eine neue Nachricht schicken           |
