/**
 * PaiBot – Tests: Das Grundgerüst lädt Schriften nicht vorab (sonst meldet der Browser beim Neuladen
 * eine ungenutzte Vorab-Ladung), und die Schriften kommen weiter vom eigenen Server.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
const schriften = readFileSync(
  new URL("../../../../packages/ui/src/schriften.css", import.meta.url),
  "utf8",
);

describe("Grundgerüst", () => {
  it("lädt keine Schrift vorab", () => {
    expect(layout).not.toMatch(/rel="preload"/);
    expect(layout).not.toMatch(/as="font"/);
    expect(layout).toContain('import "@paibot/ui/schriften.css";');
  });

  it("die Schriften liegen auf dem eigenen Server", () => {
    const quellen = [...schriften.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(quellen.length).toBeGreaterThan(0);
    for (const q of quellen) expect(q).toMatch(/^\/fonts\/[a-z-]+\.woff2$/);
  });
});
