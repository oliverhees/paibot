# Paibot

**Dein persönliches KI-Team – EU-souverän und selbst gehostet.**

Paibot (Personal AI Bot) ist dein persönlicher, webbasierter KI-Agent für die private Nutzung nach dem Vorbild von Grok Bot: mehrere Bots arbeiten im Team, reden miteinander, surfen selbst und erledigen Aufgaben in deinen Apps. Alles läuft auf deinem eigenen Server, mit EU-Modellen oder eigenen Modellen, und Kundendaten lassen sich über die zuschaltbare [Datenschleuse](https://github.com/oliverhees/datenschleuse) schützen.

> 🚧 **Status: Folge 0 – Gerüst.** Paibot entsteht öffentlich, Folge für Folge, als YouTube-Serie (Build in Public). Noch ist hier nur das Grundgerüst.

## Was Paibot werden soll

- 🤝 **Bots im Team:** eigene Rollen, Delegieren, Übergeben, ein Chief of Staff
- 🌐 **Browser-Agent:** der Bot surft selbst, du schaust live zu
- 🔌 **Apps per MCP:** Verbindungen per URL, Freigabe vor jeder schreibenden Aktion
- 🇪🇺 **Modelle deiner Wahl:** EUrouter, Ollama, vLLM – alles OpenAI-kompatibel
- 🛡️ **Datenschleuse:** Namen, E-Mails und IBANs werden vor dem Modell durch Platzhalter ersetzt – zuschaltbar
- ⏰ **Routinen:** Aufgaben laufen nachts, der Bericht liegt morgens bereit
- 📱 **PWA:** auf dem Handy, mit Push und Freigabe per Fingertipp, auf Deutsch und Englisch

## Schnellstart (Entwicklung)

Voraussetzungen: Node.js 22, pnpm 10

```bash
pnpm install
pnpm dev          # startet die Web-App auf http://localhost:3000
```

Weitere Befehle:

| Befehl                  | Zweck                                 |
| ----------------------- | ------------------------------------- |
| `pnpm build`            | alles bauen                           |
| `pnpm typecheck`        | Typen prüfen                          |
| `pnpm test`             | Tests ausführen                       |
| `pnpm lint`             | Lint und Format prüfen (Biome)        |
| `pnpm licenses:check`   | Lizenzen der Abhängigkeiten prüfen    |
| `pnpm licenses:notices` | `THIRD_PARTY_NOTICES.md` neu erzeugen |

## Aufbau

```
apps/web/          Next.js-App (UI, API, Agent-Laufzeit)
packages/shared/   gemeinsame Typen, Konstanten, i18n
packages/db/       Datenbank-Schema (ab Folge 2)
packages/llm/      Modellanbieter und Datenschleuse (ab Folge 3)
packages/agents/   Bots, Router, Team-Tools (ab Folge 5)
packages/ui/       UI-Komponenten (ab Folge 5)
packages/mcp/      App-Anbindungen per MCP (ab Folge 8)
packages/jobs/     Hintergrund-Jobs und Routinen (ab Folge 11)
services/browser/  Browser-Dienst in Python (ab Folge 10)
deploy/            Docker Compose und Coolify (ab Folge 2)
```

Jede Folge bekommt einen Git-Tag (`folge-00`, `folge-01`, …), damit du genau den Stand eines Videos nachbauen kannst.

## Lizenz: Fair-Code

Paibot ist **Fair-Code** („Source Available“), nicht Open Source. Kurz gesagt:

**Du darfst**

- Paibot für dich privat herunterladen, installieren und nutzen
- den Code für dich anpassen und erweitern
- ihn kostenlos weitergeben, z. B. als Fork, solange die Lizenz dabei bleibt

**Du darfst nicht**

- Paibot beruflich nutzen – weder in einer Firma noch als Selbstständiger oder Freiberufler, auch nicht intern
- Paibot oder eine angepasste Fassung verkaufen oder vermieten
- ihn als gehosteten Dienst für andere anbieten oder für Kunden einrichten
- ihn umbenennen und als eigenes Produkt ausgeben
- Lizenz- und Markenhinweise oder „Powered by Paibot“ entfernen

**Paibot ist für dich privat. Für alles Berufliche – im Team, mit Rollen und Rechten – gibt es [Lokyy](https://lokyy.de).**

Rechtlich gilt nur der Text in [`LICENSE`](LICENSE) (derzeit Entwurf). Bausteine Dritter behalten ihre eigenen Lizenzen, siehe [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Mitmachen

**Community:** Deep Dives zu jeder Folge und gemeinsame Coding-Sessions zum Mitbauen gibt es auf **[aiianer.de](https://aiianer.de)**.

Beiträge sind willkommen – bitte zuerst [`CONTRIBUTING.md`](CONTRIBUTING.md) lesen (Beitragsvereinbarung nötig). Sicherheitslücken bitte nicht öffentlich melden, sondern wie in [`SECURITY.md`](SECURITY.md) beschrieben.

„Paibot“, Logo und Maskottchen sind Kennzeichen von Oliver Hees.
