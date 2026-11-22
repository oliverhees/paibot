<!--
PaiBot – Doku-Seite: Einstellungen (Zugang und Grenzen) und Info.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Einstellungen und Info

**Ergebnis:** Du änderst dein Passwort, siehst, wo du angemeldet bist, entfernst einzelne Geräte oder meldest alle ab, legst eine Tagesgrenze für dein Modell fest und findest Stand, Lizenz und Hilfe von PaiBot an einer Stelle.

## Wofür

Unter **Einstellungen** regelst du den Zugang zu deinem PaiBot und die Grenzen, die das Tor bei jeder Anfrage an das Modell prüft. Unter **Info** steht, welchen Stand deine Installation hat, unter welcher Lizenz PaiBot steht und wo du Hilfe bekommst.

## So benutzt du es

**Darstellung: der Startbereich einer leeren Unterhaltung**

1. Öffne **Du → Einstellungen** und wähle oben den Reiter **Darstellung** (Adresse `/einstellungen/darstellung`).
2. Dort stehen drei Karten mit einer kleinen Vorschau: **Begrüßung**, **Startbrett** und **Stille**. Ab Werk ist „Begrüßung“ gewählt.
3. Klick auf eine Karte. Darunter steht „Gemerkt für diesen Browser.“ Eine neue, leere Unterhaltung zeigt ab sofort diese Fassung (siehe [Chat](funktion-chat.md), „Der Startbereich“).

   ![Reiter „Darstellung“: drei Karten mit kleiner Vorschau, „Begrüßung“ ist gewählt](assets/screenshots/einstellungen-darstellung.png)

   ![Reiter „Darstellung“ mit gewählter Karte „Stille“ und dem Hinweis „Gemerkt für diesen Browser.“](assets/screenshots/einstellungen-darstellung-gewaehlt.png)

4. Die Wahl gilt nur für den Browser, in dem du sie triffst. Sie liegt in einem Cookie (ein Jahr) und steht nicht auf dem Server. Der Server liest es mit und zeichnet die gewählte Fassung schon im ersten Bild, ohne späteren Wechsel.

**Die Seitenleiste: Werkzeuge und das Menü „Du“**

1. Unten links in der Seitenleiste stehen die **Werkzeuge**: Belege, Regeln, Datenschleuse sowie Modell und Anbieter. Mit **Werkzeuge einklappen** blendest du sie aus; die Liste deiner Unterhaltungen bekommt dann den Platz. **Werkzeuge ausklappen** zeigt sie wieder. Dein Browser merkt sich, wie du es eingestellt hast. Im Menü am Handy stehen die Werkzeuge immer offen.

   ![Seitenleiste mit eingeklappten Werkzeugen: oben die Unterhaltungen, unten „Werkzeuge ausklappen“, darunter der Knopf „Du“ und die Fußzeile](assets/screenshots/navigation-eingeklappt.png)
2. Ganz unten steht der Knopf **Du**. Klick darauf (oder drück Enter bzw. die Leertaste, wenn er den Fokus hat). Es öffnet sich ein Menü mit **Zugang**, **Einstellungen**, **Neuigkeiten**, unter **Hilfe** die Einträge **Dokumentation**, **Roadmap** und **Selbsttest**, dann **Info** und abgesetzt **Abmelden**. Mit den Pfeiltasten wählst du, Escape schließt das Menü.

   ![Geöffnetes Menü „Du“ über dem Knopf: Zugang, Einstellungen, Neuigkeiten mit dem Stand, unter „Hilfe“ Dokumentation, Roadmap und Selbsttest, dann Info und rot abgesetzt „Abmelden“](assets/screenshots/navigation-du.png)
3. **Neuigkeiten** zeigt den Stand deiner Installation und öffnet die Liste der Änderungen in einem neuen Tab. PaiBot fragt nicht von selbst nach neuen Versionen; wie du aktualisierst, steht unter [Aktualisieren](aktualisieren.md). **Dokumentation** öffnet paibot.de/doku, **Roadmap** paibot.de/bauplan, jeweils in einem neuen Tab und erst, wenn du klickst. Ohne Internet funktioniert PaiBot unverändert.
4. Am Handy öffnest du zuerst das Menü oben links; der Knopf **Du** steht dort unten.

   ![Auf dem Handy das Menü der Seitenleiste mit geöffnetem Menü „Du“](assets/screenshots/navigation-du-handy.png)

**Passwort ändern**

1. Klick unten links auf **Du** und dann auf **Zugang**. Es öffnen sich die Einstellungen mit dem Reiter **Zugang**.
2. Gib im Kasten **Passwort ändern** dein **aktuelles Passwort** ein.
3. Gib das **neue Passwort** zweimal ein. Die Prüfliste darunter zeigt, ob es mindestens 12 Zeichen hat und ob beide Eingaben gleich sind.

   ![Kasten „Passwort ändern“ mit ausgefüllten Feldern; die Prüfliste zeigt Haken bei „mindestens 12 Zeichen“ und „beide Eingaben sind gleich“](assets/screenshots/einstellungen-passwort-pruefliste.png)
4. Klick auf **Passwort ändern**. Die Seite lädt neu und meldet: „Dein Passwort ist geändert. Alle anderen Geräte sind jetzt abgemeldet.“ Auf diesem Gerät bleibst du angemeldet.
5. Auf anderen Geräten meldest du dich ab jetzt mit dem neuen Passwort an.

**Sitzungen ansehen und alle beenden**

1. Im Reiter **Zugang** steht unter **Sitzungen** jede Anmeldung mit grober Geräte-Angabe (zum Beispiel „Firefox auf Windows“), dem Zeitpunkt der Anmeldung und wann sie zuletzt aktiv war. Dieses Gerät trägt die Marke **diese Sitzung**.

   ![Reiter „Zugang“: oben „Passwort ändern“, darunter die Sitzungen „Firefox auf Windows“ und „Chrome auf Linux“, eine davon mit der Marke „diese Sitzung“, und der Knopf „Alle Sitzungen beenden“](assets/screenshots/einstellungen-zugang.png)
2. Willst du überall abgemeldet sein (zum Beispiel, weil du ein Gerät verloren hast), klick auf **Alle Sitzungen beenden**.
3. Bestätige die Rückfrage mit **Alle Sitzungen beenden**. Alle Geräte sind abgemeldet, auch dieses, und kein Browser gilt mehr als bekanntes Gerät; du landest auf der Anmeldung.

   ![Rückfrage „Alle Sitzungen beenden?“ mit „Abbrechen“ und „Alle Sitzungen beenden“](assets/screenshots/einstellungen-alle-beenden.png)
4. Melde dich mit deinem Passwort wieder an.

Nur dieses Gerät abmelden: **Du → Abmelden** unten in der Seitenleiste, oder der Knopf **Abmelden** im Reiter **Zugang** bzw. auf der Seite **Info**.

**Bekannte Geräte ansehen und eines entfernen**

1. Klick unten links auf **Du → Zugang**. Im Reiter **Zugang** steht unter **Passwort ändern** der Abschnitt **Bekannte Geräte**: jeder Browser, in dem du dich angemeldet hast, mit grober Angabe (zum Beispiel „Firefox auf Windows“), wann PaiBot ihn **zuerst** und **zuletzt gesehen** hat und bis wann er **gültig** ist. Der Browser, den du gerade benutzt, steht oben und trägt die Marke **dieses Gerät**.

   ![Abschnitt „Bekannte Geräte“: oben „Chrome auf Linux“ mit der Marke „dieses Gerät“, darunter weitere Geräte, je mit „zuerst gesehen“, „zuletzt gesehen“, „gültig bis“ und dem Knopf „Entfernen“](assets/screenshots/geraete-liste.png)
2. Kennst du ein Gerät nicht oder benutzt du es nicht mehr (zum Beispiel ein verlorenes Handy), klick in seiner Zeile auf **Entfernen**.
3. Lies die Rückfrage: Das Gerät ist danach kein bekanntes Gerät mehr, und alle seine Sitzungen enden sofort. Klick auf **Entfernen**, um es zu bestätigen, oder auf **Abbrechen** (oder drück Escape), wenn du es dir anders überlegst.

   ![Rückfrage „Gerät entfernen?“: „„Firefox auf Windows“ ist danach kein bekanntes Gerät mehr. Alle Sitzungen dieses Geräts enden sofort …“ mit „Abbrechen“ und „Entfernen“](assets/screenshots/geraet-entfernen-rueckfrage.png)
4. Über der Liste steht „Gerät entfernt: …“, das Gerät ist aus der Liste verschwunden. Wer es benutzt, muss sich neu mit dem Passwort anmelden.
5. Entfernst du **dieses Gerät**, sagt die Rückfrage das vorher deutlich: Du wirst in diesem Browser sofort abgemeldet und landest auf der Anmeldung.
6. Wer was entfernt hat, steht unter [Belege](funktion-belege.md): Der Beleg „Gerät entfernt“ nennt das Gerät, das entfernt wurde, und in der Zeile **Gerät** das Gerät, von dem aus du es getan hast. So nennen alle Belege deiner Aktionen das Gerät, von dem sie kamen.

**Grenzen festlegen**

1. Klick unten links auf **Du → Einstellungen** (oder in den Einstellungen auf den Reiter **Grenzen**).
2. Unter **Tagesbudget (Token)** siehst du, wie viele Token dein Bot heute schon verbraucht hat (seit Mitternacht in deiner Zeitzone). Trag eine Zahl ein, zum Beispiel `50000`, oder lass das Feld leer für keine Tagesgrenze.

   ![Reiter „Grenzen“: Tagesbudget mit „Heute verbraucht“, Verlaufsgrenze und Zeitzone „Europe/Berlin“, unten „Speichern“](assets/screenshots/einstellungen-grenzen.png)
3. Unter **Verlaufsgrenze (Token)** legst du fest, wie viel vom bisherigen Verlauf höchstens mit jeder Anfrage mitgeht. Leer heißt: so viel, wie passt.
4. Unter **Zeitzone** wählst du deine Zeitzone, zum Beispiel `Europe/Berlin`.
5. Klick auf **Speichern**. Neben dem Knopf steht „Gespeichert.“ und ein Link **Beleg Nr. … ansehen**: Die Änderung lief durch das Tor und steht mit Beleg im Protokoll.

   ![Tagesbudget 50000 eingetragen und gespeichert: neben dem Knopf „Gespeichert.“ und der Link „Beleg Nr. … ansehen“](assets/screenshots/einstellungen-grenzen-beleg.png)

**Info ansehen**

1. Klick unten links auf **Du → Info** (oder in den Einstellungen auf den Reiter **Info**).
2. Oben stehen Stand und Installations-ID deiner Installation, die Lizenz, wer PaiBot entwickelt und der Hinweis auf PaiBot Enterprise für Teams.

   ![Seite „Info“: Stand, Installations-ID (im Bild ausgeblendet), Lizenz, Entwickelt von HR CodeLabs und der Hinweis auf PaiBot Enterprise für Teams](assets/screenshots/info.png)
3. Darunter findest du den Lizenztext, Links zur Doku und zur Community, wie du eine Sicherheitslücke meldest und die Liste der Bestandteile Dritter. Alle Links öffnen in einem neuen Tab.

   ![Seite „Info“ auf dem Handy, unten: Links, Hilfe, Sicherheitslücke melden, Bestandteile und ihre Lizenzen und der Knopf „Abmelden“](assets/screenshots/info-unten.png)

## So sieht es aus

Die Bilder zu den einzelnen Schritten stehen oben in der Anleitung. Sie zeigen Beispiel-Daten: zwei Sitzungen der Beispiel-Umgebung, den Bot „Pai“ und den Test-Anbieter. Die Installations-ID ist in den Bildern ausgeblendet, weil sie bei jeder Installation anders ist.

Am Handy, Reiter „Zugang“, „Grenzen“ und die Seite „Info“:

![Reiter „Zugang“ auf dem Handy](assets/screenshots/einstellungen-zugang-handy.png)

![Abschnitt „Bekannte Geräte“ auf dem Handy: „Chrome auf Linux“ mit der Marke „dieses Gerät“ und dem Knopf „Entfernen“](assets/screenshots/geraete-liste-handy.png)

![Reiter „Grenzen“ auf dem Handy](assets/screenshots/einstellungen-grenzen-handy.png)

![Seite „Info“ auf dem Handy, oberer Teil](assets/screenshots/info-handy.png)

## Einstellungen

| Einstellung    | Wo                          | Bedeutung                                                                                                                                                                      | Standard            |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Tagesbudget    | Einstellungen › Grenzen     | Höchstens so viele Token am Tag (Eingabe und Ausgabe aller Antworten zusammen). Ist es erreicht, fragt dein Bot das Modell bis Mitternacht nicht mehr an. 1 bis 1.000.000.000. | keine Tagesgrenze   |
| Verlaufsgrenze | Einstellungen › Grenzen     | Höchstens so viele Token aus dem bisherigen Verlauf gehen mit jeder Anfrage mit. 1 bis 2.000.000.                                                                              | so viel, wie passt  |
| Zeitzone       | Einstellungen › Grenzen     | Datum für deinen Bot und Beginn des Tages für das Tagesbudget.                                                                                                                 | aus der Einrichtung |
| Startbereich   | Einstellungen › Darstellung | Fassung der leeren Unterhaltung: Begrüßung, Startbrett oder Stille. Gilt je Browser (Cookie `paibot_startbereich`).                                                            | Begrüßung           |

## So funktioniert es

- **Passwort ändern** prüft zuerst dein aktuelles Passwort. Nur wenn es stimmt, lässt das Tor die Aktion zu (Vorbedingung „Aktuelles Passwort bestätigt“). Danach werden in einem Schritt das neue Passwort gespeichert und alle Sitzungen und bekannten Geräte gelöscht; dieses Gerät bekommt eine neue Sitzung und gilt wieder als bekannt. Auch ein falsches aktuelles Passwort steht als abgelehnte Aktion im Protokoll.
- **Sitzungen** zeigt nur, was gespeichert ist: Zeitpunkte und die Browser-Kennung, aus der PaiBot eine grobe Angabe wie „Chrome auf Android“ macht. Adressen oder Orte speichert PaiBot nicht. Lässt sich nichts sicher erkennen, steht „Gerät ohne Angabe“ da.
- **Bekannte Geräte** zeigt die gültigen Einträge aus dem Geräte-Verzeichnis auf dem Server (höchstens 10): grobe Angabe aus der gespeicherten Browser-Kennung, wann zuerst und zuletzt gesehen, bis wann gültig. Adressen oder Orte speichert PaiBot auch hier nicht. **Entfernen** ist die Aktion „Gerät entfernt“: Sie läuft durch das Tor, bekommt zwei Belege und widerruft das Gerät; seine Sitzungen enden in derselben Aktion. War es dieses Gerät, löscht PaiBot auch die Cookies dieses Browsers.
- **Gerät im Beleg:** Jede Aktion, die du in PaiBot auslöst, nennt im Beleg „Entscheidung“ das Gerät, von dem sie kam (die Kennung aus dem Verzeichnis). Die Belege-Seite zeigt dazu die grobe Angabe; steht das Gerät nicht mehr im Verzeichnis (widerrufene Geräte fallen nach 30 Tagen heraus), steht dort „nicht mehr im Verzeichnis“ und die Kennung. Ältere Belege ohne diese Angabe bleiben gültig.
- **Alle Sitzungen beenden** löscht alle Sitzungen. Offene Verbindungen anderer Geräte (zum Beispiel ein laufender Chat) enden spätestens beim nächsten Herzschlag nach etwa 15 Sekunden.
- **Grenzen speichern** schickt nur die geänderten Felder. Die Aktion „Einstellung geändert“ läuft durch das Tor und bekommt zwei Belege (Entscheidung und Ergebnis); die Belege nennen, welche Felder sich geändert haben. Den Link zum Beleg zeigt die Seite direkt nach dem Speichern.
- Das **Tagesbudget** prüft das Tor als feste Grenze (G-04) bei jeder Anfrage an das Modell, ohne KI. Gezählt werden Eingabe und Ausgabe aller Antworten deines Bots seit Mitternacht in deiner Zeitzone, genau wie unter „Heute verbraucht“.
- **Info** liest den Stand aus der Installation und die Installations-ID aus der Datenbank. Die Seite lädt nichts von fremden Servern; Links nach außen sind normale Links.

## Grenzen

- **Alle anderen abmelden, aber hier angemeldet bleiben** gibt es als eigenen Knopf nicht: „Alle Sitzungen beenden“ meldet auch dieses Gerät ab. Wer nur die anderen Geräte loswerden will, entfernt sie einzeln unter **Bekannte Geräte** oder ändert das Passwort.
- Die Geräte-Angabe ist grob und kommt aus der Browser-Kennung, die der Browser selbst meldet. Zwei Browser derselben Art heißen gleich (zum Beispiel zweimal „Chrome auf Linux“); unterscheide sie an den Zeiten.
- Ein Gerät lässt sich nicht umbenennen.
- Der **Not-Aus**, der alle Bots anhält, steht nicht auf diesen Seiten, sondern oben in der Seitenleiste ([Das Tor](funktion-tor.md#not-aus-alle-bots-anhalten)).
- **Sprache** lässt sich noch nicht umstellen; PaiBot spricht Deutsch.
- Konto löschen, alle Daten exportieren und Sicherungen gibt es in den Einstellungen nicht.
- Ein vergessenes Passwort lässt sich hier nicht zurücksetzen; dafür musst du angemeldet sein.

## Fehlerbehebung

| Beobachtung                                                                                                                                           | Ursache                                                                     | Was tun                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| „Das Passwort stimmt nicht.“ beim Passwort ändern                                                                                                     | Das aktuelle Passwort war falsch.                                           | Aktuelles Passwort neu eingeben. Nichts wurde geändert.                         |
| „Das neue Passwort erfüllt die Prüfliste noch nicht.“                                                                                                 | Weniger als 12 Zeichen oder die beiden Eingaben sind verschieden.           | Prüfliste beachten, bis beide Punkte einen Haken haben.                         |
| „Gib eine ganze Zahl von 1 bis … ein oder lass das Feld leer.“                                                                                        | Null, Kommazahl, Text oder zu große Zahl bei einer Grenze.                  | Ganze Zahl eintragen oder das Feld leeren.                                      |
| „Es gibt nichts zu speichern.“                                                                                                                        | Nichts wurde geändert.                                                      | Erst einen Wert ändern, dann speichern.                                         |
| Im Chat: „Das Tor hat die Aktion abgelehnt. Grenze nicht eingehalten: G-04 „Tagesbudget“.“ (auf der Seite „Grenzen“: „Die Tagesgrenze ist erreicht.“) | Dein Bot hat heute so viele Token verbraucht, wie du erlaubst.              | Bis Mitternacht warten oder das Tagesbudget erhöhen bzw. leeren. Der Chat nennt das selbst und verlinkt auf „Grenzen“. |
| „Die Geräte lassen sich gerade nicht laden.“                                                                                                          | Die Anfrage an den Server ist gescheitert.                                  | „Noch einmal versuchen“ klicken; hilft das nicht, ins Log von PaiBot schauen.   |
| „Dieses Gerät gibt es nicht mehr …“ nach „Entfernen“                                                                                                  | Das Gerät wurde schon entfernt, zum Beispiel auf einem anderen Gerät.       | Nichts zu tun; die Liste ist neu geladen.                                       |
| Nach „Entfernen“ landest du auf der Anmeldung                                                                                                         | Du hast dieses Gerät entfernt.                                              | Neu anmelden; der Browser wird dabei wieder ein bekanntes Gerät.                |
| „Die Sitzungen lassen sich gerade nicht laden.“                                                                                                       | Die Anfrage an den Server ist gescheitert.                                  | „Noch einmal versuchen“ klicken; hilft das nicht, ins Log von PaiBot schauen.   |
| Nach dem Speichern landest du auf der Anmeldung                                                                                                       | Deine Sitzung war abgelaufen oder wurde auf einem anderen Gerät beendet.    | Neu anmelden und die Änderung wiederholen.                                      |
| Nach mehreren Versuchen, das Passwort zu ändern, landest du auf der Anmeldung                                                                         | Mehr als 5 Versuche in 15 Minuten: PaiBot beendet zum Schutz diese Sitzung. | Neu anmelden und es mit dem richtigen aktuellen Passwort noch einmal versuchen. |
