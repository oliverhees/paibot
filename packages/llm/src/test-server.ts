/**
 * PaiBot – kleiner HTTP-Server für die Tests der Anbieter-Schicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface SeenRequest {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  /** Körper der Anfrage; vollständig, sobald die Anfrage zu Ende gelesen ist. */
  body: string;
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => void;

export interface TestServer {
  /** `http://127.0.0.1:<port>` */
  origin: string;
  port: number;
  requests: SeenRequest[];
  setHandler(handler: Handler): void;
  close(): Promise<void>;
}

export async function startTestServer(initial?: Handler): Promise<TestServer> {
  let handler: Handler = initial ?? ((_req, res) => res.writeHead(404).end());
  const requests: SeenRequest[] = [];
  const server: Server = createServer((req, res) => {
    const seen: SeenRequest = {
      method: req.method ?? "",
      url: req.url ?? "",
      headers: req.headers,
      body: "",
    };
    requests.push(seen);
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      seen.body += chunk;
    });
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    port,
    requests,
    setHandler(next) {
      handler = next;
    },
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}
