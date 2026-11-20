<!--
PaiBot – Leitfaden zum Mitmachen: Ablauf, Regeln und Commit-Nachrichten.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-07
-->

# Mitmachen bei PaiBot

Schön, dass du helfen willst! 🧡 PaiBot entsteht öffentlich, Folge für Folge, als YouTube-Serie. Dieser Leitfaden zeigt dir, wie du beitragen kannst.

## Inhalt

- [Wie du helfen kannst](#wie-du-helfen-kannst)
- [Bevor du loslegst](#bevor-du-loslegst)
- [Entwicklungsumgebung](#entwicklungsumgebung)
- [Ablauf für einen Pull Request](#ablauf-für-einen-pull-request)
- [Regeln für Code und Abhängigkeiten](#regeln-für-code-und-abhängigkeiten)
- [Commit-Nachrichten](#commit-nachrichten)

## Wie du helfen kannst

| Möglichkeit         | Wie                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 🐛 Fehler melden    | [Issue „Fehler melden“](https://github.com/oliverhees/paibot/issues/new/choose) mit Schritten zum Nachstellen                  |
| 💡 Ideen einbringen | [Issue „Idee vorschlagen“](https://github.com/oliverhees/paibot/issues/new/choose) – besonders willkommen: Ideen für neue Bots |
| 📝 Doku verbessern  | Tippfehler, unklare Stellen, fehlende Erklärungen per Pull Request                                                             |
| 🛠️ Code beitragen   | kleine Verbesserungen direkt, größere Änderungen zuerst als Issue abstimmen                                                    |
| 🎥 Mitbauen         | Folgen nachbauen, Erfahrungen teilen – in der Community auf [aiianer.de](https://aiianer.de)                                   |

## Bevor du loslegst

- **Beitragsvereinbarung (CLA):** Bevor wir deinen ersten Pull Request aufnehmen, stimmst du einmal der [Beitragsvereinbarung](docs/BEITRAGSVEREINBARUNG.md) zu (§ 5 der [Lizenz](LICENSE)). Schreib dazu diesen Satz in deinen Pull Request: „Ich habe die Beitragsvereinbarung von PaiBot, Fassung 1.0, gelesen und stimme ihr für diesen und alle künftigen Beiträge zu.“ Du bleibst Urheber deines Beitrags und räumst dem Projekt die Rechte daran ein, auch für eine künftige andere Lizenzierung. Ohne Zustimmung können wir nicht mergen.
- **Für eine Person:** PaiBot steht unter einer Fair-Code-Lizenz für die Nutzung durch eine Person, privat oder für die eigene Arbeit. Beiträge, die PaiBot für mehrere Nutzer umbauen (Mehrbenutzer, Rollen, Mandanten), nehmen wir nicht auf.
- **Größere Änderungen:** bitte zuerst ein Issue eröffnen, damit wir die Richtung abstimmen. Die Roadmap folgt der YouTube-Serie.
- **Sicherheitslücken:** nie als Issue, sondern nach [SECURITY.md](SECURITY.md).

## Entwicklungsumgebung

Voraussetzungen: **Node.js 22** und **pnpm 10**.

```bash
git clone https://github.com/<dein-name>/paibot.git
cd paibot
pnpm install
pnpm dev
```

Vor jedem Pull Request lokal prüfen:

```bash
pnpm lint && pnpm headers:check && pnpm typecheck && pnpm test && pnpm build
```

Formatierungsfehler behebt `pnpm exec biome check --write .`.

## Ablauf für einen Pull Request

1. Fork anlegen und einen Branch erstellen: `feat/…`, `fix/…` oder `docs/…`
2. Änderung umsetzen, mit Tests, wo es sinnvoll ist
3. Checks lokal laufen lassen (siehe oben)
4. Beim ersten Pull Request: Zustimmung zur Beitragsvereinbarung (Satz oben)
5. Pull Request mit der Vorlage ausfüllen: was, warum, wie getestet
6. Die CI muss grün sein; danach schauen wir uns den Pull Request an

## Regeln für Code und Abhängigkeiten

- TypeScript im strikten Modus, Validierung mit Zod, Texte in der App auf Deutsch (Englisch kommt mit den Übersetzungen)
- Keine Geheimnisse (Passwörter, API-Keys) in Code, Commits oder Logs
- Neue Abhängigkeiten nur mit erlaubter Lizenz (MIT, Apache-2.0, BSD, ISC); `pnpm licenses:check` prüft das, Details in [docs/LIZENZPOLITIK.md](docs/LIZENZPOLITIK.md). Danach `pnpm licenses:notices` ausführen.
- Kein Code, keine Texte und keine Gestaltung aus fremden Projekten
- Jede neue Datei bekommt den Urheber-Kopf (Autor, Website, Copyright, Lizenz, Datum). `pnpm headers:write` fügt ihn ein, `pnpm headers:check` prüft das; ausgenommen sind Dateien, in die kein Kommentar passt (z. B. JSON) und `LICENSE`.
- Jede neue Funktion bringt ihre Doku-Seite nach der [Vorlage](docs/VORLAGE-funktion.md) mit, sonst gilt sie nicht als fertig. Das Inhaltsverzeichnis steht in [docs/README.md](docs/README.md). Screenshots entstehen aus der laufenden App (`pnpm doku:screenshots`, Liste in `docs/screenshots.json`), nicht von Hand, und zeigen nur Beispiel-Daten.

## Commit-Nachrichten

Wir nutzen [Conventional Commits](https://www.conventionalcommits.org/de/):

```
feat: neue funktion
fix: fehler behoben
docs: dokumentation
chore: wartung
```

Commits aus den Videos tragen das Format `folge-NN: schritt X – beschreibung`.

## Verhalten

Für alle gilt unser [Verhaltenskodex](CODE_OF_CONDUCT.md). Danke, dass du dabei bist!
