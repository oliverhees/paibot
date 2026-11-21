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
2. Das Tor prüft erst den Zustand (Vorbedingungen), dann die festen Grenzen und dann die Regeln und schreibt die Entscheidung als Beleg ins Protokoll.
3. Ist die Aktion erlaubt, wird sie ausgeführt. Danach schreibt das Tor einen zweiten Beleg mit dem Ergebnis.
4. Ist sie nicht erlaubt, passiert nichts. Du bekommst eine verständliche Meldung, und auch das steht als Beleg im Protokoll.

So siehst du die Regeln und Entscheidungen in PaiBot an:

1. Klick in der Navigation auf **Belege** und rechts auf **Regeln ansehen**. Die Seite **Regeln** zeigt jede geltende Regel mit Kennung (zum Beispiel `R-001`), Fassung, einem Satz in Worten („Besitzer verwaltet seine Installation: erlaubt, mit Beleg.“), für welche Aktionen sie gilt, unter welchen Bedingungen und mit welcher Stufe (fragen, vorbereiten, ausführen mit Beleg; „lehnt ab“ bei Regeln, die ablehnen). Darüber steht der aktuelle Regelstand.
2. Darunter stehen die festen **Grenzen** G-01 bis G-05 und die **Vorbedingungen** in Worten. Diese Regeln sind fest eingebaut.
3. Zurück auf der Seite **Belege** klickst du auf einen Beleg der Art „Entscheidung“. Die Karte nennt das Ergebnis mit Stufe, die angewandte Regel mit Fassung und Prüfsumme, den Regelstand und jede Vorbedingung und Grenze mit „erfüllt“, „eingehalten“, „verletzt“ oder „trifft hier nicht zu“.
4. **Beleg prüfen** rechnet die Entscheidung in deinem Browser mit dem damaligen Regelstand nach, ohne KI. Stimmt sie, steht dort „Entscheidung folgt aus Regel R-001“.

Beispiel einer Entscheidung, wie sie im Beleg steht:

```text
Aktion:        nachricht.senden (du)
Ergebnis:      erlaubt, Stufe „ausführen“
Vorbedingungen: V-01 ok · V-02 ok
Grenzen:       G-01 entfällt · G-02 entfällt · G-03 ok · G-04 entfällt · G-05 ok
Regel:         R-001 Fassung 1, Prüfsumme sha256:d6237b3d…
Regelstand:    7
```

## So sieht es aus

Folgt mit der Oberfläche. Die Bilder entstehen per Skript, sobald die Aufnahmen für diese Seite eingetragen sind.

<!--
Gewünschte Aufnahmen (Beispiel-Daten wie auf der Seite „Belege“; dunkles Design):
1. regeln: /regeln, Rechner 1440×900, Ausgangszustand (Weg Aktion → Tor → Beleg, Liste der Regeln).
2. regeln-grenzen: /regeln, nach unten gescrollt bis Grenzen und Vorbedingungen, Rechner.
3. regeln-handy: /regeln, Handy 390×844.
4. tor-entscheidung: /belege, Klick auf eine Zeile „Nachricht gesendet“ mit Art „Entscheidung“, dann „Beleg prüfen“; Karte mit Regel, Regelstand, Vorbedingungen V-01/V-02, Grenzen und dem Ergebnis „Entscheidung folgt aus Regel R-001“.
-->

## Die drei Stufen

Jede Regel nennt eine Stufe. Sie sagt, wie weit eine Aktion gehen darf:

| Stufe       | Bedeutung                                                | In der Basisversion                                 |
| ----------- | -------------------------------------------------------- | --------------------------------------------------- |
| fragen      | PaiBot fragt dich, bevor etwas passiert                  | gibt es noch keine Freigabe; nichts wird ausgeführt |
| vorbereiten | PaiBot bereitet die Aktion vor, führt sie aber nicht aus | wird ebenfalls abgelehnt                            |
| ausführen   | PaiBot führt die Aktion aus und belegt sie               | so laufen alle erlaubten Aktionen                   |

Mögliche Ergebnisse des Tors sind deshalb: **erlaubt**, **abgelehnt**, **fragen** und **vorbereiten**. In der Basisversion wird bei „fragen“ und „vorbereiten“ nichts ausgeführt. Ohne passende Regel lautet die Meldung „Dafür gibt es noch keine Regel.“; bei einem Werkzeug-Aufruf deines Bots nennt sie die Regel R-005.

## Einstellungen

Am Tor selbst gibt es nichts einzustellen: Die Regeln sind in der Basisversion **nur lesbar**. Diese Regeln gelten (kleinere Priorität zuerst):

| Regel | Name                                  | Priorität | Was sie bedeutet                                                                                                                                                        |
| ----- | ------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-003 | Einrichtung mit Einrichtungs-Code     | 50        | Mit dem Einrichtungs-Code darfst du nur die Einrichtung abschließen                                                                                                     |
| R-004 | Anmelden mit Passwort                 | 50        | Mit dem Passwort darfst du dich nur anmelden                                                                                                                            |
| R-006 | Nachweis passt nicht zur Aktion       | 60        | Für jede andere Aktion lehnt das Tor Passwort und Einrichtungs-Code ausdrücklich ab; dafür gilt nur deine Sitzung                                                       |
| R-001 | Besitzer verwaltet seine Installation | 100       | Mit deiner Sitzung darfst du alles an deiner Installation verwalten                                                                                                     |
| R-002 | Bot darf antworten                    | 100       | Der Bot einer Unterhaltung darf für diese Unterhaltung ein Modell anfragen, wenn alle Grenzen eingehalten sind                                                          |
| R-005 | Bot fragt vor Werkzeugen              | 100       | Bevor der Bot einer Unterhaltung ein Werkzeug benutzt, fragt PaiBot dich. Ausgeführt wird erst nach deiner Freigabe                                                     |
| R-007 | Einmal erlaubt                        | 100       | Ein Werkzeug-Aufruf, den du freigegeben hast, darf genau einmal laufen: nur mit deiner erteilten, unbenutzten und nicht abgelaufenen Freigabe für genau diese Argumente |
| R-008 | Ausführen nur mit Freigabe            | 200       | Ohne gültige Freigabe lehnt das Tor die Ausführung eines wartenden Werkzeug-Aufrufs ab                                                                                  |
| R-999 | Ohne passende Regel                   | 1000000   | Passt keine andere Regel, fragt das Tor. In der Basisversion heißt das: nichts wird ausgeführt, Meldung „Dafür gibt es noch keine Regel.“                               |

Kurz: Der Einrichtungs-Code gilt nur für die Einrichtung, das Passwort nur fürs Anmelden, sonst zählt deine Sitzung.

Vor den Grenzen und Regeln prüft das Tor feste Vorbedingungen. Sie beschreiben den Zustand, in dem eine Aktion überhaupt Sinn ergibt. Ist eine verletzt, wird die Aktion abgelehnt, und die Meldung nennt sie. Fehlt die Angabe, die eine Vorbedingung braucht, gilt sie als verletzt.

| Vorbedingung | Name                         | Was sie prüft                                                              | Betrifft                                            |
| ------------ | ---------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- |
| V-01         | Unterhaltung vorhanden       | Die Unterhaltung gibt es                                                   | Nachricht senden                                    |
| V-02         | Kein Lauf aktiv              | In der Unterhaltung antwortet der Bot gerade nicht                         | Nachricht senden                                    |
| V-03         | Lauf aktiv                   | Es gibt eine laufende Antwort, die sich abbrechen lässt                    | Antwort abbrechen                                   |
| V-04         | Datenschleuse eingerichtet   | Beim Einschalten der Datenschleuse ist ihr Dienst eingerichtet             | Datenschleuse schalten                              |
| V-05         | Lauf läuft                   | Die Antwort, zu der ein Werkzeug-Aufruf gehört, läuft noch                 | Werkzeug aufrufen, Werkzeug nach Freigabe ausführen |
| V-06         | Aktuelles Passwort bestätigt | Beim Ändern des Passworts wurde das aktuelle Passwort geprüft              | Passwort ändern                                     |
| V-07         | Einrichtung offen            | Die Einrichtung ist noch nicht abgeschlossen                               | Einrichtung abschließen                             |
| V-08         | Aufruf wartet auf Freigabe   | Der Werkzeug-Aufruf wartet noch auf deine Antwort und ist nicht abgelaufen | Werkzeug-Aufruf beantworten                         |
| V-09         | Freigabe passt zum Aufruf    | Deine Antwort gilt genau den Argumenten, die gespeichert sind              | Werkzeug-Aufruf beantworten                         |

Zusätzlich gibt es feste Grenzen. Sie gelten immer, auch wenn eine Regel etwas erlaubt. Ist eine Grenze verletzt, wird die Aktion abgelehnt, und die Meldung nennt die Grenze.

| Grenze | Name                              | Was sie prüft                                                                                                                                              | Betrifft                                                                               |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| G-01   | Datenschleuse gefordert           | Ist die Datenschleuse für die Unterhaltung an, muss die Anfrage über sie laufen und sie muss erreichbar sein. Es gibt keinen Rückfall auf den direkten Weg | Modell anfragen                                                                        |
| G-02   | Anbieter aktiv und Region erlaubt | Der Anbieter ist eingeschaltet und steht in der EU oder läuft bei dir (lokal). Anbieter außerhalb der EU lehnt die Basisversion ab                         | Modell anfragen                                                                        |
| G-03   | Länge                             | Die Eingabe ist höchstens so lang wie erlaubt; eine Anfrage verlangt höchstens so viel Ausgabe, wie für deinen Bot eingestellt ist                         | Nachricht senden, Modell anfragen                                                      |
| G-04   | Tagesbudget                       | Hast du ein Tagesbudget gesetzt, muss der Verbrauch des Tages darunter liegen. Ohne Budget entfällt die Grenze                                             | Modell anfragen                                                                        |
| G-05   | Not-Aus                           | Ist der Not-Aus an, wird jede betroffene Aktion abgelehnt                                                                                                  | Nachricht senden, Modell anfragen, Werkzeug aufrufen, Werkzeug nach Freigabe ausführen |

## So funktioniert es

- Das Tor liegt im Paket `packages/gate`. Es ist der einzige Weg, eine Aktion auszuführen (`gate.run`).
- Die Entscheidung trifft die Funktion `evaluate`. Sie ist rein: Sie liest keine Uhr, keine Datenbank, kein Netz und nutzt keine KI. Sie bekommt nur die Aktion, die Fakten (Werte wie Zeichenzahl, Region, Schalter, nie Inhalte von Nachrichten oder Schlüssel) und die Regeln.
- Reihenfolge: 1. Eingabe prüfen, 2. Vorbedingungen, 3. Grenzen, 4. Regeln. Alle Vorbedingungen der Aktion und alle fünf Grenzen stehen im Beleg. Eine verletzte Vorbedingung geht einer verletzten Grenze vor; beide führen immer zur Ablehnung. Von allen Regeln, die passen, entscheidet die mit der kleinsten Priorität; sie bleibt auch bei einer Ablehnung im Beleg sichtbar.
- Regelstand: Für jede angewandte Regel stehen Kennung, Fassung und eine Prüfsumme ihres Inhalts im Beleg, dazu der Stand des Regel-Protokolls. Regeln werden nie geändert, nur als neue Fassung angehängt. Mit dem Stand lässt sich eine Entscheidung später mit genau den Regeln von damals nachrechnen, und eine nachträglich veränderte Regel fällt an der Prüfsumme auf.
- Bevor das Tor entscheidet, prüft es den Regelstand: Jede Prüfsumme muss zum Inhalt passen, und jede eingebaute Regel (Quelle „standard“, Kennung `R-…`) muss genau der Fassung gleichen, die in PaiBot selbst steht. Fehlt eine eingebaute Regel (auch, weil eine abgeschaltete höhere Fassung sie verdeckt), taucht eine unbekannte Kennung `R-…` auf, trägt eine Kennung `R-…` eine andere Quelle, ist ein Regel-Vorschlag eingeschaltet oder liegt eine Regel außerhalb des Prioritäten-Bands ihrer Quelle, entscheidet das Tor nicht, schreibt keinen Beleg und führt nichts aus (Fehler `intern`). Das gilt auch für eine leere Regel-Tabelle: Dann wird nie „alles gefragt“ und nie „alles erlaubt“, sondern abgebrochen. Regel-Vorschläge zählen nie mit.
- Das Tor nimmt Regeln nur als Regelstand an (mit Stand und Prüfsummen). Jede Entscheidung trägt deshalb ihren Regelstand und je Regel die Prüfsumme.
- Feste Prioritäten-Bänder: Eingebaute Regeln liegen bei 0 bis 999 (die Auffang-Regel R-999 bei 1 000 000), eigene Regeln und Vorschläge künftig nur bei 1 000 bis 999 999. Eine eigene Regel kommt damit immer nach allen eingebauten außer der Auffang-Regel und kann keine davon überdecken. Die Datenbank prüft dasselbe.
- Dieselbe Aktion (gleiche Aktions-Kennung) läuft nie zweimal gleichzeitig durchs Tor; die Datenbank nimmt je Aktion höchstens eine Entscheidung und ein Ergebnis an.
- Ablauf von `gate.run`:
  1. Aktion und Fakten werden geprüft. Passen sie nicht zusammen (zum Beispiel eine unbekannte Aktion), wird abgelehnt und nichts ausgeführt.
  2. Regelstand laden, prüfen und entscheiden.
  3. Beleg „Entscheidung“ schreiben. Gelingt das nicht, wird **nichts** ausgeführt.
  4. Nur bei „erlaubt“ wird die Aktion ausgeführt, mit einer Berechtigung, die nur das Tor ausstellen kann und die nur während der Ausführung gilt. Sie ist unveränderlich; bei „Modell anfragen“ trägt sie auch das Ziel der Anfrage (Origin und Abdruck von Anbieter und Adresse), damit die Anbieter-Schicht genau dorthin sendet.
  5. Beleg „Ergebnis“ schreiben: ok, Fehler, abgebrochen oder abgelehnt.
- Lehnt das Tor ab, meldet `gate.run` das mit dem Fehler `GateDenied`. Er nennt das Ergebnis (`deny`, `ask` oder `prepare`), die ganze Entscheidung, beide Belege und die Aktions-Kennung. Bei einer verletzten Vorbedingung trägt er deren Fehlercode (zum Beispiel `lauf_aktiv`), sonst `abgelehnt` bzw. `regel_fehlt`. Bei „fragen“ (`ask`) wartet die Aktion auf deine Freigabe; der Fehler liefert dafür die Angaben, mit denen ein wartender Werkzeug-Aufruf gespeichert wird.
- Werkzeug-Aufrufe deines Bots laufen als eigene Aktion `werkzeug.aufrufen` durch das Tor. Im Beleg stehen Name, Quelle und Art des Werkzeugs (bei einem Werkzeug von einem MCP-Server auch dessen Name, sonst nie) und nur ein Abdruck der Argumente, nie die Argumente selbst.
- Freigabe in zwei Schritten, jeder mit eigenen Belegen: Deine Antwort auf einen wartenden Aufruf ist die Aktion `werkzeug.freigeben` (erteilen oder ablehnen, nur mit Sitzung, V-08 und V-09). Die Ausführung danach ist eine neue Entscheidung `werkzeug.ausfuehren`, die auf den Aufruf und deine Freigabe verweist; R-007 erlaubt sie genau einmal, danach ist die Freigabe verbraucht. So bekommt jede Aktion genau ihre zwei Belege.
- Für Tests gibt es den Zugang `@paibot/gate/testing` (`withTestPermit`). Er stellt eine Berechtigung auf demselben Weg aus wie das Tor, aber ohne Regeln und ohne Beleg. Eine Lint-Regel lässt ihn nur in Tests zu.
- Beide Belege einer Aktion hängen über dieselbe Aktions-Kennung zusammen. Wie Belege verkettet und geprüft werden, steht auf der Seite [Belege](funktion-belege.md).

## Grenzen

- Die Regeln sind in der Basisversion nur lesbar: Die App darf in der Datenbank keine Regeln schreiben, die eingebauten kommen allein aus den Migrationen, und eigene Regeln oder Vorschläge können dort nicht eingeschaltet sein. Eigene Regeln und Regel-Vorschläge deines Bots sind geplant; eine eigene Regel anzulegen wird dann selbst eine Aktion durch das Tor mit Beleg. Der Bot entscheidet nie für dich, er wird Regeln nur vorschlagen.
- „Fragen“ mit Freigabe-Karte ist geplant. Heute wird eine Aktion, die fragt, nicht ausgeführt; ein Werkzeug-Aufruf wartet, bis die Freigabe gebaut ist. Das Tor kann über Freigabe und Ausführung schon entscheiden; speichern lassen sich deren Belege und die Regeln R-007 und R-008 aber erst mit einer kommenden Version der Datenbank, und die Oberfläche dafür fehlt noch.
- „Vorbereiten“ ist geplant. Heute wird eine solche Aktion ebenfalls abgelehnt.
- Der Not-Aus lässt sich in der Basisversion noch nicht in der Oberfläche schalten (geplant).
- Das Tor prüft nur die Fakten, die es bekommt. Es liest keine Inhalte und bewertet nicht, ob eine Antwort gut ist. Ob ein Nachweis (Sitzung, Passwort, Code) echt ist, prüft der Zugang vorher; das Tor prüft nur, ob er zur Aktion passt.

## Fehlerbehebung

| Beobachtung                                  | Ursache                                                      | Was tun                                                                       |
| -------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| „Dafür gibt es noch keine Regel.“            | Für diese Aktion passt keine Regel (R-999)                   | In der Basisversion gibt es dafür keinen Weg; die Aktion ist nicht vorgesehen |
| „Das Tor hat die Aktion abgelehnt.“ mit G-01 | Datenschleuse ist an, aber nicht erreichbar                  | Prüf, ob die Datenschleuse läuft, oder schalte sie für diese Unterhaltung aus |
| Abgelehnt mit G-02                           | Anbieter ist ausgeschaltet oder steht außerhalb der EU       | Anbieter einschalten oder einen Anbieter in der EU bzw. lokal wählen          |
| Abgelehnt mit G-03                           | Nachricht zu lang oder Ausgabegrenze der Anfrage zu hoch     | Nachricht kürzen; die Ausgabegrenze legst du beim Bot fest                    |
| Abgelehnt mit G-04                           | Tagesbudget ist aufgebraucht                                 | Bis morgen warten oder das Budget in den Einstellungen erhöhen                |
| Abgelehnt mit G-05                           | Not-Aus ist an                                               | Not-Aus ausschalten                                                           |
| Abgelehnt mit V-01                           | Die Unterhaltung gibt es nicht (mehr)                        | Seite neu laden und eine vorhandene Unterhaltung öffnen                       |
| Abgelehnt mit V-02                           | Dein Bot antwortet noch                                      | Antwort abwarten oder abbrechen, dann erneut senden                           |
| Abgelehnt mit V-03                           | Es läuft keine Antwort, die sich abbrechen lässt             | Nichts zu tun; die Antwort ist schon fertig                                   |
| Abgelehnt mit V-04                           | Der Dienst der Datenschleuse ist nicht eingerichtet          | Datenschleuse einrichten, dann einschalten                                    |
| Abgelehnt mit V-06                           | Das aktuelle Passwort stimmt nicht                           | Aktuelles Passwort richtig eingeben                                           |
| Abgelehnt mit V-07                           | Die Einrichtung ist schon abgeschlossen                      | Anmelden statt neu einrichten                                                 |
| Abgelehnt mit R-006                          | Passwort oder Code für eine Aktion, die eine Sitzung braucht | Anmelden; danach gilt deine Sitzung                                           |
| Fehler `intern` bei jeder Aktion             | Eine eingebaute Regel in der Datenbank weicht ab             | Datenbank aus einer Sicherung wiederherstellen; nichts wurde ausgeführt       |
