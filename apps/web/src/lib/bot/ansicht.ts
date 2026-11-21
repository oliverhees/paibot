/**
 * PaiBot – Logik der Seite „Bot“ ohne DOM: Entwurf, „ungespeichert“ und Beispiele anhängen.
 * Läuft im Browser, lädt kein Zod.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { AvatarShape, BotColor } from "@paibot/shared/objekte";

/** Was die Seite bearbeitet; genau die Felder von `PUT /api/bot`. */
export interface BotEntwurf {
  name: string;
  instructions: string;
  avatarShape: AvatarShape;
  color: BotColor;
  maxOutputTokens: number;
}

export function botEntwurf(bot: BotEntwurf): BotEntwurf {
  return {
    name: bot.name,
    instructions: bot.instructions,
    avatarShape: bot.avatarShape,
    color: bot.color,
    maxOutputTokens: bot.maxOutputTokens,
  };
}

/** Gibt es ungespeicherte Änderungen? Leerzeichen am Rand des Namens zählen nicht. */
export function entwurfGeaendert(gespeichert: BotEntwurf, entwurf: BotEntwurf): boolean {
  return (
    gespeichert.name !== entwurf.name.trim() ||
    gespeichert.instructions !== entwurf.instructions ||
    gespeichert.color !== entwurf.color ||
    gespeichert.avatarShape !== entwurf.avatarShape ||
    gespeichert.maxOutputTokens !== entwurf.maxOutputTokens
  );
}

/** Hängt einen Beispiel-Satz an die Anweisung an (neue Zeile), ohne ihn doppelt einzufügen. */
export function anweisungAnhaengen(anweisung: string, satz: string): string {
  if (anweisung.includes(satz)) return anweisung;
  const rest = anweisung.replace(/\s+$/, "");
  return rest === "" ? satz : `${rest}\n${satz}`;
}
