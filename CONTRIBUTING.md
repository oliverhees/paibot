# Mitmachen bei Paibot

Schön, dass du helfen willst! 🧡 Paibot entsteht öffentlich, Folge für Folge, als YouTube-Serie. Dieser Leitfaden zeigt dir, wie du beitragen kannst.

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

- **Beitragsvereinbarung (CLA):** Mit deinem ersten Pull Request stimmst du der Beitragsvereinbarung zu (§ 5 der [Lizenz](LICENSE)). Sie räumt dem Projekt die Rechte an deinem Beitrag ein, auch für eine künftige andere Lizenzierung. Ein automatischer CLA-Check wird eingerichtet.
- **Nur private Nutzung:** Paibot steht unter einer Fair-Code-Lizenz für die private Nutzung. Beiträge, die Paibot für den Firmeneinsatz umbauen (Mehrbenutzer, Rollen, Mandanten), nehmen wir nicht auf – dafür gibt es [Lokyy](https://lokyy.de).
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
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Formatierungsfehler behebt `pnpm exec biome check --write .`.

## Ablauf für einen Pull Request

1. Fork anlegen und einen Branch erstellen: `feat/…`, `fix/…` oder `docs/…`
2. Änderung umsetzen, mit Tests, wo es sinnvoll ist
3. Checks lokal laufen lassen (siehe oben)
4. Pull Request mit der Vorlage ausfüllen: was, warum, wie getestet
5. Die CI muss grün sein; danach schauen wir uns den Pull Request an

## Regeln für Code und Abhängigkeiten

- TypeScript im strikten Modus, Validierung mit Zod, Texte in der App auf Deutsch (Englisch kommt mit den Übersetzungen)
- Keine Geheimnisse (Passwörter, API-Keys) in Code, Commits oder Logs
- Neue Abhängigkeiten nur mit erlaubter Lizenz (MIT, Apache-2.0, BSD, ISC); `pnpm licenses:check` prüft das, Details in [docs/LIZENZPOLITIK.md](docs/LIZENZPOLITIK.md). Danach `pnpm licenses:notices` ausführen.
- Kein Code aus fremden Projekten ohne passende Lizenz

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
