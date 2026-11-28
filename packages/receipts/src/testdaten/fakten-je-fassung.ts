/**
 * PaiBot – Test-Hilfe (nur in Tests benutzt): nimmt aus den Fakten der Beispiele die Fakten
 * heraus, die eine ältere Fassung des Tors noch nicht kennt. `botPaused` kommt mit Fassung 4, die
 * Füllwerte der Fassung 5 (`FUELLWERTE_5`, z. B. `conversationKind`) mit Fassung 5.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import { FUELLWERTE_5 } from "@paibot/shared/tor-fassung-5";

type Roh = Record<string, unknown>;

/** Entfernt aus `facts` (an Ort und Stelle) die Fakten, die die Fassung `format` nicht kennt. */
export function ohneSpaetereFakten(type: string, facts: Roh, format: number): Roh {
  if (format < 4) delete facts.botPaused;
  if (format < 5) {
    const neu = (FUELLWERTE_5 as Record<string, Roh>)[type] ?? {};
    for (const key of Object.keys(neu)) delete facts[key];
  }
  return facts;
}
