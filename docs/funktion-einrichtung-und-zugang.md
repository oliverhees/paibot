<!--
PaiBot – Doku: Einrichtung mit Einrichtungs-Code, Anmelden, Sitzung, Abmelden und der Schutz der App.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-20
-->

# Einrichtung und Zugang

**Ergebnis:** Deine frische Installation gehört dir: Nur wer den Einrichtungs-Code aus dem Log kennt, kann sie einrichten. Danach kommst nur du mit deinem Passwort hinein, und jede Seite und jede Schnittstelle prüft das.

## Wofür

Wer eine neue Installation im Internet zuerst erreicht, könnte sonst das Passwort setzen. Der Einrichtungs-Code steht deshalb nur im Log deines Servers. Nach der Einrichtung meldest du dich mit deinem Passwort an; PaiBot merkt sich die Anmeldung in einer Sitzung, bis du dich abmeldest oder sie abläuft.

## So benutzt du es

Die Bilder zeigen eine Installation mit Beispiel-Daten. Als Modell-Anbieter ist dort der Test-Anbieter von PaiBot auf dem eigenen Rechner verbunden; deshalb steht als Name des Anbieters die Adresse `127.0.0.1:18080` und die Modelle heißen „Beispiel-Modell …“. Bei dir steht dort EUrouter mit seinen Modellen.

### Einrichten

1. Starte PaiBot (siehe [Installation](installation.md)) und öffne die Adresse im Browser. Du landest automatisch auf der Seite „Einrichtung“.

   ![Einrichtung, Schritt 1 von 5 im dunklen Design: Pai begrüßt dich, rechts drei Versprechen und das leere Feld „Einrichtungs-Code“ mit dem Hinweis auf das Log](assets/screenshots/einrichtung-code.png)

2. Suche den Einrichtungs-Code im Log:
   - Docker Compose: `docker compose logs web | grep Einrichtungs-Code`
   - Coolify: in der Anwendung unter „Logs“ nach „Einrichtungs-Code“ suchen.

   Die Zeile sieht so aus (der Code ist bei dir ein anderer):

   ```text
   Einrichtungs-Code: K7QD-9M2F-XW4H (gilt 24 Stunden, längstens bis zum Ende der Einrichtung)
   ```

3. Gib den Code ein. Bindestriche und Kleinbuchstaben sind egal. Klick auf „Weiter“. Fehlt der Code oder hat er die falsche Form, sagt das Feld, wie er aussehen muss; ob er stimmt, prüft PaiBot erst beim Verbindungstest und beim Abschluss.

   ![Einrichtung, Schritt 1 mit rot umrandetem Feld und dem Hinweis „Der Code hat 12 Zeichen, zum Beispiel K7QD-9M2F-XW4H.“](assets/screenshots/einrichtung-code-fehler.png)

4. Lege dein Passwort fest: mindestens 12 Zeichen, zweimal gleich eingegeben. Die Liste unter den Feldern zeigt mit Haken, ob beides erfüllt ist. Gut zu merken und schwer zu erraten sind mehrere Wörter mit Bindestrichen. Klick auf „Weiter“.

   ![Einrichtung, Schritt 2 von 5: beide Passwortfelder ausgefüllt (als Punkte), darunter zwei grüne Haken bei „mindestens 12 Zeichen“ und „beide Eingaben sind gleich“](assets/screenshots/einrichtung-passwort.png)

5. Trag den Schlüssel deines Anbieters ein und klick auf „Verbindung testen“. Hast du noch keinen Schlüssel, klick auf „Später eintragen“.

   ![Einrichtung, Schritt 3 von 5: leeres Feld „Schlüssel für 127.0.0.1:18080“ (Test-Anbieter), daneben „Verbindung testen“, unten „Später eintragen“ und „Weiter“](assets/screenshots/einrichtung-schluessel.png)

   Nimmt der Anbieter den Schlüssel nicht an, steht das rot unter dem Feld. Prüfe den Schlüssel und teste noch einmal.

   ![Einrichtung, Schritt 3 mit rot umrandetem Schlüsselfeld und dem Hinweis „Der Anbieter hat den Schlüssel nicht angenommen. Trag einen gültigen Schlüssel ein.“](assets/screenshots/einrichtung-schluessel-fehler.png)

   Klappt es, steht unter dem Feld „Verbindung steht“ und wie viele passende Modelle PaiBot gefunden hat. Der Schritt „Modell“ kommt dazu, die Einrichtung hat jetzt sechs Schritte. Klick auf „Weiter“.

   ![Einrichtung, Schritt 3 von 6: Schlüssel eingegeben (als Punkte) und darunter „Verbindung steht. 2 passende Modelle gefunden.“](assets/screenshots/einrichtung-schluessel-ok.png)

6. Wähle ein Modell aus der Liste (nur mit Schlüssel) und klick auf „Weiter“.

   ![Einrichtung, Schritt 4 von 6: zwei Modelle des Test-Anbieters, „Beispiel-Modell Allrounder“ ist gewählt und grün umrandet](assets/screenshots/einrichtung-modell.png)

7. Entscheide, ob die Datenschleuse für neue Unterhaltungen standardmäßig an ist. Der Schalter lässt sich nur bedienen, wenn die Datenschleuse auf deinem Server eingerichtet ist; sonst bleibt sie aus, und PaiBot sagt dir das unter dem Schalter. Klick auf „Weiter“.

   ![Einrichtung, Schritt 5 von 6: Schalter „Standard für neue Unterhaltungen: Aus“, darunter der Hinweis, dass die Datenschleuse auf diesem Server nicht eingerichtet ist](assets/screenshots/einrichtung-schleuse.png)

8. Gib deinem Bot einen Namen (Vorschlag: „Pai“) und klick auf „Einrichtung abschließen“.

   ![Einrichtung, Schritt 6 von 6: Feld „Name deines Bots“ mit dem Vorschlag „Pai“ und der Knopf „Einrichtung abschließen“](assets/screenshots/einrichtung-bot.png)

9. Du siehst „Alles bereit“ mit allem, was eingerichtet ist, und bist angemeldet. Der Code gilt ab jetzt nicht mehr. Mit „Zur App“ geht es weiter.

   ![„Alles bereit“: Haken bei Passwort, Name des Bots, verbundenem Anbieter und Modell, Hinweis „Datenschleuse als Standard aus“ und der Knopf „Zur App“](assets/screenshots/einrichtung-fertig.png)

10. Die App öffnet sich: links dein Bot und die Navigation, in der Mitte eine neue Unterhaltung mit deinem Bot (siehe [Chat](funktion-chat.md)).

    ![Die App nach der Anmeldung: links PaiBot, der Bot Pai und die Navigation mit „Abmelden“, in der Mitte „Frag deinen Bot etwas“ mit drei Vorschlägen und unten das Eingabefeld](assets/screenshots/app-start.png)

### Anmelden und Abmelden

1. Öffne PaiBot. Ohne gültige Sitzung landest du auf „Anmelden“.

   ![Anmelden im dunklen Design: „Willkommen zurück“, Feld „Passwort“, „Angemeldet bleiben“ und der Knopf „Anmelden“](assets/screenshots/anmelden.png)

2. Gib dein Passwort ein. Mit „Angemeldet bleiben“ bleibt die Sitzung auch nach dem Schließen des Browsers erhalten. Klickst du ohne Passwort auf „Anmelden“, weist das Feld darauf hin.

   ![Anmelden mit rot umrandetem Feld und dem Hinweis „Gib dein Passwort ein.“](assets/screenshots/anmelden-leer.png)

3. Klick auf „Anmelden“. Bei einem falschen Passwort steht unter dem Feld „Das Passwort stimmt nicht.“

   ![Anmelden nach einem falschen Passwort: unter dem Feld steht „Das Passwort stimmt nicht.“](assets/screenshots/anmelden-falsch.png)

4. Zum Abmelden klick in der Navigation unten auf „Abmelden“ (am Handy erst auf „Menü öffnen“), zu sehen im Bild der App in Schritt 10 oben.

### Ausgesperrt? So kommst du wieder hinein

Versucht jemand massenhaft Passwörter, bremst PaiBot die Anmeldung für alle (siehe „So funktioniert es“). So kommst du trotzdem hinein:

1. Melde dich in einem Browser an, in dem du dich in den letzten 90 Tagen angemeldet und seitdem nicht abgemeldet hast. Er ist ein bekanntes Gerät: Er geht an der Bremse vorbei, und auch eine gesperrte Adresse hält ihn nicht auf. Dafür braucht es keinen Neustart.
2. Geht das nicht, starte den Migrations-Schritt noch einmal: `docker compose up -d` (startet den Dienst `migrate` erneut) bzw. in Coolify „Redeploy“. Er hebt alle Sperren der Anmeldung auf; im Log von `migrate` steht dann „Sperren der Anmeldung aufgehoben.“
3. Melde dich an. Hält die Flut an, nimm dafür einen bekannten Browser oder sperre die Adressen der Angreifer in deinem Proxy.

### Code verloren

1. Ein Neustart von `web` allein bringt keinen neuen Code: Solange die Einrichtung offen ist, gilt der Code aus dem ersten Start weiter, höchstens 24 Stunden. Im Log steht nach einem Neustart nur, wann er erzeugt wurde. Ist er älter als 24 Stunden, steht beim nächsten Aufruf der Seite „Einrichtung“ von selbst ein neuer im Log.
2. Lass den Migrations-Schritt noch einmal laufen: `docker compose up -d` (startet den Dienst `migrate` erneut) bzw. in Coolify „Redeploy“. Er verwirft den alten Code.
3. Lade die Seite „Einrichtung“ neu. Jetzt steht ein **neuer** Code im Log von `web`; der alte gilt nicht mehr. Was du vorher eingegeben hattest, musst du noch einmal eingeben: Gespeichert wird erst beim Abschluss, dann alles auf einmal.

## So sieht es aus

Die Bilder zu jedem Schritt stehen oben in der Anleitung. Hier die Ansichten am Handy, im hellen Design und die Seite für Adressen, die es nicht gibt.

Auf dem Handy steht der Bot mit seiner Sprechblase über dem Schritt.

![Einrichtung, Schritt 1 auf dem Handy im dunklen Design: Pai mit Sprechblase oben, darunter Begrüßung und das Feld für den Code](assets/screenshots/einrichtung-code-handy.png)

Die Anmeldung auf dem Handy im hellen Design:

![Anmelden auf dem Handy im hellen Design](assets/screenshots/anmelden-handy-hell.png)

Das Passwort im hellen Design, erst ein Feld ausgefüllt: Die Prüfliste zeigt, was noch fehlt.

![Einrichtung, Schritt 2 im hellen Design: erstes Passwortfeld ausgefüllt, Haken bei „mindestens 12 Zeichen“, Kreuz bei „beide Eingaben sind gleich“](assets/screenshots/einrichtung-passwort-hell.png)

Eine Adresse, die es in PaiBot nicht gibt, führt zu dieser Seite mit einem Link zurück zur Startseite.

![Seite „Diese Seite gibt es nicht“ mit dem PaiBot-Logo und dem Link „Zur Startseite“](assets/screenshots/seite-nicht-gefunden.png)

## Einstellungen

| Einstellung                       | Wo                | Bedeutung                                                                                                                                                                                                                                                                | Standard                 |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `APP_URL`                         | Umgebungsvariable | Adresse, unter der du PaiBot öffnest. Nur Anfragen genau von dieser Adresse dürfen etwas verändern. Beginnt sie mit `https://`, sind die Cookies `Secure` und heißen `__Host-…`. Im Betrieb Pflicht; `http://` nur für den eigenen Rechner (mit Warnung im eigenen Netz) | `http://localhost:3000`  |
| `TRUST_PROXY`                     | Umgebungsvariable | `1`, wenn PaiBot hinter einem Proxy läuft (Coolify, Traefik, Caddy, nginx). Dann zählt die Adresse, die dein Proxy als letzte in `X-Forwarded-For` anhängt                                                                                                               | im Compose `1`           |
| `PAIBOT_SECRET`                   | Umgebungsvariable | Wurzel-Geheimnis; daraus entstehen die Prüfzeichen gegen untergeschobene Anfragen und die Schlüssel für Belege und Anbieter                                                                                                                                              | Pflicht                  |
| `PAIBOT_EINRICHTUNG_ANBIETER_URL` | Umgebungsvariable | Nur für Tests und eigene Dienste: Die Einrichtung verbindet statt EUrouter diesen OpenAI-kompatiblen Dienst (zum Beispiel den Test-Anbieter). Er heißt in PaiBot „Lokaler Anbieter“ (Adresse im eigenen Netz oder über http, Region lokal) bzw. „Eigener Anbieter“       | nicht gesetzt (EUrouter) |
| Angemeldet bleiben                | Seite „Anmelden“  | Cookie bleibt 30 Tage im Browser; ohne Haken endet es mit dem Browser                                                                                                                                                                                                    | aus                      |

**Hinter einem Proxy `TRUST_PROXY=1` setzen.** Im Compose ist das der Standard, denn der Port der App ist dort nur auf dem Server selbst erreichbar. Ohne diese Einstellung kennt PaiBot die Adresse der Besucher nicht, denn den Wert in `X-Forwarded-For` kann jeder frei setzen, und PaiBot liest ihn dann gar nicht. Alle Besucher teilen sich so einen Zähler; die Sperre je Adresse verzögert dann nur (2 Sekunden je Versuch). Die gemeinsame Bremse gilt trotzdem für alle. Beim Start und auf der Seite „Einrichtung“ steht dazu ein Hinweis. Setze `TRUST_PROXY=1` nur, wenn wirklich ein Proxy davor steht, und gib den Port der App nie direkt frei; sonst könnte ein Besucher seine Adresse vortäuschen.

**Beim Start in Produktion prüft PaiBot `APP_URL`:**

| `APP_URL`                                                         | Ergebnis                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| fehlt, ist keine Adresse oder enthält Benutzer und Passwort       | Start bricht ab, mit Meldung im Log                                      |
| `http://` mit öffentlicher Adresse oder öffentlichem Namen        | Start bricht ab: Passwort und Sitzung gingen unverschlüsselt durchs Netz |
| `http://` im eigenen Netz (`192.168.…`, `10.…`, `nas`, `….local`) | Start mit Warnung                                                        |
| `http://localhost`, `http://127.0.0.1`                            | Start ohne Warnung (eigener Rechner)                                     |
| `https://…`                                                       | Start ohne Warnung                                                       |
| mit Pfad oder Abfrage (`https://…/app`)                           | Start mit Warnung; es zählt nur der Ursprung                             |

Kommt eine Anfrage an einen anderen Host als in `APP_URL`, schreibt `web` einmal einen Hinweis ins Log. Dann scheitern Anmelden und Einrichtung, bis `APP_URL` genau die Adresse im Browser ist.

## So funktioniert es

- **Einrichtungs-Code:** 12 Zeichen aus 32 Zeichen (60 Bit Zufall). PaiBot speichert nur seinen Prüfwert (SHA-256) in der Datenbank und schreibt den Code genau einmal ins Log, beim ersten Start. Er gilt 24 Stunden, längstens bis zum Ende der Einrichtung; danach entsteht beim nächsten Aufruf ein neuer. Richte PaiBot deshalb gleich nach dem ersten Start ein. Ein Neustart oder ein zweiter Prozess erzeugt keinen neuen; dann steht im Log nur ein Hinweis, wann der Code erzeugt wurde. Erst ein neuer Lauf des Migrations-Schritts verwirft ihn (siehe „Code verloren“). Falsche Codes zählen je Adresse: nach 5 Fehlversuchen in 15 Minuten ist für diese Adresse Pause. Der Verbindungstest der Einrichtung verlangt denselben Code und zählt zusätzlich höchstens 10 Tests in 15 Minuten.
- **Abschluss in einem Rutsch:** Alles läuft in einer einzigen Datenbank-Transaktion: Signaturschlüssel der Installation erzeugen und verschlüsselt speichern, Beleg „Start“ als erster Eintrag der Beleg-Kette, dann über das [Tor](funktion-tor.md) die Aktionen „Einrichtung abgeschlossen“ (Konto, Einstellungen, erste Sitzung), „Bot geändert“, „Anbieter gespeichert“ (Schlüssel verschlüsselt und an Anbieter und Adresse gebunden), „Modell gewählt“ und gegebenenfalls „Datenschleuse umgeschaltet“. Scheitert ein Schritt, bleibt nichts davon übrig. Kommen zwei Abschlüsse gleichzeitig, gewinnt genau einer; der andere bekommt „PaiBot ist schon eingerichtet“.
- **Passwort:** gespeichert nur als scrypt-Hash. Vor jeder Prüfung zählt PaiBot den Versuch, in der Datenbank und auch bei gleichzeitigen Anfragen genau:
  - je Adresse: höchstens 5 Fehlversuche in 15 Minuten und 20 an einem Tag. Die Fenster gleiten: Versuche vom Ende des letzten Fensters zählen am Anfang des nächsten anteilig mit, eine Pause dauert deshalb bis zu 30 Minuten bzw. zwei Tage. IPv6-Adressen zählen je Netz (/64), weil ein Anschluss meist ein ganzes Netz hat.
  - für alle zusammen: über 20 Versuchen in 15 Minuten (ebenfalls gleitend) prüft PaiBot höchstens ein Passwort je Takt, egal wie viele Anfragen gleichzeitig kommen. Der Takt beginnt bei 2 Sekunden und verdoppelt sich je 20 weiteren Versuchen bis 1 Minute. Alle anderen bekommen „Zu viele Versuche“ mit der Wartezeit.
  - Bekannte Geräte: Ein Browser, in dem du dich anmeldest, bekommt ein Geräte-Cookie (`HttpOnly`, `SameSite=Strict`, mit Prüfzeichen aus `PAIBOT_SECRET`). Seine Kennung steht auch auf dem Server (nur als Prüfsumme), gilt 90 Tage und wird mit jeder Anmeldung erneuert; höchstens 10 Geräte bleiben gespeichert. Abmelden entfernt das Gerät dieses Browsers, „Alle Sitzungen beenden“ und ein neues Passwort entfernen alle Geräte. Ein bekanntes Gerät hat ein eigenes Limit (5 Fehlversuche in 15 Minuten, 20 am Tag). Darunter zählen für es weder die Limits seiner Adresse noch die gemeinsame Bremse; darüber gilt für es dasselbe wie für jeden anderen Browser. Ein kopiertes Cookie bringt so höchstens diese wenigen Versuche.
  - Höchstens zwei Prüfungen rechnen gleichzeitig. Die Antwort auf einen Fehlversuch ist immer gleich und dauert ähnlich lang, auch vor der Einrichtung. Stammt der Hash aus einem älteren Verfahren, wird er beim nächsten Anmelden erneuert.
- **Sitzung:** Bei jeder Anmeldung entsteht ein neues Zufalls-Token. Der Browser bekommt es als Cookie (`HttpOnly`, `SameSite=Lax`, `Path=/`, bei https zusätzlich `Secure`); in der Datenbank steht nur seine Prüfsumme. Eine Sitzung gilt 30 Tage ab der letzten Benutzung, höchstens aber 90 Tage ab der Anmeldung; beides prüft der Server. Abmelden löscht die Sitzung, ein Passwortwechsel löscht alle. Beim Passwort ändern gelten höchstens 5 Versuche in 15 Minuten je Sitzung; darüber endet die Sitzung, mit der es versucht wurde, und du meldest dich neu an. Deine anderen Sitzungen zählen getrennt.
- **Untergeschobene Anfragen:** Jede Anfrage, die etwas verändert, muss genau von `APP_URL` kommen (`Origin`) und ein Prüfzeichen mitschicken, das aus deiner Sitzung abgeleitet ist und in jeder Seite steht. Beides fehlt einer fremden Seite.
- **Schutz jeder Route:** Ein Proxy vor allen Anfragen leitet ohne Einrichtung zur Einrichtung und ohne Anmeldung zur Anmeldung und beantwortet Schnittstellen ohne Sitzung mit „Nicht angemeldet“. Zusätzlich prüft jede Seite und jede Schnittstelle die Sitzung selbst. Jede Antwort trägt strenge Sicherheits-Kopfzeilen: Skripte laufen nur mit einer Nonce, die für jede Antwort neu entsteht; HSTS geht nur bei https mit.
- **Belege:** An- und Abmelden, alle Sitzungen beenden und das Passwort ändern stehen als Belege im Protokoll. Fehlversuche nicht; sie stehen nur im Zähler.

## Grenzen

- Passwort vergessen: Zurücksetzen gibt es in dieser Fassung noch nicht. Bewahre das Passwort gut auf.
- Nur ein Passwort, keine zweite Stufe (2FA ist geplant).
- Der Einrichtungs-Code liegt im Speicher des Dienstes `web`. Laufen mehrere `web`-Dienste gleichzeitig, hat jeder seinen eigenen Code.
- Die Seite für Sitzungen und Passwortwechsel kommt mit den Einstellungen; die Schnittstellen dafür gibt es schon.
- Hast du die Einrichtung abgeschlossen, lässt sie sich nicht wiederholen.

## Fehlerbehebung

| Beobachtung                                                    | Ursache                                                                                 | Was tun                                                                                   |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| „Der Einrichtungs-Code stimmt nicht.“                          | Tippfehler, oder der Code wurde inzwischen verworfen                                    | Neuesten Code aus dem Log von `web` nehmen (letzte Zeile mit „Einrichtungs-Code“)         |
| „Zu viele Versuche. Versuch es in … Sekunden …“                | 5 Fehlversuche von dieser Adresse in 15 Minuten (20 am Tag), oder viele fremde Versuche | Warten, bis die Zeit um ist; ausgesperrt: siehe „Ausgesperrt? So kommst du wieder hinein“ |
| Nach „Passwort ändern“ abgemeldet                              | 5 Versuche mit falschem aktuellem Passwort in 15 Minuten                                | Neu anmelden; nach 15 Minuten wieder versuchen                                            |
| Start bricht ab: „APP_URL fehlt“ oder „APP_URL nutzt http://…“ | `APP_URL` fehlt oder ist eine öffentliche Adresse ohne https                            | `APP_URL=https://…` setzen, https über den Proxy                                          |
| „Die Anfrage kam nicht von dieser PaiBot-Seite.“               | `APP_URL` passt nicht zur Adresse im Browser                                            | `APP_URL` genau auf die Adresse setzen, unter der du PaiBot öffnest; neu starten          |
| „Die Anfrage konnte nicht bestätigt werden.“                   | Seite war lange offen oder Cookies wurden gelöscht                                      | Seite neu laden                                                                           |
| Nach dem Anmelden sofort wieder „Anmelden“                     | Browser speichert keine Cookies, oder `APP_URL` ist https, die Seite aber http          | Cookies erlauben; PaiBot über die Adresse aus `APP_URL` öffnen                            |
| Hinweis „TRUST_PROXY ist nicht gesetzt“                        | PaiBot kennt die Adresse der Besucher nicht                                             | Hinter einem Proxy `TRUST_PROXY=1` setzen (siehe Einstellungen)                           |
| „Datenbank nicht erreichbar“ statt der Anmeldung               | Datenbank läuft nicht oder ist nicht eingerichtet                                       | Log ansehen, Datenbank starten, Seite neu laden                                           |

## Bilder neu aufnehmen

Für Mitwirkende: Alle Bilder dieser Seite entstehen per Skript aus der App im Produktions-Build, mit Wegwerf-Datenbank, dem [Test-Anbieter](entwickeln.md) und nur Beispiel-Daten. Der Ablauf steht in der [Doku-Übersicht](README.md#screenshots):

```bash
pnpm build
pnpm doku:app -- pnpm doku:screenshots   # App bereitstellen, alle Bilder aufnehmen, abräumen
pnpm doku:check
```
