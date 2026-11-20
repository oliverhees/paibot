/**
 * PaiBot – Tests für den Modell-Zugang gegen eine Berechtigung des Tors.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { DerivedKey } from "@paibot/crypto";
import type { GatePermit } from "@paibot/gate";
import { type ConversationId, type ModelId, newId, type ProviderId } from "@paibot/shared/ids";
import type { ResolvedModel } from "@paibot/shared/motor";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { json, startTestServer, type TestServer } from "./test-server";

// Das Tor und die Verschlüsselung entstehen in eigenen Paketen. Hier stehen Ersatz-Bausteine mit
// dem vereinbarten Verhalten: Nur vom "Tor" ausgestellte Berechtigungen werden erkannt, und
// entschlüsselt wird ein Geheimtext nur mit dem richtigen Schlüssel.
const issued = vi.hoisted(() => new WeakSet<object>());
const SECRET_KEY = vi.hoisted(() => new Uint8Array(32).fill(7));

vi.mock("@paibot/gate", () => ({
  isGatePermit: (value: unknown, action?: string) =>
    typeof value === "object" &&
    value !== null &&
    issued.has(value) &&
    (action === undefined || (value as { action: string }).action === action),
}));

vi.mock("@paibot/crypto", () => ({
  decryptSecret: (encrypted: string, key: Uint8Array) => {
    const [version, plain] = encrypted.split(":");
    if (version !== "v1" || plain === undefined || key !== SECRET_KEY) {
      throw new Error(`entschluesseln_fehlgeschlagen ${encrypted}`);
    }
    return plain;
  },
}));

const { resolveModel } = await import("./resolve-model");
type Choice = Parameters<typeof resolveModel>[1];

const PROVIDER_KEY = `sk-provider-${"p".repeat(20)}`;
const SCHLEUSE_KEY = `sk-schleuse-${"s".repeat(20)}`;
const secretsKey = SECRET_KEY as unknown as DerivedKey<"secrets-v1">;

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer((_req, res) => json(res, 200, { ok: true }));
});
afterAll(() => server.close());

const providerId = newId("provider") as ProviderId;
const modelId = newId("model") as ModelId;
const conversationId = newId("conversation") as ConversationId;

function choice(overrides: Partial<Choice["provider"]> = {}): Choice {
  return {
    provider: {
      id: providerId,
      templateKey: "eurouter",
      baseUrl: `${server.origin}/v1`,
      region: "local",
      apiKeyEnc: `v1:${PROVIDER_KEY}`,
      ...overrides,
    },
    model: { id: modelId, slug: "mistral-small-latest", displayName: "Mistral Small" },
    conversationId,
  };
}

type Facts = Record<string, unknown>;

/** Baut eine Berechtigung und trägt sie wie das Tor in die Liste echter Berechtigungen ein. */
function permit(
  facts: Facts = {},
  target: Facts = {},
  register = true,
): GatePermit<"modell.anfragen"> {
  const value = {
    actionId: newId("action"),
    action: "modell.anfragen",
    actor: { kind: "bot", id: newId("bot") },
    target: { conversationId, runId: newId("run"), botId: newId("bot"), modelId, ...target },
    facts: {
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
      ...facts,
    },
    decisionReceiptId: newId("receipt"),
    issuedAt: new Date().toISOString(),
  };
  if (register) issued.add(value);
  return value as unknown as GatePermit<"modell.anfragen">;
}

const schleuse = () => ({ baseUrl: `${server.origin}/v1`, apiKey: SCHLEUSE_KEY });

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("resolveModel", () => {
  it("direkt: Basis-URL und entschlüsselter Schlüssel des Anbieters", () => {
    const model: ResolvedModel = resolveModel(permit(), choice(), { secretsKey });
    expect(model.route).toBe("direct");
    expect(model.baseUrl).toBe(`${server.origin}/v1`);
    expect(model.apiKey).toBe(PROVIDER_KEY);
    expect(model.slug).toBe("mistral-small-latest");
    expect(model.label).toBe("Mistral Small");
    expect(model.providerId).toBe(providerId);
    expect(model.modelId).toBe(modelId);
    expect(model.headers).toEqual({});
  });

  it("Datenschleuse: ihre URL und ihr Schlüssel, Modellname und Sitzungs-Kopfzeile", () => {
    const model = resolveModel(
      permit({ route: "schleuse", requestedMode: "on" }),
      choice({ apiKeyEnc: undefined }),
      { secretsKey, schleuse: schleuse() },
    );
    expect(model.route).toBe("schleuse");
    expect(model.apiKey).toBe(SCHLEUSE_KEY);
    expect(model.apiKey).not.toBe(PROVIDER_KEY);
    expect(model.slug).toBe("eurouter/mistral-small-latest");
    expect(model.headers).toEqual({ "x-litellm-session-id": conversationId });
  });

  it("Datenschleuse ohne Verbindung: schleuse_nicht_installiert", () => {
    const error = catchError(() =>
      resolveModel(permit({ route: "schleuse", requestedMode: "on" }), choice(), { secretsKey }),
    );
    expect(error).toMatchObject({ code: "schleuse_nicht_installiert" });
  });

  it("nie ein Rückfall auf direkt, wenn die Datenschleuse gefordert war", () => {
    const error = catchError(() =>
      resolveModel(permit({ route: "direct", requestedMode: "on" }), choice(), { secretsKey }),
    );
    expect(error).toMatchObject({ code: "abgelehnt" });
  });

  it("ohne Berechtigung oder mit einer gefälschten: abgelehnt", () => {
    const deps = { secretsKey };
    for (const fake of [
      undefined,
      null,
      {},
      "permit",
      permit({}, {}, false), // gleiche Felder, nicht vom Tor ausgestellt
      { ...permit() }, // Kopie einer echten Berechtigung
      structuredClone(permit()),
    ]) {
      const error = catchError(() =>
        resolveModel(fake as unknown as GatePermit<"modell.anfragen">, choice(), deps),
      );
      expect(error).toMatchObject({ code: "abgelehnt" });
    }
  });

  it("Berechtigung für eine andere Aktion: abgelehnt", () => {
    const other = { ...permit(), action: "bot.aendern" };
    issued.add(other);
    const error = catchError(() =>
      resolveModel(other as unknown as GatePermit<"modell.anfragen">, choice(), { secretsKey }),
    );
    expect(error).toMatchObject({ code: "abgelehnt" });
  });

  it("Berechtigung passt nicht zur Wahl: abgelehnt", () => {
    const deps = { secretsKey };
    const cases: Array<[GatePermit<"modell.anfragen">, Choice]> = [
      [permit({}, { conversationId: newId("conversation") }), choice()],
      [permit({}, { modelId: newId("model") }), choice()],
      [permit({ providerId: newId("provider") }), choice()],
      [permit({ region: "eu" }), choice()],
    ];
    for (const [p, c] of cases) {
      expect(catchError(() => resolveModel(p, c, deps))).toMatchObject({ code: "abgelehnt" });
    }
  });

  it("Schlüssel fehlt oder lässt sich nicht entschlüsseln: schluessel_ungueltig ohne Klartext", () => {
    const p = () => permit({ region: "eu" });
    const eu = (apiKeyEnc?: string) =>
      choice({ region: "eu", baseUrl: "https://api.eurouter.ai/v1", apiKeyEnc });
    const missing = catchError(() => resolveModel(p(), eu(undefined), { secretsKey }));
    expect(missing).toMatchObject({ code: "schluessel_ungueltig" });
    const wrongKey = new Uint8Array(32) as unknown as DerivedKey<"secrets-v1">;
    const broken = catchError(() =>
      resolveModel(p(), eu(`v1:${PROVIDER_KEY}`), { secretsKey: wrongKey }),
    ) as Error;
    expect(broken).toMatchObject({ code: "schluessel_ungueltig" });
    for (const text of [String(broken), broken.stack ?? "", JSON.stringify(broken)]) {
      expect(text).not.toContain(PROVIDER_KEY);
    }
    expect((broken as { cause?: unknown }).cause).toBeUndefined();
  });

  it("lokaler Anbieter darf ohne Schlüssel arbeiten", () => {
    const model = resolveModel(permit(), choice({ apiKeyEnc: undefined }), { secretsKey });
    expect(model.apiKey).toBe("");
  });

  it("gespeicherte unzulässige Basis-URL wird nicht benutzt", () => {
    for (const baseUrl of [
      "http://api.example.org/v1",
      "https://169.254.169.254/v1",
      "https://postgres/v1",
    ]) {
      const error = catchError(() =>
        resolveModel(permit({ region: "eu" }), choice({ region: "eu", baseUrl }), { secretsKey }),
      );
      expect(error).toMatchObject({ code: "anbieter_nicht_erreichbar" });
    }
  });

  it("fetch erreicht nur das Ziel des gewählten Weges", async () => {
    const model = resolveModel(permit(), choice(), { secretsKey });
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

    // Auf dem Weg über die Datenschleuse ist der Anbieter selbst nicht erreichbar.
    const other = await startTestServer();
    try {
      const viaSchleuse = resolveModel(
        permit({ route: "schleuse", requestedMode: "on" }),
        choice({ baseUrl: `${other.origin}/v1` }),
        { secretsKey, schleuse: schleuse() },
      );
      await expect(viaSchleuse.fetch(`${other.origin}/v1/models`)).rejects.toMatchObject({
        name: "EgressBlockedError",
      });
      expect(other.requests).toHaveLength(0);
    } finally {
      await other.close();
    }
  });

  it("der Schlüssel steht in keinem Fehlertext", () => {
    const errors = [
      catchError(() => resolveModel(permit({}, {}, false), choice(), { secretsKey })),
      catchError(() =>
        resolveModel(permit({ route: "schleuse", requestedMode: "on" }), choice(), { secretsKey }),
      ),
      catchError(() =>
        resolveModel(permit({ providerId: newId("provider") }), choice(), {
          secretsKey,
          schleuse: schleuse(),
        }),
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
