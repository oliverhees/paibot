<!--
PaiBot – Inhaltsverzeichnis der Dokumentation.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-08
-->

# Dokumentation

Für jeden Teil von PaiBot gibt es einen eigenen Doku-Teil. Die Doku wächst Funktion für Funktion mit: Eine neue Funktion gilt erst als fertig, wenn ihre Seite nach der [Vorlage](VORLAGE-funktion.md) dabei ist.

## Inhalt

| Bereich                                | Datei                                                                    | Stand                                       |
| -------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| Installation                           | [installation.md](installation.md)                                       | vorhanden                                   |
| Server mit Coolify                     | [deploy-coolify.md](deploy-coolify.md)                                   | vorhanden                                   |
| Aktualisieren                          | [aktualisieren.md](aktualisieren.md)                                     | vorhanden                                   |
| Sicherung                              | [sicherung.md](sicherung.md)                                             | vorhanden, Befehle ohne Oberfläche          |
| Einrichtung und Zugang                 | [funktion-einrichtung-und-zugang.md](funktion-einrichtung-und-zugang.md) | vorhanden, mit Bildern                      |
| Chat                                   | [funktion-chat.md](funktion-chat.md)                                     | vorhanden, mit Bildern                      |
| Bot                                    | [funktion-bot.md](funktion-bot.md)                                       | vorhanden, mit Bildern                      |
| Bots und Teams                         | [funktion-bots-und-teams.md](funktion-bots-und-teams.md)                 | vorhanden, mit Bildern                      |
| Team aus Vorlage                       | [funktion-team-entwurf.md](funktion-team-entwurf.md)                     | vorhanden, mit Bildern                      |
| Apps                                   | [funktion-apps.md](funktion-apps.md)                                     | vorhanden, mit Bildern                      |
| Anbieter und Modelle                   | [funktion-anbieter-und-modelle.md](funktion-anbieter-und-modelle.md)     | vorhanden, mit Bildern                      |
| Datenschleuse                          | [funktion-datenschleuse.md](funktion-datenschleuse.md)                   | vorhanden, mit Bildern; zuschaltbar         |
| Belege                                 | [funktion-belege.md](funktion-belege.md)                                 | vorhanden, mit Bildern                      |
| Das Tor und die Regeln                 | [funktion-tor.md](funktion-tor.md)                                       | vorhanden, mit Bildern                      |
| Datenbank für Teams (A)                | [funktion-datenbank-teams-a.md](funktion-datenbank-teams-a.md)           | vorhanden, ohne Oberfläche                  |
| Datenbank (Abgleich-Klasse je Tabelle) | [entwickler/datenbank.md](entwickler/datenbank.md)                       | vorhanden (Vertrag, ohne Oberfläche)        |
| Fertige Apps                           | [funktion-fertige-apps.md](funktion-fertige-apps.md)                     | vorhanden, ohne Oberfläche                  |
| Einstellungen und Info                 | [funktion-einstellungen.md](funktion-einstellungen.md)                   | vorhanden, mit Bildern                      |
| Selbsttest                             | [funktion-selbsttest.md](funktion-selbsttest.md)                         | vorhanden, mit Bildern                      |
| Architektur                            | [architektur.md](architektur.md)                                         | vorhanden, wächst mit                       |
| Hintergrund-Läufe                      | [architektur.md](architektur.md#hintergrund-läufe)                       | vorhanden (Teil der Architektur)            |
| Sicherheit                             | [sicherheit.md](sicherheit.md)                                           | vorhanden, wächst mit                       |
| Entwickeln und Testen                  | [entwickeln.md](entwickeln.md)                                           | vorhanden                                   |
| Entwickler-Doku                        | [entwickler/README.md](entwickler/README.md)                             | vorhanden, je Funktion eine Seite           |
| Doku-Index im Image                    | [entwickler/doku-index.md](entwickler/doku-index.md)                     | vorhanden (Grundlage, ohne Oberfläche)      |
| Werkzeug-Kern (Vertrag)                | [entwickler/werkzeug-kern.md](entwickler/werkzeug-kern.md)               | vorhanden (Verträge, noch ohne Werkzeug)    |
| Apps (Datenmodell)                     | [entwickler/apps-datenmodell.md](entwickler/apps-datenmodell.md)         | vorhanden (Datenbank, noch ohne Oberfläche) |
| Lizenzen der Pakete                    | [LIZENZPOLITIK.md](LIZENZPOLITIK.md)                                     | vorhanden                                   |
| Beitragsvereinbarung                   | [BEITRAGSVEREINBARUNG.md](BEITRAGSVEREINBARUNG.md)                       | vorhanden                                   |
| Vorlage für Funktion                   | [VORLAGE-funktion.md](VORLAGE-funktion.md)                               | vorhanden                                   |
| Bots im Team                           | folgt mit der Funktion                                                   | geplant                                     |
| Apps per MCP                           | folgt mit der Funktion                                                   | geplant                                     |
| Browser-Dienst                         | folgt mit der Funktion                                                   | geplant                                     |

„Mit Bildern“ heißt: Die Seite hat zu jedem Schritt in der Oberfläche ein Bild aus der laufenden App, aufgenommen per Skript mit Beispiel-Daten.

### Neu

Nach Themen geordnet, ohne Anspruch auf Vollständigkeit; die Seiten in der Tabelle oben sind maßgeblich.

**Installieren und Betrieb**

- **Coolify:** Eine eigene Compose-Datei mit erzeugten Geheimnissen und Hinweisen zu den häufigsten Stolpersteinen ([Server mit Coolify](deploy-coolify.md)).
- **Migrations-Schritt im Betrieb:** Der Einmal-Dienst `migrate` richtet Datenbank und App-Rolle ein, danach starten `web` und `worker` nur mit der App-Rolle ([Installation](installation.md)).
- **Sicherung und Wiederherstellung:** Ein Befehl sichert die Installation (Datenbank und Begleit-Datei mit Prüfsumme und Anker der Belege-Kette), ein Befehl spielt sie in eine frische Installation zurück und prüft danach Tabellen, Migrationen und die Belege-Kette ([Sicherung](sicherung.md)).
- **Aktualisieren:** Wechsel auf eine neue Version mit eigenem Bau oder fertigem Image, mit Sicherung vorher ([Aktualisieren](aktualisieren.md)).
- **Selbsttest:** Unter Einstellungen → Selbsttest siehst du, ob Adresse, Proxy, Verbindung, Kopfzeilen, Datenbank-Rolle, Migrationen und Worker richtig eingestellt sind, jeweils mit Ausweg. Ob ein Proxy davorsteht, lässt sich nicht immer feststellen; dann steht dort ein ehrlicher Hinweis ([Selbsttest](funktion-selbsttest.md)).

**Zugang und Sicherheit**

- **Einrichtungs-Code:** Er entsteht beim ersten Start und gilt 24 Stunden, längstens bis zum Ende der Einrichtung, auch wenn `web` neu startet. Ein falscher Code fällt schon im ersten Schritt der Einrichtung auf. Ist er abgelaufen, steht beim nächsten Aufruf der Einrichtung ein neuer im Log; ein neuer Lauf des Migrations-Schritts verwirft ihn sofort ([Einrichtung und Zugang](funktion-einrichtung-und-zugang.md)).
- **Bekannte Geräte und Hinweis bei neuer Anmeldung:** Liste der Browser, in denen du angemeldet warst, einzeln entfernbar; eine Leiste meldet Anmeldungen von neuen Geräten ([Einstellungen und Info](funktion-einstellungen.md), [Einrichtung und Zugang](funktion-einrichtung-und-zugang.md)).
- **Einstellungen und Info:** Passwort ändern, Geräte sehen und abmelden, Tagesgrenze und Verlaufsgrenze, Stand und Lizenz. Jede Änderung läuft durch das Tor und hat einen Beleg, den du von dort aus öffnen kannst ([Einstellungen und Info](funktion-einstellungen.md)).
- **Not-Aus:** Oben in der Seitenleiste hältst du mit einem Klick alle Bots an; eine laufende Antwort bricht sofort ab, und auf jeder Seite steht die Leiste „Alle Bots sind angehalten.“. Fortsetzen geht nur mit deinem aktuellen Passwort; beides hat einen Beleg ([Das Tor](funktion-tor.md#not-aus-alle-bots-anhalten)).

**Chat, Anbieter und Modelle**

- **Anbieter-Auswahl:** EUrouter mit deinen Routing-Regeln, Mistral AI (direkt) oder ein eigener Anbieter, schon in der Einrichtung; an jeder Antwort steht, wer laut Anbieter geantwortet hat ([Anbieter und Modelle](funktion-anbieter-und-modelle.md)).
- **Eigener Anbieter in der Oberfläche:** OpenAI-kompatible Anbieter anlegen, ändern und entfernen, auch auf deinem Rechner ([Anbieter und Modelle](funktion-anbieter-und-modelle.md)).
- **Chat-Eingabe:** Nach dem Senden bleibt der Cursor im Feld; die Leiste zeigt schon die Plätze für geplante Funktionen (gesperrt, „kommt später“). Dazu Suche in allen Unterhaltungen, Unterhaltung als Datei sichern und Antwort neu erzeugen ([Chat](funktion-chat.md)).
- **Seitenleiste mit Menü „Du“:** Unten links stehen die Werkzeuge (Belege, Regeln, Datenschleuse, Modell und Anbieter, Apps), ein- und ausklappbar. Der Knopf „Du“ öffnet Zugang, Einstellungen, Neuigkeiten, Hilfe (Dokumentation, Roadmap, Selbsttest), Info und Abmelden ([Einstellungen und Info](funktion-einstellungen.md)).

**Belege und Tor**

- **Belege ansehen und prüfen:** Liste aller Belege, ein Beleg als eigene Seite, „Ganze Kette prüfen“ im Browser, Anker sichern und vergleichen, Export für `pnpm belege:pruefen` ([Belege](funktion-belege.md)).
- **Belege filtern und Schlüssel ansehen:** Filter nach Aktion und Unterhaltung (auch als Lesezeichen), Kasten „Schlüssel dieser Installation“ mit Kurzform ([Belege](funktion-belege.md)).
- **Apps:** Auf der Seite „Apps“ verbindest du MCP-Server mit öffentlicher https-Adresse, siehst den Text jedes Werkzeugs, stufst es selbst ein und gibst einem Bot höchstens Lese-Zugriff ([Apps](funktion-apps.md)). Gegen echte Server ist das noch nicht geprüft.
- **Regeln:** Die Seite „Regeln“ zeigt die fest eingebauten Regeln, Grenzen und Vorbedingungen des Tors. Regeln kommen nur mit einem Update von PaiBot; die App selbst darf sie nur lesen ([Das Tor](funktion-tor.md)).

**Doku selbst**

- **Entwickler-Doku:** Zu jeder Funktion gibt es eine Seite für Entwickler mit Aufbau, Datenmodell, Schnittstellen, Sicherheit, Tests und bekannten Schwächen; jede Aussage nennt die Stelle im Code ([Entwickler-Doku](entwickler/README.md)).
- **Bilder für alle Funktionsseiten:** Chat, Bot, Anbieter und Modelle, Datenschleuse, Belege, Regeln sowie Einstellungen und Info zeigen jeden Schritt mit einem Bild aus der laufenden App, aufgenommen per Skript in einer Beispiel-Umgebung ([Screenshots](#screenshots)).

**Noch nicht in dieser Fassung** (siehe [Sicherheit](sicherheit.md)): ein Notfall-Zugang (ein vergessenes Passwort lässt sich nicht zurücksetzen), ein zweiter Faktor beim Anmelden und die erneute Bestätigung heikler Aktionen.

Die Doku ist auch unter https://paibot.de/doku zu lesen.

## Screenshots

Die Bilder liegen in `docs/assets/screenshots/`. Sie werden nicht von Hand gemacht, sondern aus der laufenden App aufgenommen, damit sie nach Änderungen neu entstehen können und nicht veralten. **Sie zeigen nur Beispiel-Daten**: erfundene Namen und Texte, Wegwerf-Passwort, Test-Anbieter auf dem eigenen Rechner. Nie echte Namen, Adressen, Schlüssel oder Unterhaltungen.

| Was                 | Wo                                                                           |
| ------------------- | ---------------------------------------------------------------------------- |
| Liste der Aufnahmen | [screenshots.json](screenshots.json)                                         |
| Aufnahme-Skript     | `scripts/doku-screenshots.mjs` (Prüfung der Liste: `scripts/doku/liste.mjs`) |
| App bereitstellen   | `scripts/doku/app.mjs`                                                       |
| Beispiel-Daten      | `scripts/doku-beispieldaten.mjs`                                             |

So geht es (einmalig vorher `pnpm build`, damit die App im Produktions-Build vorliegt):

1. `pnpm doku:app -- pnpm doku:screenshots` stellt die App bereit, nimmt alle Bilder auf und räumt danach alles wieder ab. Einzelne Bilder: Namen anhängen, z. B. `pnpm doku:app -- pnpm doku:screenshots anmelden app-start`.
2. Neue Bilder ansehen.
3. `pnpm doku:check` ausführen und die Bilder mit der Änderung committen.

Wer die App zwischendurch selbst ansehen will, startet sie getrennt: `pnpm doku:app` in einem Terminal (läuft bis Strg+C), dann in einem zweiten `pnpm doku:beispieldaten` (richtet ein und füllt Beispiele ein) oder `pnpm doku:screenshots`. Adresse, Code und Wegwerf-Passwort stehen in der Lauf-Datei, deren Ort `pnpm doku:app` beim Start nennt.

Was `pnpm doku:app` tut:

- Es startet eine frische Wegwerf-Datenbank: einen eigenen Postgres aus den Programmen des Systems (`initdb`, `pg_ctl`; als root über den Benutzer `postgres`) oder, wenn `PAIBOT_DOKU_DATABASE_URL` auf einen Wegwerf-Server zeigt, eine eigene Datenbank dort. Sie heißt immer `paibot_doku_<zufall>` und trägt einen Vermerk; gelöscht wird am Ende nur, was beides hat. Eine andere Datenbank fasst das Skript nie an.
- Es startet den [Test-Anbieter](entwickeln.md) nur an `127.0.0.1` auf Port 18097 (anders: `PAIBOT_DOKU_ANBIETER_PORT`; die Adresse steht auf der Seite „Modell und Anbieter“), mit erfundenen Modellen und einem Wegwerf-Schlüssel. Vor jeder Aufnahme stellt das Aufnahme-Skript sein Grund-Verhalten wieder her.
- Es startet eine Beispiel-Datenschleuse: eine kleine lokale Attrappe nur an `127.0.0.1`, die dem Worker „bereit“, „Schlüssel passt nicht“ oder „nicht erreichbar“ meldet und Chat-Anfragen unverändert an den Test-Anbieter weiterreicht. Sie maskiert nichts und ist nur für die Bilder da. Der Worker startet ohne sie („nicht eingerichtet“), bis eine Aufnahme mit `datenschleuse` ihn neu starten lässt.
- Es startet Web-App und Worker im Produktions-Build, so wie Nutzer die App sehen, mit zufällig erzeugten Geheimnissen und ohne Werte aus deiner Umgebung, und liest den Einrichtungs-Code aus dem Log.
- Web-App und Worker laufen dabei mit einer Beispiel-Uhr (`scripts/doku/beispiel-uhr.mjs`): Sie beginnt am 20.11.2026 um 14:31 und läuft tausendmal langsamer als die echte. So zeigen Belege, Sitzungen und der Zustand der Datenschleuse bei jedem Lauf dieselben Zeiten. Zeiten, die die Datenbank selbst setzt (etwa an Nachrichten im Chat), bleiben echt; solche Stellen blendet `verdecke` aus.
- Am Ende (auch bei Strg+C oder Fehler) beendet es alle Prozesse, löscht Datenbank, temporäre Ordner und Lauf-Datei.

Gut zu wissen:

- Das Skript braucht [Playwright](https://playwright.dev), das nicht zum Projekt gehört. Einmalig: `npm install -g playwright && npx playwright install chromium`.
- Ohne `pnpm doku:app` nimmt es die App unter `PAIBOT_URL` auf (Standard `http://127.0.0.1:3000`); Aufnahmen mit `zustand` oder `anmeldung` gehen dann nicht. Es bricht ab, wenn die Adresse nicht auf den eigenen Rechner zeigt. Bewusste Ausnahme: `--erlaube-fremde-url`.
- Ruhige, gleiche Bilder ohne Eingriff in die Seite: feste Uhrzeit im Browser, reduzierte Bewegung, Animationen und Textcursor beim Bild angehalten, Schriften geladen, Ruhe im Netz. Es fügt keinen Stil in die Seite ein; die Content-Security-Policy der App bleibt wirksam.
- Eine Aufnahme scheitert bei einem Fehler in der Seite, einer Meldung der Content-Security-Policy, einem Fehler oder einer Warnung in der Konsole, einer Anfrage an einen fremden Host, seitlichem Scrollen oder wenn die Schrift „Inter“ fehlt. So prüft jeder Lauf auch die App.

Felder einer Aufnahme (Pflicht sind nur `name` und `pfad`):

| Feld                     | Wofür                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`, `pfad`           | Dateiname ohne Endung und Seite in der App, z. B. `"/anmelden"`.                                                                                                                                                                                                                                                                                                         |
| `zustand`                | `"frisch"` (nicht eingerichtet), `"eingerichtet"` oder `"mit-beispieldaten"`. Das Skript ordnet die Aufnahmen so, dass jeder Zustand nur einmal hergestellt wird, und stellt ihn über die echten Wege der App her.                                                                                                                                                       |
| `anmeldung`              | `true`: Die Aufnahme ist angemeldet (eine Sitzung je Lauf, über die Seite „Anmelden“). Braucht `zustand` „eingerichtet“ oder „mit-beispieldaten“.                                                                                                                                                                                                                        |
| `danach`                 | `"eingerichtet"`: Die Schritte dieser frischen Aufnahme schließen die Einrichtung selbst ab (Bild „Alles bereit“). Höchstens einmal.                                                                                                                                                                                                                                     |
| `vorher`                 | Schritte vor der Aufnahme, der Reihe nach (siehe unten).                                                                                                                                                                                                                                                                                                                 |
| `warteAuf`, `ausschnitt` | CSS-Selector, auf den gewartet wird, bzw. das Element, das allein aufgenommen wird.                                                                                                                                                                                                                                                                                      |
| `status`                 | Erwarteter HTTP-Status der Seite, Standard 200 (z. B. 404 für die Fehlerseite).                                                                                                                                                                                                                                                                                          |
| `breite`, `hoehe`        | Fenster in Pixeln (Standard 1280 × 800; die Doku nutzt 1440 × 900 am Rechner und 390 × 844 am Handy).                                                                                                                                                                                                                                                                    |
| `thema`                  | `"dunkel"` (Standard) oder `"hell"`.                                                                                                                                                                                                                                                                                                                                     |
| `skalierung`             | Pixeldichte von 1 bis 3, Standard 2.                                                                                                                                                                                                                                                                                                                                     |
| `modus`                  | `"app"` (Standard) oder `"entwicklung"` für Seiten, die es nur mit `next dev` gibt: Das Skript startet den Entwicklungs-Server selbst (ohne Datenbank) und beendet ihn danach. Mit `PAIBOT_DEV_URL` nutzt es einen laufenden.                                                                                                                                            |
| `datenschleuse`          | Zustand der Datenschleuse in der Beispiel-Umgebung: `"aus"` (Standard, nicht eingerichtet), `"bereit"`, `"schluessel_falsch"` oder `"nicht_erreichbar"`. Dafür startet `pnpm doku:app` den Worker mit einer kleinen lokalen Attrappe der Datenschleuse neu (`scripts/doku/schleuse-attrappe.mjs`). Nur mit `zustand`.                                                    |
| `verdecke`               | Liste von CSS-Selectoren für Stellen, die sich bei jedem Lauf ändern (Uhrzeit des Servers, Prüfsummen, Signaturen). Das Skript füllt sie im fertigen Bild mit der Farbe ihrer Umgebung (`scripts/doku/png.mjs`), damit ein zweiter Lauf dasselbe Bild liefert; die Seite selbst bleibt unverändert. Neben CSS gehen Selectoren von Playwright wie `dd:has-text("blg_")`. |

Schritte in `vorher` (je Schritt genau eine Aktion):

| Schritt                                                                            | Wirkung                                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `{ "klick": "<CSS>" }` oder `{ "klick": { "rolle": "button", "name": "Weiter" } }` | klickt                                                             |
| `{ "tippe": "<Beschriftung des Felds>", "text": "…" }`                             | füllt das Feld mit dieser Beschriftung                             |
| `{ "taste": "Enter" }`                                                             | drückt eine Taste                                                  |
| `{ "warteAuf": "<CSS>" }`, `{ "warteAufText": "…" }`                               | wartet auf ein Element bzw. einen sichtbaren Text                  |
| `{ "gehe": "/pfad" }`                                                              | öffnet eine andere Seite                                           |
| `{ "ablauf": "<name>" }`                                                           | setzt eine benannte Folge aus `"ablaeufe"` (oben in der Liste) ein |
| `{ "zeige": "<CSS>" }` (Ziel auch als Objekt)                                      | scrollt das Element in den sichtbaren Bereich                      |
| `{ "anbieter": { "reply": "…", "chunkChars": 40, "chunkDelayMs": 60000 } }`        | ändert das Verhalten des Test-Anbieters nur für diese Aufnahme     |

Ziele als Objekt: genau eines von `css`, `beschriftung`, `rolle` (mit `name`) oder `text`, dazu `"genau": false` für Teil-Treffer und `"nr": 0` für den ersten von mehreren Treffern. Für `text` gibt es Sonderwerte, damit nie ein Geheimnis in der Liste steht: `$einrichtungs-code` (Code aus dem Log), `$passwort` (Wegwerf-Passwort des Laufs), `$anbieter-schluessel` (Schlüssel des Test-Anbieters).

Nach jeder Änderung an Doku oder Screenshots gehört `pnpm doku:check` dazu. Es prüft, ob jede Funktionsseite alle Pflicht-Abschnitte der Vorlage hat, ob es zu jeder Funktionsseite die Entwickler-Seite `entwickler/<name>.md` mit den Abschnitten aus [entwickler/VORLAGE.md](entwickler/VORLAGE.md) gibt, ob jeder Datei-Verweis in den Entwickler-Seiten auf eine vorhandene Datei zeigt, ob `screenshots.json` gültig ist, ob irgendwo ein Wert steht, der wie ein Geheimnis aussieht (Schlüssel, Token, Passwort in einer Adresse), ob „So sieht es aus“ einen Screenshot oder einen gültigen Vermerk enthält, ob jedes Bild und jeder Link existiert, ob jeder Screenshot in `screenshots.json` eingetragen ist und ob jede Seite unter `docs/` in dieser Datei verlinkt ist. Es liest dazu jede Seite mit einem Markdown-Parser und lehnt ab, was auf der dargestellten Seite nichts anzeigt: rohes HTML und HTML-Kommentare (außer dem Urheber-Kopf ganz am Anfang einer Seite), Link-Definitionen und Fußnoten, Zeichenreferenzen wie `&#x41;` außerhalb von Code, einen Zusatz hinter der Sprache eines Codeblocks, Kommentare und Screenreader-Texte in Diagrammen sowie unsichtbare und Bidi-Zeichen. Es lehnt außerdem ab: Seiten unter `docs/`, die in keiner der beiden Listen in `scripts/doku-umfang.mjs` stehen („in den Index“ für die Anwender-Doku, „nicht in den Index“ mit Grund), und in den Seiten der ersten Liste typische Formulierungen eingeschleuster Anweisungen (nur eine Stichprobe, kein Schutz). Jede neue Seite unter `docs/` gehört deshalb in eine der beiden Listen. Fehler brechen ab; Warnungen zeigen offene Punkte (etwa „folgt mit der Oberfläche“). Mit `pnpm doku:check --streng` zählen auch Warnungen als Fehler, das gilt für einen fertigen Stand.

## Neue Doku-Seite anlegen

1. `docs/VORLAGE-funktion.md` kopieren, z. B. nach `docs/funktion-<name>.md`.
2. Alle Abschnitte ausfüllen (nichts behaupten, was der Code nicht kann).
3. `entwickler/VORLAGE.md` nach `docs/entwickler/<name>.md` kopieren und für Entwickler beschreiben, wie die Funktion gebaut ist; jede Aussage mit Pfad im Code belegen.
4. Die Seite in der Tabelle oben eintragen.
5. Screenshots in `screenshots.json` eintragen und mit `pnpm doku:screenshots` aufnehmen.

PaiBot wird entwickelt von [HR CodeLabs](https://hr-codelabs.de).
