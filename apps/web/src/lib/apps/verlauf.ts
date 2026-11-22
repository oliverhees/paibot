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
 * Die Fassung, mit der eine Fassung zu vergleichen ist: die jüngste frühere, die der Besitzer
 * eingestuft hat (`bestaetigt` oder `gesperrt`) und deren Abdruck ein anderer ist als der heutige.
 * Bei einer geänderten Fassung gilt sonst die unmittelbar vorherige. Eine neue Fassung hat nur dann
 * einen Vergleich, wenn der Besitzer früher eine andere eingestuft hatte (etwa weil sich das
 * Werkzeug während einer Trennung geändert hat). `undefined`, wenn es nichts zu vergleichen gibt.
 */
export function vergleichsFassung(verlauf: readonly AppTool[], tool: AppTool): AppTool | undefined {
  const frueher = verlauf.filter((f) => f.version < tool.version);
  const eingestuft = frueher.filter(
    (f) =>
      (f.status === "bestaetigt" || f.status === "gesperrt") && f.toolDigest !== tool.toolDigest,
  );
  return eingestuft.at(-1) ?? (tool.status === "geaendert" ? frueher.at(-1) : undefined);
}

/** Hat die Fassung einen Vergleich verdient (geändert, oder neu nach früherer Einstufung)? */
export function brauchtVergleich(tool: AppTool): boolean {
  return tool.status === "geaendert" || (tool.status === "neu" && tool.version > 1);
}

/** Werkzeuge für die Anzeige; geänderte tragen die Fassung, die der Besitzer zuletzt bestätigt hatte. */
export async function werkzeugeMitVergleich(
  db: Database,
  werkzeuge: readonly AppTool[],
): Promise<WerkzeugAntwort[]> {
  const aus: WerkzeugAntwort[] = [];
  for (const tool of werkzeuge) {
    if (!brauchtVergleich(tool)) {
      aus.push(werkzeugAnsicht(tool));
      continue;
    }
    const frueher = vergleichsFassung(await repo.apps.toolHistory(db, tool.toolId), tool);
    aus.push(werkzeugAnsicht(tool, frueher));
  }
  return aus;
}
