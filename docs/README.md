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

| Bereich              | Datei                                              | Stand                 |
| -------------------- | -------------------------------------------------- | --------------------- |
| Installation         | [installation.md](installation.md)                 | vorhanden             |
| Server mit Coolify   | [deploy-coolify.md](deploy-coolify.md)             | vorhanden             |
| Architektur          | [architektur.md](architektur.md)                   | vorhanden, wächst mit |
| Lizenzen der Pakete  | [LIZENZPOLITIK.md](LIZENZPOLITIK.md)               | vorhanden             |
| Beitragsvereinbarung | [BEITRAGSVEREINBARUNG.md](BEITRAGSVEREINBARUNG.md) | vorhanden             |
| Vorlage für Funktion | [VORLAGE-funktion.md](VORLAGE-funktion.md)         | vorhanden             |
| Datenschleuse        | folgt mit der Funktion                             | geplant               |
| Bots und Team        | folgt mit der Funktion                             | geplant               |
| Apps per MCP         | folgt mit der Funktion                             | geplant               |
| Browser-Dienst       | folgt mit der Funktion                             | geplant               |
| Hintergrund-Jobs     | folgt mit der Funktion                             | geplant               |

Die Doku ist auch unter https://paibot.de/doku zu lesen.

## Screenshots

Die Bilder liegen in `docs/assets/screenshots/`. Sie werden nicht von Hand gemacht, sondern aus der laufenden App aufgenommen, damit sie nach Änderungen neu entstehen können und nicht veralten.

| Was                 | Wo                                                                       |
| ------------------- | ------------------------------------------------------------------------ |
| Liste der Aufnahmen | [screenshots.json](screenshots.json) (Name, Pfad, Größe, Wartebedingung) |
| Skript              | `scripts/doku-screenshots.mjs`                                           |
| Alle neu aufnehmen  | `pnpm doku:screenshots`                                                  |
| Eine neu aufnehmen  | `pnpm doku:screenshots startseite`                                       |

So geht es:

1. App lokal starten, mit Beispiel-Daten (Standard-Adresse `http://127.0.0.1:3000`, sonst `PAIBOT_URL` setzen).
2. `pnpm doku:screenshots` ausführen.
3. Neue Bilder ansehen und mit der Änderung committen.

Gut zu wissen:

- Das Skript braucht [Playwright](https://playwright.dev), das nicht zum Projekt gehört. Einmalig: `npm install -g playwright && npx playwright install chromium`.
- Es bricht ab, wenn `PAIBOT_URL` nicht auf den eigenen Rechner zeigt. So werden keine echten Daten fotografiert. Bewusste Ausnahme: `--erlaube-fremde-url`.
- Heute gibt es nur das dunkle Design.

## Neue Doku-Seite anlegen

1. `docs/VORLAGE-funktion.md` kopieren, z. B. nach `docs/funktion-<name>.md`.
2. Alle Abschnitte ausfüllen (nichts behaupten, was der Code nicht kann).
3. Die Seite in der Tabelle oben eintragen.
4. Screenshots in `screenshots.json` eintragen und mit `pnpm doku:screenshots` aufnehmen.

PaiBot wird entwickelt von [HR CodeLabs](https://hr-codelabs.de).
