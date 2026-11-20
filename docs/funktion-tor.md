<!--
PaiBot – Doku: das Tor, seine Stufen, Standard-Regeln und festen Grenzen.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-20
-->

# Das Tor

**Ergebnis:** Jede Aktion in PaiBot läuft durch eine feste Regelprüfung ohne KI. Dein Bot fragt nicht um Erlaubnis, er belegt, dass er darf: Für jede Aktion entstehen zwei Belege im Protokoll, einer für die Entscheidung und einer für das Ergebnis.

## Wofür

Das Tor sorgt dafür, dass nichts an dir vorbei passiert. Bevor PaiBot etwas tut (eine Nachricht annehmen, ein Modell anfragen, eine Einstellung ändern), prüft das Tor nach festen Regeln, ob das erlaubt ist. Die Prüfung ist immer gleich: gleiche Lage, gleiche Entscheidung. Deshalb lässt sich jede Entscheidung später aus dem Beleg nachrechnen.

## So benutzt du es

Du musst nichts einschalten. Das Tor arbeitet bei jeder Aktion mit:

1. Du oder dein Bot löst eine Aktion aus, zum Beispiel „Nachricht senden“ oder „Modell anfragen“.
2. Das Tor prüft die Regeln und die festen Grenzen und schreibt die Entscheidung als Beleg ins Protokoll.
3. Ist die Aktion erlaubt, wird sie ausgeführt. Danach schreibt das Tor einen zweiten Beleg mit dem Ergebnis.
4. Ist sie nicht erlaubt, passiert nichts. Du bekommst eine verständliche Meldung, und auch das steht als Beleg im Protokoll.

Beispiel einer Entscheidung, wie sie im Beleg steht:

```text
Aktion:    modell.anfragen (dein Bot)
Ergebnis:  erlaubt, Stufe „ausführen“
Regel:     R-002 „Bot darf antworten“
Grenzen:   G-01 ok · G-02 ok · G-03 ok · G-04 ok · G-05 ok
```

## So sieht es aus

Folgt mit der Oberfläche. Die Regeln und Belege erscheinen dann auf der Seite „Belege“.

## Die drei Stufen

Jede Regel nennt eine Stufe. Sie sagt, wie weit eine Aktion gehen darf:

| Stufe       | Bedeutung                                                | In der Basisversion                                    |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------ |
| fragen      | PaiBot fragt dich, bevor etwas passiert                  | gibt es noch keine Freigabe; die Aktion wird abgelehnt |
| vorbereiten | PaiBot bereitet die Aktion vor, führt sie aber nicht aus | wird ebenfalls abgelehnt                               |
| ausführen   | PaiBot führt die Aktion aus und belegt sie               | so laufen alle erlaubten Aktionen                      |

Mögliche Ergebnisse des Tors sind deshalb: **erlaubt**, **abgelehnt**, **fragen** und **vorbereiten**. In der Basisversion endet „fragen“ und „vorbereiten“ mit der Meldung „Dafür gibt es noch keine Regel.“ und nichts wird ausgeführt.

## Einstellungen

Am Tor selbst gibt es nichts einzustellen: Die Regeln sind in der Basisversion **nur lesbar**. Diese Regeln gelten:

| Regel | Name                                  | Was sie bedeutet                                                                                                                                                                      |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-001 | Besitzer verwaltet seine Installation | Du darfst alles an deiner Installation verwalten, wenn du dich ausgewiesen hast: mit deiner Sitzung, beim Anmelden mit deinem Passwort, bei der Einrichtung mit dem Einrichtungs-Code |
| R-002 | Bot darf antworten                    | Der Bot einer Unterhaltung darf für diese Unterhaltung ein Modell anfragen, wenn alle Grenzen eingehalten sind                                                                        |
| R-999 | Ohne passende Regel                   | Passt keine andere Regel, fragt das Tor. In der Basisversion heißt das: abgelehnt mit „Dafür gibt es noch keine Regel.“                                                               |

Zusätzlich gibt es feste Grenzen. Sie gelten immer, auch wenn eine Regel etwas erlaubt. Ist eine Grenze verletzt, wird die Aktion abgelehnt, und die Meldung nennt die Grenze.

| Grenze | Name                              | Was sie prüft                                                                                                                                              | Betrifft                          |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| G-01   | Datenschleuse gefordert           | Ist die Datenschleuse für die Unterhaltung an, muss die Anfrage über sie laufen und sie muss erreichbar sein. Es gibt keinen Rückfall auf den direkten Weg | Modell anfragen                   |
| G-02   | Anbieter aktiv und Region erlaubt | Der Anbieter ist eingeschaltet und steht in der EU oder läuft bei dir (lokal). Anbieter außerhalb der EU lehnt die Basisversion ab                         | Modell anfragen                   |
| G-03   | Länge                             | Die Eingabe ist höchstens so lang wie erlaubt; eine Anfrage verlangt höchstens so viel Ausgabe, wie für deinen Bot eingestellt ist                         | Nachricht senden, Modell anfragen |
| G-04   | Tagesbudget                       | Hast du ein Tagesbudget gesetzt, muss der Verbrauch des Tages darunter liegen. Ohne Budget entfällt die Grenze                                             | Modell anfragen                   |
| G-05   | Not-Aus                           | Ist der Not-Aus an, wird jede betroffene Aktion abgelehnt                                                                                                  | Nachricht senden, Modell anfragen |

## So funktioniert es

- Das Tor liegt im Paket `packages/gate`. Es ist der einzige Weg, eine Aktion auszuführen (`gate.run`).
- Die Entscheidung trifft die Funktion `evaluate`. Sie ist rein: Sie liest keine Uhr, keine Datenbank, kein Netz und nutzt keine KI. Sie bekommt nur die Aktion, die Fakten (Werte wie Zeichenzahl, Region, Schalter, nie Inhalte von Nachrichten oder Schlüssel) und die Regeln.
- Rangfolge: Von allen Regeln, die passen, entscheidet die mit der kleinsten Priorität. Danach werden immer alle fünf Grenzen geprüft und im Beleg festgehalten. Eine verletzte Grenze führt immer zur Ablehnung.
- Ablauf von `gate.run`:
  1. Aktion und Fakten werden geprüft. Passen sie nicht zusammen (zum Beispiel eine unbekannte Aktion), wird abgelehnt und nichts ausgeführt.
  2. Regeln laden und entscheiden.
  3. Beleg „Entscheidung“ schreiben. Gelingt das nicht, wird **nichts** ausgeführt.
  4. Nur bei „erlaubt“ wird die Aktion ausgeführt, mit einer Berechtigung, die nur das Tor ausstellen kann und die nur während der Ausführung gilt.
  5. Beleg „Ergebnis“ schreiben: ok, Fehler, abgebrochen oder abgelehnt.
- Beide Belege einer Aktion hängen über dieselbe Aktions-Kennung zusammen. Wie Belege verkettet und geprüft werden, steht auf der Seite [Belege](funktion-belege.md).

## Grenzen

- Die Regeln sind in der Basisversion nur lesbar. Eigene Regeln und Regel-Vorschläge deines Bots sind geplant. Der Bot entscheidet nie für dich, er wird Regeln nur vorschlagen.
- „Fragen“ mit Freigabe-Karte ist geplant. Heute wird eine Aktion ohne passende Regel abgelehnt.
- „Vorbereiten“ ist geplant. Heute wird eine solche Aktion ebenfalls abgelehnt.
- Der Not-Aus lässt sich in der Basisversion noch nicht in der Oberfläche schalten (geplant).
- Das Tor prüft nur die Fakten, die es bekommt. Es liest keine Inhalte und bewertet nicht, ob eine Antwort gut ist.

## Fehlerbehebung

| Beobachtung                                  | Ursache                                                  | Was tun                                                                       |
| -------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| „Dafür gibt es noch keine Regel.“            | Für diese Aktion passt keine Regel (R-999)               | In der Basisversion gibt es dafür keinen Weg; die Aktion ist nicht vorgesehen |
| „Das Tor hat die Aktion abgelehnt.“ mit G-01 | Datenschleuse ist an, aber nicht erreichbar              | Prüf, ob die Datenschleuse läuft, oder schalte sie für diese Unterhaltung aus |
| Abgelehnt mit G-02                           | Anbieter ist ausgeschaltet oder steht außerhalb der EU   | Anbieter einschalten oder einen Anbieter in der EU bzw. lokal wählen          |
| Abgelehnt mit G-03                           | Nachricht zu lang oder Ausgabegrenze der Anfrage zu hoch | Nachricht kürzen; die Ausgabegrenze legst du beim Bot fest                    |
| Abgelehnt mit G-04                           | Tagesbudget ist aufgebraucht                             | Bis morgen warten oder das Budget in den Einstellungen erhöhen                |
| Abgelehnt mit G-05                           | Not-Aus ist an                                           | Not-Aus ausschalten                                                           |
