/**
 * PaiBot – Tests für Modell-Liste und Verbindungstest.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { isPaiBotError } from "@paibot/shared/fehler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchModels, testConnection } from "./models";
import { json, startTestServer, type TestServer } from "./test-server";

const KEY = `test-${"k".repeat(24)}-ende`;

const LIST = {
  object: "list",
  data: [
    {
      id: "zeta-chat",
      name: "Zeta",
      context_length: 32000,
      architecture: { modality: "text->text" },
      supported_api_endpoints: ["chat.completions", "embeddings"],
      supported_parameters: ["stream", "temperature"],
    },
    {
      id: "alpha-chat",
      architecture: { modality: "text->text" },
      supported_api_endpoints: ["chat.completions"],
      supported_parameters: ["stream"],
    },
    { id: "bild-modell", architecture: { modality: "text->image" } },
    { id: "nur-embedding", supported_api_endpoints: ["embeddings"] },
    { id: "ohne-strom", supported_parameters: ["temperature"] },
    { id: "ohne-zusatzfelder" },
    { id: "alpha-chat", name: "Doppelt" },
    { name: "ohne id" },
    "kaputt",
  ],
};

let server: TestServer;
const provider = () => ({ baseUrl: `${server.origin}/v1`, region: "local" as const });

beforeAll(async () => {
  server = await startTestServer();
});
afterAll(() => server.close());

describe("fetchModels", () => {
  it("liefert die gefilterte, sortierte Liste", async () => {
    server.setHandler((_req, res) => json(res, 200, LIST));
    const models = await fetchModels(provider(), undefined);
    expect(models).toEqual([
      { slug: "alpha-chat", displayName: "alpha-chat" },
      { slug: "ohne-zusatzfelder", displayName: "ohne-zusatzfelder" },
      { slug: "zeta-chat", displayName: "Zeta", contextWindow: 32000 },
    ]);
  });

  it("ruft /v1/models auf und sendet den Schlüssel nur als Bearer", async () => {
    server.setHandler((_req, res) => json(res, 200, { data: [] }));
    server.requests.length = 0;
    await fetchModels(provider(), KEY);
    await fetchModels(provider(), undefined);
    expect(server.requests[0]?.url).toBe("/v1/models");
    expect(server.requests[0]?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(server.requests[1]?.headers.authorization).toBeUndefined();
  });

  it("lehnt eine unzulässige Basis-URL ab, bevor etwas gesendet wird", async () => {
    server.requests.length = 0;
    await expect(
      fetchModels({ baseUrl: `${server.origin}/v1`, region: "eu" }, KEY),
    ).rejects.toMatchObject({ code: "anbieter_nicht_erreichbar" });
    expect(server.requests).toHaveLength(0);
  });

  it("weist einen Schlüssel mit Zeilenumbruch ab, ohne ihn zu nennen", async () => {
    const bad = `${KEY}\nX-Evil: 1`;
    const error = await fetchModels(provider(), bad).catch((e: unknown) => e);
    expect(isPaiBotError(error)).toBe(true);
    expect(error).toMatchObject({ code: "schluessel_ungueltig" });
    expect(JSON.stringify(error) + String(error) + (error as Error).stack).not.toContain("Evil");
  });

  it("meldet Abbruch über das Signal als unterbrochen", async () => {
    server.setHandler(() => undefined);
    const controller = new AbortController();
    const pending = fetchModels(provider(), undefined, { signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ code: "unterbrochen" });
  });
});

describe("testConnection", () => {
  it("ok mit Modellen", async () => {
    server.setHandler((_req, res) => json(res, 200, LIST));
    const result = await testConnection(provider(), KEY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.models).toHaveLength(3);
  });

  it("401 und 403 → schluessel_ungueltig", async () => {
    for (const status of [401, 403]) {
      server.setHandler((_req, res) => json(res, status, { error: "nein" }));
      expect(await testConnection(provider(), KEY)).toEqual({
        ok: false,
        code: "schluessel_ungueltig",
      });
    }
  });

  it("404 → anbieter_nicht_erreichbar", async () => {
    server.setHandler((_req, res) => res.writeHead(404).end("nicht da"));
    expect(await testConnection(provider(), KEY)).toEqual({
      ok: false,
      code: "anbieter_nicht_erreichbar",
    });
  });

  it("429 → limit_erreicht, 500 → anbieter_nicht_erreichbar", async () => {
    server.setHandler((_req, res) => res.writeHead(429).end());
    expect(await testConnection(provider(), KEY)).toEqual({ ok: false, code: "limit_erreicht" });
    server.setHandler((_req, res) => res.writeHead(500).end());
    expect(await testConnection(provider(), KEY)).toEqual({
      ok: false,
      code: "anbieter_nicht_erreichbar",
    });
  });

  it("Zeitüberschreitung → anbieter_nicht_erreichbar", async () => {
    server.setHandler(() => undefined); // antwortet nie
    const result = await testConnection(provider(), KEY, { timeoutMs: 100 });
    expect(result).toEqual({ ok: false, code: "anbieter_nicht_erreichbar" });
  });

  it("kein JSON oder falsche Form → anbieter_nicht_erreichbar", async () => {
    server.setHandler((_req, res) => res.writeHead(200).end("<html>Hallo</html>"));
    expect(await testConnection(provider(), KEY)).toEqual({
      ok: false,
      code: "anbieter_nicht_erreichbar",
    });
    server.setHandler((_req, res) => json(res, 200, { models: [] }));
    expect(await testConnection(provider(), KEY)).toEqual({
      ok: false,
      code: "anbieter_nicht_erreichbar",
    });
  });

  it("Server nicht erreichbar → anbieter_nicht_erreichbar", async () => {
    const result = await testConnection({ baseUrl: "http://127.0.0.1:1/v1", region: "local" }, KEY);
    expect(result).toEqual({ ok: false, code: "anbieter_nicht_erreichbar" });
  });

  it("der Schlüssel taucht in keinem Ergebnis und keinem Fehler auf", async () => {
    const outputs: string[] = [];
    for (const handler of [
      (_req: unknown, res: import("node:http").ServerResponse) => json(res, 401, { echo: KEY }),
      (_req: unknown, res: import("node:http").ServerResponse) => res.writeHead(500).end(KEY),
      (_req: unknown, res: import("node:http").ServerResponse) => res.writeHead(200).end(KEY),
    ]) {
      server.setHandler(handler);
      outputs.push(JSON.stringify(await testConnection(provider(), KEY)));
      const error = await fetchModels(provider(), KEY).catch((e: unknown) => e as Error);
      outputs.push(JSON.stringify(error), String(error), (error as Error).stack ?? "");
      outputs.push(JSON.stringify((error as { cause?: unknown }).cause ?? null));
    }
    for (const output of outputs) expect(output).not.toContain(KEY);
  });
});
