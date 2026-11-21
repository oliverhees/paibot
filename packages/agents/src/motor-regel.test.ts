/**
 * PaiBot – Tests: Motor mit einer Routing-Regel (EUrouter) gegen den Test-Anbieter. Die Anfrage
 * nennt `rule_name` statt `model`, und das Ende der Runde sagt, wer laut Strom geantwortet hat.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createFakeProvider, type FakeProvider } from "@paibot/fake-provider";
import { routingRuleSlug } from "@paibot/llm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAiSdkMotor } from "./motor-aisdk";
import { modelAccess, type TurnRequest } from "./testing/test-umgebung";

const API_KEY = `sk-test-${"g".repeat(24)}`;
let provider: FakeProvider;
let baseUrl: string;

beforeAll(async () => {
  provider = createFakeProvider({ apiKey: API_KEY });
  ({ baseUrl } = await provider.start({ port: 0 }));
});
afterAll(() => provider.stop());
beforeEach(() => {
  provider.reset();
  provider.configure({
    apiKey: API_KEY,
    routingRules: [
      { name: "Beispiel-Regel", provider: "beispiel-nord", model: "beispiel/modell-1" },
    ],
  });
});

const TURN: TurnRequest = {
  system: "Test",
  history: [{ role: "user", text: "Hallo" }],
  limits: { maxOutputTokens: 64, timeoutMs: 5000 },
};

describe("Motor mit Routing-Regel", () => {
  it("schickt rule_name ohne model, streamt und meldet den Anbieter aus dem Strom", async () => {
    const zugang = modelAccess({
      baseUrl,
      apiKey: API_KEY,
      templateKey: "eurouter",
      slug: routingRuleSlug("Beispiel-Regel"),
    });
    const events = await zugang.step(createAiSdkMotor(), TURN);
    const body = provider.requests.at(-1)?.body as Record<string, unknown>;
    expect(body.rule_name).toBe("Beispiel-Regel");
    expect("model" in body).toBe(false);
    expect(body.stream).toBe(true);
    expect(events.filter((e) => e.type === "text-delta").length).toBeGreaterThan(0);
    expect(events.at(-1)).toMatchObject({
      type: "finish",
      servedBy: { provider: "beispiel-nord", model: "beispiel/modell-1" },
    });
  });

  it("Gegenprobe: gewöhnliches Modell schickt model, kein rule_name; ohne provider im Strom kein Anbieter", async () => {
    const zugang = modelAccess({ baseUrl, apiKey: API_KEY, templateKey: "eurouter" });
    const events = await zugang.step(createAiSdkMotor(), TURN);
    const body = provider.requests.at(-1)?.body as Record<string, unknown>;
    expect(body.model).toBe("fake/test-modell");
    expect("rule_name" in body).toBe(false);
    const last = events.at(-1);
    expect(last?.type).toBe("finish");
    expect(last?.type === "finish" && "servedBy" in last).toBe(false);
  });

  it("unbekannte Regel: Fehler-Ereignis, keine Ausnahme", async () => {
    const zugang = modelAccess({
      baseUrl,
      apiKey: API_KEY,
      templateKey: "eurouter",
      slug: routingRuleSlug("Gibt es nicht"),
    });
    const events = await zugang.step(createAiSdkMotor(), TURN);
    expect(events.at(-1)).toMatchObject({ type: "error" });
  });
});
