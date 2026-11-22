/**
 * PaiBot – Test: Die Hilfsdateien, mit denen Web-App und Worker den Test-MCP-Server ansprechen, sind
 * eine Kopie und bleiben gleich. Beide Pakete dürfen keinen gemeinsamen Code importieren; ohne diesen
 * Vergleich liefen die Dateien unbemerkt auseinander.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const WEB = "apps/web/src/lib/apps/testdaten/test-server.ts";
const WORKER = "apps/worker/src/testdaten/test-server.ts";

describe("Hilfsdateien für den Test-MCP-Server", () => {
  // Gegenprobe: eine Zeile in einer der beiden Dateien ändern → rot.
  it("sind in Web-App und Worker Zeichen für Zeichen gleich", () => {
    const web = readFileSync(path.join(ROOT, WEB), "utf8");
    const worker = readFileSync(path.join(ROOT, WORKER), "utf8");
    expect(worker).toBe(web);
  });

  it("nennen im Kopf, dass sie eine Kopie sind und wie der geteilte Zustand zu behandeln ist", () => {
    for (const datei of [WEB, WORKER]) {
      const kopf = readFileSync(path.join(ROOT, datei), "utf8").slice(0, 2_000);
      expect(kopf).toContain("Kopie");
      expect(kopf).toContain("Zustand geteilt");
    }
  });
});
