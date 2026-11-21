/**
 * PaiBot – Tests für Route, Datenschleuse und Fehler-Abbildung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { PaiBotError } from "@paibot/shared/fehler";
import { MOTOR_ERROR_CODES } from "@paibot/shared/motor";
import type { ProviderTemplateKey } from "@paibot/shared/objekte";
import { errorWayOut } from "@paibot/shared/texte";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EgressBlockedError } from "./egress";
import {
  isRetryable,
  mapProviderError,
  providerFailure,
  schleuseFailureCode,
  wayOutKeyOf,
} from "./errors";
import { isSchleuseUnavailable, resolveRoute, resolveSchleuseMode } from "./route";
import {
  checkSchleuseHealth,
  probeSchleuse,
  SCHLEUSE_ENV,
  schleuseFromEnv,
  schleuseModelName,
} from "./schleuse";
import { json, startTestServer, type TestServer } from "./test-server";
import { schleuseLivenessReply, schleuseNoKeyReply, schleuseWrongKeyReply } from "./testing";

describe("resolveSchleuseMode", () => {
  it("Nachricht vor Unterhaltung vor Standard", () => {
    expect(resolveSchleuseMode({ message: "on", conversation: "off", settings: "off" })).toBe("on");
    expect(resolveSchleuseMode({ message: "off", conversation: "on", settings: "on" })).toBe("off");
    expect(resolveSchleuseMode({ conversation: "on", settings: "off" })).toBe("on");
    expect(resolveSchleuseMode({ settings: "on" })).toBe("on");
    expect(resolveSchleuseMode({ settings: "off" })).toBe("off");
  });
});

describe("resolveRoute", () => {
  const up = { installed: true, reachable: true };
  it("wechselt mit der Einstellung", () => {
    expect(resolveRoute("off", up)).toBe("direct");
    expect(resolveRoute("on", up)).toBe("schleuse");
  });
  it("aus bleibt direkt, auch wenn die Datenschleuse fehlt", () => {
    expect(resolveRoute("off", { installed: false, reachable: false })).toBe("direct");
  });
  it("an ohne nutzbare Datenschleuse: nie ein Rückfall auf direkt", () => {
    const missing = resolveRoute("on", { installed: false, reachable: false });
    expect(missing).toEqual({ unavailable: true, reason: "nicht_installiert" });
    const down = resolveRoute("on", { installed: true, reachable: false });
    expect(down).toEqual({ unavailable: true, reason: "nicht_erreichbar" });
    expect(isSchleuseUnavailable(missing)).toBe(true);
    expect(isSchleuseUnavailable(down)).toBe(true);
  });
});

describe("schleuseFromEnv", () => {
  it("ohne URL nicht installiert", () => {
    expect(schleuseFromEnv({})).toBeUndefined();
    expect(schleuseFromEnv({ [SCHLEUSE_ENV.url]: "  " })).toBeUndefined();
  });
  it("liest URL und Schlüssel", () => {
    expect(
      schleuseFromEnv({
        [SCHLEUSE_ENV.url]: "http://datenschleuse:4000/v1/",
        [SCHLEUSE_ENV.key]: " sk-test ",
      }),
    ).toEqual({
      baseUrl: "http://datenschleuse:4000/v1",
      apiKey: "sk-test",
      providerKeyPath: "anfrage",
    });
  });
  it("Weg des Anbieter-Schlüssels: Standard anfrage, umgebung als Rückfall, sonst Fehler", () => {
    const base = { [SCHLEUSE_ENV.url]: "http://datenschleuse:4000/v1", [SCHLEUSE_ENV.key]: "k" };
    expect(schleuseFromEnv(base)?.providerKeyPath).toBe("anfrage");
    expect(schleuseFromEnv({ ...base, [SCHLEUSE_ENV.keyPath]: " " })?.providerKeyPath).toBe(
      "anfrage",
    );
    expect(schleuseFromEnv({ ...base, [SCHLEUSE_ENV.keyPath]: "umgebung" })?.providerKeyPath).toBe(
      "umgebung",
    );
    expect(() => schleuseFromEnv({ ...base, [SCHLEUSE_ENV.keyPath]: "beides" })).toThrow(TypeError);
  });
  it("Fehler ohne Schlüssel oder mit schlechter URL, ohne Werte zu nennen", () => {
    const secret = "geheim-123";
    const cases: Record<string, string>[] = [
      { [SCHLEUSE_ENV.url]: "http://datenschleuse:4000/v1" },
      { [SCHLEUSE_ENV.url]: "kein url", [SCHLEUSE_ENV.key]: secret },
      { [SCHLEUSE_ENV.url]: "ftp://datenschleuse/v1", [SCHLEUSE_ENV.key]: secret },
      { [SCHLEUSE_ENV.url]: `http://nutzer:${secret}@datenschleuse/v1`, [SCHLEUSE_ENV.key]: "k" },
      { [SCHLEUSE_ENV.url]: "http://169.254.169.254/v1", [SCHLEUSE_ENV.key]: secret },
    ];
    for (const env of cases) {
      let caught: unknown;
      try {
        schleuseFromEnv(env);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(TypeError);
      expect(String(caught)).not.toContain(secret);
    }
  });
});

describe("schleuseModelName", () => {
  it("baut <anbieter>/<slug>", () => {
    expect(schleuseModelName("eurouter", "mistral-small-latest")).toBe(
      "eurouter/mistral-small-latest",
    );
    expect(schleuseModelName("eurouter", "org/modell:v1")).toBe("eurouter/org/modell:v1");
  });
  it("lehnt Ungültiges ab", () => {
    expect(() => schleuseModelName("Euro Router" as ProviderTemplateKey, "x")).toThrow(TypeError);
    // Nur Schlüssel aus der Liste der Vorlagen, auch wenn sie wie einer aussehen.
    expect(() => schleuseModelName("lokal" as ProviderTemplateKey, "x")).toThrow(TypeError);
    expect(schleuseModelName("eigener", "x")).toBe("eigener/x");
    expect(() => schleuseModelName("eurouter", "")).toThrow(TypeError);
    expect(() => schleuseModelName("eurouter", "a b")).toThrow(TypeError);
  });
});

describe("checkSchleuseHealth", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(() => server.close());
  const connection = () => ({ baseUrl: `${server.origin}/v1`, apiKey: "sk-health" });

  it("ohne Verbindung: nicht installiert", async () => {
    expect(await checkSchleuseHealth(undefined)).toEqual({ installed: false, reachable: false });
  });
  it("erreichbar: erst Lebenszeichen ohne Schlüssel, dann Modell-Liste mit Schlüssel", async () => {
    server.setHandler((_req, res) => json(res, 200, { data: [] }));
    server.requests.length = 0;
    expect(await checkSchleuseHealth(connection())).toEqual({ installed: true, reachable: true });
    expect(server.requests.map((r) => r.url)).toEqual(["/health/liveliness", "/v1/models"]);
    expect(server.requests[0]?.headers.authorization).toBeUndefined();
    expect(server.requests[1]?.headers.authorization).toBe("Bearer sk-health");
  });
  it("Fehlerantwort, Zeitüberschreitung und kein Server: nicht erreichbar, ohne zu werfen", async () => {
    server.setHandler((_req, res) => res.writeHead(401).end());
    expect(await checkSchleuseHealth(connection())).toEqual({ installed: true, reachable: false });
    server.setHandler(() => undefined);
    expect(await checkSchleuseHealth(connection(), { timeoutMs: 80 })).toEqual({
      installed: true,
      reachable: false,
    });
    expect(await checkSchleuseHealth({ baseUrl: "http://127.0.0.1:1/v1", apiKey: "k" })).toEqual({
      installed: true,
      reachable: false,
    });
  });
});

describe("probeSchleuse", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(() => server.close());
  const connection = (apiKey = "sk-richtig") => ({ baseUrl: `${server.origin}/v1`, apiKey });

  /** Antwortet wie die Datenschleuse ohne eigene Datenbank (gemessen). */
  function wieDieDatenschleuse(req: IncomingMessage, res: ServerResponse) {
    if (req.url === "/health/liveliness") return schleuseLivenessReply(res);
    if (req.url === "/v1/models") {
      const auth = req.headers.authorization;
      if (auth === undefined) return schleuseNoKeyReply(res);
      if (auth !== "Bearer sk-richtig") return schleuseWrongKeyReply(res);
      return json(res, 200, { data: [{ id: "eurouter/*" }] });
    }
    return json(res, 404, {});
  }

  it("aus, bereit, Schlüssel falsch", async () => {
    server.setHandler(wieDieDatenschleuse);
    expect(await probeSchleuse(undefined)).toEqual({ state: "aus" });
    expect(await probeSchleuse(connection())).toEqual({ state: "bereit" });
    expect(await probeSchleuse(connection("sk-falsch"))).toEqual({ state: "schluessel_falsch" });
    expect(await checkSchleuseHealth(connection("sk-falsch"))).toEqual({
      installed: true,
      reachable: false,
    });
    server.setHandler((req, res) =>
      req.url === "/v1/models" ? res.writeHead(401).end() : wieDieDatenschleuse(req, res),
    );
    expect(await probeSchleuse(connection())).toEqual({ state: "schluessel_falsch" });
  });

  it("nicht erreichbar: Lebenszeichen fehlt, Zeitgrenze, kein Dienst, andere Fehler", async () => {
    server.setHandler((_req, res) => json(res, 503, {}));
    expect(await probeSchleuse(connection())).toEqual({ state: "nicht_erreichbar" });
    server.setHandler((req, res) =>
      req.url === "/v1/models" ? json(res, 500, {}) : wieDieDatenschleuse(req, res),
    );
    expect(await probeSchleuse(connection())).toEqual({ state: "nicht_erreichbar" });
    server.setHandler((req, res) =>
      req.url === "/v1/models"
        ? json(res, 400, { error: { type: "anders" } })
        : wieDieDatenschleuse(req, res),
    );
    expect(await probeSchleuse(connection())).toEqual({ state: "nicht_erreichbar" });
    // Zeitgrenze je Stufe: Lebenszeichen hängt, und ebenso die Modell-Liste.
    server.setHandler(() => undefined);
    expect(await probeSchleuse(connection(), { timeoutMs: 80 })).toEqual({
      state: "nicht_erreichbar",
    });
    server.setHandler((req, res) =>
      req.url === "/v1/models" ? undefined : wieDieDatenschleuse(req, res),
    );
    expect(await probeSchleuse(connection(), { timeoutMs: 80 })).toEqual({
      state: "nicht_erreichbar",
    });
    expect(await probeSchleuse({ baseUrl: "http://127.0.0.1:1/v1", apiKey: "k" })).toEqual({
      state: "nicht_erreichbar",
    });
  });

  it("ohne Lebenszeichen nicht erreichbar, auch wenn die Modell-Liste antwortet", async () => {
    server.setHandler((req, res) =>
      req.url === "/health/liveliness" ? json(res, 503, {}) : wieDieDatenschleuse(req, res),
    );
    server.requests.length = 0;
    expect(await probeSchleuse(connection())).toEqual({ state: "nicht_erreichbar" });
    expect(server.requests.map((r) => r.url)).toEqual(["/health/liveliness"]);
  });

  it("folgt keiner Weiterleitung, auch nicht auf derselben Adresse", async () => {
    server.setHandler((req, res) =>
      req.url === "/health/liveliness"
        ? res.writeHead(302, { location: "/anderswo" }).end()
        : json(res, 200, {}),
    );
    expect(await probeSchleuse(connection())).toEqual({ state: "nicht_erreichbar" });
  });

  it("folgt keiner Weiterleitung und erreicht nur die eigene Adresse", async () => {
    const other = await startTestServer((_req, res) => json(res, 200, {}));
    try {
      server.setHandler((_req, res) =>
        res.writeHead(302, { location: `${other.origin}/health/liveliness` }).end(),
      );
      expect(await probeSchleuse(connection())).toEqual({ state: "nicht_erreichbar" });
      expect(other.requests).toHaveLength(0);
    } finally {
      await other.close();
    }
  });

  it("Basis-URL mit Vorsatz-Pfad: Lebenszeichen neben /v1", async () => {
    server.setHandler((req, res) =>
      req.url === "/schleuse/health/liveliness" || req.url === "/schleuse/v1/models"
        ? json(res, 200, {})
        : json(res, 404, {}),
    );
    expect(
      await probeSchleuse({ baseUrl: `${server.origin}/schleuse/v1`, apiKey: "sk-richtig" }),
    ).toEqual({ state: "bereit" });
  });
});

describe("mapProviderError", () => {
  const res = (status: number) => new Response(null, { status });
  it("Statuscodes", () => {
    expect(mapProviderError(res(401))).toBe("schluessel_ungueltig");
    expect(mapProviderError(res(403))).toBe("schluessel_ungueltig");
    expect(mapProviderError(res(429))).toBe("limit_erreicht");
    expect(mapProviderError(res(402))).toBe("limit_erreicht");
    expect(mapProviderError(res(404))).toBe("anbieter_nicht_erreichbar");
    expect(mapProviderError(res(500))).toBe("anbieter_nicht_erreichbar");
    expect(mapProviderError(res(503))).toBe("anbieter_nicht_erreichbar");
    expect(mapProviderError(res(400))).toBe("intern");
    expect(mapProviderError({ statusCode: 401 })).toBe("schluessel_ungueltig");
    expect(mapProviderError({ status: 429 })).toBe("limit_erreicht");
  });
  it("Netz, Zeit, Abbruch, Ausgangs-Liste", () => {
    expect(mapProviderError(new TypeError("fetch failed"))).toBe("anbieter_nicht_erreichbar");
    expect(
      mapProviderError(
        new TypeError("x", { cause: Object.assign(new Error("y"), { code: "ECONNREFUSED" }) }),
      ),
    ).toBe("anbieter_nicht_erreichbar");
    expect(mapProviderError(new DOMException("t", "TimeoutError"))).toBe(
      "anbieter_nicht_erreichbar",
    );
    expect(mapProviderError(new DOMException("a", "AbortError"))).toBe("unterbrochen");
    expect(mapProviderError(new EgressBlockedError("https://x:443"))).toBe(
      "anbieter_nicht_erreichbar",
    );
  });
  it("Status 2xx: Strom bricht nach erfolgreicher Antwort ab, die Ursache entscheidet", () => {
    // So meldet die Bibliothek einen Abbruch mitten im Strom: Status der Antwort plus Ursache.
    const socket = Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" });
    const terminated = new TypeError("terminated", { cause: socket });
    const apiCallError = (cause: unknown, statusCode = 200) =>
      Object.assign(new Error("Fehler beim Lesen"), { name: "AI_APICallError", statusCode, cause });
    expect(mapProviderError(apiCallError(terminated))).toBe("anbieter_nicht_erreichbar");
    expect(mapProviderError(apiCallError(socket))).toBe("anbieter_nicht_erreichbar");
    expect(mapProviderError(apiCallError(new TypeError("terminated")))).toBe(
      "anbieter_nicht_erreichbar",
    );
    expect(
      mapProviderError(apiCallError(Object.assign(new Error("x"), { code: "ECONNRESET" }), 204)),
    ).toBe("anbieter_nicht_erreichbar");
    expect(mapProviderError(apiCallError(new DOMException("a", "AbortError")))).toBe(
      "unterbrochen",
    );
    expect(mapProviderError(apiCallError(new DOMException("t", "TimeoutError")))).toBe(
      "anbieter_nicht_erreichbar",
    );
    // Ohne erkennbare Ursache bleibt es intern, ebenso bei kaputtem JSON in einer 200-Antwort.
    expect(mapProviderError(apiCallError(undefined))).toBe("intern");
    expect(mapProviderError(apiCallError(new SyntaxError("Unexpected token")))).toBe("intern");
    expect(mapProviderError({ status: 200 })).toBe("intern");
    // Eine Fehler-Antwort bleibt beim Status, auch mit Netz-Ursache.
    expect(mapProviderError(apiCallError(terminated, 401))).toBe("schluessel_ungueltig");
  });
  it("Block der Datenschleuse", () => {
    expect(mapProviderError({ name: "DatenschleuseBlocked", message: "x" })).toBe(
      "schleuse_blockiert",
    );
    expect(
      mapProviderError({
        statusCode: 400,
        responseBody: '{"error":{"type":"DatenschleuseBlocked"}}',
      }),
    ).toBe("schleuse_blockiert");
    expect(
      mapProviderError({ status: 502, data: { error: { message: "datenschleuse blocked" } } }),
    ).toBe("schleuse_blockiert");
  });
  it("Route schleuse: Block (HTTP 500, Typ None) und falscher Schlüssel (HTTP 400)", () => {
    const schleuse = { route: "schleuse" } as const;
    const fehler = (statusCode: number, error: Record<string, unknown>) => ({
      name: "AI_APICallError",
      message: "Fehler der Gegenstelle",
      statusCode,
      responseBody: JSON.stringify({
        error: { param: "None", code: String(statusCode), ...error },
      }),
    });
    const block = (message: string) => fehler(500, { type: "None", message });
    for (const message of [
      "Exception occured - Analyse nicht erreichbar; Request blockiert (fail-closed, kein unmaskiertes PII).",
      "Inhalt wird NICHT an die Cloud gesendet.",
      "fail-closed",
    ]) {
      expect(mapProviderError(block(message), schleuse)).toBe("schleuse_blockiert");
      expect(isRetryable(mapProviderError(block(message), schleuse))).toBe(false);
    }
    // Ohne Route bleibt es beim Status (neuer Versuch möglich).
    expect(mapProviderError(block("blockiert"))).toBe("anbieter_nicht_erreichbar");
    // HTTP 500 ohne passende Meldung oder mit anderem Typ: Anbieter nicht erreichbar.
    expect(mapProviderError(block("Upstream down"), schleuse)).toBe("anbieter_nicht_erreichbar");
    expect(
      mapProviderError(fehler(500, { type: "APIError", message: "blockiert" }), schleuse),
    ).toBe("anbieter_nicht_erreichbar");
    // Falscher Zugangsschlüssel ohne Datenbank.
    const falsch = fehler(400, { type: "no_db_connection", message: "No connected db." });
    expect(mapProviderError(falsch, schleuse)).toBe("schluessel_ungueltig");
    expect(mapProviderError(falsch)).toBe("intern");
    expect(mapProviderError(fehler(400, { type: "bad_request" }), schleuse)).toBe("intern");
    expect(mapProviderError(fehler(401, { type: "auth_error" }), schleuse)).toBe(
      "schluessel_ungueltig",
    );
    expect(mapProviderError(fehler(429, {}), schleuse)).toBe("limit_erreicht");
    // Kaputter oder fehlender Körper: nach dem Status.
    expect(mapProviderError({ statusCode: 500, responseBody: "{kaputt" }, schleuse)).toBe(
      "anbieter_nicht_erreichbar",
    );
    expect(mapProviderError(new Response(null, { status: 400 }), schleuse)).toBe("intern");
    // Ohne Status wie sonst; ein Code des Modell-Zugangs bleibt.
    expect(mapProviderError(new TypeError("fetch failed"), schleuse)).toBe(
      "anbieter_nicht_erreichbar",
    );
    expect(mapProviderError(providerFailure("schleuse_blockiert"), schleuse)).toBe(
      "schleuse_blockiert",
    );
  });
  it("schleuseFailureCode nimmt nur Status und Kennungen", () => {
    expect(schleuseFailureCode(500, '{"error":{"type":"None","message":"blockiert"}}')).toBe(
      "schleuse_blockiert",
    );
    expect(schleuseFailureCode(400, '{"error":{"type":"no_db_connection"}}')).toBe(
      "schluessel_ungueltig",
    );
    expect(schleuseFailureCode(500, undefined)).toBe("anbieter_nicht_erreichbar");
    expect(schleuseFailureCode(503, "[]")).toBe("anbieter_nicht_erreichbar");
    expect(schleuseFailureCode(200, "")).toBe("intern");
    // Zu großer Körper wird nicht gelesen.
    const riesig = JSON.stringify({ error: { type: "None", message: "blockiert".repeat(10_000) } });
    expect(schleuseFailureCode(500, riesig)).toBe("anbieter_nicht_erreichbar");
  });
  it("PaiBotError mit Motor-Code bleibt, Unbekanntes wird intern", () => {
    expect(mapProviderError(providerFailure("limit_erreicht"))).toBe("limit_erreicht");
    expect(mapProviderError(new Error("boom"))).toBe("intern");
    expect(mapProviderError(undefined)).toBe("intern");
    expect(mapProviderError("text")).toBe("intern");
  });
  it("wiederholbar sind nur Limit und Erreichbarkeit", () => {
    expect(isRetryable("limit_erreicht")).toBe(true);
    expect(isRetryable("anbieter_nicht_erreichbar")).toBe(true);
    expect(isRetryable("schluessel_ungueltig")).toBe(false);
  });
});

describe("Ausweg-Text", () => {
  it("jeder Motor-Fehlercode hat einen Ausweg-Schlüssel und einen Text", () => {
    for (const code of MOTOR_ERROR_CODES) {
      expect(wayOutKeyOf(code)).toBe(`fehler.${code}.ausweg`);
      const error = providerFailure(code);
      expect(error).toBeInstanceOf(PaiBotError);
      expect(error.code).toBe(code);
      expect(error.ausweg).toBe(errorWayOut(code));
      expect(error.ausweg).toBeTruthy();
    }
  });
});
