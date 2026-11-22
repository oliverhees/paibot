/**
 * PaiBot – Frühere Fassungen eines Werkzeugs für „Was hat sich geändert“. Verglichen wird mit der
 * Fassung, die der Besitzer zuletzt bestätigt oder gesperrt hat, nicht mit der unmittelbar
 * vorherigen: Änderte der Server ein Werkzeug mehrmals, bevor der Besitzer es sah, sieht er alles,
 * was sich seit seiner Bestätigung geändert hat.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { type Database, repo } from "@paibot/db";
import type { WerkzeugAntwort } from "./ansicht";
import { werkzeugAnsicht } from "./anzeige";

type AppTool = repo.apps.AppTool;

/** So viele Fassungen gehen höchstens in eine Antwort (die jüngsten). */
export const MAX_FASSUNGEN = 50;

/**
 * Die Fassung, mit der eine geänderte Fassung zu vergleichen ist: die jüngste frühere, die der
 * Besitzer eingestuft hat (`bestaetigt` oder `gesperrt`); gibt es keine, die unmittelbar vorherige.
 * `undefined`, wenn es keine frühere Fassung gibt.
 */
export function vergleichsFassung(verlauf: readonly AppTool[], tool: AppTool): AppTool | undefined {
  const frueher = verlauf.filter((f) => f.version < tool.version);
  const eingestuft = frueher.filter((f) => f.status === "bestaetigt" || f.status === "gesperrt");
  return eingestuft.at(-1) ?? frueher.at(-1);
}

/** Werkzeuge für die Anzeige; geänderte tragen die Fassung, die der Besitzer zuletzt bestätigt hatte. */
export async function werkzeugeMitVergleich(
  db: Database,
  werkzeuge: readonly AppTool[],
): Promise<WerkzeugAntwort[]> {
  const aus: WerkzeugAntwort[] = [];
  for (const tool of werkzeuge) {
    if (tool.status !== "geaendert") {
      aus.push(werkzeugAnsicht(tool));
      continue;
    }
    const frueher = vergleichsFassung(await repo.apps.toolHistory(db, tool.toolId), tool);
    aus.push(werkzeugAnsicht(tool, frueher));
  }
  return aus;
}
