/**
 * PaiBot – Test-Fabrik für den Doku-Index: schreibt einen kleinen, gültigen Index in einen
 * eigenen temporären Ordner, damit Tests, die den Worker oder das Register der Auslieferung
 * bauen, nichts im Arbeitsbaum brauchen und nichts dorthin schreiben.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dokuIndexAusText, dokuPruefsumme } from "../werkzeuge/doku/index-laden";
import type { GeladenerDokuIndex } from "../werkzeuge/doku/suche";

const ABSCHNITTE = [
  {
    id: "funktion-einstellungen.md#tagesbudget",
    seite: "funktion-einstellungen.md",
    anker: "tagesbudget",
    titel: "Tagesbudget",
    pfad: ["Einstellungen", "Tagesbudget"],
    text: "Das Tagesbudget stellst du in den Einstellungen ein. Beispieltext für Tests.",
  },
];

/** Der Text eines gültigen kleinen Index (Beispieltext, nur für Tests). */
export function testDokuIndexText(): string {
  return JSON.stringify({
    format: "pb-doku-index",
    v: 2,
    stand: { version: "0.0.0-test", pruefsumme: dokuPruefsumme(ABSCHNITTE) },
    abschnitte: ABSCHNITTE,
  });
}

/** Der kleine Index, geladen und geprüft wie im Betrieb. */
export function testDokuIndex(): GeladenerDokuIndex {
  return dokuIndexAusText(testDokuIndexText());
}

let ordner: string | undefined;

/**
 * Pfad einer Index-Datei mit dem kleinen Index, einmal je Prozess in einem eigenen temporären
 * Ordner (beim Beenden des Prozesses gelöscht).
 */
export function testDokuIndexPfad(): string {
  if (ordner === undefined) {
    ordner = mkdtempSync(path.join(tmpdir(), "paibot-doku-index-"));
    const ziel = ordner;
    process.once("exit", () => {
      try {
        rmSync(ziel, { recursive: true, force: true });
      } catch {
        // Aufräumen ist nur Komfort.
      }
    });
    writeFileSync(path.join(ordner, "doku-index.json"), testDokuIndexText());
  }
  return path.join(ordner, "doku-index.json");
}

/** Umgebung mit `PAIBOT_DOKU_INDEX` auf die Datei aus `testDokuIndexPfad()`. */
export function testDokuEnv(): { PAIBOT_DOKU_INDEX: string } {
  return { PAIBOT_DOKU_INDEX: testDokuIndexPfad() };
}
