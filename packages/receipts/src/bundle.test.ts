/**
 * PaiBot – Test, dass sich der Prüfer für den Browser bündeln lässt: keine Node-APIs, keine
 * Datenbank, kein Krypto-Paket.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { build } from "esbuild";
import { describe, expect, it } from "vitest";

describe("Prüfer-Bündel für den Browser", () => {
  it("enthält keine node:-Importe, keine Datenbank und kein Krypto-Paket", async () => {
    const result = await build({
      entryPoints: [new URL("./verify.ts", import.meta.url).pathname],
      bundle: true,
      platform: "browser",
      format: "esm",
      write: false,
      metafile: true,
      logLevel: "silent",
    });
    expect(result.errors).toEqual([]);
    const code = result.outputFiles.map((file) => file.text).join("\n");
    expect(code).not.toMatch(/["']node:/);
    expect(code).not.toMatch(/\brequire\(/);
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.some((path) => path.endsWith("src/verify.ts"))).toBe(true);
    expect(inputs.some((path) => path.endsWith("src/nachrechnen.ts"))).toBe(true);
    for (const forbidden of [
      "/db/src/",
      "/crypto/src/",
      "drizzle-orm",
      "postgres",
      "writer.ts",
      "server.ts",
      "export.ts",
    ]) {
      expect(inputs.filter((path) => path.includes(forbidden))).toEqual([]);
    }
  });
});
