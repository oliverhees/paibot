/**
 * PaiBot – Tests für Route, Datenschleuse und Fehler-Abbildung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { PaiBotError } from "@paibot/shared/fehler";
import { MOTOR_ERROR_CODES } from "@paibot/shared/motor";
import { errorWayOut } from "@paibot/shared/texte";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EgressBlockedError } from "./egress";
import { isRetryable, mapProviderError, providerFailure, wayOutKeyOf } from "./errors";
import { isSchleuseUnavailable, resolveRoute, resolveSchleuseMode } from "./route";
import { checkSchleuseHealth, SCHLEUSE_ENV, schleuseFromEnv, schleuseModelName } from "./schleuse";
import { json, startTestServer, type TestServer } from "./test-server";

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
    ).toEqual({ baseUrl: "http://datenschleuse:4000/v1", apiKey: "sk-test" });
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
    expect(() => schleuseModelName("Euro Router", "x")).toThrow(TypeError);
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
  it("erreichbar, mit Schlüssel angefragt", async () => {
    server.setHandler((_req, res) => json(res, 200, { data: [] }));
    server.requests.length = 0;
    expect(await checkSchleuseHealth(connection())).toEqual({ installed: true, reachable: true });
    expect(server.requests[0]?.url).toBe("/v1/models");
    expect(server.requests[0]?.headers.authorization).toBe("Bearer sk-health");
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
