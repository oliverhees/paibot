/**
 * PaiBot – startet den Test-MCP-Server als eigenen Prozess (nur Loopback, nur für Tests).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createTestMcpServer, TEST_MCP_PORT_ENV } from "./index";

// Umgebungsvariablen: TEST_MCP_PORT (Standard 0 = zufällig), TEST_MCP_CONTROL_KEY (Schlüssel für
// /_steuerung/; ohne ihn gibt es keine Steuerung über HTTP). Der Server lauscht immer nur auf 127.0.0.1.
process.stdout.write(
  "Test-MCP-Server: nur für Tests. Nie im Betrieb und nie in einem ausgelieferten Image.\n",
);
const controlKey = process.env.TEST_MCP_CONTROL_KEY;
const server = createTestMcpServer(undefined, controlKey ? { key: controlKey } : {});
const { url } = await server.start({
  host: "127.0.0.1",
  port: Number(process.env[TEST_MCP_PORT_ENV] ?? 0),
});
process.stdout.write(`Test-MCP-Server bereit: ${url}\n`);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void server.stop().then(() => process.exit(0));
  });
}
