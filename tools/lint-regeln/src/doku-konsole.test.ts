/**
 * PaiBot – Test: Welche Konsolen-Meldung eine Aufnahme der Doku-Bilder nicht ungültig macht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { istBekannteDevWarnung } = (await import(
  pathToFileURL(path.join(ROOT, "scripts/doku/konsole.mjs")).href
)) as {
  istBekannteDevWarnung: (art: string, text: string, entwicklung: boolean) => boolean;
};

const WARNUNG =
  "The resource http://localhost:3000/_next/static/chunks/a.css was preloaded using link preload but not used within a few seconds from the window's load event.";

describe("Konsole einer Aufnahme: die eine Ausnahme", () => {
  it("die bekannte Warnung des Entwicklungs-Servers zählt in einer Entwicklungs-Aufnahme nicht", () => {
    expect(istBekannteDevWarnung("warning", WARNUNG, true)).toBe(true);
  });

  it("dieselbe Warnung in einer Aufnahme der App (nicht Entwicklung) ist ein Fehler", () => {
    expect(istBekannteDevWarnung("warning", WARNUNG, false)).toBe(false);
  });

  it("als `error` ist sie ein Fehler, auch in einer Entwicklungs-Aufnahme", () => {
    expect(istBekannteDevWarnung("error", WARNUNG, true)).toBe(false);
  });

  it("der Satz mitten in einer anderen Meldung ist ein Fehler (nur der Anfang zählt)", () => {
    expect(istBekannteDevWarnung("warning", `Schlimm: ${WARNUNG}`, true)).toBe(false);
    expect(
      istBekannteDevWarnung(
        "warning",
        "Etwas anderes: was preloaded using link preload but not used",
        true,
      ),
    ).toBe(false);
  });

  it("andere Warnungen in einer Entwicklungs-Aufnahme sind Fehler", () => {
    expect(istBekannteDevWarnung("warning", "Hydration failed", true)).toBe(false);
    expect(istBekannteDevWarnung("warning", "The resource was preloaded", true)).toBe(false);
  });

  it("das Aufnahme-Skript benutzt genau diese Funktion für die Konsole", () => {
    const skript = readFileSync(path.join(ROOT, "scripts/doku-screenshots.mjs"), "utf8");
    expect(skript).toContain("istBekannteDevWarnung(type, message.text(), entwicklung)");
    expect(skript).toContain('watch(context, page, baseUrl, entry.modus === "entwicklung")');
  });
});
