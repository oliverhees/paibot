# Mitmachen bei Paibot

Danke, dass du helfen willst! Paibot entsteht öffentlich, Folge für Folge.

## Bevor du loslegst

- **Beitragsvereinbarung (CLA):** Mit deinem ersten Pull Request stimmst du der Beitragsvereinbarung zu (§ 5 der [Lizenz](LICENSE)). Sie räumt dem Projekt die Rechte an deinem Beitrag ein, auch für die kommerzielle Version. Ein automatischer CLA-Check wird eingerichtet.
- **Größere Änderungen:** bitte zuerst ein Issue eröffnen und kurz abstimmen.
- **Sicherheitslücken:** nie als Issue, sondern nach [SECURITY.md](SECURITY.md).

## Ablauf

1. Fork anlegen und einen Branch erstellen (`feat/...`, `fix/...`).
2. `pnpm install`, dann ändern.
3. Vor dem Pull Request: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
4. Commits nach [Conventional Commits](https://www.conventionalcommits.org/de/) (`feat:`, `fix:`, `docs:` …).
5. Pull Request mit kurzer Beschreibung: was, warum, wie getestet.

## Regeln für Abhängigkeiten

Neue Pakete nur mit erlaubter Lizenz (MIT, Apache-2.0, BSD, ISC). `pnpm licenses:check` prüft das automatisch, Details in [docs/LIZENZPOLITIK.md](docs/LIZENZPOLITIK.md).

## Verhalten

Es gilt unser [Verhaltenskodex](CODE_OF_CONDUCT.md).
