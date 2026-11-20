<!--
PaiBot – Änderungsprotokoll mit den Neuerungen pro Stand.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-08
-->

# Changelog

Alle wichtigen Änderungen an PaiBot, sortiert nach Folge der YouTube-Serie. Jede Folge hat einen eigenen Git-Tag.

## Noch nicht veröffentlicht

PaiBot ist im Bau: Diese Neuerungen sind Bausteine im Hintergrund. In der Oberfläche siehst du davon noch nichts außer der Startseite.

### Hinzugefügt

- Das Tor: jede Aktion läuft durch feste Regeln und Grenzen ohne KI, mit Vorbedingungen und Nachweis je Aktion ([Doku](docs/funktion-tor.md))
- Das Beleg-Protokoll: verkettete, signierte Belege zu jeder Entscheidung, Prüfer mit `pnpm belege:pruefen`, Anker und Nachrechnen mit dem damaligen Regelstand ([Doku](docs/funktion-belege.md))
- Verschlüsselung für gespeicherte Schlüssel, Passwörter, Tokens und Signaturen ([Doku](docs/sicherheit.md))
- Anbieter und Modelle mit Ausgangs-Liste ([Doku](docs/funktion-anbieter-und-modelle.md))
- Motor: ein Baustein, der eine Antwort vom Modell abholt, Stück für Stück, und sich abbrechen lässt
- Warteschlange für Läufe, je Unterhaltung der Reihe nach
- Worker-Prozess im selben Image wie die Web-App: holt Aufträge aus der Warteschlange ab; die Ausführung der Läufe ist noch im Bau
- Live-Ereignisse je Unterhaltung mit Nachholen nach einer Unterbrechung (Baustein, noch nicht an die Anmeldung angeschlossen)
- Zugriffsfunktionen auf die Datenbank je Bereich und alle Tabellen der Basis
- Design und Bausteine der Oberfläche (Farben, App-Rahmen, Grundkomponenten) und lokal eingebundene Schriften
- Grundlage für „Als Web-App installieren“ (Manifest und Symbole)
- Datenschleuse als zuschaltbarer Dienst in Docker Compose (Profil `schleuse`, Standard: aus), Konfiguration mit `pnpm schleuse:config`
- Test-Anbieter für Entwicklung und Tests, Durchstich-Test über alle Bausteine
- Eigene 404-Seite im Design der App
- `pnpm doku:check` prüft die Doku (Pflicht-Abschnitte, Bilder, Links)

### Geändert

- Die Datenbank hat getrennte Rollen für Migrationen und für die App; die App läuft mit der eingeschränkten Rolle ([Installation](docs/installation.md))
- Docker Compose: internes Netz für die Datenbank, Pflichtwerte, gehärtete Container, Healthchecks für Web-App und Worker
- Die Tests laufen auch gegen eine echte Postgres-Datenbank (eine Variable genügt, siehe [Entwickeln und Testen](docs/entwickeln.md))

### Sicherheit

- Die App verbindet sich mit einer eingeschränkten Datenbank-Rolle; Belege, Regeln und Schlüssel lassen sich darüber nur anhängen, nicht ändern oder löschen
- Der Start bricht im Betrieb ab, wenn Pflichtwerte fehlen, zu schwach sind oder die Datenbank-Rechte zu weit gehen
- Die Web-App sendet Schutz-Kopfzeilen mit strenger Content-Security-Policy
- Gespeicherte Schlüssel sind an ihren Datensatz gebunden; Anfragen an das Modell gehen nur an die freigegebene Adresse

### Behoben

- Das Docker-Image enthält jetzt den Ordner `public` (Schriften und Symbole)
- Test-Server schließen ruhende Verbindungen nicht mehr nach fünf Sekunden

## Lizenz

- Die Fair-Code-Lizenz ist jetzt Version 1.1: Forks sind erlaubt, wenn sie kostenlos bleiben, einen eigenen Namen tragen und „Powered by PaiBot“ mit Verweis auf paibot.de zeigen. Kurse, Bücher, Videos und Beratung bleiben erlaubt, bezahlter Betrieb oder Support für andere nicht. Dazu gibt es eine [Beitragsvereinbarung](docs/BEITRAGSVEREINBARUNG.md). Maßgeblich ist der Text in `LICENSE`.
- Die Fair-Code-Lizenz ist Version 1.0 (kein Entwurf mehr) und gilt jetzt für die Nutzung durch eine Person, privat und für die eigene Arbeit. Die Nutzung mit mehreren Personen (Team, Unternehmen) braucht eine gesonderte Lizenz.

## Folge 2 – Server

- Datenbank-Paket mit Drizzle, erster Migration und Test (PGlite)
- Migrationen laufen beim Start der Web-App
- Healthcheck meldet den Zustand der Datenbank (`ok`, `down`, `not_configured`)
- Startseite im PaiBot-Look mit Statusanzeige
- Docker-Image, Docker Compose mit Postgres, Anleitung für Coolify
- CI baut und startet den Stack und prüft den Healthcheck

## Folge 0 – Gerüst

- Monorepo mit pnpm, Turborepo, Biome und TypeScript
- Minimale Web-App mit Healthcheck (`/api/health`)
- PaiBot Fair-Code-Lizenz (Entwurf, nur private Nutzung), README, Beitragsleitfaden, Sicherheitsrichtlinie, Verhaltenskodex
- Lizenz-Check der Abhängigkeiten und automatisch erzeugte `THIRD_PARTY_NOTICES.md`
- CI mit Lint, Typecheck, Tests, Build und Lizenz-Check
