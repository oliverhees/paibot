<!--
PaiBot – Entwickler-Doku: der Bot (Name, Anweisung, Aussehen, Modell, „Was dein Bot darf“).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Bot – für Entwickler

**Anwender-Doku:** [Bot](../funktion-bot.md)

## Zweck und Entscheidung

Der Bot ist der eine Assistent der Installation: Name, Anweisung, Aussehen, Ausgabegrenze und Modell. Lesen, Ändern und der Überblick „Was dein Bot darf“ stehen in `apps/web/src/lib/bot/bot.ts`.

Belegte Entscheidungen im Code:

- **Nur Änderungen speichern:** `botAendern` ermittelt die geänderten Felder (`geaenderteFelder`); ohne Änderung Fehler `eingabe_ungueltig` mit dem Text `bot.unveraendert` (`apps/web/src/lib/bot/bot.ts#botAendern`).
- **Beleg ohne Inhalt:** Der Fakt von `bot.aendern` ist nur die Liste der geänderten Felder (`fields`), nicht ihr Wert (`apps/web/src/lib/bot/bot.ts#botAendern`, `packages/shared/src/actions.ts#BOT_FIELDS`).
- **Rechte abgeleitet, nicht eingestellt:** „Was dein Bot darf“ entsteht rein aus den aktiven Regeln, die für den Akteur „Bot“ gelten, plus Grenze G-01 (`apps/web/src/lib/bot/bot.ts#botRechte`).

## Aufbau

| Datei                                                                                  | Aufgabe                                                                                                                                                               |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/bot/bot.ts`                                                          | `botLesen`, `botAendern`, `botModell`, `botRechte`, `botSeitenDaten`                                                                                                  |
| `apps/web/src/lib/bot/ansicht.ts`                                                      | Logik der Seite ohne DOM: Entwurf, „ungespeichert“                                                                                                                    |
| `apps/web/src/app/(app)/bot/page.tsx`                                                  | Seite „Bot“: lädt Bot, Modell und Regeln auf dem Server                                                                                                               |
| `apps/web/src/app/(app)/bot/BotSeite.tsx`, `apps/web/src/app/(app)/bot/BotAnsicht.tsx` | Oberfläche                                                                                                                                                            |
| `apps/web/src/app/api/bot/route.ts`                                                    | `GET` und `PUT /api/bot`                                                                                                                                              |
| `apps/web/src/app/api/bot/modell/route.ts`                                             | `PUT /api/bot/modell`                                                                                                                                                 |
| `packages/db/src/repo/bots.ts`                                                         | `create`, `get`, `getDefault`, `update`, `setModel`                                                                                                                   |
| `packages/ui/src/avatar-lebendig/AvatarLebendig.tsx`                                   | Avatar (alle sieben Formen, acht Zustände); Umrisse in `packages/ui/src/avatar/formen.ts`, Gesicht je Form in `packages/ui/src/avatar-lebendig/daten.ts#FORM_GESICHT` |
| `packages/agents/src/prompt.ts`                                                        | `buildSystemPrompt`: setzt Name und Anweisung des Bots in die Vorlage                                                                                                 |

Datenfluss beim Speichern:

1. `PUT /api/bot` mit `botInput` (`packages/shared/src/inputs.ts#botInput`).
2. `botAendern` liest den Standard-Bot (`repo.bots.getDefault`), vergleicht die Felder und ruft das Tor mit `bot.aendern` und `{ fields }`.
3. In der Ausführung `repo.bots.update` nur mit den geänderten Feldern.

Ein Lauf liest den Bot beim Start im Kontext (`packages/agents/src/run/kontext.ts#loadRunContext`); `buildSystemPrompt` nimmt bei leerer Anweisung `SYSTEM_PROMPT_FRAME`, sonst `SYSTEM_PROMPT_TEMPLATE` (`packages/agents/src/prompt.ts#buildSystemPrompt`).

## Datenmodell und Migrationen

| Tabelle    | Schema                               | Wofür                                                                     |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------- |
| `bots`     | `packages/db/src/schema/anbieter.ts` | Name, Anweisung, Modell, Form, Farbe, `max_output_tokens` (Standard 4096) |
| `settings` | `packages/db/src/schema/settings.ts` | `default_bot_id`: der Bot der Installation                                |

Ausgabegrenze: Die Einrichtung legt den Bot ohne `maxOutputTokens` an, es gilt der Standard 4096 der Datenbank (`apps/web/src/lib/zugang/einrichtung.ts`, `packages/db/src/schema/anbieter.ts#bots`). `PUT /api/bot` verlangt alle fünf Felder, auch `maxOutputTokens` (1 bis `LIMITS.maxOutputTokens`), und speichert nur die geänderten (`packages/shared/src/inputs.ts#botInput`, `apps/web/src/lib/bot/bot.ts#geaenderteFelder`). Die Seite „Bot“ hat kein Eingabefeld dafür und schickt den geladenen Wert zurück (`apps/web/src/app/(app)/bot/BotAnsicht.tsx`, `apps/web/src/lib/bot/ansicht.ts#botEntwurf`); über die Schnittstelle ist der Wert also änderbar. Der Lauf nutzt den Wert des Bots als Ausgabegrenze der Anfrage (`packages/agents/src/run/kontext.ts`).

CHECKs in `packages/db/src/schema/anbieter.ts#bots`: `bots_name_laenge` (1 bis 60 Zeichen), `bots_instructions_laenge` (höchstens 8000), `bots_max_output_tokens_positiv`, `bots_max_output_tokens_hoechstens` (höchstens 200 000, gleich `LIMITS.maxOutputTokens` in `packages/shared/src/constants.ts`). Migration: `packages/db/drizzle/0001_basis.sql`; die Obergrenze kam mit `packages/db/drizzle/0014_werkzeug_kern.sql`, die höhere Werte vorher auf 200 000 setzt.

„Was dein Bot darf“ zeigt seitdem auch R-010 (`apps/web/src/lib/bot/bot.ts#botRechte`); die Regel wirkt erst mit dem Werkzeug „In der Doku nachschlagen“.

## Schnittstellen

| Art    | Name                  | Datei                                      |
| ------ | --------------------- | ------------------------------------------ |
| Route  | `GET /api/bot`        | `apps/web/src/app/api/bot/route.ts`        |
| Route  | `PUT /api/bot`        | `apps/web/src/app/api/bot/route.ts`        |
| Route  | `PUT /api/bot/modell` | `apps/web/src/app/api/bot/modell/route.ts` |
| Aktion | `bot.aendern`         | `packages/shared/src/actions.ts`           |
| Aktion | `modell.waehlen`      | `packages/shared/src/actions.ts`           |
| Seite  | `/bot`                | `apps/web/src/app/(app)/bot/page.tsx`      |

Felder, die `bot.aendern` betreffen kann: `name`, `instructions`, `avatarShape`, `color`, `maxOutputTokens` (`packages/shared/src/actions.ts#BOT_FIELDS`).

## Sicherheit

- **Tor:** `bot.aendern` und `modell.waehlen` gehen mit Sitzung durch das Tor (R-001) (`apps/web/src/lib/routen.ts#API_ROUTEN`).
- **Modell nur aus der Liste:** `botModell` nimmt nur ein Modell, das `enabled` ist und dessen Anbieter `enabled` ist, sonst `modelle.nicht_in_liste` (`apps/web/src/lib/bot/bot.ts#botModell`).
- **Grenzen der Eingabe:** Name 1 bis `botNameChars` (60), Anweisung bis `botInstructionsChars` (8000) Zeichen (`packages/shared/src/constants.ts`), Körper bis 64 KiB (`apps/web/src/lib/routen.ts`, Route `botAendern`).
- **Proxy ausgenommen:** `PUT /api/bot` läuft nicht durch den Proxy und prüft Sitzung, Herkunft und Prüfzeichen selbst (Kommentar an `config` in `apps/web/src/proxy.ts`).

## Tests

| Test                                                                                     | Prüft                                                                            |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/web/src/lib/bot/bot.test.ts`                                                       | Lesen, Ändern über das Tor mit Belegen, Grenzen der Eingabe, „Was dein Bot darf“ |
| `packages/agents/src/prompt.test.ts`                                                     | Anweisung: fester Text, Platzhalter, Datum, leere Anweisung                      |
| `packages/ui/src/avatar/formen.test.ts`, `packages/ui/src/avatar-lebendig/leben.test.ts` | Avatar-Formen und Takt (Blinzeln, Atmen, Zeiger)                                 |

Ausführen:

```bash
pnpm --filter @paibot/web test
pnpm --filter @paibot/agents test
```

## Bekannte Schwächen

- **Ein Bot:** Alle Funktionen lesen den Standard-Bot über `repo.bots.getDefault` (`apps/web/src/lib/bot/bot.ts`); weitere Bots gibt es in der Oberfläche nicht.
- **Keine Werkzeuge:** Der Motor bekommt keine Werkzeuge (Kommentar an `packages/agents/src/run/ausfuehren.ts#executeRun`).
