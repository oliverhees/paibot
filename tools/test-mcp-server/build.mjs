/**
 * PaiBot – bündelt den Test-Anbieter zu einer einzelnen Datei für sein Image.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/test-mcp-server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "warning",
});
