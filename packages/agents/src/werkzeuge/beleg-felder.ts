/**
 * PaiBot – Zusätzliche Felder im Ergebnis-Beleg eines Werkzeug-Aufrufs, die aus der gespeicherten
 * Hülle kommen. In dieser Fassung nur beim Nachschlagen in der Doku: Doku-Stand und Zahl der
 * Fundstellen. Die Werte stammen immer aus der Hülle, die das Modell bekommen hat (nach dem
 * Bereinigen und Kürzen), nie aus dem Ergebnis davor.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { ToolEnvelope, ToolKey } from "@paibot/shared/werkzeug";
import { STAND_MUSTER } from "./doku/suche";
import { DOKU_TOOL_KEY, dokuErgebnisSchema } from "./doku/werkzeug";

/** Felder für den Ergebnis-Beleg (`docStand`, `found`). */
export interface BelegFelder {
  docStand?: string;
  found?: number;
}

/**
 * Ergebnis des Nachschlagens aus einer gespeicherten Hülle, wenn sie eins ist. Eine gekürzte Hülle
 * zählt nur, wenn der Doku-Stand darin noch vollständig ist (Form `<Version>+<12 Hex>`): Bleibt
 * im Schritt kaum Platz, kürzt das Kürzen auch diese Angabe, und ein beschnittener Stand dürfte
 * nicht in den Beleg gehören. Dann ist das Ergebnis `undefined`, der Lauf geht
 * weiter, und das Modell sieht die gekürzte Hülle.
 */
export function dokuAusHuelle(
  toolKey: ToolKey,
  huelle: ToolEnvelope,
): { stand: string; gefunden: number } | undefined {
  if (toolKey !== DOKU_TOOL_KEY || huelle.status !== "ok" || huelle.werkzeug !== DOKU_TOOL_KEY) {
    return undefined;
  }
  const geprueft = dokuErgebnisSchema.safeParse(huelle.inhalt);
  if (!geprueft.success) return undefined;
  const ergebnis = geprueft.data;
  if (huelle.gekuerzt === true && !STAND_MUSTER.test(ergebnis.stand)) return undefined;
  return {
    stand: ergebnis.stand,
    gefunden: ergebnis.status === "gefunden" ? ergebnis.abschnitte.length : 0,
  };
}

/** `docStand` und `found` für den Ergebnis-Beleg; für andere Werkzeuge leer. */
export function belegFelder(toolKey: ToolKey, huelle: ToolEnvelope): BelegFelder {
  const doku = dokuAusHuelle(toolKey, huelle);
  return doku === undefined ? {} : { docStand: doku.stand, found: doku.gefunden };
}
