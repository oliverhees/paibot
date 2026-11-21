/**
 * PaiBot – Tests: Routing-Regeln (Eintrag, Prüfung, `rule_name` in der Chat-Anfrage), Angabe
 * „wer hat geantwortet“, Modell-Liste in der Form von Mistral und „lokal“ nur für lokale Adressen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { randomBytes } from "node:crypto";
import { deriveKey, encryptSecret, loadMasterSecret } from "@paibot/crypto";
import { createFakeProvider, type FakeProvider } from "@paibot/fake-provider";
import { withTestPermit } from "@paibot/gate/testing";
import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import { providerSecretBinding, secretAad } from "@paibot/shared/bindung";
import { type ConversationId, type ModelId, newId, type ProviderId } from "@paibot/shared/ids";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  checkProviderBaseUrl,
  createEgressFetch,
  EgressBlockedError,
  providerEgressTarget,
} from "./egress";
import { fetchModels, testConnection } from "./models";
import { resolveModel } from "./resolve-model";
import {
  checkRoutingRule,
  isRoutingRuleName,
  routingRuleNameOf,
  routingRuleSlug,
  servedByOf,
} from "./routing-rules";
import { providerTargetFacts } from "./target";
import { PROVIDER_TEMPLATES } from "./templates";

const KEY = `sk-regel-${"r".repeat(24)}`;
const secretsKey = deriveKey(
  loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") }),
  "secrets-v1",
);

let fake: FakeProvider;
let baseUrl: string;

beforeAll(async () => {
  fake = createFakeProvider({ apiKey: KEY });
  ({ baseUrl } = await fake.start());
});
afterAll(() => fake.stop());
beforeEach(() => {
  fake.reset();
  fake.configure({
    apiKey: KEY,
    routingRules: [{ name: "EU Beispiel", provider: "beispiel-anbieter", model: "beispiel/m-1" }],
  });
});

const endpoint = () => ({ templateKey: "eurouter" as const, baseUrl, region: "local" as const });

describe("Eintrag einer Routing-Regel", () => {
  it("Name ↔ Slug nur bei EUrouter; andere Anbieter haben keine Regeln", () => {
    const slug = routingRuleSlug("EU Beispiel");
    expect(slug).toBe("rule:EU Beispiel");
    expect(routingRuleNameOf("eurouter", slug)).toBe("EU Beispiel");
    // Gegenprobe: dieselbe Kennung bei Mistral oder einem eigenen Anbieter ist ein Modell.
    expect(routingRuleNameOf("mistral", slug)).toBeUndefined();
    expect(routingRuleNameOf("eigener", slug)).toBeUndefined();
    expect(routingRuleNameOf("eurouter", "nebul/glm-5.3")).toBeUndefined();
  });

  it("unbrauchbare Namen werden abgewiesen", () => {
    for (const name of ["", " EU", "EU ", "a‮b", "a\nb", "zwei  Leer", "x".repeat(101)]) {
      expect(isRoutingRuleName(name), name).toBe(false);
      expect(() => routingRuleSlug(name)).toThrow(TypeError);
    }
    expect(isRoutingRuleName("EU GLM 5.3")).toBe(true);
  });
});

describe("checkRoutingRule (gegen den Test-Anbieter)", () => {
  it("bekannte Regel: ok, mit Anbieter und Modell aus der Antwort; Anfrage ohne model", async () => {
    const result = await checkRoutingRule(endpoint(), KEY, "EU Beispiel");
    expect(result).toEqual({
      ok: true,
      servedBy: { provider: "beispiel-anbieter", model: "beispiel/m-1" },
    });
    const sent = fake.requests.at(-1)?.body as Record<string, unknown>;
    expect(sent.rule_name).toBe("EU Beispiel");
    expect("model" in sent).toBe(false);
    expect(sent.max_tokens).toBeLessThanOrEqual(8);
    expect(sent.stream).toBe(false);
  });

  it("unbekannte Regel → regel_unbekannt (400); Groß/klein zählt", async () => {
    expect(await checkRoutingRule(endpoint(), KEY, "gibt-es-nicht")).toEqual({
      ok: false,
      code: "regel_unbekannt",
    });
    expect(await checkRoutingRule(endpoint(), KEY, "eu beispiel")).toEqual({
      ok: false,
      code: "regel_unbekannt",
    });
  });

  it("falscher Schlüssel, Limit, 403 und Ausfall haben eigene Codes", async () => {
    expect(await checkRoutingRule(endpoint(), "sk-falsch", "EU Beispiel")).toMatchObject({
      code: "schluessel_ungueltig",
    });
    fake.failNext({ kind: "status", status: 429 });
    expect(await checkRoutingRule(endpoint(), KEY, "EU Beispiel")).toMatchObject({
      code: "limit_erreicht",
    });
    fake.failNext({ kind: "status", status: 403 });
    expect(await checkRoutingRule(endpoint(), KEY, "EU Beispiel")).toMatchObject({
      code: "abgelehnt",
    });
    fake.failNext({ kind: "status", status: 503 });
    expect(await checkRoutingRule(endpoint(), KEY, "EU Beispiel")).toMatchObject({
      code: "anbieter_nicht_erreichbar",
    });
  });

  it("anderer Anbieter oder unbrauchbarer Name: keine Anfrage", async () => {
    const before = fake.requests.length;
    expect(
      await checkRoutingRule({ ...endpoint(), templateKey: "mistral" }, KEY, "EU Beispiel"),
    ).toMatchObject({ ok: false });
    expect(await checkRoutingRule(endpoint(), KEY, "a\u0000b")).toMatchObject({ ok: false });
    expect(fake.requests.length).toBe(before);
  });
});

describe("servedByOf", () => {
  it("nimmt nur saubere Kennungen; Steuerzeichen, HTML und Überlänge fallen weg", () => {
    expect(servedByOf({ provider: "tensorix", model: "tensorix/glm-5.3" })).toEqual({
      provider: "tensorix",
      model: "tensorix/glm-5.3",
    });
    expect(servedByOf({ provider: "Ten‮sorix", model: "a b" })).toBeUndefined();
    expect(servedByOf({ provider: "<b>x</b>", model: "x".repeat(201) })).toBeUndefined();
    expect(servedByOf({ provider: "nebul" })).toEqual({ provider: "nebul" });
    expect(servedByOf("nebul")).toBeUndefined();
  });
});

describe("rule_name in der Chat-Anfrage (resolveModel, direkt)", () => {
  const providerId = newId("provider") as ProviderId;
  const modelId = newId("model") as ModelId;
  const conversationId = newId("conversation") as ConversationId;
  const botId = newId("bot");

  function permitFor<R>(fn: Parameters<typeof withTestPermit<"modell.anfragen", R>>[2]) {
    const request: ActionRequest<"modell.anfragen"> = {
      actionId: newId("action"),
      type: "modell.anfragen",
      actor: `bot:${botId}`,
      target: { conversationId, runId: newId("run"), botId, modelId },
    };
    const facts: Facts<"modell.anfragen"> = {
      ...providerTargetFacts(providerId, baseUrl),
      botOfConversation: true,
      providerId,
      providerEnabled: true,
      region: "local",
      route: "direct",
      requestedMode: "off",
      schleuseReachable: true,
      inputChars: 2,
      maxInputChars: 1000,
      maxOutputTokens: 8,
      botMaxOutputTokens: 8,
      tokensToday: 0,
      killSwitch: false,
    };
    return withTestPermit(request, facts, fn);
  }

  const choiceWith = (slug: string, templateKey: "eurouter" | "mistral" = "eurouter") => ({
    provider: {
      id: providerId,
      templateKey,
      baseUrl,
      region: "local" as const,
      apiKeyEnc: encryptSecret(KEY, secretsKey, {
        aad: secretAad(providerSecretBinding(providerId, baseUrl)),
      }),
    },
    model: { id: modelId, slug, displayName: "Regel" },
    conversationId,
  });

  const chatBody = JSON.stringify({
    model: "rule:EU Beispiel",
    messages: [{ role: "user", content: "hi" }],
    stream: true,
    stream_options: { include_usage: true },
  });

  it("Regel: model fällt weg, rule_name geht mit; der Strom nennt den Anbieter", async () => {
    const text = await permitFor(async (permit) => {
      const m = resolveModel(permit, choiceWith(routingRuleSlug("EU Beispiel")), { secretsKey });
      const response = await m.fetch(`${m.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: chatBody,
      });
      return response.text();
    });
    const sent = fake.requests.at(-1)?.body as Record<string, unknown>;
    expect(sent.rule_name).toBe("EU Beispiel");
    expect("model" in sent).toBe(false);
    expect(sent.stream).toBe(true);
    expect(text).toContain('"provider":"beispiel-anbieter"');
    expect(text).toContain("data: [DONE]");
  });

  it("Gegenprobe: gleicher Slug bei Mistral ist ein Modell, kein rule_name", async () => {
    await permitFor(async (permit) => {
      const m = resolveModel(permit, choiceWith("rule:EU Beispiel", "mistral"), { secretsKey });
      await m.fetch(`${m.baseUrl}/chat/completions`, { method: "POST", body: chatBody });
    });
    const sent = fake.requests.at(-1)?.body as Record<string, unknown>;
    expect(sent.model).toBe("rule:EU Beispiel");
    expect("rule_name" in sent).toBe(false);
  });

  it("Körper, der kein JSON-Objekt ist, wird bei einer Regel nicht gesendet", async () => {
    const before = fake.requests.length;
    const error = await permitFor(async (permit) => {
      const m = resolveModel(permit, choiceWith(routingRuleSlug("EU Beispiel")), { secretsKey });
      return m.fetch(`${m.baseUrl}/chat/completions`, { method: "POST", body: "[1]" }).then(
        () => undefined,
        (e: unknown) => e,
      );
    });
    expect(error).toMatchObject({ code: "abgelehnt" });
    expect(fake.requests.length).toBe(before);
  });

  it("Regel über die Datenschleuse: abgelehnt (nicht geprüft, ob sie das Feld weitergibt)", async () => {
    const request: ActionRequest<"modell.anfragen"> = {
      actionId: newId("action"),
      type: "modell.anfragen",
      actor: `bot:${botId}`,
      target: { conversationId, runId: newId("run"), botId, modelId },
    };
    const error = await withTestPermit(
      request,
      {
        ...providerTargetFacts(providerId, baseUrl),
        botOfConversation: true,
        providerId,
        providerEnabled: true,
        region: "local",
        route: "schleuse",
        requestedMode: "on",
        schleuseReachable: true,
        inputChars: 2,
        maxInputChars: 1000,
        maxOutputTokens: 8,
        botMaxOutputTokens: 8,
        tokensToday: 0,
        killSwitch: false,
      },
      (permit) => {
        try {
          resolveModel(permit, choiceWith(routingRuleSlug("EU Beispiel")), {
            secretsKey,
            schleuse: { baseUrl, apiKey: "sk-schleuse-xyz" },
          });
        } catch (e) {
          return e;
        }
        return undefined;
      },
    );
    expect(error).toMatchObject({ code: "abgelehnt" });
  });
});

describe("Modell-Liste in der Form von Mistral", () => {
  it("nur Chat-Modelle, Kontext aus max_context_length, keine Regel-Vorsilbe, Namen bereinigt", async () => {
    fake.configure({
      modelFormat: "mistral",
      models: [
        { id: "mistral-small-latest", contextLength: 128000 },
        { id: "mistral-embed", supportsChat: false },
        { id: "rule:verwechslung" },
      ],
    });
    const models = await fetchModels({ baseUrl, region: "local" }, KEY);
    expect(models).toEqual([
      { slug: "mistral-small-latest", displayName: "mistral-small-latest", contextWindow: 128000 },
    ]);
  });

  it("Gegenprobe EUrouter-Form: Name mit Schreibrichtungs-Zeichen wird bereinigt", async () => {
    fake.configure({ models: [{ id: "fake/a", name: "Böse‮ Name\u0007" }] });
    const [model] = await fetchModels({ baseUrl, region: "local" }, KEY);
    expect(model?.displayName).toBe("Böse Name");
  });

  it("Vorlage Mistral: EU-Endpunkt laut Anbieter", () => {
    expect(PROVIDER_TEMPLATES.mistral.baseUrl).toBe("https://api.eu.mistral.ai/v1");
  });
});

describe("Ort „lokal“ nur für Adressen im eigenen Rechner oder Netz", () => {
  it("öffentliche IP-Adresse mit lokal: nicht_lokal; privat und Loopback gehen", () => {
    expect(checkProviderBaseUrl("http://8.8.8.8:11434/v1", "local")).toEqual({
      ok: false,
      problem: "nicht_lokal",
    });
    expect(checkProviderBaseUrl("https://[2606:4700::1111]/v1", "local")).toMatchObject({
      problem: "nicht_lokal",
    });
    expect(checkProviderBaseUrl("http://192.168.1.20:11434/v1", "local").ok).toBe(true);
    expect(checkProviderBaseUrl("http://127.0.0.1:11434/v1", "local").ok).toBe(true);
    // Gegenprobe: dieselbe öffentliche Adresse mit https und Ort EU ist erlaubt.
    expect(checkProviderBaseUrl("https://8.8.8.8/v1", "eu").ok).toBe(true);
  });

  it("Name, der auf eine öffentliche Adresse zeigt: gesperrt, auch über https", async () => {
    const seen: string[] = [];
    const guarded = createEgressFetch(
      [providerEgressTarget("https://ollama.example.org/v1", "local")],
      async () => {
        seen.push("gesendet");
        return new Response("{}");
      },
      { lookup: async (host) => (host === "ollama.example.org" ? ["93.184.215.14"] : []) },
    );
    const error = await guarded("https://ollama.example.org/v1/models").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EgressBlockedError);
    expect((error as EgressBlockedError).reason).toBe("adresse_nicht_erlaubt");
    expect(seen).toEqual([]);
    // Gegenprobe: zeigt der Name ins eigene Netz, geht die Anfrage.
    const ok = createEgressFetch(
      [providerEgressTarget("https://ollama.example.org/v1", "local")],
      async () => new Response("{}"),
      { lookup: async (host) => (host === "ollama.example.org" ? ["10.0.0.7"] : []) },
    );
    expect((await ok("https://ollama.example.org/v1/models")).status).toBe(200);
  });

  it("Verbindungstest meldet nicht_lokal statt eines allgemeinen Fehlers", async () => {
    expect(await testConnection({ baseUrl: "http://1.1.1.1/v1", region: "local" }, "")).toEqual({
      ok: false,
      code: "anbieter_nicht_erreichbar",
      detail: "nicht_lokal",
    });
    const blocked: typeof fetch = async () => {
      throw new EgressBlockedError("https://ollama.example.org:443", "adresse_nicht_erlaubt");
    };
    expect(
      await testConnection({ baseUrl: "https://ollama.example.org/v1", region: "local" }, "", {
        fetch: blocked,
      }),
    ).toMatchObject({ detail: "nicht_lokal" });
    // Gegenprobe: derselbe Block bei Ort EU ist ein gewöhnlicher Fehler ohne diesen Hinweis.
    const eu = await testConnection(
      { baseUrl: "https://ollama.example.org/v1", region: "eu" },
      "sk-x",
      { fetch: blocked },
    );
    expect(eu).toEqual({ ok: false, code: "anbieter_nicht_erreichbar" });
  });
});
