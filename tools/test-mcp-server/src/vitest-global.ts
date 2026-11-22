/**
 * PaiBot – Globale Vorbereitung für Vitest-Läufe anderer Pakete: startet einen Test-MCP-Server auf
 * Loopback und gibt Port und Steuer-Schlüssel an die Tests weiter (`inject("testMcpServer")`). So
 * brauchen Tests der Web-App und des Workers weder das Paket des Servers zu importieren noch einen
 * Prozess zu starten. Nur für Tests; der Server lauscht nur auf 127.0.0.1.
 *
 * Ein Server je Vitest-Projekt, Zustand geteilt: Eine weitere Testdatei muss Verhalten und Protokoll
 * selbst zurücksetzen (`/_steuerung/zuruecksetzen`) oder serielle Läufe nutzen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { randomBytes } from "node:crypto";
import type { TestProject } from "vitest/node";
import { createTestMcpServer } from "./index";

/** Was die Tests über den Server erfahren. */
export interface TestMcpServerInfo {
  port: number;
  /** Wert der Kopfzeile `x-steuerung-schluessel` für die Pfade unter `/_steuerung/`. */
  schluessel: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    testMcpServer: TestMcpServerInfo;
  }
}

export default async function setup(projekt: TestProject): Promise<() => Promise<void>> {
  const schluessel = randomBytes(16).toString("hex");
  const server = createTestMcpServer(undefined, { key: schluessel });
  const { port } = await server.start({ host: "127.0.0.1", port: 0 });
  projekt.provide("testMcpServer", { port, schluessel });
  return async () => {
    await server.stop();
  };
}
