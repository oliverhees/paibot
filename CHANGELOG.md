<!--
PaiBot – Änderungsprotokoll mit den Neuerungen pro Stand.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-08
-->

# Changelog

Alle wichtigen Änderungen an PaiBot, nach Themen sortiert: zuerst der Stand, der noch nicht veröffentlicht ist, darunter die früheren Bausteine.

## Noch nicht veröffentlicht

PaiBot ist im Bau. Mit diesem Stand lässt sich PaiBot einrichten und benutzen: Einrichtung und Anmeldung, Chat mit deinem Bot und die Seiten für Belege, Regeln, Modell und Anbieter, Datenschleuse, Bot sowie Einstellungen und Info. Eine veröffentlichte Version gibt es noch nicht.

### Hinzugefügt

- Einrichtung im Browser mit Einrichtungs-Code, Anmeldung mit Passwort, Sitzungen und Schutz vor zu vielen Versuchen ([Doku](docs/funktion-einrichtung-und-zugang.md))
- Chat mit deinem Bot: Antwort Stück für Stück, Stopp, Beleg zu jeder Antwort in der Arbeitsfläche, Datenschleuse je Unterhaltung, Umbenennen und Löschen ([Doku](docs/funktion-chat.md))
- Seiten „Bot“ (Name, Anweisung, Aussehen, was der Bot darf), „Modell und Anbieter“ (Schlüssel testen, ersetzen, entfernen, Modell wählen) und „Datenschleuse“ (Zustand vom Worker, Standard für neue Unterhaltungen) ([Bot](docs/funktion-bot.md), [Anbieter und Modelle](docs/funktion-anbieter-und-modelle.md), [Datenschleuse](docs/funktion-datenschleuse.md))
- Seiten „Belege“ (Liste, Filter nach Aktion und Unterhaltung, ganze Kette im Browser prüfen, Anker, Schlüssel der Installation, Export) und „Regeln“ ([Belege](docs/funktion-belege.md), [Das Tor](docs/funktion-tor.md))
- Einstellungen (Passwort, Sitzungen, Tagesbudget, Verlaufsgrenze, Zeitzone) und Info ([Doku](docs/funktion-einstellungen.md))
- Anbieter-Auswahl in der Einrichtung und auf „Modell und Anbieter“: EUrouter mit deinen Routing-Regeln, Mistral AI (direkt) oder ein eigener bzw. lokaler Anbieter; an jeder Antwort steht, wer laut Anbieter geantwortet hat, und die Angaben zu Ort und Bedingungen nennen ihren Stand ([Anbieter und Modelle](docs/funktion-anbieter-und-modelle.md))
- Eigener Anbieter in der Oberfläche: OpenAI-kompatible Dienste anlegen, ändern und entfernen, auch auf deinem Rechner oder in deinem Netz (Ort „lokal“, Schlüssel dort freiwillig)
- Das erste Werkzeug: Pai schlägt in der Doku der installierten Version nach, ohne zu fragen und mit Beleg; die Werkzeug-Zeile im Chat zeigt die Quellen oder „nichts gefunden“, der Knopf „Schritte“ blendet Werkzeug- und Beleg-Zeilen aus und ein, vorläufiger Text steht gekennzeichnet über der Antwort ([Chat](docs/funktion-chat.md#so-benutzt-du-es), [Bot](docs/funktion-bot.md))
- Chat: Unterhaltungen durchsuchen (Titel und Nachrichten), eine Unterhaltung als Datei sichern, eine Antwort neu erzeugen (auch mit einem anderen Modell, mit Blättern zwischen den Fassungen) ([Chat](docs/funktion-chat.md))
- Not-Aus als Schalter: alle Bots mit einem Klick anhalten, Fortsetzen nur mit deinem Passwort, beides mit Beleg ([Das Tor](docs/funktion-tor.md#not-aus-alle-bots-anhalten))
- Selbsttest „Ist meine Installation richtig eingestellt?“: Adresse, Proxy, Verbindung, Kopfzeilen, Datenbank-Rolle, Migrationen, Worker und mehr, jeweils mit Ausweg ([Selbsttest](docs/funktion-selbsttest.md))
- Bekannte Geräte unter Einstellungen → Zugang und ein Hinweis bei der Anmeldung von einem neuen Gerät ([Einstellungen und Info](docs/funktion-einstellungen.md))
- Sicherung und Wiederherstellung mit je einem Befehl, mit Prüfung der Belege-Kette danach ([Sicherung](docs/sicherung.md))
- Neue Oberfläche des Chats: Menü „Du“ unten in der Seitenleiste, einklappbare Werkzeuge, Plätze für geplante Funktionen in der Eingabe-Leiste, helles und dunkles Design
- Compose-Datei für Coolify mit erzeugten Geheimnissen (`deploy/docker-compose.coolify.yml`, [Doku](docs/deploy-coolify.md))
- Entwickler-Doku: zu jeder Funktion eine Seite mit Aufbau, Datenmodell, Schnittstellen, Sicherheit, Tests und bekannten Schwächen; `pnpm doku:check` prüft sie mit ([Entwickler-Doku](docs/entwickler/README.md))
- Lauf-Steuerung: eine Nachricht wird über das Tor zur Antwort, mit Belegen, Grenzen und Aufräumen hängender Läufe
- Doku mit Bildern aus der laufenden App für alle Funktionsseiten, aufgenommen per Skript in einer Beispiel-Umgebung (`pnpm doku:app -- pnpm doku:screenshots`); Anleitung zum Aktualisieren ([Doku](docs/aktualisieren.md))
- Das Tor: jede Aktion läuft durch feste Regeln und Grenzen ohne KI, mit Vorbedingungen und Nachweis je Aktion ([Doku](docs/funktion-tor.md))
- Das Beleg-Protokoll: verkettete, signierte Belege zu jeder Entscheidung, Prüfer mit `pnpm belege:pruefen`, Anker und Nachrechnen mit dem damaligen Regelstand ([Doku](docs/funktion-belege.md))
- Verschlüsselung für gespeicherte Schlüssel, Passwörter, Tokens und Signaturen ([Doku](docs/sicherheit.md))
- Datenbank für Werkzeug-Aufrufe: Angaben zu Werkzeug, Schritt und Kennzeichen an jedem Aufruf, Zwischentexte und Herkunft an Nachrichten, feste Grenzen für Läufe mit Werkzeugen, gespeicherte Regel R-010; Nachrichten werden nur noch mit ihrer Unterhaltung gelöscht ([Entwickler-Doku](docs/entwickler/werkzeug-kern.md)). Beim Update werden Ausgabegrenzen über 200 000 auf 200 000 gesetzt; die Grenze für Token je Lauf passt sich der höchsten Ausgabegrenze an.
- Anbieter und Modelle mit Ausgangs-Liste ([Doku](docs/funktion-anbieter-und-modelle.md))
- Motor: ein Baustein, der eine Antwort vom Modell abholt, Stück für Stück, und sich abbrechen lässt
- Warteschlange für Läufe, je Unterhaltung der Reihe nach
- Worker-Prozess im selben Image wie die Web-App: führt die Läufe aus und meldet den Zustand der Datenschleuse
- Live-Ereignisse je Unterhaltung mit Nachholen nach einer Unterbrechung
- Zugriffsfunktionen auf die Datenbank je Bereich und alle Tabellen der Basis
- Design und Bausteine der Oberfläche (Farben, App-Rahmen, Grundkomponenten) und lokal eingebundene Schriften
- Release-Ablauf: Ein Tag `v*` baut das Image für `linux/amd64` und `linux/arm64` mit Herkunftsnachweis und SBOM und veröffentlicht es auf `ghcr.io/oliverhees/paibot`; `deploy/docker-compose.image.yml` startet PaiBot aus dem fertigen Image mit fester Version (`PAIBOT_VERSION`), nutzbar ab der ersten veröffentlichten Version ([Doku](docs/installation.md#mit-fertigem-image))
- Grundlage für „Als Web-App installieren“ (Manifest und Symbole)
- Datenschleuse als zuschaltbarer Dienst in Docker Compose (Profil `schleuse`, Standard: aus), Konfiguration mit `pnpm schleuse:config`
- Test-Anbieter für Entwicklung und Tests, Durchstich-Test über alle Bausteine
- Eigene 404-Seite im Design der App
- `pnpm doku:check` prüft die Doku (Pflicht-Abschnitte, Bilder, Links)

### Geändert

- Die Lauf-Steuerung kann mehrere Schritte je Antwort machen; jeder Schritt und jeder spätere Werkzeug-Aufruf geht einzeln durchs Tor, mit den Grenzen aus den Einstellungen. Ein Werkzeug gibt es: das Nachschlagen in der Doku; ohne Wunsch des Modells macht eine Antwort weiter genau einen Schritt, nur ihr Text erscheint erst am Ende als Ganzes ([Chat](docs/funktion-chat.md), [Das Tor](docs/funktion-tor.md))
- Verlauf, Suche, „Neu erzeugen“ und die gesicherte Datei zeigen nur deine Nachrichten und die End-Antworten, nie Zwischentexte eines Laufs mit Werkzeugen
- Die Länge einer Antwort folgt zusätzlich der Grenze „Token je Antwort“ ([Chat](docs/funktion-chat.md#grenzen))
- Wünscht ein Modell ein Werkzeug, das es nicht gibt, ist jeder Wunsch mit Beleg abgelehnt; die Antwort endet mit „Dieses Werkzeug gibt es hier nicht.“
- Die Datenbank hat getrennte Rollen für Migrationen und für die App; die App läuft mit der eingeschränkten Rolle ([Installation](docs/installation.md))
- Docker Compose: internes Netz für die Datenbank, Pflichtwerte, gehärtete Container, Healthchecks für Web-App und Worker
- Die Tests laufen auch gegen eine echte Postgres-Datenbank (eine Variable genügt, siehe [Entwickeln und Testen](docs/entwickeln.md))

### Sicherheit

- Eine Unterhaltung, die als Datei gesichert wird, zeigt HTML, Bilder und Steuerzeichen nur als Text
- Findet der Lauf Not-Aus und Stopp nicht mehr lesbar (Datenbank weg), hält er an
- Die App verbindet sich mit einer eingeschränkten Datenbank-Rolle; Belege, Regeln und Schlüssel lassen sich darüber nur anhängen, nicht ändern oder löschen
- Der Start bricht im Betrieb ab, wenn Pflichtwerte fehlen, zu schwach sind oder die Datenbank-Rechte zu weit gehen
- Die Web-App sendet Schutz-Kopfzeilen mit strenger Content-Security-Policy
- Gespeicherte Schlüssel sind an ihren Datensatz gebunden; Anfragen an das Modell gehen nur an die freigegebene Adresse
- Die Bereinigung der Ein- und Ausgaben von Werkzeugen entfernt alle Zeichen, die Unicode als standardmäßig unsichtbar führt, und behandelt den Schlüssel `__proto__` sicher

### Behoben

- Das Aufräumen nach einem abgebrochenen Lauf schreibt nach einer abgelehnten Aktion das Ergebnis „abgelehnt“ und bricht nicht mehr ab
- Der Einrichtungs-Code wird schon im ersten Schritt der Einrichtung geprüft, nicht erst beim Verbindungstest oder am Ende
- Der Selbsttest sagt bei „Proxy“ nur noch „In Ordnung“, wenn ein Proxy erkennbar ist; sonst steht dort „nicht feststellbar“
- Das Docker-Image enthält jetzt den Ordner `public` (Schriften und Symbole)
- Test-Server schließen ruhende Verbindungen nicht mehr nach fünf Sekunden

### Lizenz

- Die Fair-Code-Lizenz ist jetzt Version 1.1: Forks sind erlaubt, wenn sie kostenlos bleiben, einen eigenen Namen tragen und „Powered by PaiBot“ mit Verweis auf paibot.de zeigen. Kurse, Bücher, Videos und Beratung bleiben erlaubt, bezahlter Betrieb oder Support für andere nicht. Dazu gibt es eine [Beitragsvereinbarung](docs/BEITRAGSVEREINBARUNG.md). Maßgeblich ist der Text in `LICENSE`.
- Die Fair-Code-Lizenz ist Version 1.0 (kein Entwurf mehr) und gilt jetzt für die Nutzung durch eine Person, privat und für die eigene Arbeit. Die Nutzung mit mehreren Personen (Team, Unternehmen) braucht eine gesonderte Lizenz.

## Server-Grundlage

- Datenbank-Paket mit Drizzle, erster Migration und Test (PGlite)
- Migrationen laufen beim Start der Web-App
- Healthcheck meldet den Zustand der Datenbank (`ok`, `down`, `not_configured`)
- Startseite im PaiBot-Look mit Statusanzeige
- Docker-Image, Docker Compose mit Postgres, Anleitung für Coolify
- CI baut und startet den Stack und prüft den Healthcheck

## Gerüst

- Monorepo mit pnpm, Turborepo, Biome und TypeScript
- Minimale Web-App mit Healthcheck (`/api/health`)
- PaiBot Fair-Code-Lizenz (Entwurf, nur private Nutzung), README, Beitragsleitfaden, Sicherheitsrichtlinie, Verhaltenskodex
- Lizenz-Check der Abhängigkeiten und automatisch erzeugte `THIRD_PARTY_NOTICES.md`
- CI mit Lint, Typecheck, Tests, Build und Lizenz-Check
