/**
 * PaiBot – Durchstich-Test: Einrichtung, Tor, Modell-Zugang, Test-Anbieter, Belege und Export im Zusammenspiel.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  contextDigest,
  createSigningKeyHolder,
  decryptSecret,
  deriveKey,
  encryptSecret,
  fingerprint,
  generateSigningKey,
  loadMasterSecret,
} from "@paibot/crypto";
import { type Database, repo, rules } from "@paibot/db";
import { createTestDb, type TestDb } from "@paibot/db/testing";
import { createFakeProvider, type FakeProvider } from "@paibot/fake-provider";
import {
  ACTIVE_STANDARD_RULES,
  createGate,
  type Gate,
  hashRule,
  isGateDenied,
  ruleSnapshot,
} from "@paibot/gate";
import { fetchModels, providerTargetFacts } from "@paibot/llm";
import { isResolvedModel, resolveModel } from "@paibot/llm/modell";
import {
  checkContext,
  createReceiptWriter,
  exportJsonl,
  parseJsonl,
  reevaluate,
  runCli,
  verifyChain,
} from "@paibot/receipts";
import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import type { ReceiptBody, ReceiptEntry } from "@paibot/shared/belege";
import { providerSecretBinding, secretAad, signingKeySecretBinding } from "@paibot/shared/bindung";
import {
  type InstallationId,
  type KeyId,
  newId,
  type ProviderId,
  type RunId,
} from "@paibot/shared/ids";
import type { Bot, Conversation, Model, Provider } from "@paibot/shared/objekte";
import { readStand } from "@paibot/shared/stand";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Durchstich über alle Bausteine, so wie ihn später die Lauf-Steuerung zusammensetzt:
 *
 * 1. Einrichtung im Kleinen: Wurzel-Geheimnis, Signaturschlüssel erzeugen und verschlüsselt
 *    speichern, Beleg „Start“.
 * 2. Anbieter (Test-Anbieter) mit verschlüsseltem Schlüssel, Modell-Liste über die Ausgangs-Liste,
 *    Bot, Unterhaltung, Nachricht, Lauf.
 * 3. `modell.anfragen` durchs Tor → Berechtigung → `resolveModel` → Abruf beim Test-Anbieter →
 *    Beleg „Ergebnis“ → Kette prüfen → Export prüfen.
 * 4. Gegenprobe: Eine Regel lehnt ab → kein Abruf beim Test-Anbieter, Beleg „abgelehnt“.
 * 5. Gegenprobe: Die Adresse des Anbieters wird nach der Entscheidung umgebogen → kein Zugang,
 *    keine Anfrage und kein Schlüssel beim fremden Host.
 */

const PROVIDER_KEY = `sk-test-${randomBytes(12).toString("base64url")}`;
const REPLY = "Hallo, ich bin Pai.";
const QUESTION = "Wer bist du?";

let ctx: TestDb;
let fake: FakeProvider;
let gate: Gate;
let installationId: InstallationId;
let keyId: KeyId;
let provider: Provider;
let model: Model;
let bot: Bot;
let conversation: Conversation;
let tick = 0;
let attacker: Server;
const attackerRequests: Array<{ url: string; authorization: string | undefined }> = [];

const master = loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") });
const secretsKey = deriveKey(master, "secrets-v1");
const keysKey = deriveKey(master, "keys-v1");
const contextKey = deriveKey(master, "context-v1");
const clock = { now: () => new Date(Date.UTC(2026, 10, 20, 10, 0, 0) + tick++ * 1000) };

/**
 * Lädt den aktiven Signaturschlüssel aus der Datenbank und entschlüsselt ihn (gebunden an Kennung
 * und öffentlichen Teil). Der Schreiber ruft `current()` unter seiner Sperre in der eigenen
 * Transaktion auf; deshalb wird der Schlüssel vorher einmal geladen und im Speicher gehalten.
 */
async function loadReceiptKeys(db: Database) {
  const holder = createSigningKeyHolder(async () => {
    const active = await repo.installationKeys.getActive(db);
    if (active === undefined) throw new Error("kein aktiver Schlüssel");
    const aad = secretAad(signingKeySecretBinding(active.id, active.publicKey));
    return {
      keyId: active.id,
      publicKey: active.publicKey,
      privateKey: decryptSecret(active.privateKeyEnc, keysKey, { aad }),
    };
  });
  await holder.load();
  return holder;
}

async function entries(): Promise<ReceiptEntry[]> {
  return repo.belege.listFrom(ctx.db);
}

async function verifyAll() {
  return verifyChain(await entries(), await repo.installationKeys.listPublic(ctx.db), {
    rules: await repo.rules.listActive(ctx.db),
  });
}

/** Aktion und Fakten für eine Modell-Anfrage, wie sie die Lauf-Steuerung aus der Datenbank baut. */
async function modelRequest(): Promise<{
  runId: RunId;
  action: ActionRequest<"modell.anfragen">;
  facts: Facts<"modell.anfragen">;
}> {
  const message = await repo.messages.insert(ctx.db, {
    conversationId: conversation.id,
    role: "user",
    content: QUESTION,
  });
  const run = await repo.runs.create(ctx.db, {
    conversationId: conversation.id,
    triggerMessageId: message.id,
    botId: bot.id,
  });
  await repo.runs.markRunning(ctx.db, run.id);
  return {
    runId: run.id,
    action: {
      actionId: newId("action"),
      type: "modell.anfragen",
      actor: `bot:${bot.id}`,
      target: { conversationId: conversation.id, runId: run.id, botId: bot.id, modelId: model.id },
    },
    facts: {
      botOfConversation: conversation.botId === bot.id,
      providerId: provider.id,
      providerEnabled: provider.enabled,
      region: provider.region,
      route: "direct",
      requestedMode: "off",
      schleuseReachable: false,
      inputChars: QUESTION.length,
      maxInputChars: 32000,
      maxOutputTokens: 1024,
      botMaxOutputTokens: bot.maxOutputTokens,
      tokensToday: 0,
      killSwitch: false,
      // Ziel aus dem gelesenen Anbieter: Abdruck von ID und Basis-URL, geprüft vor dem Abruf.
      ...providerTargetFacts(provider.id, provider.baseUrl),
    },
  };
}

/** Ausführung der erlaubten Anfrage: Modell-Zugang nur mit Berechtigung, Abruf nur über dessen `fetch`. */
async function askModel(permit: Parameters<typeof resolveModel>[0]) {
  const stored = await repo.providers.getWithKey(ctx.db, provider.id);
  if (stored === undefined) throw new Error("Anbieter fehlt");
  const resolved = resolveModel(
    permit,
    {
      provider: {
        id: stored.provider.id,
        templateKey: stored.provider.templateKey,
        baseUrl: stored.provider.baseUrl,
        region: stored.provider.region,
        ...(stored.apiKeyEnc === undefined ? {} : { apiKeyEnc: stored.apiKeyEnc }),
      },
      model: { id: model.id, slug: model.slug, displayName: model.displayName },
      conversationId: conversation.id,
    },
    { secretsKey },
  );
  expect(isResolvedModel(resolved)).toBe(true);
  expect(JSON.stringify(resolved)).not.toContain(PROVIDER_KEY);
  // Die Anmeldung setzt `fetch` selbst; der Zugang gibt den Schlüssel nicht heraus.
  const response = await resolved.fetch(`${resolved.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...resolved.headers },
    body: JSON.stringify({
      model: resolved.slug,
      stream: false,
      messages: [{ role: "user", content: QUESTION }],
    }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  const text = body.choices[0]?.message.content ?? "";
  return {
    value: text,
    result: {
      status: "ok" as const,
      digest: contextDigest(contextKey, text),
      tokens: { input: body.usage.prompt_tokens, output: body.usage.completion_tokens },
    },
  };
}

beforeAll(async () => {
  ctx = await createTestDb();

  // 1. Einrichtung im Kleinen
  installationId = newId("installation");
  await repo.settings.completeSetup(ctx.db, { installationId, now: clock.now() });
  const pair = generateSigningKey();
  const newKeyId = newId("key") as KeyId;
  const stored = await repo.installationKeys.create(ctx.db, {
    id: newKeyId,
    publicKey: pair.publicKey,
    privateKeyEnc: encryptSecret(pair.privateKey, keysKey, {
      aad: secretAad(signingKeySecretBinding(newKeyId, pair.publicKey)),
    }),
    fingerprint: fingerprint(pair.publicKey),
  });
  keyId = stored.id;
  const writer = createReceiptWriter(ctx.db, await loadReceiptKeys(ctx.db));
  await writer.appendStart({
    installationId,
    key: { keyId, publicKey: pair.publicKey, privateKey: pair.privateKey },
    software: readStand({}),
    time: clock.now(),
  });
  gate = createGate({
    // Regelstand aus der Datenbank: geltende Fassungen mit Nummer im Regel-Protokoll und Stand.
    rules: {
      load: async () => {
        const { stand, rules: active } = await repo.rules.loadSnapshot(ctx.db);
        return ruleSnapshot(active, stand);
      },
    },
    receipts: writer,
    clock,
  });

  // 2. Anbieter, Modell, Bot, Unterhaltung
  fake = createFakeProvider({ apiKey: PROVIDER_KEY });
  const { baseUrl } = await fake.start({ port: 0 });
  const providerId = newId("provider") as ProviderId;
  provider = await repo.providers.create(ctx.db, {
    id: providerId,
    name: "Test-Anbieter",
    baseUrl,
    apiKeyEnc: encryptSecret(PROVIDER_KEY, secretsKey, {
      aad: secretAad(providerSecretBinding(providerId, baseUrl)),
    }),
    region: "local",
  });
  attacker = createServer((req, res) => {
    attackerRequests.push({ url: req.url ?? "", authorization: req.headers.authorization });
    res.writeHead(200, { "content-type": "application/json" }).end("{}");
  });
  await new Promise<void>((resolve) => attacker.listen(0, "127.0.0.1", resolve));
  const listed = await fetchModels({ baseUrl, region: "local" }, PROVIDER_KEY);
  const first = listed.find((m) => m.slug === "fake/test-modell");
  if (first === undefined) throw new Error("Modell fehlt in der Liste");
  model = await repo.models.create(ctx.db, {
    providerId: provider.id,
    slug: first.slug,
    displayName: first.displayName,
  });
  bot = await repo.bots.create(ctx.db, {
    name: "Pai",
    modelId: model.id,
    avatarShape: "blatt",
    color: "limette",
  });
  conversation = await repo.conversations.create(ctx.db, { botId: bot.id, title: "Beispiel" });
  fake.reset();
  fake.configure({ reply: REPLY });
});

afterAll(async () => {
  await fake?.stop();
  if (attacker?.listening) {
    attacker.closeAllConnections();
    await new Promise((resolve) => attacker.close(resolve));
  }
  await ctx?.client.close();
});

describe("Durchstich", () => {
  it("Einrichtung: Start-Beleg mit dem gespeicherten Schlüssel, Kette gültig", async () => {
    const [start] = await entries();
    expect(start?.body).toMatchObject({
      type: "start",
      seq: 1,
      keyId,
      facts: { installationId, software: readStand({}) },
    });
    const key = await repo.installationKeys.get(ctx.db, keyId);
    expect(key?.privateKeyEnc.startsWith("v2:")).toBe(true);
    const stored = await repo.providers.getWithKey(ctx.db, provider.id);
    expect(stored?.apiKeyEnc?.startsWith("v2:")).toBe(true);
    expect((await verifyAll()).ok).toBe(true);
  });

  it("modell.anfragen: Tor → Berechtigung → Modell-Zugang → Test-Anbieter → Ergebnis-Beleg", async () => {
    const { runId, action, facts } = await modelRequest();
    const before = (await entries()).length;

    const run = await gate.run(action, facts, (permit) => askModel(permit), {
      context: { digest: contextDigest(contextKey, QUESTION) },
    });

    await repo.runs.finish(ctx.db, runId, { status: "succeeded" });
    expect(run.value).toBe(REPLY);
    // Die Prüfsumme der Standard-Regel aus dem Code: die Regel in der Datenbank gleicht ihr.
    const r002 = ACTIVE_STANDARD_RULES.find((rule) => rule.id === "R-002");
    if (r002 === undefined) throw new Error("R-002 fehlt");
    expect(run.decision).toMatchObject({
      outcome: "allow",
      stage: "execute",
      matchedRules: [{ id: "R-002", version: 1, hash: await hashRule(r002) }],
      ruleStand: (await repo.rules.loadSnapshot(ctx.db)).stand,
    });
    expect(run.decision.limits.every((limit) => limit.result !== "verletzt")).toBe(true);

    // Genau ein Abruf beim Test-Anbieter, mit dem entschlüsselten Schlüssel und dem Modell.
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/chat/completions",
      body: { model: "fake/test-modell" },
    });
    expect(fake.requests[0]?.headers.authorization).toBe(`Bearer ${PROVIDER_KEY}`);

    // Zwei Belege, verbunden über die Aktion, ohne Inhalte der Nachricht.
    const all = await entries();
    expect(all).toHaveLength(before + 2);
    const [decision, result] = all.slice(-2).map((e) => e.body as ReceiptBody);
    expect(decision).toMatchObject({
      type: "decision",
      action: { actionId: action.actionId, type: "modell.anfragen" },
      decision: { outcome: "allow" },
    });
    expect(result).toMatchObject({
      type: "result",
      action: { actionId: action.actionId },
      result: { status: "ok", tokens: { input: expect.any(Number), output: expect.any(Number) } },
    });
    const raw = JSON.stringify(all);
    expect(raw).not.toContain(QUESTION);
    expect(raw).not.toContain(REPLY);
    expect(raw).not.toContain(PROVIDER_KEY);

    // Kontext lässt sich gegen den gespeicherten Inhalt prüfen.
    const decisionEntry = all.at(-2) as ReceiptEntry;
    expect(checkContext(decisionEntry, QUESTION, contextKey).status).toBe("ok");
    expect(checkContext(decisionEntry, "etwas anderes", contextKey).status).toBe("fehler");

    // Ereignisse der Unterhaltung: je Beleg ein `beleg.created`.
    const events = await repo.events.listSince(ctx.db, conversation.id);
    expect(events.filter((e) => e.type === "beleg.created").map((e) => e.data)).toEqual([
      { belegId: run.receipts.decision.receiptId, action: "modell.anfragen" },
      { belegId: run.receipts.result.receiptId, action: "modell.anfragen" },
    ]);

    // Kette prüfen, mit Nachrechnen der Entscheidungen.
    const report = await verifyAll();
    expect(report).toMatchObject({ ok: true, checked: all.length });
  });

  it("Export: JSONL lesen, Kette prüfen, Befehl meldet gültig", async () => {
    const header = {
      format: "pb-belege" as const,
      v: 1 as const,
      installationId,
      publicKeys: await repo.installationKeys.listPublic(ctx.db),
    };
    let text = "";
    for await (const line of exportJsonl(header, await entries())) text += line;

    const parsed = parseJsonl(text);
    expect(parsed.header.installationId).toBe(installationId);
    expect(parsed.entries).toEqual(await entries());
    const report = await verifyChain(parsed.entries, parsed.header.publicKeys);
    expect(report.ok).toBe(true);

    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(["export.jsonl"], {
      readFile: async () => text,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    });
    expect({ code, err }).toEqual({ code: 0, err: [] });
    expect(out[0]).toContain("gültig");

    // Ein verändertes Byte im Export fällt auf.
    const tampered = text.replace('"status":"ok"', '"status":"error"');
    expect(tampered).not.toBe(text);
    const bad = await runCli(["export.jsonl"], {
      readFile: async () => tampered,
      out: () => undefined,
      err: () => undefined,
    });
    expect(bad).toBe(1);
  });

  it("Gegenprobe: Adresse nach der Entscheidung umgebogen → kein Zugang, nichts beim fremden Host", async () => {
    fake.reset();
    fake.configure({ reply: REPLY });
    const { runId, action, facts } = await modelRequest();
    const original = provider.baseUrl;
    const evil = `http://127.0.0.1:${(attacker.address() as AddressInfo).port}/v1`;

    const error = await gate
      .run(action, facts, async (permit) => {
        // Zwischen Entscheidung und Abruf ändert jemand die Adresse in der Datenbank.
        await repo.providers.update(ctx.db, provider.id, { baseUrl: evil });
        return askModel(permit);
      })
      .catch((e: unknown) => e);
    await repo.providers.update(ctx.db, provider.id, { baseUrl: original });
    await repo.runs.finish(ctx.db, runId, { status: "failed", errorCode: "abgelehnt" });

    expect(error).toMatchObject({ code: "abgelehnt" });
    expect(attackerRequests).toEqual([]);
    expect(fake.requests).toHaveLength(0);
    const [, result] = (await entries()).slice(-2).map((e) => e.body as ReceiptBody);
    expect(result).toMatchObject({ type: "result", action: { actionId: action.actionId } });
    expect(JSON.stringify(await entries())).not.toContain(PROVIDER_KEY);
    expect((await verifyAll()).ok).toBe(true);

    // Schon vor der Entscheidung umgebogen: Die Fakten stammen aus dem geänderten Datensatz, der
    // Abdruck passt also. Trotzdem kommt der Schlüssel nicht beim fremden Host an: Er ist an die
    // Adresse gebunden, für die er gespeichert wurde.
    await repo.providers.update(ctx.db, provider.id, { baseUrl: evil });
    try {
      const next = await modelRequest();
      const bentFacts = { ...next.facts, ...providerTargetFacts(provider.id, evil) };
      const second = await gate
        .run(next.action, bentFacts, (permit) => askModel(permit))
        .catch((e: unknown) => e);
      await repo.runs.finish(ctx.db, next.runId, {
        status: "failed",
        errorCode: "schluessel_ungueltig",
      });
      expect(second).toMatchObject({ code: "schluessel_ungueltig" });
    } finally {
      await repo.providers.update(ctx.db, provider.id, { baseUrl: original });
    }
    expect(attackerRequests).toEqual([]);
  });

  it("Gegenprobe: nur der Pfad umgebogen (gleicher Host) → Schlüssel passt nicht, keine Anfrage", async () => {
    fake.reset();
    fake.configure({ reply: REPLY });
    const original = provider.baseUrl;
    const bent = `${new URL(original).origin}/fremder-mandant/v1`;
    // Vor der Entscheidung geändert: Fakten und Abdruck stammen aus dem geänderten Datensatz.
    await repo.providers.update(ctx.db, provider.id, { baseUrl: bent });
    try {
      const next = await modelRequest();
      const bentFacts = { ...next.facts, ...providerTargetFacts(provider.id, bent) };
      const error = await gate
        .run(next.action, bentFacts, (permit) => askModel(permit))
        .catch((e: unknown) => e);
      await repo.runs.finish(ctx.db, next.runId, {
        status: "failed",
        errorCode: "schluessel_ungueltig",
      });
      expect(error).toMatchObject({ code: "schluessel_ungueltig" });
    } finally {
      await repo.providers.update(ctx.db, provider.id, { baseUrl: original });
    }
    expect(fake.requests).toHaveLength(0);
    expect(JSON.stringify(await entries())).not.toContain(PROVIDER_KEY);
    expect((await verifyAll()).ok).toBe(true);
  });

  it("Gegenprobe: Regel lehnt ab → kein Abruf beim Test-Anbieter, Beleg „abgelehnt“", async () => {
    const ruleId = newId("rule");
    await ctx.db.insert(rules).values({
      id: ruleId,
      version: 1,
      action: "modell.anfragen",
      effect: "deny",
      stage: "execute",
      conditions: [],
      priority: 1,
      source: "owner",
      title: "Keine Modell-Anfragen",
      reason: "Modell-Anfragen sind gesperrt.",
    });
    fake.reset();
    fake.configure({ reply: REPLY });
    const { runId, action, facts } = await modelRequest();
    let executed = false;

    const error = await gate
      .run(action, facts, async (permit) => {
        executed = true;
        return askModel(permit);
      })
      .catch((e: unknown) => e);

    await repo.runs.finish(ctx.db, runId, { status: "denied", errorCode: "abgelehnt" });
    expect(isGateDenied(error)).toBe(true);
    if (!isGateDenied(error)) throw error;
    expect(error.code).toBe("abgelehnt");
    const added = (await repo.rules.listActive(ctx.db)).find((rule) => rule.id === ruleId);
    if (added === undefined) throw new Error("Regel fehlt");
    const addedHash = await hashRule(added);
    expect(error.decision.matchedRules).toEqual([{ id: ruleId, version: 1, hash: addedHash }]);
    expect(executed).toBe(false);
    expect(fake.requests).toHaveLength(0);

    const [decision, result] = (await entries()).slice(-2).map((e) => e.body as ReceiptBody);
    expect(decision).toMatchObject({
      type: "decision",
      action: { actionId: action.actionId },
      decision: { outcome: "deny", rules: [{ id: ruleId, version: 1, hash: addedHash }] },
    });
    expect(result).toMatchObject({
      type: "result",
      action: { actionId: action.actionId },
      result: { status: "denied", code: "abgelehnt" },
    });

    // Signaturen und Kette bleiben gültig. Nachgerechnet wird die neue Entscheidung mit den
    // Regeln, die jetzt gelten (die frühere Erlaubnis galt vor der neuen Regel).
    const all = await entries();
    const keys = await repo.installationKeys.listPublic(ctx.db);
    expect((await verifyChain(all, keys)).ok).toBe(true);
    const active = await repo.rules.listActive(ctx.db);
    expect(reevaluate(all.at(-2) as ReceiptEntry, active).status).toBe("ok");
  });
});
