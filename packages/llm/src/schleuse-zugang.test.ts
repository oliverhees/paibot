/**
 * PaiBot – Tests für den Modell-Zugang über die Datenschleuse: Anbieter-Schlüssel je Anfrage und
 * Abbildung ihrer Fehlerantworten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { inspect } from "node:util";
import { deriveKey, encryptSecret, loadMasterSecret } from "@paibot/crypto";
import type { GatePermit } from "@paibot/gate";
import { withTestPermit } from "@paibot/gate/testing";
import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import { providerSecretBinding, secretAad } from "@paibot/shared/bindung";
import { PaiBotError } from "@paibot/shared/fehler";
import { type ConversationId, type ModelId, newId, type ProviderId } from "@paibot/shared/ids";
import type { ResolvedModel } from "@paibot/shared/motor";
import type { Region } from "@paibot/shared/objekte";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { isRetryable, mapProviderError } from "./errors";
import { type ModelChoice, resolveModel } from "./resolve-model";
import type { SchleuseConnection, SchleuseKeyPath } from "./schleuse";
import { createSchleuseFetch, SCHLEUSE_CLIENT_ROUTING_FIELDS } from "./schleuse-zugang";
import { providerTargetFacts } from "./target";
import { json, startTestServer, type TestServer } from "./test-server";
import { schleuseBlockedReply, schleuseWrongKeyReply } from "./testing";

const secretsKey = deriveKey(
  loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") }),
  "secrets-v1",
);
// Im Test erzeugt; nie ein echter Schlüssel.
const PROVIDER_KEY = `sk-anbieter-${randomBytes(12).toString("hex")}`;
const SCHLEUSE_KEY = `sk-${randomBytes(20).toString("hex")}`;
// Ein Wort, das nur in der Meldung der Datenschleuse vorkommt.
const BEGRUENDUNG = "Zitronenfalter7319";

const PROVIDER_URL = "https://api.anbieter.example/v1";
const providerId = newId("provider") as ProviderId;
const modelId = newId("model") as ModelId;
const conversationId = newId("conversation") as ConversationId;
const botId = newId("bot");

/** Die Datenschleuse zum Nachstellen: gemessene Antworten, Anfragen werden aufgezeichnet. */
let schleuse: TestServer;
beforeAll(async () => {
  schleuse = await startTestServer();
});
afterAll(() => schleuse.close());
beforeEach(() => {
  schleuse.requests.length = 0;
  schleuse.setHandler(antwortet200);
});

function antwortet200(req: IncomingMessage, res: ServerResponse) {
  req.resume();
  req.on("end", () =>
    json(res, 200, { choices: [{ message: { role: "assistant", content: "ok" } }] }),
  );
}

/** Antwort der Datenschleuse bei einem Block (gemessen: HTTP 500, Typ "None"). */
function blockiert(req: IncomingMessage, res: ServerResponse) {
  req.resume();
  schleuseBlockedReply(res, BEGRUENDUNG);
}

/** Antwort bei falschem Zugangsschlüssel ohne eigene Datenbank (gemessen: HTTP 400). */
function keineDatenbank(req: IncomingMessage, res: ServerResponse) {
  req.resume();
  schleuseWrongKeyReply(res, BEGRUENDUNG);
}

const connection = (providerKeyPath?: SchleuseKeyPath): SchleuseConnection => ({
  baseUrl: `${schleuse.origin}/v1`,
  apiKey: SCHLEUSE_KEY,
  ...(providerKeyPath === undefined ? {} : { providerKeyPath }),
});

function choice(region: Region = "eu", withKey = true): ModelChoice {
  return {
    provider: {
      id: providerId,
      templateKey: "eurouter",
      baseUrl: PROVIDER_URL,
      region,
      ...(withKey
        ? {
            apiKeyEnc: encryptSecret(PROVIDER_KEY, secretsKey, {
              aad: secretAad(providerSecretBinding(providerId, PROVIDER_URL)),
            }),
          }
        : {}),
    },
    model: { id: modelId, slug: "mistral-small-latest", displayName: "Mistral Small" },
    conversationId,
  };
}

function facts(region: Region = "eu"): Facts<"modell.anfragen"> {
  return {
    ...providerTargetFacts(providerId, PROVIDER_URL),
    botOfConversation: true,
    providerId,
    providerEnabled: true,
    region,
    route: "schleuse",
    requestedMode: "on",
    schleuseReachable: true,
    inputChars: 10,
    maxInputChars: 1000,
    maxOutputTokens: 100,
    botMaxOutputTokens: 100,
    tokensToday: 0,
    killSwitch: false,
  };
}

function request(): ActionRequest<"modell.anfragen"> {
  return {
    actionId: newId("action"),
    type: "modell.anfragen",
    actor: `bot:${botId}`,
    target: { conversationId, runId: newId("run"), botId, modelId },
  };
}

/** Ruft `run` mit einem Modell-Zugang über die Datenschleuse auf (nur gültig, solange `run` läuft). */
function viaSchleuse<R>(
  run: (model: ResolvedModel) => Promise<R>,
  options: { path?: SchleuseKeyPath; region?: Region; withKey?: boolean } = {},
): Promise<R> {
  const region = options.region ?? "eu";
  return withTestPermit(request(), facts(region), (permit: GatePermit<"modell.anfragen">) =>
    run(
      resolveModel(permit, choice(region, options.withKey ?? true), {
        secretsKey,
        schleuse: connection(options.path),
      }),
    ),
  );
}

const chatBody = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    model: "eurouter/mistral-small-latest",
    messages: [{ role: "user", content: "Grüße an Jörg – äöü ß €" }],
    ...extra,
  });

const post = (model: ResolvedModel, body: BodyInit, path = "/chat/completions") =>
  model.fetch(`${model.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

/** Alles, was sich aus einem Fehler herauslesen lässt. */
function everythingIn(error: unknown): string {
  const parts: string[] = [inspect(error, { depth: 10, showHidden: true }), String(error)];
  if (error instanceof Error) {
    parts.push(error.stack ?? "", error.message, JSON.stringify(error));
    parts.push(inspect(error.cause, { depth: 10, showHidden: true }));
    for (const name of Object.getOwnPropertyNames(error)) {
      parts.push(String((error as unknown as Record<string, unknown>)[name]));
    }
  }
  return parts.join("\n");
}

describe("Weg anfrage (Standard): Anbieter-Schlüssel im Körper, nur an die Datenschleuse", () => {
  it("Chat-Anfrage: api_key im Körper, authorization = Schlüssel der Datenschleuse", async () => {
    const response = await viaSchleuse((m) => post(m, chatBody()));
    expect(response.status).toBe(200);
    const [seen, ...rest] = schleuse.requests;
    expect(rest).toHaveLength(0);
    expect(seen?.headers.authorization).toBe(`Bearer ${SCHLEUSE_KEY}`);
    const body = JSON.parse(seen?.body ?? "{}") as Record<string, unknown>;
    expect(body.api_key).toBe(PROVIDER_KEY);
    expect(body.model).toBe("eurouter/mistral-small-latest");
    expect(body.messages).toEqual([{ role: "user", content: "Grüße an Jörg – äöü ß €" }]);
    // Content-Length zählt Bytes, nicht Zeichen.
    expect(Number(seen?.headers["content-length"])).toBe(Buffer.byteLength(seen?.body ?? ""));
    expect(seen?.headers["content-type"]).toBe("application/json");
    // Der Anbieter-Schlüssel steht nirgends sonst in der Anfrage.
    expect(JSON.stringify(seen?.headers)).not.toContain(PROVIDER_KEY);
  });

  it("ohne Angabe des Wegs gilt anfrage; mitgegebene Ziel- und Schlüssel-Felder fallen weg", async () => {
    const extra = Object.fromEntries(
      SCHLEUSE_CLIENT_ROUTING_FIELDS.map((field) => [field, `fremd-${field}`]),
    );
    await viaSchleuse((m) => post(m, chatBody({ ...extra, stream: true })), {
      path: undefined,
    });
    const body = JSON.parse(schleuse.requests[0]?.body ?? "{}") as Record<string, unknown>;
    expect(body.api_key).toBe(PROVIDER_KEY);
    for (const field of SCHLEUSE_CLIENT_ROUTING_FIELDS.filter((f) => f !== "api_key")) {
      expect(body).not.toHaveProperty(field);
    }
    expect(body.stream).toBe(true);
  });

  it("überschreibt eine mitgegebene authorization und eine falsche Content-Length", async () => {
    await viaSchleuse((m) =>
      m.fetch(`${m.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { authorization: "Bearer fremd", "content-length": "3" },
        body: new TextEncoder().encode(chatBody()),
      }),
    );
    const seen = schleuse.requests[0];
    expect(seen?.headers.authorization).toBe(`Bearer ${SCHLEUSE_KEY}`);
    expect(Number(seen?.headers["content-length"])).toBe(Buffer.byteLength(seen?.body ?? ""));
    expect(JSON.parse(seen?.body ?? "{}")).toHaveProperty("api_key", PROVIDER_KEY);
  });

  it("auch als Request-Objekt", async () => {
    await viaSchleuse((m) =>
      m.fetch(
        new Request(`${m.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: chatBody(),
        }),
      ),
    );
    expect(JSON.parse(schleuse.requests[0]?.body ?? "{}")).toHaveProperty("api_key", PROVIDER_KEY);
  });

  it("Strom: die Antwort kommt Stück für Stück durch", async () => {
    schleuse.setHandler((req, res) => {
      req.resume();
      res.writeHead(200, { "content-type": "text/event-stream" });
      const chunks = ["Hal", "lo"];
      for (const text of chunks) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
      }
      res.end("data: [DONE]\n\n");
    });
    const text = await viaSchleuse(async (m) => {
      const response = await post(m, chatBody({ stream: true }));
      return response.text();
    });
    expect(text).toContain('"Hal"');
    expect(text).toContain("[DONE]");
    expect(JSON.parse(schleuse.requests[0]?.body ?? "{}")).toHaveProperty("stream", true);
  });

  it("andere Endpunkte und GET bekommen keinen Anbieter-Schlüssel", async () => {
    await viaSchleuse(async (m) => {
      await m.fetch(`${m.baseUrl}/models`);
      await post(m, chatBody(), "/embeddings");
    });
    expect(schleuse.requests.map((r) => r.url)).toEqual(["/v1/models", "/v1/embeddings"]);
    for (const seen of schleuse.requests) {
      expect(seen.body).not.toContain(PROVIDER_KEY);
      expect(seen.headers.authorization).toBe(`Bearer ${SCHLEUSE_KEY}`);
    }
  });

  it("ein Körper, der kein JSON-Objekt ist, wird nicht gesendet", async () => {
    for (const body of ["kein json", "[1,2]", "null", new Blob([chatBody()])]) {
      const error = await caught(viaSchleuse((m) => post(m, body)));
      expect(error).toBeInstanceOf(PaiBotError);
      expect(error).toMatchObject({ code: "intern" });
      expect(everythingIn(error)).not.toContain(PROVIDER_KEY);
    }
    expect(schleuse.requests).toHaveLength(0);
  });

  it("keine Weiterleitung mit dem Schlüssel im Körper", async () => {
    schleuse.setHandler((req, res) => {
      req.resume();
      if (req.url === "/v1/chat/completions") {
        res.writeHead(307, { location: "/v1/anderswo" }).end();
      } else json(res, 200, {});
    });
    const error = await caught(viaSchleuse((m) => post(m, chatBody())));
    expect(error).toBeDefined();
    expect(schleuse.requests.map((r) => r.url)).toEqual(["/v1/chat/completions"]);
  });

  it("nur an die Adresse der Datenschleuse, nie an den Anbieter oder ein fremdes Ziel", async () => {
    const fremd = await startTestServer((_req, res) => json(res, 200, {}));
    try {
      await viaSchleuse(async (m) => {
        await expect(
          m.fetch(`${fremd.origin}/v1/chat/completions`, { method: "POST", body: chatBody() }),
        ).rejects.toMatchObject({ name: "EgressBlockedError" });
        await expect(
          m.fetch(`${PROVIDER_URL}/chat/completions`, { method: "POST", body: chatBody() }),
        ).rejects.toMatchObject({ name: "EgressBlockedError" });
      });
      expect(fremd.requests).toHaveLength(0);
    } finally {
      await fremd.close();
    }
  });

  it("nach dem Ende der Berechtigung geht nichts mehr hinaus", async () => {
    const model = await viaSchleuse(async (m) => m);
    const error = await caught(post(model, chatBody()));
    expect(error).toMatchObject({ code: "abgelehnt" });
    expect(schleuse.requests).toHaveLength(0);
  });

  it("der Schlüssel steht in keinem Feld des Zugangs", async () => {
    await viaSchleuse(async (m) => {
      const shown = [JSON.stringify(m), inspect(m, { showHidden: true, depth: 5 }), String(m)];
      for (const text of shown) expect(text).not.toContain(PROVIDER_KEY);
      expect(Object.values(m).map(String).join(" ")).not.toContain(PROVIDER_KEY);
    });
  });

  it("ohne Schlüssel beim Anbieter: schluessel_ungueltig, lokal ohne Schlüssel: ohne api_key", async () => {
    const error = await caught(viaSchleuse(async () => undefined, { withKey: false }));
    expect(error).toMatchObject({ code: "schluessel_ungueltig" });
    await viaSchleuse((m) => post(m, chatBody({ api_key: "fremd" })), {
      region: "local",
      withKey: false,
    });
    const body = JSON.parse(schleuse.requests[0]?.body ?? "{}") as Record<string, unknown>;
    // Lokal ohne Schlüssel wird der Körper nicht angefasst.
    expect(body.api_key).toBe("fremd");
  });
});

describe("createSchleuseFetch", () => {
  it("gibt keine veraltete Content-Length an die Verbindung weiter", async () => {
    const seen: RequestInit[] = [];
    const doFetch = createSchleuseFetch({
      guarded: async (_input, init) => {
        seen.push(init ?? {});
        return new Response("{}", { status: 200 });
      },
      baseUrl: "http://datenschleuse:4000/v1",
      schleuseKey: SCHLEUSE_KEY,
      providerKey: PROVIDER_KEY,
      stillAllowed: () => true,
    });
    await doFetch("http://datenschleuse:4000/v1/chat/completions", {
      method: "POST",
      headers: { "content-length": "2" },
      body: "{}",
    });
    const headers = new Headers(seen[0]?.headers);
    expect(headers.get("content-length")).toBeNull();
    expect(headers.get("authorization")).toBe(`Bearer ${SCHLEUSE_KEY}`);
    expect(seen[0]?.redirect).toBe("error");
    expect(JSON.parse(String(seen[0]?.body))).toEqual({ api_key: PROVIDER_KEY });
  });
});

describe("Weg umgebung: kein Anbieter-Schlüssel von PaiBot", () => {
  it("Körper unverändert, kein Schlüssel nötig", async () => {
    const original = chatBody();
    await viaSchleuse((m) => post(m, original), { path: "umgebung", withKey: false });
    expect(schleuse.requests[0]?.body).toBe(original);
    expect(schleuse.requests[0]?.headers.authorization).toBe(`Bearer ${SCHLEUSE_KEY}`);
  });
  it("auch mit gespeichertem Schlüssel geht er nicht mit", async () => {
    await viaSchleuse((m) => post(m, chatBody()), { path: "umgebung" });
    expect(schleuse.requests[0]?.body).not.toContain(PROVIDER_KEY);
  });
});

describe("Fehlerantworten der Datenschleuse", () => {
  it("Block → schleuse_blockiert, nicht wiederholbar, ohne ein Wort aus der Meldung", async () => {
    schleuse.setHandler(blockiert);
    const error = await caught(viaSchleuse((m) => post(m, chatBody())));
    expect(error).toBeInstanceOf(PaiBotError);
    expect(error).toMatchObject({ code: "schleuse_blockiert" });
    expect((error as Error).cause).toBeUndefined();
    const code = mapProviderError(error);
    expect(code).toBe("schleuse_blockiert");
    expect(isRetryable(code)).toBe(false);
    const all = everythingIn(error);
    expect(all).not.toContain(BEGRUENDUNG);
    expect(all).not.toMatch(/fail-closed|Exception occured/);
    expect(all).not.toContain(PROVIDER_KEY);
    expect(all).not.toContain(SCHLEUSE_KEY);
  });

  it("falscher Zugangsschlüssel (HTTP 400 no_db_connection) → schluessel_ungueltig", async () => {
    schleuse.setHandler(keineDatenbank);
    const error = await caught(viaSchleuse((m) => post(m, chatBody())));
    expect(error).toMatchObject({ code: "schluessel_ungueltig" });
    expect(everythingIn(error)).not.toContain(BEGRUENDUNG);
  });

  it("andere Fehler nach dem Status, ohne Inhalt", async () => {
    const cases: Array<[number, string]> = [
      [401, "schluessel_ungueltig"],
      [429, "limit_erreicht"],
      [500, "anbieter_nicht_erreichbar"],
      [502, "anbieter_nicht_erreichbar"],
      [400, "intern"],
    ];
    for (const [status, code] of cases) {
      schleuse.setHandler((req, res) => {
        req.resume();
        json(res, status, { error: { message: BEGRUENDUNG, type: "irgendwas" } });
      });
      const error = await caught(viaSchleuse((m) => post(m, chatBody())));
      expect(error, String(status)).toMatchObject({ code });
      expect(everythingIn(error)).not.toContain(BEGRUENDUNG);
    }
  });

  it("riesige Fehlerantwort: nach dem Status, ohne alles zu lesen", async () => {
    schleuse.setHandler((req, res) => {
      req.resume();
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ error: { type: "None", message: `blockiert ${"x".repeat(200_000)}` } }),
      );
    });
    const error = await caught(viaSchleuse((m) => post(m, chatBody())));
    expect(error).toMatchObject({ code: "anbieter_nicht_erreichbar" });
  });

  it("Weg umgebung bildet genauso ab", async () => {
    schleuse.setHandler(blockiert);
    const error = await caught(
      viaSchleuse((m) => post(m, chatBody()), { path: "umgebung", withKey: false }),
    );
    expect(error).toMatchObject({ code: "schleuse_blockiert" });
  });
});
