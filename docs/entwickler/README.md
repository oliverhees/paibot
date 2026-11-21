<!--
PaiBot – Entwickler-Doku: Überblick, Aufbau des Monorepos, lokal prüfen und testen, Liste der Seiten.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Entwickler-Doku

**Ergebnis:** Zu jeder Funktion gibt es neben der Anwender-Seite eine Seite für Entwickler: wie sie gebaut ist, welche Dateien, Tabellen, Routen und Aktionen beteiligt sind, wie sie abgesichert und getestet ist und was noch fehlt. Jede Aussage nennt die Stelle im Code.

Die Anwender-Doku steht in der [Übersicht der Doku](../README.md). Wie man lokal entwickelt und den Test-Anbieter benutzt, beschreibt [Entwickeln und Testen](../entwickeln.md); den Gesamtaufbau [Architektur](../architektur.md).

## Seiten

| Funktion                | Entwickler-Seite                                       | Anwender-Seite                                                              |
| ----------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Einrichtung und Zugang  | [einrichtung-und-zugang.md](einrichtung-und-zugang.md) | [funktion-einrichtung-und-zugang.md](../funktion-einrichtung-und-zugang.md) |
| Chat                    | [chat.md](chat.md)                                     | [funktion-chat.md](../funktion-chat.md)                                     |
| Bot                     | [bot.md](bot.md)                                       | [funktion-bot.md](../funktion-bot.md)                                       |
| Anbieter und Modelle    | [anbieter-und-modelle.md](anbieter-und-modelle.md)     | [funktion-anbieter-und-modelle.md](../funktion-anbieter-und-modelle.md)     |
| Datenschleuse           | [datenschleuse.md](datenschleuse.md)                   | [funktion-datenschleuse.md](../funktion-datenschleuse.md)                   |
| Belege                  | [belege.md](belege.md)                                 | [funktion-belege.md](../funktion-belege.md)                                 |
| Das Tor und die Regeln  | [tor.md](tor.md)                                       | [funktion-tor.md](../funktion-tor.md)                                       |
| Einstellungen und Info  | [einstellungen.md](einstellungen.md)                   | [funktion-einstellungen.md](../funktion-einstellungen.md)                   |
| Selbsttest              | [selbsttest.md](selbsttest.md)                         | [funktion-selbsttest.md](../funktion-selbsttest.md)                         |
| Sicherung               | [sicherung.md](sicherung.md)                           | [sicherung.md](../sicherung.md)                                             |
| Team-Entwurf (Format)   | [team-entwurf.md](team-entwurf.md)                     | folgt mit der Oberfläche                                                    |
| Doku-Index im Image     | [doku-index.md](doku-index.md)                         | –                                                                           |
| Teamchat (Regeln)       | [teamchat.md](teamchat.md)                             | –                                                                           |
| Vorlage                 | [VORLAGE.md](VORLAGE.md)                               | –                                                                           |
| Funktion                | Entwickler-Seite                                       | Anwender-Seite                                                              |
| ----------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Einrichtung und Zugang  | [einrichtung-und-zugang.md](einrichtung-und-zugang.md) | [funktion-einrichtung-und-zugang.md](../funktion-einrichtung-und-zugang.md) |
| Chat                    | [chat.md](chat.md)                                     | [funktion-chat.md](../funktion-chat.md)                                     |
| Bot                     | [bot.md](bot.md)                                       | [funktion-bot.md](../funktion-bot.md)                                       |
| Anbieter und Modelle    | [anbieter-und-modelle.md](anbieter-und-modelle.md)     | [funktion-anbieter-und-modelle.md](../funktion-anbieter-und-modelle.md)     |
| Datenschleuse           | [datenschleuse.md](datenschleuse.md)                   | [funktion-datenschleuse.md](../funktion-datenschleuse.md)                   |
| Belege                  | [belege.md](belege.md)                                 | [funktion-belege.md](../funktion-belege.md)                                 |
| Das Tor und die Regeln  | [tor.md](tor.md)                                       | [funktion-tor.md](../funktion-tor.md)                                       |
| Einstellungen und Info  | [einstellungen.md](einstellungen.md)                   | [funktion-einstellungen.md](../funktion-einstellungen.md)                   |
| Selbsttest              | [selbsttest.md](selbsttest.md)                         | [funktion-selbsttest.md](../funktion-selbsttest.md)                         |
| Sicherung               | [sicherung.md](sicherung.md)                           | [sicherung.md](../sicherung.md)                                             |
| Doku-Index im Image     | [doku-index.md](doku-index.md)                         | –                                                                           |
| Werkzeug-Kern (Vertrag) | [werkzeug-kern.md](werkzeug-kern.md)                   | [funktion-tor.md](../funktion-tor.md)                                       |
| Vorlage                 | [VORLAGE.md](VORLAGE.md)                               | –                                                                           |

## Aufbau des Monorepos

pnpm-Workspace mit den Ordnern `apps/*`, `packages/*` und `tools/*` (`pnpm-workspace.yaml`), gebaut mit Turborepo (`turbo.json`). Node.js steht in `.nvmrc` (22), pnpm in `package.json` (Feld `packageManager`).

| Ordner                 | Paket                   | Inhalt                                                                     |
| ---------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `apps/web/`            | `@paibot/web`           | Web-App (Next.js): Seiten, API-Routen, Proxy                               |
| `apps/worker/`         | `@paibot/worker`        | Worker: holt Läufe aus der Warteschlange und führt sie aus                 |
| `packages/shared/`     | `@paibot/shared`        | gemeinsame Verträge: Aktionen, Regeln, Belege, Ereignisse, Eingaben, Texte |
| `packages/gate/`       | `@paibot/gate`          | das Tor                                                                    |
| `packages/receipts/`   | `@paibot/receipts`      | Belege: bauen, anhängen, prüfen, exportieren; Befehl `belege:pruefen`      |
| `packages/db/`         | `@paibot/db`            | Schema, Migrationen (`packages/db/drizzle/`), Zugriff (`repo`), Rollen     |
| `packages/crypto/`     | `@paibot/crypto`        | Wurzel-Geheimnis, Schlüssel, Passwörter, Tokens, Signaturen                |
| `packages/llm/`        | `@paibot/llm`           | Anbieter-Schicht und Modell-Zugang                                         |
| `packages/agents/`     | `@paibot/agents`        | Motor und Lauf-Steuerung                                                   |
| `packages/jobs/`       | `@paibot/jobs`          | Warteschlange (pg-boss)                                                    |
| `packages/ui/`         | `@paibot/ui`            | Bausteine der Oberfläche und Design-Tokens                                 |
| `packages/mcp/`        | `@paibot/mcp`           | Platzhalter, noch ohne Inhalt (`packages/mcp/src/index.ts`)                |
| `packages/stub/`       | `@paibot/stub`          | Fehler „noch nicht umgesetzt“                                              |
| `tools/fake-provider/` | `@paibot/fake-provider` | Test-Anbieter für Tests ohne echtes Modell                                 |
| `tools/durchstich/`    | `@paibot/durchstich`    | Tests über alle Bausteine im Zusammenspiel                                 |
| `tools/e2e/`           | `@paibot/e2e`           | Ende-zu-Ende-Lauf (`pnpm e2e`)                                             |
| `tools/lint-regeln/`   | `@paibot/lint-regeln`   | eigene Lint-Regeln und Tests der Skripte (u. a. `pnpm doku:check`)         |
| `scripts/`             | –                       | Skripte der Wurzel: Doku-Check, Urheber-Kopf, Lizenzen, Screenshots        |
| `deploy/`              | –                       | Docker Compose und Hilfsskripte für den Betrieb                            |
| `services/browser/`    | –                       | geplanter Browser-Dienst, nur Beschreibung (`services/browser/README.md`)  |

Abhängigkeiten zwischen den Paketen begrenzt `biome.json` (`noRestrictedImports`); zum Beispiel darf die Web-App `@paibot/llm/modell` nicht importieren.

## Lokal prüfen und testen

Diese Befehle sind am 21.11.2026 in einem frischen Arbeitsstand gelaufen, ohne Datenbank-Server (ohne `PAIBOT_TEST_DATABASE_URL`):

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm headers:check
pnpm typecheck
pnpm exec turbo run test --concurrency=1 --continue --force
pnpm build
pnpm licenses:check
pnpm doku:check --streng
```

Ergebnis dieses Laufs:

| Befehl                                                        | Ergebniszeile                                           |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| `pnpm lint`                                                   | `Checked 766 files in 9s. No fixes applied.`            |
| `pnpm headers:check`                                          | `Urheber-Kopf ok (720 Dateien geprüft).`                |
| `pnpm typecheck`                                              | `Tasks: 16 successful, 16 total`                        |
| `pnpm exec turbo run test --concurrency=1 --continue --force` | `Tasks: 18 successful, 18 total`                        |
| `pnpm build`                                                  | `Tasks: 4 successful, 4 total`                          |
| `pnpm licenses:check`                                         | `Lizenz-Check bestanden.`                               |
| `pnpm doku:check --streng`                                    | `Doku-Check bestanden: 0 Fehler, 0 Warnungen (streng).` |

Tests je Paket in diesem Lauf. Ganz übersprungen wurden die Testdateien, die einen echten Postgres-Server (`PAIBOT_TEST_DATABASE_URL`), Playwright (`packages/ui/browser/tastatur.test.mjs`) oder eine laufende Datenschleuse (`tools/durchstich/src/schleuse-vertrag.test.ts`) brauchen; dazu einzelne Tests in anderen Dateien.

| Paket                   | Tests                          |
| ----------------------- | ------------------------------ |
| `@paibot/web`           | 803 bestanden, 8 übersprungen  |
| `@paibot/gate`          | 748 bestanden                  |
| `@paibot/db`            | 394 bestanden, 42 übersprungen |
| `@paibot/llm`           | 232 bestanden                  |
| `@paibot/receipts`      | 149 bestanden, 3 übersprungen  |
| `@paibot/agents`        | 128 bestanden, 1 übersprungen  |
| `@paibot/lint-regeln`   | 124 bestanden, 1 übersprungen  |
| `@paibot/shared`        | 119 bestanden                  |
| `@paibot/crypto`        | 94 bestanden                   |
| `@paibot/worker`        | 91 bestanden, 1 übersprungen   |
| `@paibot/fake-provider` | 42 bestanden                   |
| `@paibot/ui`            | 40 bestanden, 12 übersprungen  |
| `@paibot/jobs`          | 36 bestanden, 5 übersprungen   |
| `@paibot/durchstich`    | 11 bestanden, 19 übersprungen  |
| `@paibot/e2e`           | 5 bestanden                    |
| `@paibot/stub`          | 2 bestanden                    |

Die Zahlen gelten für diesen Stand und ändern sich mit jedem neuen Test.

Gut zu wissen:

- Ohne `PAIBOT_TEST_DATABASE_URL` laufen die Datenbank-Tests mit PGlite im Speicher; Tests gegen echtes Postgres werden übersprungen (z. B. `packages/receipts/src/postgres.test.ts`, `apps/worker/src/postgres.test.ts`). Wie man sie mit einem Wegwerf-Server laufen lässt, steht in [Entwickeln und Testen](../entwickeln.md#tests-gegen-echtes-postgres).
- Die CI führt die Tests mit `pnpm test --concurrency=1` aus (`.github/workflows/ci.yml`).
- Ein einzelnes Paket testen: `pnpm --filter <paket> test`, z. B. `pnpm --filter @paibot/gate test`.

## Prüfung dieser Seiten

`pnpm doku:check` prüft die Entwickler-Doku mit (`scripts/doku-check.mjs`):

- Zu jeder `docs/funktion-<name>.md` gibt es `docs/entwickler/<name>.md` mit den Abschnitten aus `docs/entwickler/VORLAGE.md` in derselben Reihenfolge.
- Jeder Pfad in Backticks, der wie eine Datei im Repo aussieht (etwa `packages/gate/src/gate.ts`, Ordner mit `/` am Ende wie `packages/gate/`), muss existieren. Mit `#name` dahinter (etwa `packages/gate/src/gate.ts#createGate`) muss `name` in der Datei vorkommen.
- In allen Seiten unter `docs/` stehen keine HTML-Kommentare außer dem Urheber-Kopf am Anfang und keine unsichtbaren oder Bidi-Zeichen; jede Seite steht in genau einer der beiden Listen in `scripts/doku-umfang.mjs` (siehe [Doku-Index](doku-index.md)).

Die Tests dazu stehen in `tools/lint-regeln/src/doku-check.test.ts`.

## Neue Entwickler-Seite anlegen

1. `docs/entwickler/VORLAGE.md` nach `docs/entwickler/<name>.md` kopieren; `<name>` wie bei `docs/funktion-<name>.md`.
2. Jeden Abschnitt füllen und jede Aussage mit Pfad (und wo sinnvoll `#name`) belegen. Was sich nicht belegen lässt, weglassen.
3. Die Seite in die Tabelle „Seiten“ oben eintragen.
4. `pnpm doku:check` ausführen.
