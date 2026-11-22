/**
 * PaiBot – bündelt das Prüf-Werkzeug für Beleg-Exporte zu einer einzelnen Datei.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { build } from "esbuild";

await build({
  entryPoints: ["src/bin.ts"],
  outfile: "dist/belege-pruefen.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node26",
  logLevel: "warning",
});
