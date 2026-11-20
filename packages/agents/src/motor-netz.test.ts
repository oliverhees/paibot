/**
 * PaiBot – Tests zum Netzverkehr des Motors: nur das Ziel aus dem Modell-Zugang, eine
 * Text-Kennung als Modell schlägt fehl, die Ausgangs-Liste sperrt fremde Ziele.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createFakeProvider, type FakeProvider } from "@paibot/fake-provider";
import type { MotorEvent, TurnInput } from "@paibot/shared/motor";
import { streamText } from "ai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createAiSdkMotor } from "./motor-aisdk";
import { modelAccess, type TurnRequest } from "./testing/test-umgebung";

const API_KEY = `sk-test-${"n".repeat(24)}`;

let provider: FakeProvider;
let baseUrl: string;
let foreign: Server;
let foreignUrl: string;
let foreignHits = 0;

beforeAll(async () => {
  provider = createFakeProvider({ apiKey: API_KEY });
  ({ baseUrl } = await provider.start({ port: 0 }));
  foreign = createServer((_req, res) => {
    foreignHits++;
    res.writeHead(200, { "content-type": "application/json" }).end("{}");
  });
  await new Promise<void>((resolve) => foreign.listen(0, "127.0.0.1", resolve));
  foreignUrl = `http://127.0.0.1:${(foreign.address() as AddressInfo).port}/v1`;
});
afterAll(async () => {
  await provider.stop();
  await new Promise((resolve) => foreign.close(resolve));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  provider.reset();
});

/** Ersetzt das globale `fetch` durch einen Rekorder, der nie ins Netz geht. */
function recordGlobalFetch(): string[] {
  const targets: string[] = [];
  vi.stubGlobal("fetch", async (url: unknown) => {
    targets.push(url instanceof Request ? url.url : String(url));
    throw new TypeError("fetch failed");
  });
  return targets;
}

async function collect(iterable: AsyncIterable<MotorEvent>): Promise<MotorEvent[]> {
  const events: MotorEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

const TURN: TurnRequest = {
  system: "Test",
  history: [{ role: "user", text: "Hallo" }],
  limits: { maxOutputTokens: 64, timeoutMs: 5000 },
};

describe("kein Netzverkehr außer zum Anbieter", () => {
  it("eine Text-Kennung als Modell schlägt fehl und zielt auf ein fremdes Gateway", async () => {
    // Absichtlich über eine Variable: die Lint-Regel fängt nur Text direkt im Aufruf ab.
    const textKennung: string = ["openai", "gpt-test"].join("/");
    const run = async () => {
      const failures: unknown[] = [];
      const result = streamText({
        model: textKennung,
        prompt: "Hallo",
        maxRetries: 0,
        onError: () => undefined,
      });
      for await (const part of result.stream) if (part.type === "error") failures.push(part.error);
      return failures;
    };

    // Ohne Zugangsdaten: Fehler, bevor etwas gesendet wird.
    const targetsWithoutKey = recordGlobalFetch();
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const withoutKey = await run();
    expect(withoutKey).toHaveLength(1);
    expect((withoutKey[0] as Error).name).toBe("GatewayAuthenticationError");
    expect(targetsWithoutKey).toEqual([]);

    // Mit irgendeinem Schlüssel in der Umgebung ginge die Anfrage an das Gateway. Der Rekorder
    // fängt sie ab und meldet das Ziel; ins Netz geht nichts.
    vi.stubEnv("AI_GATEWAY_API_KEY", "nur-fuer-den-test");
    const targets = recordGlobalFetch();
    const withKey = await run();
    expect(withKey).toHaveLength(1);
    expect(targets).toHaveLength(1);
    expect(new URL(targets[0] ?? "").hostname).toBe("ai-gateway.vercel.sh");
  });

  it("der Motor geht auch mit Gateway-Schlüssel in der Umgebung nur zum Anbieter", async () => {
    const original = globalThis.fetch;
    const zugang = modelAccess({ baseUrl, apiKey: API_KEY, baseFetch: original });
    vi.stubEnv("AI_GATEWAY_API_KEY", "nur-fuer-den-test");
    const targets = recordGlobalFetch();
    const events = await zugang.step(createAiSdkMotor(), TURN);
    expect(events.at(-1)?.type).toBe("finish");
    expect(targets).toEqual([]);
    expect(provider.requests.map((r) => r.path)).toEqual(["/v1/chat/completions"]);
  });

  it("die Ausgangs-Liste sperrt ein fremdes Ziel, bevor eine Verbindung entsteht", async () => {
    // Der echte Zugang innerhalb von `execute`, aber die Anfrage zielt woanders hin: Die
    // Ausgangs-Liste kennt nur den Anbieter, also wird nichts gesendet.
    const zugang = modelAccess({ baseUrl, apiKey: API_KEY });
    const failure = await zugang.request(async (model) =>
      model.fetch(`${foreignUrl}/chat/completions`, { method: "POST", body: "{}" }).then(
        () => undefined,
        (error: unknown) => error,
      ),
    );
    expect((failure as { name?: unknown }).name).toBe("EgressBlockedError");
    expect(foreignHits).toBe(0);
    expect(provider.requests).toHaveLength(0);
  });

  it("eine Kopie des Zugangs mit umgebogener Basis-URL nimmt der Motor nicht an", async () => {
    const zugang = modelAccess({ baseUrl, apiKey: API_KEY });
    const events = await zugang.request(async (model) => {
      const redirected = { ...model, baseUrl: foreignUrl } as TurnInput["model"];
      return collect(
        createAiSdkMotor().runTurn({ ...TURN, model: redirected }, new AbortController().signal),
      );
    });
    expect(events).toEqual([
      { type: "error", code: "intern", retryable: false, detail: "zugang_ungueltig" },
    ]);
    expect(foreignHits).toBe(0);
    expect(provider.requests).toHaveLength(0);
  });

  it("ein Zugang, der aus `execute` herausgereicht wurde, sendet nichts mehr", async () => {
    const zugang = modelAccess({ baseUrl, apiKey: API_KEY });
    const leaked = await zugang.request(async (model) => model);
    const events = await collect(
      createAiSdkMotor().runTurn({ ...TURN, model: leaked }, new AbortController().signal),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", retryable: false });
    expect(provider.requests).toHaveLength(0);
  });
});
