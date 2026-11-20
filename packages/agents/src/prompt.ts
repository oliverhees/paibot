/**
 * PaiBot – Anweisung an das Modell aus der festen Vorlage, dem Bot und den Einstellungen bauen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Bot, Settings } from "@paibot/shared/objekte";
import { notImplemented } from "@paibot/stub";

/** Platzhalter der Vorlage. */
export const PROMPT_PLACEHOLDERS = ["name", "datum", "zeitzone", "anweisung"] as const;
export type PromptPlaceholder = (typeof PROMPT_PLACEHOLDERS)[number];

/**
 * Baut die Anweisung an das Modell aus der Vorlage `prompts/de/system.md`:
 * `{{name}}` = Name des Bots, `{{datum}}` = Datum von `now` in der Zeitzone der Einstellungen als
 * `TT.MM.JJJJ`, `{{zeitzone}}` = `settings.timezone`, `{{anweisung}}` = Anweisung des Bots. Ist die
 * Anweisung leer, entfallen die Zeile „Anweisung der Person für dich:“ und der Platzhalter.
 *
 * Zusagen: Der feste Text der Vorlage bleibt Zeichen für Zeichen erhalten; rein bis auf `now`
 * (Standard: jetzt).
 */
export function buildSystemPrompt(
  bot: Pick<Bot, "name" | "instructions">,
  settings: Pick<Settings, "timezone">,
  now?: Date,
): string {
  return notImplemented("agents.buildSystemPrompt", bot, settings, now);
}
