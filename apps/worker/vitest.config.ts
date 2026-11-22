/**
 * PaiBot – Einstellungen von Vitest für den Worker.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test-MCP-Server auf Loopback für die Ende-zu-Ende-Tests der Apps (nur Tests).
    globalSetup: ["../../tools/test-mcp-server/src/vitest-global.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
