/**
 * PaiBot – der zweite Schlüssel im Quelltext: Der verschlüsselte Wert (`managementKeyEnc`) und der
 * Aufruf der Regel-Liste (`readRoutingRules`, `kontoRegelnLesen`) kommen nur in den genannten Dateien
 * vor; der Modell-Zugang für Chat-Aufrufe, die Motoren und der Worker kennen ihn nicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WURZEL = fileURLToPath(new URL("../../../", import.meta.url));

function dateien(ordner: string): string[] {
  if (!existsSync(ordner)) return [];
  const liste: string[] = [];
  for (const eintrag of readdirSync(ordner)) {
    if ([".next", "node_modules", "dist", "drizzle"].includes(eintrag)) continue;
    const voll = path.join(ordner, eintrag);
    if (statSync(voll).isDirectory()) liste.push(...dateien(voll));
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(eintrag) && !/\.test\./.test(eintrag)) liste.push(voll);
  }
  return liste;
}

function ohneKommentare(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Dateien (relativ zur Wurzel), die ein Wort im Quelltext enthalten. */
function vorkommen(wort: RegExp): string[] {
  const ordner = ["apps", "packages", "tools"].flatMap((o) =>
    existsSync(path.join(WURZEL, o))
      ? readdirSync(path.join(WURZEL, o)).map((n) => path.join(WURZEL, o, n, "src"))
      : [],
  );
  return ordner
    .flatMap(dateien)
    .filter((d) => wort.test(ohneKommentare(readFileSync(d, "utf8"))))
    .map((d) => path.relative(WURZEL, d))
    .sort();
}

describe("zweiter Schlüssel im Quelltext", () => {
  it("der verschlüsselte Wert wird nur von Datenbank-Zugriff, Verwaltung und Einrichtung berührt", () => {
    expect(vorkommen(/managementKeyEnc|management_key_enc/)).toEqual([
      "apps/web/src/lib/modelle/regeln.ts",
      "apps/web/src/lib/modelle/verwaltung.ts",
      "apps/web/src/lib/zugang/einrichtung.ts",
      "packages/db/src/repo/abbildung.ts",
      "packages/db/src/repo/anbieter.ts",
      "packages/db/src/schema/anbieter.ts",
    ]);
  });

  it("die Regel-Liste wird nur von der Verwaltung, der Einrichtung und den Diensten gelesen", () => {
    expect(vorkommen(/\breadRoutingRules\b|\bkontoRegelnLesen\b/)).toEqual([
      "apps/web/src/lib/modelle/verwaltung.ts",
      "apps/web/src/lib/zugang/dienste.ts",
      "apps/web/src/lib/zugang/testing.ts",
      "packages/llm/src/routing-rules-liste.ts",
    ]);
  });

  it("Chat-Zugang, Motoren, Läufe und Worker kennen den zweiten Schlüssel nicht", () => {
    const verboten = vorkommen(/managementKey|management_key|verwaltungsschluessel/i).filter(
      (d) =>
        d.startsWith("packages/agents/") ||
        d.startsWith("apps/worker/") ||
        d.startsWith("packages/llm/src/resolve-model") ||
        d.startsWith("packages/llm/src/schleuse") ||
        d.startsWith("packages/jobs/"),
    );
    expect(verboten).toEqual([]);
  });
});
