/**
 * PaiBot – Beispiel-Konto für die Doku-Bilder: eine kleine Vorschaltung vor dem Test-Anbieter, die
 * die Regel-Liste eines Kontos (`GET /api/v1/routing-rules`) in der belegten Form liefert und alles
 * andere unverändert an den Test-Anbieter weiterreicht. Nur Beispiel-Daten, nur an 127.0.0.1.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createServer, request as httpRequest } from "node:http";

/** Regeln des Beispiel-Kontos in der Form der Antwort (Kennungen sind erfundene Platzhalter). */
export const BEISPIEL_KONTO_REGELN = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Beispiel-Regel",
    description: "Beispiel",
    model: "beispiel/allrounder",
    models: ["beispiel/kompakt"],
    provider: {
      allow_fallbacks: true,
      data_collection: "deny",
      data_residency: "EU",
      max_retention_days: 0,
      eu_owned: true,
    },
    enabled: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Zweite Beispiel-Regel",
    description: "Beispiel",
    model: "beispiel/kompakt",
    models: [],
    provider: {
      allow_fallbacks: false,
      data_collection: "deny",
      data_residency: "US",
      max_retention_days: 30,
      eu_owned: false,
    },
    enabled: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Dritte Beispiel-Regel",
    description: "Beispiel",
    model: "beispiel/kompakt",
    models: [],
    provider: {},
    enabled: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    name: "Ausgeschaltete Beispiel-Regel",
    description: "Beispiel",
    model: "beispiel/kompakt",
    models: [],
    provider: { data_residency: "EU" },
    enabled: false,
  },
];

/**
 * Startet die Vorschaltung auf einem freien Port. Mit dem Verwaltungsschlüssel kommt die Liste;
 * mit jedem anderen Schlüssel (auch dem normalen) kommt 403 wie bei EUrouter.
 */
export function starteKontoAttrappe({ verwaltungsschluessel, anbieterUrl }) {
  const ziel = new URL(anbieterUrl);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/api/v1/routing-rules") {
      res.setHeader("content-type", "application/json");
      if (req.headers.authorization !== `Bearer ${verwaltungsschluessel}`) {
        res.statusCode = 403;
        res.end(
          JSON.stringify({
            error: {
              code: 403,
              message: "This key cannot access this endpoint",
              type: "permission_error",
            },
          }),
        );
        return;
      }
      res.end(JSON.stringify({ data: BEISPIEL_KONTO_REGELN }));
      return;
    }
    const weiter = httpRequest(
      {
        host: ziel.hostname,
        port: ziel.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: ziel.host },
      },
      (antwort) => {
        res.writeHead(antwort.statusCode ?? 502, antwort.headers);
        antwort.pipe(res);
      },
    );
    weiter.on("error", () => {
      res.statusCode = 502;
      res.end();
    });
    req.pipe(weiter);
  });
  return new Promise((fertig, fehler) => {
    server.once("error", fehler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      fertig({
        url: `http://127.0.0.1:${port}`,
        stop: () => new Promise((ok) => server.close(() => ok())),
      });
    });
  });
}
