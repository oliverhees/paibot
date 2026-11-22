/**
 * PaiBot – Testhilfe: Zugriff auf den Test-MCP-Server, den die globale Vorbereitung von Vitest auf
 * Loopback gestartet hat (`tools/test-mcp-server/src/vitest-global.ts`, eingetragen in
 * `vitest.config.ts`). Die Web-App importiert das Paket des Servers nicht und startet keinen
 * Prozess; sie spricht ihn über HTTP an.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

// Kopie: `apps/web/src/lib/apps/testdaten/test-server.ts` und `apps/worker/src/testdaten/test-server.ts`
// müssen gleich bleiben (Web und Worker dürfen keinen gemeinsamen Code teilen, den sie importieren);
// ein Test in `tools/lint-regeln` vergleicht beide. Änderungen immer in beiden Dateien.
// Ein Server je Vitest-Projekt, Zustand geteilt: Verhalten und Protokoll gelten für alle Testdateien
// des Projekts. Jede Testdatei setzt den Zustand selbst zurück (`zuruecksetzen()`, vor jedem Test)
// oder läuft mit seriellen Läufen (`--no-file-parallelism`).

import { createServer } from "node:net";
import { inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    testMcpServer: { port: number; schluessel: string };
  }
}

/** Eine protokollierte Anfrage an den Test-Server (nur die Felder, die Tests brauchen). */
export interface ProtokollZeile {
  method: string;
  /** JSON-RPC-Methode, z. B. `tools/list` oder `tools/call`. */
  rpcMethod?: string;
  /** Name des Werkzeugs bei `tools/call`. */
  toolName?: string;
  /** Der Client hat die Verbindung geschlossen, bevor der Server fertig war. */
  closedByClient?: boolean;
  headers: Record<string, string>;
}

export interface TestServer {
  /** Port des Servers auf Loopback. */
  readonly port: number;
  /** Setzt einen Teil des Verhaltens (JSON-Form von `McpBehaviour`). */
  setzeVerhalten(verhalten: Record<string, unknown>): Promise<void>;
  /** Leert das Protokoll, stellt das Start-Verhalten her und schließt offene Verbindungen. */
  zuruecksetzen(): Promise<void>;
  /** Alle protokollierten Anfragen (Zugangsdaten unkenntlich). */
  anfragen(): Promise<ProtokollZeile[]>;
}

/** Der Server dieses Laufs. */
export function testServer(): TestServer {
  const { port, schluessel } = inject("testMcpServer");
  const steuer = async (pfad: string, methode: string, koerper?: unknown) => {
    const antwort = await fetch(`http://127.0.0.1:${port}${pfad}`, {
      method: methode,
      headers: { "x-steuerung-schluessel": schluessel, "content-type": "application/json" },
      ...(koerper === undefined ? {} : { body: JSON.stringify(koerper) }),
    });
    if (!antwort.ok) throw new Error(`Steuerung ${pfad}: ${antwort.status}`);
    return antwort;
  };
  return {
    port,
    async setzeVerhalten(verhalten) {
      await steuer("/_steuerung/verhalten", "POST", verhalten);
    },
    async zuruecksetzen() {
      await steuer("/_steuerung/zuruecksetzen", "POST");
    },
    async anfragen() {
      const antwort = await steuer("/_steuerung/anfragen", "GET");
      return ((await antwort.json()) as { requests: ProtokollZeile[] }).requests;
    },
  };
}

/** Ein Port auf Loopback, auf dem nichts lauscht (die Verbindung wird abgelehnt). */
export async function freierPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((fertig) => server.listen(0, "127.0.0.1", fertig));
  const adresse = server.address();
  await new Promise<void>((fertig) => server.close(() => fertig()));
  if (adresse === null || typeof adresse === "string") throw new Error("kein Port");
  return adresse.port;
}
