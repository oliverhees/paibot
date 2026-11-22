<!--
PaiBot – Doku: Apps verbinden, ihre Werkzeuge prüfen und einstufen, Zugriff je Bot setzen.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-22
-->

# Apps

**Ergebnis:** Du verbindest eine App (einen MCP-Server mit öffentlicher https-Adresse), siehst, was jedes ihrer Werkzeuge dem Modell sagt, stufst es selbst ein und gibst deinem Bot höchstens Lese-Zugriff. Was du freigibst, entscheidest allein du.

## Wofür

Du willst, dass dein Bot im Chat etwas nachschlagen kann, das in einer anderen Anwendung liegt, zum Beispiel in deinen Notizen. Dafür verbindest du die App, prüfst ihre Werkzeuge und erlaubst dem Bot genau die, die nur lesen.

## So benutzt du es

1. Öffne in der Seitenleiste unter „Werkzeuge“ die Seite **Apps** (Adresse `/apps`). Solange keine App verbunden ist, steht dort der Weg zum Verbinden.

   ![Seite „Apps“ ohne verbundene App: „Noch keine App verbunden“ und der Knopf „Verbindung einfügen“](assets/screenshots/apps-leer.png)
2. Klick auf **Verbindung einfügen** (später **App verbinden**) und trag die **Adresse des Servers** ein. Erlaubt sind nur öffentliche https-Adressen auf dem Port 443, ohne Benutzer-Teil, ohne Abfrage-Teil (`?…`) und ohne Anker (`#…`). Unter dem Feld steht, mit welcher Adresse sich PaiBot verbindet; Namen mit Umlauten erscheinen dort in der Form mit `xn--`.

   ![Formular „Verbindung einfügen“: Unter der Adresse steht „PaiBot verbindet sich mit:“ und die Adresse mit dem Namen in der Form xn--bcher-kva](assets/screenshots/apps-verbinden-adresse.png)
3. Verlangt die App einen persönlichen Token, trag ihn im Feld **Token** ein. Er wird verschlüsselt gespeichert, danach nie wieder angezeigt und steht in keiner Meldung. Schreib ihn nicht in die Adresse.
4. Fügst du statt einer Adresse einen Befehl ein (zum Beispiel `npx …`), sagt PaiBot „Lokale Befehle startet PaiBot nicht“ und startet nichts. Starte den Server selbst und trag seine Adresse ein.

   ![Formular „Verbindung einfügen“ nach dem Einfügen eines Befehls: „Lokale Befehle startet PaiBot nicht“ mit dem Ausweg](assets/screenshots/apps-verbinden-befehl.png)
5. Klick auf **Verbinden**. PaiBot prüft die Adresse, holt die Liste der Werkzeuge der App (nur die Liste, es wird nichts aufgerufen) und speichert sie. Danach steht oben, wie viele Werkzeuge gefunden wurden. Werkzeuge, die PaiBot nicht prüfen kann, nennt die Meldung mit Namen; sie werden nicht angezeigt und keinem Bot angeboten.

   ![Seite „Apps“ mit zwei verbundenen Apps, Kennzahlen zu den Werkzeugen und „0 Bots mit Zugriff“](assets/screenshots/apps-liste.png)
6. Klick bei einer App auf **Werkzeuge ansehen**. Du siehst jedes Werkzeug mit dem Text, der ans Modell gehen würde, und darunter den **Zugriff der Bots**. Ein neues Werkzeug gilt als „schreibt“, bis du es einstufst. Die Angabe „laut App: nur lesend“ ist nur eine Auskunft der App und ändert nichts.

   ![Eine aufgeklappte App: Werkzeuge mit Beschreibung und „laut App“-Hinweis, darunter der Zugriff der Bots](assets/screenshots/apps-werkzeuge.png)
7. Klick bei einem Werkzeug auf **Einstufen**. Dort steht der volle Text, den das Modell sähe (Beschreibung, Feldnamen, Beschreibungen der Felder und – unter „(Werkzeug)“ – die Beschreibung des ganzen Eingabe-Schemas, Auswahlwerte, Vorgaben, Beispiele). Wähle **Liest nur**, **Schreibt** oder **Gesperrt** und klick auf **Bestätigen**. Mit „Liest nur“ sagst du, dass das Werkzeug nichts verändert; das entscheidest du, nicht die App.

   ![Ein Werkzeug wird eingestuft: voller Text, gewählt „Liest nur“, Hinweis vor dem Bestätigen](assets/screenshots/apps-einstufen.png)
8. Nach dem Bestätigen gilt die Einstufung für genau die Fassung, die du gesehen hast. Ein als „liest“ eingestuftes Werkzeug wird angeboten; alle anderen nicht.

   ![Nach dem Bestätigen: „notizen__suche“ ist als „liest“ eingestuft und wird Bots mit Zugriff „darf lesen“ angeboten, dazu die Fassung als kurze Kennung](assets/screenshots/apps-eingestuft.png)
9. Unter **Zugriff der Bots** stellst du je Bot **kein Zugriff** oder **darf lesen** ein. Mit „darf lesen“ bekommt der Bot nur die Werkzeuge, die du als „liest“ bestätigt hast. Schreib-Zugriff gibt es nicht.

   ![Zugriff „darf lesen“ für den Bot: Er bekommt nur Werkzeuge, die als „liest“ bestätigt sind](assets/screenshots/apps-zugriff.png)
10. **Erneut testen** holt die Liste noch einmal und gleicht sie mit dem ab, was du bestätigt hast. Hat die App ein Werkzeug geändert, steht es danach als „geändert“ da und wird nicht mehr angeboten, bis du es neu bestätigst. Unter **Was sich geändert hat** siehst du, was die App geändert hat: jeweils die Fassung, die du bestätigt hattest, neben der neuen (Name, Beschreibung, Texte der Eingabe, Hinweise der App). Änderte die App das Werkzeug mehrmals, bevor du es gesehen hast, steht alles da, was sich seit deiner Bestätigung geändert hat. Bestätigt wird nur die neue Fassung, die du siehst.
11. **Trennen** fragt vorher nach. PaiBot löscht den hinterlegten Token, und kein Bot sieht danach noch Werkzeuge dieser App. Die App steht danach unter „Getrennte Apps“.

    ![Rückfrage „App trennen?“ mit dem Namen der App und den Knöpfen „Abbrechen“ und „Trennen“](assets/screenshots/apps-trennen.png)
12. **Neu verbinden:** Bei einer getrennten App klickst du unter „Getrennte Apps“ auf **Neu verbinden**. PaiBot verbindet sich nur mit der gespeicherten Adresse. Hatte die App einen Token, trägst du einen neuen ein (der alte wurde beim Trennen gelöscht). Danach sind alle Werkzeuge wieder „neu“ (sie gelten als „schreibt“), und kein Bot hat Zugriff, bis du es wieder erlaubst; die Einstufungen der früheren Verbindung gelten nicht mehr. Willst du eine andere Adresse, verbindest du eine neue App.

## So sieht es aus

Die Bilder zu den einzelnen Schritten stehen oben in der Anleitung (Beispiel-Daten, erfundene Apps „Notizen“ und „Aufgaben“, nichts davon ist ein echter Server). Am Handy steht alles untereinander:

![Seite „Apps“ auf dem Handy, eine App aufgeklappt](assets/screenshots/apps-handy.png)

## Einstellungen

| Einstellung                | Wo                             | Bedeutung                                                                          | Standard                            |
| -------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------- |
| Einstufung eines Werkzeugs | Seite Apps, „Einstufen“        | „Liest nur“, „Schreibt“ oder „Gesperrt“; gilt für die Fassung, die du gesehen hast | „Schreibt“, bis du etwas bestätigst |
| Zugriff je Bot             | Seite Apps, „Zugriff der Bots“ | „kein Zugriff“ oder „darf lesen“                                                   | „kein Zugriff“                      |

## So funktioniert es

- Alles, was du auf der Seite änderst, geht durch das Tor und bekommt Belege (Entscheidung und Ergebnis), zu sehen unter „Belege“. Die Adresse prüft das Tor vor jeder Verbindung. Lehnt es sie ab, steht in der Meldung der Grund (nur https, nur öffentliche Adressen, nur Port 443, kein Benutzer-, Abfrage- oder Anker-Teil), und es wird nichts verbunden.
- Ob der Bot ein Werkzeug im Chat benutzt, entscheiden die Regeln und Grenzen des Tors bei jedem Aufruf neu (siehe [Das Tor](funktion-tor.md), „Pai liest in Apps“, und [Chat](funktion-chat.md), „Pai liest in Apps“). Die Seite „Apps“ legt nur fest, was du erlaubst.
- Texte aus einer App (Namen, Beschreibungen, Felder) zeigt die Seite nur als Text: kein Markup, keine Bilder, keine Links; eine Bild-Adresse aus einer App lädt der Browser nie.
- Der **Not-Aus** hält nur die Aufrufe an: Solange er an ist, ruft PaiBot keine App auf. Zugriff und Einstufung lassen sich auch dann weiter ändern.

## Grenzen

- **Neu verbinden:** Eine getrennte App lässt sich nur mit der gespeicherten Adresse neu verbinden. Die Einstufungen und der Zugriff der Bots aus der früheren Verbindung gelten nicht mehr.
- **Nur lesen:** PaiBot liest Werkzeuge und bietet nur solche an, die du als „liest“ bestätigt hast. Schreibende Werkzeuge gibt es nicht.
- **Ob ein Werkzeug wirklich nur liest, weiß PaiBot nicht.** Du entscheidest das beim Einstufen; die Angabe der App („nur lesend“) zählt nicht. Das Verhalten eines Servers kann sich ändern, ohne dass sich die Beschreibung ändert; PaiBot merkt eine geänderte Beschreibung, aber nicht, was das Werkzeug dahinter tut.
- **Nicht jedes Werkzeug lässt sich prüfen:** Hat ein Werkzeug ein Eingabe-Schema, das PaiBot nicht prüfen kann, wird es nicht gespeichert und nie angeboten.
- **Grenzen beim Lesen der Liste:** PaiBot liest höchstens 200 Werkzeuge je Abruf; hat die App mehr, steht das in der Meldung und die übrigen fehlen.
- **Was „geändert“ bedeutet:** Die Seite zeigt, was sich in Beschreibung, Eingabe und Hinweisen geändert hat. Was das Werkzeug hinter der Beschreibung tut, sieht PaiBot nicht; auch dann nicht, wenn sich nichts in der Beschreibung ändert.
- **Nicht gegen echte Server geprüft:** Verbinden, Einstufen und Zugriff sind gegen einen Test-Server geprüft, nicht gegen echte MCP-Server (zum Beispiel Notion oder Linear). Ob echte Server nach diesen Regeln bestätigbar sind, ist offen.
- **Im Chat:** Die Zeile eines Werkzeug-Aufrufs im Chat nennt die App und das Werkzeug („Werkzeug aus der App …“), beides nur als Text; steht die App nicht mehr in der Liste, steht ihr Kurzname da. Hat sich eine Antwort auf Inhalte aus einer App gestützt, sind Links darin nicht anklickbar: Das ganze Ziel steht als Text daneben, auch der Abfrage-Teil. Wer es öffnen will, kopiert es. Solange eine Antwort noch schreibt und kurz danach, bis PaiBot den Lauf gelesen hat (auch bei einer abgebrochenen oder gescheiterten Antwort mit Teiltext), sind Links in jeder Antwort nur Text; erst dann werden sie anklickbar, wenn die Antwort nicht auf Inhalte aus einer App beruht. Scheitert dieses Lesen, bleiben sie bis zum Neuladen Text.

## Fehlerbehebung

Die Meldungen heißen so, wie sie auf der Seite stehen.

| Beobachtung                                                                                 | Ursache                                                                                    | Was tun                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| „Adresse nicht erlaubt“, darunter „Nur der Port 443 ist erlaubt.“                           | Die Adresse nennt einen anderen Port                                                       | Lass die Port-Angabe weg                                                                                                                                                                 |
| „Adresse nicht erlaubt“, darunter „Nur öffentliche Adressen sind erlaubt …“                 | Die Adresse ist eine IP-Adresse oder ein interner Name                                     | Nimm die öffentliche https-Adresse des Servers                                                                                                                                           |
| „Adresse nicht erlaubt“, darunter ein Satz zu https, Benutzer-Teil, Abfrage-Teil oder Anker | Die Adresse hat so einen Zusatz                                                            | Nimm die Adresse ohne den Zusatz; den Token trägst du im Feld „Token“ ein                                                                                                                |
| „Lokale Befehle startet PaiBot nicht“                                                       | Du hast einen Befehl statt einer Adresse eingefügt                                         | Starte den Server selbst und trag seine https-Adresse ein                                                                                                                                |
| „Token abgelehnt“                                                                           | Der Token fehlt, ist falsch oder abgelaufen                                                | Beim Verbinden: trag einen gültigen Token ein. Bei einer schon verbundenen App: trenne sie, klick unter „Getrennte Apps“ auf „Neu verbinden“ und trag den richtigen Token ein (einen Token direkt ersetzen kann die Seite noch nicht) |
| „App nicht erreichbar“                                                                      | Die Adresse hat nicht oder zu langsam geantwortet                                          | Prüf die Adresse und versuch es später noch einmal                                                                                                                                       |
| „Das ist kein MCP-Server“                                                                   | Unter der Adresse hat PaiBot keinen MCP-Server gefunden                                    | Schau in der Anleitung der App nach der Adresse für MCP; sie endet oft auf /mcp                                                                                                          |
| „Fassung nicht unterstützt“                                                                 | Die App spricht eine Fassung des Protokolls, die PaiBot nicht kennt                        | Nutz eine neuere oder ältere Fassung der App, falls sie das anbietet                                                                                                                     |
| „App will etwas von dir wissen“                                                             | Die App fragt nach einer Eingabe, die PaiBot nicht weitergeben kann                        | Diese App lässt sich mit PaiBot noch nicht nutzen                                                                                                                                        |
| „Die App wird gerade abgeglichen oder geändert“                                             | Ein anderer Vorgang hält die App kurz fest                                                 | Warte einen Moment und versuche es noch einmal                                                                                                                                           |
| Ein Werkzeug fehlt in der Liste                                                             | PaiBot kann es nicht prüfen; die Meldung beim Verbinden und beim Testen nennt es mit Namen | Es wird nicht angeboten; frag den Betreiber der App                                                                                                                                      |
| Ein Werkzeug steht auf „geändert“                                                           | Die App hat es seit deiner Bestätigung geändert                                            | Sieh dir den neuen Text an und bestätige neu, wenn du es willst                                                                                                                          |
| „Die Apps lassen sich gerade nicht laden“                                                   | PaiBot kommt nicht an die Liste der Apps                                                   | Lade die Seite neu; hilft das nicht, schau in den Selbsttest                                                                                                                             |
