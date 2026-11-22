/**
 * PaiBot – Der echte Doku-Index für Tests: gebaut wie `pnpm doku:index` (`baueIndex` aus
 * `scripts/doku-index.mjs`), im Speicher, ohne eine Datei zu schreiben. Dazu eine Prüfsumme wie
 * beim Bau für die kleinen Test-Indizes. Nur für Tests.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { indexAus, type TestAbschnitt, type TestIndex } from "./indizes";

/** Projektstamm des Repos. */
export const PROJEKTSTAMM = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../..",
);

let gebaut: Promise<string> | undefined;

/** Text der Index-Datei des echten Repos (einmal je Test-Datei gebaut). */
export function echterIndexText(): Promise<string> {
  gebaut ??= (async () => {
    const skript = pathToFileURL(path.join(PROJEKTSTAMM, "scripts", "doku-index.mjs")).href;
    const modul = (await import(skript)) as { baueIndex(o: { wurzel: string }): { text: string } };
    return modul.baueIndex({ wurzel: PROJEKTSTAMM }).text;
  })();
  return gebaut;
}

/** Prüfsumme wie `scripts/doku-index.mjs#pruefsumme`, unabhängig vom Lader gerechnet. */
export function testPruefsumme(abschnitte: readonly TestAbschnitt[]): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(abschnitte)).digest("hex")}`;
}

/** Index-Datei als Text aus Test-Abschnitten, mit passender Prüfsumme. */
export function testIndexText(abschnitte: readonly TestAbschnitt[]): string {
  return `${JSON.stringify(indexAus(abschnitte, testPruefsumme(abschnitte)), null, 2)}\n`;
}

/** Test-Index als Objekt mit passender Prüfsumme. */
export function testIndex(abschnitte: readonly TestAbschnitt[]): TestIndex {
  return indexAus(abschnitte, testPruefsumme(abschnitte));
}
