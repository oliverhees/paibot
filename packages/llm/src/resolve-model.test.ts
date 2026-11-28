/**
 * PaiBot – Tests für den Modell-Zugang gegen eine Berechtigung des Tors.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { deriveKey, encryptSecret, loadMasterSecret } from "@paibot/crypto";
import { encryptLegacySecret } from "@paibot/crypto/testing";
import type { GatePermit } from "@paibot/gate";
import { withTestPermit } from "@paibot/gate/testing";
import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import { providerSecretBinding, secretAad } from "@paibot/shared/bindung";
import { type ConversationId, type ModelId, newId, type ProviderId } from "@paibot/shared/ids";
import type { ResolvedModel } from "@paibot/shared/motor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isResolvedModel, type ModelChoice, resolveModel } from "./resolve-model";
import { providerTargetFacts } from "./target";
import { json, startTestServer, type TestServer } from "./test-server";

// Echte Bausteine: Berechtigungen stellt der Test-Zugang des Tors aus, Schlüssel werden mit dem
// Krypto-Paket verschlüsselt und entschlüsselt.
const masterOf = () => loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") });
const secretsKey = deriveKey(masterOf(), "secrets-v1");

const PROVIDER_KEY = `sk-provider-${"p".repeat(20)}`;
const SCHLEUSE_KEY = `sk-schleuse-${"s".repeat(20)}`;

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer((_req, res) => json(res, 200, { ok: true }));
});
afterAll(() => server.close());

const providerId = newId("provider") as ProviderId;
const modelId = newId("model") as ModelId;
const conversationId = newId("conversation") as ConversationId;
const botId = newId("bot");

/** Schlüssel verschlüsselt im Format v2, gebunden an Datensatz und Host der Basis-URL. */
const encFor = (baseUrl: string, id: ProviderId = providerId, plain = PROVIDER_KEY) =>
  encryptSecret(plain, secretsKey, { aad: secretAad(providerSecretBinding(id, baseUrl)) });

const defaultBaseUrl = () => `${server.origin}/v1`;

function choice(overrides: Partial<ModelChoice["provider"]> = {}): ModelChoice {
  const baseUrl = overrides.baseUrl ?? defaultBaseUrl();
  return {
    provider: {
      id: providerId,
      templateKey: "eurouter",
      baseUrl,
      region: "local",
      apiKeyEnc: encFor(baseUrl),
      ...overrides,
    },
    model: { id: modelId, slug: "mistral-small-latest", displayName: "Mistral Small" },
    conversationId,
  };
}

type Target = ActionRequest<"modell.anfragen">["target"];

function request(target: Partial<Target> = {}): ActionRequest<"modell.anfragen"> {
  return {
    actionId: newId("action"),
    type: "modell.anfragen",
    actor: `bot:${botId}`,
    target: { conversationId, runId: newId("run"), botId, modelId, ...target },
  };
}

function facts(overrides: Partial<Facts<"modell.anfragen">> = {}): Facts<"modell.anfragen"> {
  return {
    ...providerTargetFacts(providerId, defaultBaseUrl()),
    botPaused: false,
    conversationKind: "direkt",
    botHatAuftrag: false,
    auftragArt: "keiner",
    zweck: "chat",
    botOfConversation: true,
    providerId,
    providerEnabled: true,
    region: "local",
    route: "direct",
    requestedMode: "off",
    schleuseReachable: true,
    inputChars: 10,
    maxInputChars: 1000,
    maxOutputTokens: 100,
    botMaxOutputTokens: 100,
    tokensToday: 0,
    killSwitch: false,
    // Übergangswerte, bis ein Lauf mehrere Schritte macht.
    step: 0,
    maxSteps: 1,
    runTokens: 0,
    stepTokenEstimate: 0,
    maxRunTokens: 500000,
    toolCount: 0,
    untrustedInput: false,
    trigger: "chat",
    ...overrides,
  };
}

/** Ruft `fn` mit einer echten Berechtigung des Tors auf (nur gültig, solange `fn` läuft). */
function withPermit<R>(
  fn: (permit: GatePermit<"modell.anfragen">) => R | Promise<R>,
  factOverrides: Partial<Facts<"modell.anfragen">> = {},
  target: Partial<Target> = {},
): Promise<R> {
  return withTestPermit(request(target), facts(factOverrides), fn);
}

/** Fakten für einen Anbieter mit eigener Basis-URL und Region. */
const at = (baseUrl: string, region: "eu" | "non_eu" | "local" = "eu") => ({
  region,
  ...providerTargetFacts(providerId, baseUrl),
});

const schleuse = () => ({ baseUrl: `${server.origin}/v1`, apiKey: SCHLEUSE_KEY });

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

const SCHLEUSE_ON = { route: "schleuse", requestedMode: "on" } as const;

describe("resolveModel", () => {
  it("direkt: Basis-URL des Anbieters, Schlüssel geht nur über fetch mit", async () => {
    server.requests.length = 0;
    const model: ResolvedModel = await withPermit(async (p) => {
      const m = resolveModel(p, choice(), { secretsKey });
      await m.fetch(`${m.baseUrl}/chat/completions`, { method: "POST", body: "{}" });
      return m;
    });
    expect(server.requests[0]?.headers.authorization).toBe(`Bearer ${PROVIDER_KEY}`);
    expect(model.route).toBe("direct");
    expect(model.baseUrl).toBe(`${server.origin}/v1`);
    expect("apiKey" in model).toBe(false);
    expect(isResolvedModel(model)).toBe(true);
    expect(model.slug).toBe("mistral-small-latest");
    expect(model.label).toBe("Mistral Small");
    expect(model.providerId).toBe(providerId);
    expect(model.modelId).toBe(modelId);
    expect(model.headers).toEqual({});
  });

  it("Datenschleuse: ihre URL und ihr Schlüssel, Modellname und Sitzungs-Kopfzeile", async () => {
    const model = await withPermit(async (p) => {
      const m = resolveModel(p, choice({ apiKeyEnc: undefined }), {
        secretsKey,
        schleuse: schleuse(),
      });
      await m.fetch(`${m.baseUrl}/models`);
      return m;
    }, SCHLEUSE_ON);
    expect(model.route).toBe("schleuse");
    expect("apiKey" in model).toBe(false);
    expect(server.requests.at(-1)?.headers.authorization).toBe(`Bearer ${SCHLEUSE_KEY}`);
    expect(model.slug).toBe("eurouter/mistral-small-latest");
    expect(model.headers).toEqual({ "x-litellm-session-id": conversationId });
  });

  it("Datenschleuse ohne Verbindung: schleuse_nicht_installiert", async () => {
    const error = await withPermit(
      (p) => catchError(() => resolveModel(p, choice(), { secretsKey })),
      SCHLEUSE_ON,
    );
    expect(error).toMatchObject({ code: "schleuse_nicht_installiert" });
  });

  it("nie ein Rückfall auf direkt, wenn die Datenschleuse gefordert war", async () => {
    const error = await withPermit(
      (p) => catchError(() => resolveModel(p, choice(), { secretsKey })),
      { route: "direct", requestedMode: "on" },
    );
    expect(error).toMatchObject({ code: "abgelehnt" });
  });

  it("ohne Berechtigung, mit einer gefälschten, kopierten oder abgelaufenen: abgelehnt", async () => {
    const deps = { secretsKey };
    let expired: unknown;
    await withPermit((real) => {
      expired = real;
      const fakes: unknown[] = [
        undefined,
        null,
        {},
        "permit",
        // gleiche Felder, nicht vom Tor ausgestellt
        JSON.parse(JSON.stringify(real)),
        { ...real },
        structuredClone(real),
      ];
      for (const fake of fakes) {
        const error = catchError(() =>
          resolveModel(fake as GatePermit<"modell.anfragen">, choice(), deps),
        );
        expect(error).toMatchObject({ code: "abgelehnt" });
      }
    });
    const error = catchError(() =>
      resolveModel(expired as GatePermit<"modell.anfragen">, choice(), deps),
    );
    expect(error).toMatchObject({ code: "abgelehnt" });
  });

  it("Berechtigung für eine andere Aktion: abgelehnt", async () => {
    const other: ActionRequest<"modell.waehlen"> = {
      actionId: newId("action"),
      type: "modell.waehlen",
      actor: "besitzer",
      target: { botId, modelId },
    };
    const error = await withTestPermit(other, { credential: "sitzung" }, (p) =>
      catchError(() =>
        resolveModel(p as unknown as GatePermit<"modell.anfragen">, choice(), { secretsKey }),
      ),
    );
    expect(error).toMatchObject({ code: "abgelehnt" });
  });

  it("Berechtigung passt nicht zur Wahl: abgelehnt", async () => {
    const deps = { secretsKey };
    const cases: Array<[Partial<Facts<"modell.anfragen">>, Partial<Target>]> = [
      [{}, { conversationId: newId("conversation") }],
      [{}, { modelId: newId("model") }],
      [{ providerId: newId("provider") }, {}],
      [{ region: "eu" }, {}],
      [
        { targetDigest: providerTargetFacts(providerId, "https://anders.example/v1").targetDigest },
        {},
      ],
      [{ targetOrigin: "https://anders.example" }, {}],
    ];
    for (const [f, target] of cases) {
      const error = await withPermit(
        (p) => catchError(() => resolveModel(p, choice(), deps)),
        f,
        target,
      );
      expect(error).toMatchObject({ code: "abgelehnt" });
    }
  });

  it("Schlüssel fehlt oder lässt sich nicht entschlüsseln: schluessel_ungueltig ohne Klartext", async () => {
    const EU = "https://api.eurouter.ai/v1";
    const eu = (apiKeyEnc?: string) => choice({ region: "eu", baseUrl: EU, apiKeyEnc });
    const missing = await withPermit(
      (p) => catchError(() => resolveModel(p, eu(undefined), { secretsKey })),
      at(EU),
    );
    expect(missing).toMatchObject({ code: "schluessel_ungueltig" });

    const wrongKey = deriveKey(masterOf(), "secrets-v1");
    const good = encFor(EU);
    const tampered = `${good.slice(0, -2)}${good.endsWith("AA") ? "BA" : "AA"}`;
    for (const [enc, key] of [
      [good, wrongKey],
      [tampered, secretsKey],
      [encFor(EU, newId("provider") as ProviderId), secretsKey], // aus einem anderen Datensatz
      [encFor("https://anderer-host.example/v1"), secretsKey], // für einen anderen Host
      [encryptLegacySecret(PROVIDER_KEY, secretsKey), secretsKey], // v1 ohne Bindung
      ["v2:a:b:c", secretsKey],
      ["kein-geheimtext", secretsKey],
    ] as const) {
      const broken = (await withPermit(
        (p) => catchError(() => resolveModel(p, eu(enc), { secretsKey: key })),
        at(EU),
      )) as Error;
      expect(broken).toMatchObject({ code: "schluessel_ungueltig" });
      for (const text of [String(broken), broken.stack ?? "", JSON.stringify(broken)]) {
        expect(text).not.toContain(PROVIDER_KEY);
      }
      expect((broken as { cause?: unknown }).cause).toBeUndefined();
    }
  });

  it("lokaler Anbieter (Region local) darf ohne Schlüssel arbeiten, andere Regionen nicht", async () => {
    const local = await withPermit((p) =>
      resolveModel(p, choice({ apiKeyEnc: undefined }), { secretsKey }),
    );
    expect("apiKey" in local).toBe(false);
    const eu = await withPermit(
      (p) =>
        catchError(() =>
          resolveModel(
            p,
            choice({ region: "eu", baseUrl: "https://api.eurouter.ai/v1", apiKeyEnc: undefined }),
            { secretsKey },
          ),
        ),
      at("https://api.eurouter.ai/v1"),
    );
    expect(eu).toMatchObject({ code: "schluessel_ungueltig" });
  });

  it("gespeicherte unzulässige Basis-URL wird nicht benutzt", async () => {
    for (const baseUrl of [
      "http://api.example.org/v1",
      "https://169.254.169.254/v1",
      "https://postgres/v1",
    ]) {
      const error = await withPermit(
        (p) => catchError(() => resolveModel(p, choice({ region: "eu", baseUrl }), { secretsKey })),
        at(baseUrl),
      );
      expect(error).toMatchObject({ code: "anbieter_nicht_erreichbar" });
    }
  });

  it("fetch erreicht nur das Ziel des gewählten Weges", async () => {
    await withPermit(async (p) => {
      const model = resolveModel(p, choice(), { secretsKey });
      expect(
        (await model.fetch(`${model.baseUrl}/chat/completions`, { method: "POST", body: "{}" })).ok,
      ).toBe(true);
      const blocked = await model
        .fetch("http://169.254.169.254/latest/meta-data")
        .catch((e: unknown) => e as Error);
      expect(blocked).toMatchObject({ name: "EgressBlockedError" });
      await expect(model.fetch("https://example.org/")).rejects.toMatchObject({
        name: "EgressBlockedError",
      });
    });

    // Auf dem Weg über die Datenschleuse ist der Anbieter selbst nicht erreichbar.
    const other = await startTestServer();
    try {
      await withPermit(
        async (p) => {
          const viaSchleuse = resolveModel(p, choice({ baseUrl: `${other.origin}/v1` }), {
            secretsKey,
            schleuse: schleuse(),
          });
          await expect(viaSchleuse.fetch(`${other.origin}/v1/models`)).rejects.toMatchObject({
            name: "EgressBlockedError",
          });
        },
        { ...SCHLEUSE_ON, ...at(`${other.origin}/v1`, "local") },
      );
      expect(other.requests).toHaveLength(0);
    } finally {
      await other.close();
    }
  });

  it("der Schlüssel steht in keinem Fehlertext", async () => {
    const errors = [
      catchError(() => resolveModel({} as GatePermit<"modell.anfragen">, choice(), { secretsKey })),
      await withPermit(
        (p) => catchError(() => resolveModel(p, choice(), { secretsKey })),
        SCHLEUSE_ON,
      ),
      await withPermit(
        (p) => catchError(() => resolveModel(p, choice(), { secretsKey, schleuse: schleuse() })),
        { providerId: newId("provider") },
      ),
    ] as Error[];
    for (const error of errors) {
      const all = [
        String(error),
        error.stack ?? "",
        JSON.stringify(error),
        JSON.stringify(error.cause ?? ""),
      ];
      for (const text of all) {
        expect(text).not.toContain(PROVIDER_KEY);
        expect(text).not.toContain(SCHLEUSE_KEY);
      }
    }
  });
});
