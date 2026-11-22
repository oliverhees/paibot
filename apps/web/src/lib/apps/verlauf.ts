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

/** Hat die Fassung einen Vergleich verdient (geändert, oder neu nach früherer Einstufung)? */
export function brauchtVergleich(tool: AppTool): boolean {
  return tool.status === "geaendert" || (tool.status === "neu" && tool.version > 1);
}

/**
 * Die Fassung, mit der eine Fassung zu vergleichen ist: die jüngste frühere, die der Besitzer
 * eingestuft hat (`bestaetigt` oder `gesperrt`) und deren Abdruck ein anderer ist als der heutige.
 * Bei einer geänderten Fassung gilt sonst die unmittelbar vorherige. Eine neue Fassung hat nur dann
 * einen Vergleich, wenn der Besitzer früher eine andere eingestuft hatte (etwa weil sich das
 * Werkzeug während einer Trennung geändert hat).
 *
 * War der Verlauf abgeschnitten (es gibt ältere Fassungen, als geladen wurden) und liegt darin keine
 * eingestufte Fassung, kann die bestätigte außerhalb liegen: Dann ist der Vergleich
 * `unvollstaendig`, und es gibt keinen Ersatz-Vergleich mit dem Vorgänger. Nie bedeutet ein
 * fehlender Vergleich „unverändert“.
 */
export function vergleichFuer(
  verlauf: readonly AppTool[],
  tool: AppTool,
  abgeschnitten: boolean,
): { frueher: AppTool | undefined; unvollstaendig: boolean } {
  if (!brauchtVergleich(tool)) return { frueher: undefined, unvollstaendig: false };
  const frueher = verlauf.filter((f) => f.version < tool.version);
  const eingestuft = frueher
    .filter(
      (f) =>
        (f.status === "bestaetigt" || f.status === "gesperrt") && f.toolDigest !== tool.toolDigest,
    )
    .at(-1);
  if (eingestuft !== undefined) return { frueher: eingestuft, unvollstaendig: false };
  if (abgeschnitten) return { frueher: undefined, unvollstaendig: true };
  return {
    frueher: tool.status === "geaendert" ? frueher.at(-1) : undefined,
    unvollstaendig: false,
  };
}

/**
 * Lädt den Verlauf eines Werkzeugs mit einer Fassung mehr als `MAX_TOOL_HISTORY`: Damit weiß der
 * Aufrufer, ob es ältere gibt. Zurück kommen höchstens `MAX_TOOL_HISTORY` Fassungen, die jüngsten.
 */
export async function ladeVerlauf(
  db: Database,
  toolId: AppTool["toolId"],
): Promise<{ verlauf: AppTool[]; abgeschnitten: boolean }> {
  const grenze = repo.apps.MAX_TOOL_HISTORY;
  const zeilen = await repo.apps.toolHistory(db, toolId, grenze + 1);
  const abgeschnitten = zeilen.length > grenze;
  return { verlauf: abgeschnitten ? zeilen.slice(1) : zeilen, abgeschnitten };
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
    const { verlauf, abgeschnitten } = await ladeVerlauf(db, tool.toolId);
    const { frueher, unvollstaendig } = vergleichFuer(verlauf, tool, abgeschnitten);
    aus.push(werkzeugAnsicht(tool, frueher, unvollstaendig));
  }
  return aus;
}
