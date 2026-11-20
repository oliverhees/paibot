/**
 * PaiBot – Tests für den Modell-Zugang: Ziel-Bindung, verborgener Schlüssel, Lebenszeit.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { format, inspect } from "node:util";
import { deriveKey, encryptSecret, loadMasterSecret } from "@paibot/crypto";
import { encryptLegacySecret } from "@paibot/crypto/testing";
import type { GatePermit } from "@paibot/gate";
import { withTestPermit } from "@paibot/gate/testing";
import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import { providerSecretBinding, secretAad } from "@paibot/shared/bindung";
import { type ConversationId, type ModelId, newId, type ProviderId } from "@paibot/shared/ids";
import type { ResolvedModel } from "@paibot/shared/motor";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isResolvedModel, type ModelChoice, resolveModel } from "./resolve-model";
import { providerTargetFacts } from "./target";
import { json, startTestServer, type TestServer } from "./test-server";

const secretsKey = deriveKey(
  loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") }),
  "secrets-v1",
);
const PROVIDER_KEY = `sk-ziel-${"z".repeat(24)}`;

let provider: TestServer;
let attacker: TestServer;
beforeAll(async () => {
  provider = await startTestServer((_req, res) => json(res, 200, { ok: true }));
  attacker = await startTestServer((_req, res) => json(res, 200, { gestohlen: true }));
});
afterAll(async () => {
  await provider.close();
  await attacker.close();
});
beforeEach(() => {
  provider.requests.length = 0;
  attacker.requests.length = 0;
});

const providerId = newId("provider") as ProviderId;
const modelId = newId("model") as ModelId;
const conversationId = newId("conversation") as ConversationId;
const botId = newId("bot");

const legit = () => `${provider.origin}/v1`;
const encFor = (baseUrl: string) =>
  encryptSecret(PROVIDER_KEY, secretsKey, {
    aad: secretAad(providerSecretBinding(providerId, baseUrl)),
  });

/** Der Datensatz, wie `resolveModel` ihn liest (z. B. nach einer Änderung in der Datenbank). */
function row(baseUrl: string, apiKeyEnc = encFor(legit())): ModelChoice {
  return {
    provider: { id: providerId, templateKey: "eigener", baseUrl, region: "local", apiKeyEnc },
    model: { id: modelId, slug: "test-modell", displayName: "Test" },
    conversationId,
  };
}

/** Fakten, wie die Lauf-Steuerung sie zum Zeitpunkt der Entscheidung gebildet hat. */
function decidedFor(baseUrl: string): Facts<"modell.anfragen"> {
  return {
    botOfConversation: true,
    providerId,
    providerEnabled: true,
    region: "local",
    route: "direct",
    requestedMode: "off",
    schleuseReachable: false,
    inputChars: 10,
    maxInputChars: 1000,
    maxOutputTokens: 100,
    botMaxOutputTokens: 100,
    tokensToday: 0,
    killSwitch: false,
    ...providerTargetFacts(providerId, baseUrl),
  };
}

function action(): ActionRequest<"modell.anfragen"> {
  return {
    actionId: newId("action"),
    type: "modell.anfragen",
    actor: `bot:${botId}`,
    target: { conversationId, runId: newId("run"), botId, modelId },
  };
}

function withPermit<R>(
  facts: Facts<"modell.anfragen">,
  fn: (permit: GatePermit<"modell.anfragen">) => R | Promise<R>,
): Promise<R> {
  return withTestPermit(action(), facts, fn);
}

function errorOf(fn: () => unknown): { code?: string } | undefined {
  try {
    fn();
  } catch (error) {
    return error as { code?: string };
  }
  return undefined;
}

describe("Ziel-Bindung beim Senden", () => {
  it("Adresse nach der Entscheidung umgebogen: abgelehnt, der fremde Host bekommt nichts", async () => {
    const error = await withPermit(decidedFor(legit()), async (permit) => {
      // Zwischen Entscheidung und Abruf zeigt der Datensatz auf einen anderen Host.
      const failure = errorOf(() =>
        resolveModel(permit, row(`${attacker.origin}/v1`), { secretsKey }),
      );
      return failure;
    });
    expect(error).toMatchObject({ code: "abgelehnt" });
    expect(attacker.requests).toHaveLength(0);
    expect(provider.requests).toHaveLength(0);
  });

  it("auch ein anderer Pfad auf demselben Host passt nicht mehr zum Abdruck", async () => {
    const error = await withPermit(decidedFor(legit()), (permit) =>
      errorOf(() => resolveModel(permit, row(`${provider.origin}/anderer-pfad`), { secretsKey })),
    );
    expect(error).toMatchObject({ code: "abgelehnt" });
  });

  it("Adresse vor der Entscheidung umgebogen: der Schlüssel passt nicht zum neuen Host", async () => {
    // Die Entscheidung sieht schon den fremden Host, der Schlüssel ist aber an den echten gebunden.
    const evil = `${attacker.origin}/v1`;
    const error = await withPermit(decidedFor(evil), (permit) =>
      errorOf(() => resolveModel(permit, row(evil), { secretsKey })),
    );
    expect(error).toMatchObject({ code: "schluessel_ungueltig" });
    expect(attacker.requests).toHaveLength(0);
  });

  it("Geheimtext eines anderen Datensatzes lässt sich hier nicht verwenden", async () => {
    const otherRow = newId("provider") as ProviderId;
    const copied = encryptSecret(PROVIDER_KEY, secretsKey, {
      aad: secretAad(providerSecretBinding(otherRow, legit())),
    });
    const error = await withPermit(decidedFor(legit()), (permit) =>
      errorOf(() => resolveModel(permit, row(legit(), copied), { secretsKey })),
    );
    expect(error).toMatchObject({ code: "schluessel_ungueltig" });
  });

  it("passendes Ziel: Anfrage geht genau zum Anbieter, mit Schlüssel nur in der Kopfzeile", async () => {
    await withPermit(decidedFor(legit()), async (permit) => {
      const model = resolveModel(permit, row(legit()), { secretsKey });
      expect(model.targetDigest).toBe(providerTargetFacts(providerId, legit()).targetDigest);
      const response = await model.fetch(`${model.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { authorization: "Bearer untergeschoben" },
        body: "{}",
      });
      expect(response.ok).toBe(true);
    });
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.headers.authorization).toBe(`Bearer ${PROVIDER_KEY}`);
    expect(attacker.requests).toHaveLength(0);
  });
});

describe("Modell-Zugang ohne herausgebbaren Schlüssel", () => {
  async function resolved(): Promise<{ model: ResolvedModel; texts: string[] }> {
    return withPermit(decidedFor(legit()), (permit) => {
      const model = resolveModel(permit, row(legit()), { secretsKey });
      const logged: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        logged.push(format(...args));
      });
      try {
        console.log(model);
        console.log("%o", model);
        console.log({ model });
      } finally {
        spy.mockRestore();
      }
      const texts = [
        JSON.stringify(model),
        JSON.stringify({ model }),
        JSON.stringify({ ...model }),
        inspect(model, { showHidden: true, depth: 10, getters: true }),
        String(Object.keys(model)),
        String(Object.values(model)),
        JSON.stringify(Object.getOwnPropertyDescriptors(model)),
        String(new Error("Fehler", { cause: model }).cause),
        ...logged,
      ];
      return { model, texts };
    });
  }

  it("der Klartext steht in keiner Ausgabe, Kopie oder Aufzählung", async () => {
    const { model, texts } = await resolved();
    for (const text of texts) expect(text).not.toContain(PROVIDER_KEY);
    expect("apiKey" in model).toBe(false);
    expect(JSON.parse(JSON.stringify(model))).toEqual({
      providerId,
      modelId,
      slug: "test-modell",
      label: "Test",
      route: "direct",
      baseUrl: legit(),
      targetDigest: providerTargetFacts(providerId, legit()).targetDigest,
    });
  });

  it("nach dem Ende der Berechtigung scheitert jede Nutzung, ohne dass etwas gesendet wird", async () => {
    const { model } = await resolved();
    await expect(model.fetch(`${model.baseUrl}/chat/completions`)).rejects.toMatchObject({
      code: "abgelehnt",
    });
    expect(provider.requests).toHaveLength(0);
  });

  it("lässt sich nicht nachbauen: Kopien und selbst gebaute Objekte sind keine Zugänge", async () => {
    await withPermit(decidedFor(legit()), async (permit) => {
      const model = resolveModel(permit, row(legit()), { secretsKey });
      expect(isResolvedModel(model)).toBe(true);
      const copy = { ...model };
      expect(isResolvedModel(copy)).toBe(false);
      expect(isResolvedModel(structuredClone({ ...model, fetch: undefined }))).toBe(false);
      expect(isResolvedModel({})).toBe(false);
      expect(Object.isFrozen(model)).toBe(true);
      // Eine Kopie mit anderer Basis-URL erreicht über das kopierte fetch trotzdem nur den Anbieter.
      const redirected = { ...model, baseUrl: `${attacker.origin}/v1` };
      await expect(
        redirected.fetch(`${redirected.baseUrl}/chat/completions`),
      ).rejects.toMatchObject({ name: "EgressBlockedError" });
    });
    expect(attacker.requests).toHaveLength(0);
  });
});

describe("ohne Ziel-Abdruck und Altbestand", () => {
  it("Fakten ohne Ziel-Abdruck ergeben keine Berechtigung", async () => {
    const { targetDigest: _d, targetOrigin: _o, ...rest } = decidedFor(legit());
    const error = await withPermit(rest as Facts<"modell.anfragen">, () => "ausgefuehrt").catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ code: "eingabe_ungueltig" });
    expect(provider.requests).toHaveLength(0);
  });

  it("ein v1-Schlüssel ohne Bindung wird nicht angenommen", async () => {
    const v1 = encryptLegacySecret(PROVIDER_KEY, secretsKey);
    const error = await withPermit(decidedFor(legit()), (permit) =>
      errorOf(() => resolveModel(permit, row(legit(), v1), { secretsKey })),
    );
    expect(error).toMatchObject({ code: "schluessel_ungueltig" });
    expect(provider.requests).toHaveLength(0);
  });

  it("Host vor der Entscheidung umgebogen: Abdruck passt, der gebundene Schlüssel nicht", async () => {
    // Die Fakten stammen schon aus dem geänderten Datensatz; der Schlüssel gehört zum alten Host.
    const bent = `${attacker.origin}/v1`;
    const error = await withPermit(decidedFor(bent), (permit) =>
      errorOf(() => resolveModel(permit, row(bent), { secretsKey })),
    );
    expect(error).toMatchObject({ code: "schluessel_ungueltig" });
    expect(attacker.requests).toHaveLength(0);
  });
});
