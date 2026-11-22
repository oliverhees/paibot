/**
 * PaiBot – baut den Doku-Index für Läufe, die den Worker aus dem Build starten (Ende-zu-Ende-Lauf,
 * Doku-Aufnahmen). Der Worker startet ohne gültigen Index nicht; hier entsteht er vorher mit
 * `scripts/doku-index.mjs` in den von git ausgenommenen Ordner `doku-index/` im Projektstamm.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * Baut den Index und liefert den absoluten Pfad der Datei (für `PAIBOT_DOKU_INDEX`). Bricht mit
 * der Ausgabe des Skripts ab, wenn der Bau scheitert.
 */
export function baueDokuIndex(wurzel) {
  const ergebnis = spawnSync(process.execPath, [path.join(wurzel, "scripts", "doku-index.mjs")], {
    cwd: wurzel,
    encoding: "utf8",
  });
  if (ergebnis.status !== 0) {
    throw new Error(
      `Doku-Index lässt sich nicht bauen (Ausgang ${ergebnis.status}):\n${ergebnis.stdout}${ergebnis.stderr}`,
    );
  }
  return path.join(wurzel, "doku-index", "doku-index.json");
}
