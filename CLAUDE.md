# CLAUDE.md – Paibot

Hinweise für Claude Code beim Bauen von Paibot. Paibot entsteht **live auf Video**, Folge für Folge. Jede Sitzung baut genau eine Folge nach Drehbuch.

## Arbeitsweise beim Dreh

- Arbeite **Schritt für Schritt** nach den Anweisungen des Nutzers. Keine Schritte vorziehen, nichts nebenbei „mit erledigen“.
- Erkläre kurz und verständlich auf Deutsch, was du tust. Die Zuschauer sollen mitkommen.
- Nach jedem abgeschlossenen Schritt: Checks laufen lassen, dann committen mit
  `folge-NN: schritt X – <kurze Beschreibung>` (z. B. `folge-02: schritt 3 – datenbank-schema`).
- Wenn etwas nicht klappt: Fehler zeigen, Ursache erklären, beheben. Nicht still umgehen.
- Keine Geheimnisse (Passwörter, API-Keys) in Code, Commits oder Ausgaben. `.env` wird nie committet.

## Befehle

| Befehl                  | Zweck                                                                        |
| ----------------------- | ---------------------------------------------------------------------------- |
| `pnpm install`          | Abhängigkeiten                                                               |
| `pnpm dev`              | Web-App lokal starten                                                        |
| `pnpm lint`             | Biome (Lint + Format); `pnpm exec biome check --write .` behebt Formatierung |
| `pnpm typecheck`        | TypeScript prüfen                                                            |
| `pnpm test`             | Tests (Vitest)                                                               |
| `pnpm build`            | alles bauen                                                                  |
| `pnpm licenses:check`   | Lizenzen der Abhängigkeiten prüfen                                           |
| `pnpm licenses:notices` | `THIRD_PARTY_NOTICES.md` neu erzeugen (nach neuen Abhängigkeiten)            |

Vor jedem Commit: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Aufbau und Regeln

- Monorepo mit pnpm und Turborepo: `apps/web` (Next.js), `packages/*`, `services/browser` (Python, später).
- TypeScript strict, Zod für Validierung, Texte in der App auf Deutsch (Englisch kommt mit i18n).
- Neue Abhängigkeiten nur mit erlaubter Lizenz (siehe `docs/LIZENZPOLITIK.md`), danach `pnpm licenses:notices`.
- Einzelnutzer-App: keine Mehrbenutzer-, Rollen- oder Mandantenfunktionen bauen.
- `LICENSE` nicht verändern. Kein Code aus fremden Repos ohne passende Lizenz übernehmen.
- Der Branch `referenz/folge-02` ist ein Spickzettel aus der Planung, nicht direkt mergen.
