/**
 * PaiBot – Verhaltens-Tests der Schritt-Schleife mit dem echten Motor gegen den Test-Anbieter mit
 * Drehbuch (PGlite): Ausführung nur nach „erlaubt“, Fakten je Schritt, Grenzen mitten im Lauf,
 * Schritt-Ende, Rückhalten des Texts, Hüllen, Ränder von Namen, Eingaben und Kennungen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { contextDigest } from "@paibot/crypto";
import { bots, repo, settings as settingsTable } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { createFakeProvider, type FakeProvider, type FakeScript } from "@paibot/fake-provider";
import { toolCallDigestText } from "@paibot/gate";
import { type FakeSchleuse, startFakeSchleuse } from "@paibot/llm/testing";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import type { ReceiptEntry } from "@paibot/shared/belege";
import type { ConversationEvent } from "@paibot/shared/ereignisse";
import type { RunId } from "@paibot/shared/ids";
import type { JsonValue } from "@paibot/shared/motor";
import { t } from "@paibot/shared/texte";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAiSdkMotor } from "../motor-aisdk";
import { buildSystemPrompt } from "../prompt";
import { type RunSetup, type RunSetupOptions, setupRun } from "../testing/lauf-umgebung";
import {
  createTestTools,
  TEST_FOREIGN_CLEAN,
  TEST_SECRET_MARKER,
  type TestToolOptions,
  type TestTools,
} from "../testing/werkzeuge";
import { createToolRegistry } from "../werkzeuge/register";
import { executeRun } from "./ausfuehren";
import { REQUEST_DIGEST_PREFIX, readSchleuseStatus } from "./kontext";
import {
  ANSWER_TEXT,
  DRAFT_TEXT,
  longInput,
  REASONING_MARKER,
  SCRIPTS,
} from "./testdaten/drehbuecher";

// Drehbücher: `testdaten/drehbuecher.ts`, Test-Werkzeuge: `testing/werkzeuge.ts`. Die Gegenprobe
// im Kommentar ist die Änderung, die den Fall rot machen muss. Durch das echte Tor kommt ein
// Werkzeug-Aufruf nur als „erlaubt“, wenn das Werkzeug die Kennung von R-010 trägt
// (`allowedByR010`); alles andere entscheidet R-005 als „fragen“, und das ist abgelehnt.

const PROVIDER_KEY = `sk-test-${"p".repeat(24)}`;
const SCHLEUSE_KEY = `sk-schleuse-${"s".repeat(20)}`;
const QUESTION = "Wie ist der Stand?";

const RECEIPT_TOOLS = {
  createWriter: createReceiptWriter,
  verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
    verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
};

let provider: FakeProvider;
let providerUrl: string;
let behind: FakeProvider;
let schleuse: FakeSchleuse;

beforeAll(async () => {
  provider = createFakeProvider({ apiKey: PROVIDER_KEY, reply: ANSWER_TEXT });
  ({ baseUrl: providerUrl } = await provider.start({ port: 0 }));
  behind = createFakeProvider({ apiKey: PROVIDER_KEY, reply: ANSWER_TEXT });
  const { baseUrl: behindUrl } = await behind.start({ port: 0 });
  schleuse = await startFakeSchleuse({ apiKey: SCHLEUSE_KEY, upstream: behindUrl });
});

afterAll(async () => {
  await provider.stop();
  await behind.stop();
  await schleuse.close();
});

afterEach(() => {
  provider.reset();
  behind.reset();
  schleuse.setMode("durchlassen");
  vi.restoreAllMocks();
});

const never = () => new AbortController().signal;

interface Env extends RunSetup {
  tools: TestTools;
  /** Rohe Verbindung der Test-Datenbank (für eingespielte Fehler). */
  sqlExec(text: string): Promise<unknown>;
  /** Fragt einmal und führt den Lauf aus. */
  ask(text?: string): Promise<{ runId: RunId; outcome: Awaited<ReturnType<typeof executeRun>> }>;
}

/**
 * Installation mit Test-Werkzeugen im Register; `allowedByR010` macht ein Werkzeug durch das echte
 * Tor erlaubt. `script` setzt das Drehbuch des Test-Anbieters.
 */
async function setup(
  script: FakeScript | undefined,
  options: {
    tools?: TestToolOptions | false;
    extra?: Partial<RunSetupOptions>;
    fake?: FakeProvider;
  } = {},
): Promise<Env> {
  const { db, client } = await createTestDb();
  const fake = options.fake ?? provider;
  const env = await setupRun(db, RECEIPT_TOOLS, {
    providerBaseUrl: providerUrl,
    providerKey: PROVIDER_KEY,
    motor: createAiSdkMotor(),
    ...options.extra,
  });
  const tools = createTestTools(options.tools === false ? {} : options.tools);
  if (options.tools !== false) env.deps.tools = await createToolRegistry(tools.tools);
  fake.reset();
  fake.configure({ reply: ANSWER_TEXT, ...(script === undefined ? {} : { script }) });
  return {
    ...env,
    tools,
    sqlExec: (text) => client.exec(text),
    async ask(text = QUESTION) {
      const { runId } = await env.queueMessage(text);
      const outcome = await executeRun(runId, env.deps, never());
      return { runId, outcome };
    },
  };
}

function chats(fake: FakeProvider = provider) {
  return fake.requests.filter((r) => r.path.endsWith("/chat/completions"));
}

type Body = {
  messages: { role: string; content: unknown; tool_calls?: unknown }[];
  tools?: { function: { name: string } }[];
  max_tokens?: number;
  max_completion_tokens?: number;
};
const body = (i: number, fake: FakeProvider = provider) => chats(fake)[i]?.body as Body;

function bodies(entries: readonly ReceiptEntry[]) {
  return entries.map((entry) => entry.body);
}

function decisions(entries: readonly ReceiptEntry[], type: string) {
  return bodies(entries).filter(
    (b): b is Extract<ReceiptEntry["body"], { type: "decision" }> =>
      b.type === "decision" && b.action.type === type,
  );
}

function results(entries: readonly ReceiptEntry[], type: string) {
  return bodies(entries).filter(
    (b): b is Extract<ReceiptEntry["body"], { type: "result" }> =>
      b.type === "result" && b.action.type === type,
  );
}

const types = (events: readonly ConversationEvent[]) => events.map((event) => event.type);

async function setLimits(env: RunSetup, values: Partial<typeof settingsTable.$inferInsert>) {
  await env.db.update(settingsTable).set(values);
}

describe("Ausführung nur nach „erlaubt“", () => {
  // Gegenprobe: (a) `run()` vor `gate.run` aufrufen; (b) im Zweig „abgelehnt“ ausführen → rot.
  it("vor jeder Ausführung stehen Zeile requested, Entscheidung allow und running – in dieser Reihenfolge; Zählwerk = Zahl der allow", async () => {
    const env = await setup(SCRIPTS.zweiSchritteMitAufruf, {
      tools: { allowedByR010: "test_lesen" },
    });
    const order: string[] = [];
    const appendDecision = env.writer.appendDecision.bind(env.writer);
    vi.spyOn(env.writer, "appendDecision").mockImplementation(async (record) => {
      if (record.action.type === "werkzeug.aufrufen") {
        const row = await repo.toolCalls.get(env.db, record.action.actionId);
        order.push(`entscheidung:${record.decision.outcome}:zeile=${row?.status}`);
      }
      return appendDecision(record);
    });
    const run = env.tools.byName("test_lesen").run;
    vi.spyOn(env.tools.byName("test_lesen"), "run").mockImplementation(async (input, ctx) => {
      const row = await repo.toolCalls.get(env.db, ctx.permit.actionId);
      order.push(`werkzeug:zeile=${row?.status}`);
      return run(input, ctx);
    });
    env.deps.tools = await createToolRegistry(env.tools.tools);
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "succeeded" });
    expect(order).toEqual([
      "entscheidung:allow:zeile=requested",
      "werkzeug:zeile=running",
      "entscheidung:allow:zeile=requested",
      "werkzeug:zeile=running",
    ]);
    const allowed = decisions(await env.receipts(), "werkzeug.aufrufen").filter(
      (d) => d.decision.outcome === "allow",
    );
    expect(env.tools.protocol.count()).toBe(allowed.length);
    expect(await repo.toolCalls.listForRun(env.db, runId)).toMatchObject([
      { status: "succeeded" },
      { status: "succeeded" },
    ]);
    expect(await env.verify()).toMatchObject({ ok: true });
  });
});

/** Nachrichten des Bots in einem Lauf. */
async function botMessages(env: RunSetup, runId: RunId) {
  const all = await repo.messages.listForConversation(env.db, env.conversationId, { limit: 200 });
  return all.filter((m) => m.role === "assistant" && m.runId === runId);
}

/** Werte des Bots direkt in der Datenbank setzen (die Oberfläche begrenzt sie anders). */
async function setBot(env: RunSetup, values: Partial<typeof bots.$inferInsert>) {
  await env.db.update(bots).set(values);
}

describe("„Fragen“ ist abgelehnt", () => {
  // Gegenprobe: Zweig „fragen“ auf „warten“ (`recordDecision` mit ask bzw. `markWaiting`) → Fehler, rot.
  it("„fragen“ (R-005): test_schreiben läuft nicht, Zeile denied/freigabe_noetig, Hülle mit festem Satz, nichts wartet, Lauf succeeded mit Antwort aus Schritt 2", async () => {
    const env = await setup(SCRIPTS.schreiben);
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "succeeded" });
    expect(env.tools.protocol.count()).toBe(0);
    const [row] = await repo.toolCalls.listForRun(env.db, runId);
    expect(row).toMatchObject({
      status: "denied",
      errorCode: "freigabe_noetig",
      output: {
        status: "abgelehnt",
        code: "freigabe_noetig",
        text: t("werkzeug.huelle.freigabe_noetig"),
      },
    });
    const run = await repo.runs.get(env.db, runId);
    expect(run?.status).toBe("succeeded");
    const answer = (await botMessages(env, runId)).find((m) => m.step === undefined);
    expect(answer).toMatchObject({ content: ANSWER_TEXT, status: "complete" });
    expect(types(await env.events())).not.toContain("run.waiting");
    // Das Ergebnis des Tors bleibt „Regel fehlt“; freigabe_noetig steht nur an Zeile und Hülle.
    expect(results(await env.receipts(), "werkzeug.aufrufen")).toMatchObject([
      { result: { status: "denied", code: "regel_fehlt" } },
    ]);
    expect(chats()).toHaveLength(2);
    expect(body(1).messages.at(-1)?.role).toBe("tool");
  });
});

describe("Fremde Inhalte (Deckel D-01)", () => {
  // Gegenprobe: (a) nur aus dem eigenen Lauf; (b) über message_id statt run_id; (c) `false` fest → rot.
  it("Lauf 2 nach fremden Inhalten in Lauf 1: Fakt untrustedInput = true, Deckel nicht_noetig statt entfaellt, test_schreiben läuft nicht", async () => {
    const env = await setup(SCRIPTS.fremd, { tools: { allowedByR010: "test_fremd" } });
    expect((await env.ask()).outcome).toMatchObject({ status: "succeeded" });
    provider.configure({ script: SCRIPTS.schreiben });
    const { outcome } = await env.ask("Und jetzt?");
    expect(outcome).toMatchObject({ status: "succeeded" });
    const [lauf1, lauf2] = decisions(await env.receipts(), "modell.anfragen").filter(
      (d) => d.facts.step === 0,
    );
    expect(lauf1?.facts.untrustedInput).toBe(false);
    expect(lauf2?.facts.untrustedInput).toBe(true);
    const schreiben = decisions(await env.receipts(), "werkzeug.aufrufen").find(
      (d) => d.facts.toolName === "test_schreiben",
    );
    expect(schreiben?.facts.untrustedInput).toBe(true);
    expect(schreiben?.decision.caps).toEqual([
      { name: "fremd_dann_fragen", result: "nicht_noetig" },
    ]);
    expect(env.tools.protocol.count("test_schreiben")).toBe(0);
  });

  /** „Neu erzeugen“: neuer Lauf zur selben Nachricht der Person, mit dem Drehbuch `script`, bis zum Ende. */
  async function neuErzeugen(
    env: Env,
    messageId: Parameters<typeof repo.runs.create>[1]["triggerMessageId"],
    script: FakeScript,
  ) {
    const lauf = await repo.withTransaction(env.db, async (tx) => {
      const run = await repo.runs.create(tx, {
        conversationId: env.conversationId,
        triggerMessageId: messageId,
        botId: env.botId,
      });
      await repo.events.append(tx, {
        conversationId: env.conversationId,
        type: "run.queued",
        data: { runId: run.id },
      });
      return run;
    });
    provider.configure({ script });
    expect(await executeRun(lauf.id, env.deps, never())).toMatchObject({ status: "succeeded" });
    return lauf.id;
  }

  /** Fakt `untrustedInput` am ersten Schritt jedes Laufs (`modell.anfragen`), in der Reihenfolge der Läufe. */
  async function fremdJeLauf(env: Env) {
    return decisions(await env.receipts(), "modell.anfragen")
      .filter((d) => d.facts.step === 0)
      .map((d) => d.facts.untrustedInput);
  }

  // Gegenprobe: `untrustedInput` über alle Läufe der Unterhaltung statt über die gesendeten End-Antworten → rot.
  it("neu erzeugt: die ersetzte End-Antwort mit fremden Inhalten wird nicht mehr gesendet, der nächste Lauf gilt als unbedenklich", async () => {
    const env = await setup(SCRIPTS.fremd, { tools: { allowedByR010: "test_fremd" } });
    const eins = await env.queueMessage(QUESTION);
    expect(await executeRun(eins.runId, env.deps, never())).toMatchObject({ status: "succeeded" });
    await neuErzeugen(env, eins.messageId, SCRIPTS.nurText);
    provider.configure({ script: SCRIPTS.nurText });
    expect((await env.ask("Und jetzt?")).outcome).toMatchObject({ status: "succeeded" });
    expect(await fremdJeLauf(env)).toEqual([false, false, false]);
  });

  it("neu erzeugt mit fremden Inhalten: die geltende End-Antwort stammt aus einem Lauf mit fremden Inhalten, der nächste Lauf gilt als bedenklich", async () => {
    const env = await setup(SCRIPTS.nurText, { tools: { allowedByR010: "test_fremd" } });
    const eins = await env.queueMessage(QUESTION);
    expect(await executeRun(eins.runId, env.deps, never())).toMatchObject({ status: "succeeded" });
    await neuErzeugen(env, eins.messageId, SCRIPTS.fremd);
    provider.configure({ script: SCRIPTS.nurText });
    expect((await env.ask("Und jetzt?")).outcome).toMatchObject({ status: "succeeded" });
    expect(await fremdJeLauf(env)).toEqual([false, false, true]);
  });

  it("ohne fremde Inhalte: Deckel entfaellt (Gegenstück)", async () => {
    const env = await setup(SCRIPTS.schreiben);
    await env.ask();
    const schreiben = decisions(await env.receipts(), "werkzeug.aufrufen")[0];
    expect(schreiben?.facts.untrustedInput).toBe(false);
    expect(schreiben?.decision.caps).toEqual([{ name: "fremd_dann_fragen", result: "entfaellt" }]);
  });

  it("nach test_fremd ist untrustedInput = true an modell.anfragen des nächsten Schritts und am nächsten Aufruf", async () => {
    const env = await setup(SCRIPTS.fremdDannLesen, { tools: { allowedByR010: "test_fremd" } });
    expect((await env.ask()).outcome).toMatchObject({ status: "succeeded" });
    const steps = decisions(await env.receipts(), "modell.anfragen").map(
      (d) => d.facts.untrustedInput,
    );
    expect(steps).toEqual([false, true, true]);
    const calls = decisions(await env.receipts(), "werkzeug.aufrufen").map((d) => [
      d.facts.toolName,
      d.facts.untrustedInput,
    ]);
    expect(calls).toEqual([
      ["test_fremd", false],
      ["test_lesen", true],
    ]);
  });

  // Gegenprobe: den Wert vor jedem Aufruf neu aus der Datenbank lesen → zweiter Aufruf true, rot.
  // Der Wert gehört zur Anfrage, die den Aufruf erzeugte: das Modell hat beide Wünsche geschrieben,
  // bevor es ein Ergebnis dieses Schritts gesehen hat. Erst der nächste Schritt ist gedeckelt.
  it("untrustedInput gilt je Anfrage: ein fremdes Ergebnis desselben Schritts ändert ihn am nächsten Aufruf nicht", async () => {
    const env = await setup(SCRIPTS.fremdDannSchreibenImSchritt, {
      tools: { allowedByR010: "test_fremd" },
    });
    await env.ask();
    const calls = decisions(await env.receipts(), "werkzeug.aufrufen");
    expect(calls.map((d) => [d.facts.toolName, d.facts.untrustedInput])).toEqual([
      ["test_fremd", false],
      ["test_schreiben", false],
    ]);
    expect(calls[1]?.decision.caps).toEqual([{ name: "fremd_dann_fragen", result: "entfaellt" }]);
  });

  it("fällt die End-Antwort des fremden Laufs aus dem gesendeten Verlauf, gilt der Lauf nicht mehr als fremd", async () => {
    const env = await setup(SCRIPTS.fremd, {
      tools: { allowedByR010: "test_fremd" },
      extra: { tuning: { historyMaxMessages: 1 } },
    });
    await env.ask();
    provider.configure({ script: SCRIPTS.nurText });
    await env.ask("Neue Frage");
    const firstSteps = decisions(await env.receipts(), "modell.anfragen").filter(
      (d) => d.facts.step === 0,
    );
    expect(firstSteps.map((d) => d.facts.untrustedInput)).toEqual([false, false]);
  });
});

describe("Fakten je Schritt", () => {
  // Gegenprobe: `step: 0` fest; `untrustedInput: false` in kontext.ts zurück → rot.
  it("zweiter Schritt: step 1, runTokens = Verbrauch von Schritt 1, maxSteps aus den Einstellungen, toolCount im letzten Schritt 0", async () => {
    const env = await setup(SCRIPTS.zweiSchritteMitAufruf, {
      tools: { allowedByR010: "test_lesen" },
    });
    await setLimits(env, { maxStepsPerRun: 3 });
    const { outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "succeeded" });
    const facts = decisions(await env.receipts(), "modell.anfragen").map((d) => d.facts);
    const tokens = results(await env.receipts(), "modell.anfragen").map(
      (r) => (r.result.tokens?.input ?? 0) + (r.result.tokens?.output ?? 0),
    );
    expect(facts.map((f) => f.step)).toEqual([0, 1, 2]);
    expect(facts.map((f) => f.maxSteps)).toEqual([3, 3, 3]);
    expect(facts[1]?.runTokens).toBe(tokens[0]);
    expect(facts[2]?.runTokens).toBe((tokens[0] ?? 0) + (tokens[1] ?? 0));
    expect(facts.map((f) => f.toolCount)).toEqual([7, 7, 0]);
    expect(facts.map((f) => f.maxRunTokens)).toEqual([60000, 60000, 60000]);
    expect(body(2).tools).toBeUndefined();
    expect(body(0).tools?.map((tool) => tool.function.name)).toContain("test_lesen");
  });

  // Gegenprobe: Schätzung 0 → läuft bis Schritt 8, rot.
  it("ohne Verbrauchsangabe zählt jeder Schritt ⌈Eingabe ÷ 4⌉ + Ausgabe; Ende an G-18 vor max_steps_per_run", async () => {
    const env = await setup(SCRIPTS.ohneVerbrauch, { tools: { allowedByR010: "test_lesen" } });
    await setLimits(env, { maxTokensPerRun: 7000 });
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "failed", code: "limit_erreicht" });
    const facts = decisions(await env.receipts(), "modell.anfragen").map((d) => d.facts);
    const res = results(await env.receipts(), "modell.anfragen");
    expect(facts.length).toBeLessThan(8);
    for (const [i, r] of res.entries()) {
      const f = facts[i];
      if (r.result.status !== "ok" || f === undefined) continue;
      expect(r.result.tokens).toEqual({
        input: Math.ceil((f.inputChars as number) / 4),
        output: f.maxOutputTokens,
      });
    }
    const last = decisions(await env.receipts(), "modell.anfragen").at(-1);
    expect(last?.decision.limits).toContainEqual(
      expect.objectContaining({ name: "lauf_token", result: "verletzt" }),
    );
    const fest = (await botMessages(env, runId)).find((m) => m.step === undefined);
    expect(fest).toMatchObject({ origin: "fest", status: "complete" });
    expect(fest?.content).toBe(
      t("lauf.grenze.antwort", { titel: t("regel.G-18"), n: facts.length - 1 }),
    );
  });

  // Gegenprobe: tokensToday nur vom Lauf-Anfang → Schritt 3 erlaubt, rot.
  it("G-04 je Schritt: Schritt 3 abgelehnt, wenn Schritt 1 und 2 das Tagesbudget erreicht haben; tokensSince = Summe", async () => {
    const env = await setup(SCRIPTS.dreiSchritteVerbrauch, {
      tools: { allowedByR010: "test_lesen" },
    });
    await repo.settings.update(env.db, { dailyTokenBudget: 1000 });
    const { outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "denied", code: "abgelehnt" });
    const facts = decisions(await env.receipts(), "modell.anfragen").map((d) => [
      d.facts.tokensToday,
      d.facts.runTokens,
    ]);
    expect(facts).toEqual([
      [0, 0],
      [500, 500],
      [1000, 1000],
    ]);
    expect(await repo.messages.tokensSince(env.db, new Date(0))).toBe(1000);
    expect(types(await env.events())).toContain("run.denied");
  });

  // Gegenprobe: ohne Begrenzung → erster Schritt an G-18 abgelehnt, rot.
  it("beim Test-Anbieter kommt max_tokens = min(200000, max(Rest, 1000)) an", async () => {
    const env = await setup(SCRIPTS.nurText);
    await setBot(env, { maxOutputTokens: 200_000 });
    const { outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "succeeded" });
    const facts = decisions(await env.receipts(), "modell.anfragen")[0]?.facts;
    const expected = Math.min(
      200_000,
      Math.max(60_000 - Math.ceil(((facts?.inputChars as number | undefined) ?? 0) / 4), 1000),
    );
    expect(facts?.maxOutputTokens).toBe(expected);
    expect(facts?.botMaxOutputTokens).toBe(200_000);
    expect(body(0).max_tokens ?? body(0).max_completion_tokens).toBe(expected);
  });

  // Gegenprobe: ungekappt → eingabe_ungueltig ohne Beleg, rot.
  it("gemeldeter Verbrauch 2^53: gekappt belegt, der nächste Schritt an G-18 mit festem Satz, Kette gültig", async () => {
    const env = await setup(SCRIPTS.riesigerVerbrauch, { tools: { allowedByR010: "test_lesen" } });
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "failed", code: "limit_erreicht" });
    const first = results(await env.receipts(), "modell.anfragen")[0];
    expect(first?.result.tokens).toEqual({ input: 1_000_000_000, output: 1_000_000_000 });
    const second = decisions(await env.receipts(), "modell.anfragen")[1];
    expect(second?.facts.runTokens).toBe(2_000_000_000);
    expect(second?.facts.maxOutputTokens).toBe(1000);
    expect((await botMessages(env, runId)).find((m) => m.step === undefined)?.origin).toBe("fest");
    expect(await env.verify()).toMatchObject({ ok: true });
  });

  // Gegenprobe: nur den letzten servedBy belegen → rot.
  it("zwei Schritte mit zwei Anbietern: zwei Ergebnis-Belege mit eigenem servedBy/modelReported, zwei step.finished", async () => {
    const env = await setup(SCRIPTS.zweiAnbieter, { tools: { allowedByR010: "test_lesen" } });
    expect((await env.ask()).outcome).toMatchObject({ status: "succeeded" });
    expect(
      results(await env.receipts(), "modell.anfragen").map((r) => [
        r.result.servedBy,
        r.result.modelReported,
      ]),
    ).toEqual([
      [{ provider: "anbieter-eins", model: "modell-eins" }, "modell-eins"],
      [{ provider: "anbieter-zwei", model: "modell-zwei" }, "modell-zwei"],
    ]);
    const finished = (await env.events())
      .filter((e) => e.type === "step.finished")
      .map((e) => e.data);
    expect(finished).toMatchObject([
      { step: 0, ending: "zwischentext", modelReported: "modell-eins" },
      { step: 1, ending: "antwort", modelReported: "modell-zwei" },
    ]);
  });

  // Gegenprobe: Zustand nur einmal je Lauf lesen → Schritt 2 läuft, rot.
  it("Datenschleuse je Schritt: Schleuse nach Schritt 1 weg → Schritt 2 an G-01 abgelehnt, kein Rückfall auf direkt", async () => {
    let reads = 0;
    const connection = { baseUrl: schleuse.baseUrl, apiKey: SCHLEUSE_KEY };
    const env = await setup(SCRIPTS.zweiSchritteMitAufruf, {
      tools: { allowedByR010: "test_lesen" },
      fake: behind,
      extra: {
        schleuse: connection,
        schleuseStatus: async () => {
          reads += 1;
          return reads === 1
            ? readSchleuseStatus(connection, { timeoutMs: 1000 })
            : { installed: true, reachable: false, state: "nicht_erreichbar" as const };
        },
      },
    });
    await repo.conversations.setSchleuseMode(env.db, env.conversationId, "on");
    const { outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "denied" });
    expect(chats(behind)).toHaveLength(1);
    expect(chats(provider)).toHaveLength(0);
    const second = decisions(await env.receipts(), "modell.anfragen")[1];
    expect(second?.facts).toMatchObject({ step: 1, route: "schleuse", schleuseReachable: false });
  });
});

describe("Grenzen mitten in der Kette", () => {
  // Gegenprobe: letzter Schritt mit Werkzeugen (body.tools gesetzt); toolOffered immer true → rot.
  it("endlose Aufrufe: nach max_steps_per_run Ende, letzter Schritt ohne tools, Aufruf dort V-12, End-Antwort fest, failed schritte_aufgebraucht", async () => {
    const env = await setup(SCRIPTS.endlos, { tools: { allowedByR010: "test_lesen" } });
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "failed", code: "schritte_aufgebraucht" });
    expect(chats()).toHaveLength(8);
    expect(body(7).tools).toBeUndefined();
    expect(body(6).tools).toBeDefined();
    const last = decisions(await env.receipts(), "werkzeug.aufrufen").at(-1);
    expect(last?.facts).toMatchObject({ step: 7, toolRegistered: true, toolOffered: false });
    expect(last?.decision.outcome).toBe("deny");
    expect(env.tools.protocol.count()).toBe(7);
    const end = (await botMessages(env, runId)).find((m) => m.step === undefined);
    expect(end).toMatchObject({ origin: "fest", content: t("lauf.schritte.antwort") });
  });

  // Gegenprobe: callsInRun nicht hochzählen → läuft, rot.
  it("Aufruf über max_tool_calls_per_run: G-17 mit Beleg-Paar, Schleife geht weiter", async () => {
    const env = await setup(SCRIPTS.endlosZweiAufrufe, { tools: { allowedByR010: "test_lesen" } });
    await setLimits(env, { maxToolCallsPerRun: 3, maxStepsPerRun: 3 });
    await env.ask();
    const calls = decisions(await env.receipts(), "werkzeug.aufrufen");
    expect(calls.map((d) => d.facts.callsInRun)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(calls[3]?.decision.limits).toContainEqual({
      name: "lauf_aufrufe",
      result: "verletzt",
      value: 3,
    });
    expect(results(await env.receipts(), "werkzeug.aufrufen")[3]?.result).toMatchObject({
      status: "denied",
      code: "limit_erreicht",
    });
    expect(env.tools.protocol.count()).toBe(3);
  });

  // Gegenprobe: eine actionId für alle → rot.
  it("drei Aufrufe in einem Schritt: drei actionId, drei Beleg-Paare, Reihenfolge wie vom Modell, callIndexInStep 0, 1, 2", async () => {
    const env = await setup(SCRIPTS.dreiAufrufe, { tools: { allowedByR010: "test_lesen" } });
    const { runId } = await env.ask();
    const rows = await repo.toolCalls.listForRun(env.db, runId);
    expect(new Set(rows.map((r) => r.actionId)).size).toBe(3);
    const calls = decisions(await env.receipts(), "werkzeug.aufrufen");
    expect(calls.map((d) => d.facts.callIndexInStep)).toEqual([0, 1, 2]);
    expect(results(await env.receipts(), "werkzeug.aufrufen")).toHaveLength(3);
    expect(env.tools.protocol.calls.map((c) => c.input)).toEqual([
      { q: "a" },
      { q: "b" },
      { q: "c" },
    ]);
  });

  // Gegenprobe: callIndexInStep fest 0 → rot.
  it("Aufruf 9 bei max_tool_calls_per_step = 8: V-14 mit Beleg-Paar", async () => {
    const env = await setup(SCRIPTS.neunAufrufe, { tools: { allowedByR010: "test_lesen" } });
    await env.ask();
    const ninth = results(await env.receipts(), "werkzeug.aufrufen")[8];
    expect(ninth?.result).toMatchObject({ status: "denied", code: "limit_erreicht" });
    expect(
      decisions(await env.receipts(), "werkzeug.aufrufen")[8]?.decision.preconditions,
    ).toContainEqual({
      name: "aufrufe_je_schritt",
      result: "verletzt",
    });
    expect(env.tools.protocol.count()).toBe(8);
  });

  // Gegenprobe: Obergrenze weg → 500 Beleg-Paare, rot.
  it.each([
    ["siebzehnAufrufe", 17],
    ["fuenfhundertAufrufe", 500],
  ] as const)(
    "%s: keine Zeile, kein Beleg je Aufruf, modell.anfragen error/zu_viele_aufrufe, Lauf failed",
    async (name, _count) => {
      const env = await setup(SCRIPTS[name], { tools: { allowedByR010: "test_lesen" } });
      const { runId, outcome } = await env.ask();
      expect(outcome).toMatchObject({ status: "failed", code: "zu_viele_aufrufe" });
      expect(await repo.toolCalls.listForRun(env.db, runId)).toEqual([]);
      expect(decisions(await env.receipts(), "werkzeug.aufrufen")).toEqual([]);
      expect(results(await env.receipts(), "modell.anfragen")).toMatchObject([
        { result: { status: "error", code: "zu_viele_aufrufe" } },
      ]);
      expect(env.tools.protocol.count()).toBe(0);
    },
  );
});

/** Ergebnis und Entscheidung des einzigen Aufrufs eines Laufs. */
async function onlyCall(env: Env, runId: RunId) {
  const [row] = await repo.toolCalls.listForRun(env.db, runId);
  const decision = decisions(await env.receipts(), "werkzeug.aufrufen")[0];
  const result = results(await env.receipts(), "werkzeug.aufrufen")[0];
  return { row, decision, result };
}

describe("Name und Eingabe prüft die Steuerung selbst", () => {
  // Gegenprobe: inputValid = !invalid → läuft, rot.
  it.each(["schemaVerstoss", "zusatzfeld"] as const)(
    "%s ohne invalid: inputValid = false, V-13 mit Beleg-Paar, nicht ausgeführt",
    async (name) => {
      const env = await setup(SCRIPTS[name], { tools: { allowedByR010: "test_lesen" } });
      const { runId, outcome } = await env.ask();
      expect(outcome).toMatchObject({ status: "succeeded" });
      const { row, decision, result } = await onlyCall(env, runId);
      expect(decision?.facts.inputValid).toBe(false);
      expect(result?.result).toMatchObject({
        status: "denied",
        code: "werkzeug_eingabe_ungueltig",
      });
      expect(row).toMatchObject({ status: "denied", errorCode: "werkzeug_eingabe_ungueltig" });
      expect(env.tools.protocol.count()).toBe(0);
    },
  );

  it("Text der Hülle bei ungültiger Eingabe nennt Feld und Art, nie den Wert", async () => {
    const env = await setup(SCRIPTS.schemaVerstoss, { tools: { allowedByR010: "test_lesen" } });
    const { runId } = await env.ask();
    const { row } = await onlyCall(env, runId);
    expect((row?.output as { text: string } | undefined)?.text).toBe(
      t("werkzeug.huelle.eingabe", { feld: "a", art: t("werkzeug.huelle.art.zu_gross") }),
    );
    expect(JSON.stringify(row?.output)).not.toContain("5000");
  });

  // Gegenprobe: Zeichenkette parsen → läuft, rot.
  it.each(["jsonAlsText", "kaputtesJson"] as const)(
    "%s: V-13, nicht ausgeführt, nie geparst",
    async (name) => {
      const env = await setup(SCRIPTS[name], { tools: { allowedByR010: "test_lesen" } });
      const { runId } = await env.ask();
      const { row, decision } = await onlyCall(env, runId);
      expect(decision?.facts.inputValid).toBe(false);
      expect(row?.input).toEqual({ roh: expect.any(String) });
      expect(env.tools.protocol.count()).toBe(0);
    },
  );

  // Gegenprobe: Fehler des Abdrucks nicht abfangen → Lauf failed intern, rot.
  it("Gleitkommazahl: werkzeug_eingabe_ungueltig mit Beleg-Paar, Lauf läuft weiter", async () => {
    const env = await setup(SCRIPTS.gleitkomma, { tools: { allowedByR010: "test_lesen" } });
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "succeeded" });
    const { result } = await onlyCall(env, runId);
    expect(result?.result).toMatchObject({ status: "denied", code: "werkzeug_eingabe_ungueltig" });
    expect(env.tools.protocol.count()).toBe(0);
  });

  // Gegenprobe: Bereinigung aus → läuft, rot.
  it("Steuer- oder Bidi-Zeichen in der Eingabe: inputValid = false", async () => {
    const env = await setup(SCRIPTS.steuerzeichenInEingabe, {
      tools: { allowedByR010: "test_lesen" },
    });
    const { runId } = await env.ask();
    expect((await onlyCall(env, runId)).decision?.facts.inputValid).toBe(false);
    expect(env.tools.protocol.count()).toBe(0);
  });

  // Gegenprobe: roher Name in den Fakten → eingabe_ungueltig ohne Beleg; ungekürzt in raw_name → CHECK-Fehler, rot.
  it.each([
    ["nameMitPunkt", "a.b"],
    ["name65", "n".repeat(64)],
    ["name300", undefined],
  ] as const)(
    "ungültiger Name (%s): toolName = unbekannt, raw_name bereinigt und ≤ 64, V-12 mit Beleg-Paar",
    async (name, raw) => {
      const env = await setup(SCRIPTS[name], { tools: { allowedByR010: "test_lesen" } });
      const { runId, outcome } = await env.ask();
      expect(outcome).toMatchObject({ status: "succeeded" });
      const { row, decision, result } = await onlyCall(env, runId);
      expect(decision?.facts).toMatchObject({
        toolName: "unbekannt",
        toolRegistered: false,
        toolKey: "eingebaut/unbekannt",
      });
      expect(result?.result).toMatchObject({ status: "denied", code: "werkzeug_unbekannt" });
      expect(row?.name).toBe("unbekannt");
      if (raw !== undefined) expect(row?.rawName).toBe(raw);
      expect(Array.from(row?.rawName ?? "").length).toBeLessThanOrEqual(64);
      expect(JSON.stringify(decision?.facts)).not.toContain("<script>");
    },
  );

  it("leerer Name: endet sauber ohne Datenbankfehler, nichts ausgeführt", async () => {
    // Das SDK lehnt einen leeren Namen schon selbst ab: Der Motor meldet `intern`, kein Wunsch
    // erreicht die Steuerung. Die Prüfung der Steuerung für den leeren Namen belegt `aufruf.test.ts`.
    const env = await setup(SCRIPTS.nameLeer, { tools: { allowedByR010: "test_lesen" } });
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "failed", code: "intern" });
    expect(await repo.toolCalls.listForRun(env.db, runId)).toEqual([]);
    expect(env.tools.protocol.count()).toBe(0);
  });

  // Gegenprobe: Bereinigung aus → Steuerzeichen in raw_name, rot.
  it("raw_name ohne Steuer-, Bidi- und unsichtbare Zeichen gespeichert, `<script>` bleibt reiner Text", async () => {
    const env = await setup(SCRIPTS.name300, { tools: { allowedByR010: "test_lesen" } });
    const { runId } = await env.ask();
    const { row } = await onlyCall(env, runId);
    expect(row?.rawName?.startsWith("<script>")).toBe(true);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: genau diese Zeichen dürfen nicht vorkommen
    expect(row?.rawName).not.toMatch(/[\u0000-\u001f\u200b-\u200f\u202a-\u202e]/);
  });

  // Gegenprobe: toolRegistered fest true → rot.
  it("gültiger, nicht registrierter Name: toolRegistered = false, V-12, Hülle nennt die angebotenen Namen", async () => {
    const env = await setup(SCRIPTS.nameNichtRegistriert, {
      tools: { allowedByR010: "test_lesen" },
    });
    const { runId } = await env.ask();
    const { row, decision } = await onlyCall(env, runId);
    expect(decision?.facts).toMatchObject({ toolName: "gibt_es_nicht", toolRegistered: false });
    expect((row?.output as { text: string } | undefined)?.text).toContain("test_lesen");
  });

  // Gegenprobe: callId ungeprüft in die Tabelle → Datenbankfehler, rot.
  // Gegenprobe: callId ungeprüft in die Tabelle → Datenbankfehler (CHECK 1–200), rot.
  it("201 Zeichen lange callId: V-13 mit Beleg-Paar, Ersatz in der Zeile, an das Modell die gesendete", async () => {
    const env = await setup(SCRIPTS.callId201, { tools: { allowedByR010: "test_lesen" } });
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "succeeded" });
    const { row, decision } = await onlyCall(env, runId);
    expect(decision?.facts.inputValid).toBe(false);
    expect(row?.callId).toBe("pb-0");
    const sent = SCRIPTS.callId201.steps[0]?.toolCalls?.[0]?.id;
    expect(JSON.stringify(body(1).messages)).toContain(String(sent));
    expect(env.tools.protocol.count()).toBe(0);
  });

  // Das SDK ersetzt leere und doppelte Kennungen selbst durch eigene; die Prüfung der Steuerung für
  // diese Fälle belegt `aufruf.test.ts`. Hier: kein Datenbankfehler, beide Wünsche als Zeile.
  it.each(["callIdLeer", "callIdDoppelt"] as const)(
    "%s über den echten Motor: kein Datenbankfehler, jede Zeile mit eigener Kennung",
    async (name) => {
      const env = await setup(SCRIPTS[name], { tools: { allowedByR010: "test_lesen" } });
      const { runId, outcome } = await env.ask();
      expect(outcome).toMatchObject({ status: "succeeded" });
      const rows = await repo.toolCalls.listForRun(env.db, runId);
      expect(rows.length).toBe(SCRIPTS[name].steps[0]?.toolCalls?.length);
      expect(new Set(rows.map((r) => r.callId)).size).toBe(rows.length);
      for (const row of rows) expect(row.callId.length).toBeGreaterThan(0);
    },
  );

  // Gegenprobe: Abdruck über die gekürzte Eingabe → gleiche Abdrücke, rot.
  it("Eingabe über 2 000 Zeichen: nur gekürzt gespeichert, argsDigest über die ganze Eingabe verschieden", async () => {
    const a = await setup(SCRIPTS.langeEingabeA, { tools: { allowedByR010: "test_lesen" } });
    const runA = await a.ask();
    const rowA = (await onlyCall(a, runA.runId)).row;
    const b = await setup(SCRIPTS.langeEingabeB, { tools: { allowedByR010: "test_lesen" } });
    const runB = await b.ask();
    const rowB = (await onlyCall(b, runB.runId)).row;
    expect((rowA?.input as { roh: string } | undefined)?.roh).toHaveLength(2000);
    expect((rowA?.input as { roh: string } | undefined)?.roh).toBe(
      (rowB?.input as { roh: string } | undefined)?.roh,
    );
    // Abdrücke hängen auch an der Kennung der Aktion; deshalb über den Text nachgerechnet.
    const digest = (env: Env, row: typeof rowA, roh: string) =>
      contextDigest(
        env.deps.keys.context,
        toolCallDigestText({
          actionId: row?.actionId as never,
          args: { roh },
          chainRootRunId: row?.runId as never,
          conversationId: row?.conversationId as never,
          toolDigest: row?.toolDigest as never,
          toolKey: row?.toolKey as never,
        }),
      );
    const fullA = JSON.stringify(longInput("A"));
    const fullB = JSON.stringify(longInput("B"));
    expect(rowA?.argsDigest).toBe(digest(a, rowA, fullA));
    expect(rowA?.argsDigest).not.toBe(digest(a, rowA, fullA.slice(0, 2000)));
    expect(rowB?.argsDigest).toBe(digest(b, rowB, fullB));
  });
});

describe("Hüllen und Ergebnisse", () => {
  // Gegenprobe: Ergebnis als system- oder user-Nachricht → rot.
  it("das Ergebnis steht beim Test-Anbieter nur als role tool, nie in system oder user", async () => {
    const env = await setup(SCRIPTS.textDannAufruf, { tools: { allowedByR010: "test_lesen" } });
    await env.ask();
    const second = body(1);
    const withEnvelope = second.messages.filter((m) =>
      JSON.stringify(m.content ?? "").includes("werkzeug-ergebnis"),
    );
    expect(withEnvelope.map((m) => m.role)).toEqual(["tool"]);
    const envelope = JSON.parse(String(withEnvelope[0]?.content));
    expect(envelope).toMatchObject({
      paibot: "werkzeug-ergebnis",
      status: "ok",
      inhalt: { antwort: "gelesen" },
    });
  });

  // Gegenprobe: Meldung durchreichen → rot.
  it("test_wirft: Merkmal der Meldung weder beim Test-Anbieter noch im Log noch in der Zeile", async () => {
    const logs: string[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      });
    }
    const env = await setup(SCRIPTS.wirft, { tools: { allowedByR010: "test_wirft" } });
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "succeeded" });
    const { row, result } = await onlyCall(env, runId);
    expect(row).toMatchObject({ status: "failed", errorCode: "werkzeug_fehler" });
    expect(result?.result).toMatchObject({ status: "error", code: "werkzeug_fehler" });
    expect(JSON.stringify(row)).not.toContain(TEST_SECRET_MARKER);
    expect(JSON.stringify(chats().map((c) => c.body))).not.toContain(TEST_SECRET_MARKER);
    expect(logs.join("\n")).not.toContain(TEST_SECRET_MARKER);
    expect(JSON.stringify(await env.events())).not.toContain(TEST_SECRET_MARKER);
  });

  // Gegenprobe: Bereinigung aus → rot.
  it("test_fremd: Steuer-, Bidi- und unsichtbare Zeichen vor dem Modell und in der Zeile entfernt", async () => {
    const env = await setup(SCRIPTS.fremd, { tools: { allowedByR010: "test_fremd" } });
    const { runId } = await env.ask();
    const { row } = await onlyCall(env, runId);
    expect(row?.output).toMatchObject({ inhalt: { text: TEST_FOREIGN_CLEAN } });
    const tool = body(1).messages.find((m) => m.role === "tool");
    expect(String(tool?.content)).toContain(TEST_FOREIGN_CLEAN);
    expect(String(tool?.content)).not.toMatch(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: genau diese Zeichen dürfen nicht vorkommen
      /[\u0007\u200b\u200e\u202c\u202e\u2066\u2069\u061c\ufeff]/,
    );
  });

  // Gegenprobe: Kürzen aus → Hülle zu groß bzw. G-03 im nächsten Schritt, rot.
  it("test_riesig (Grenzen 3 000 je Aufruf, 5 000 je Schritt): Hülle ≤ tool_result_max_chars, gekuerzt, output_truncated, output_chars = Länge vorher; zwei Ergebnisse ≤ Grenze je Schritt, das zweite stärker gekürzt", async () => {
    const env = await setup(SCRIPTS.grossesErgebnis, { tools: { allowedByR010: "test_riesig" } });
    await setLimits(env, { toolResultMaxChars: 3000, toolResultsMaxCharsPerStep: 5000 });
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "succeeded" });
    const rows = await repo.toolCalls.listForRun(env.db, runId);
    const sizes = rows.map((r) => JSON.stringify((r.output as { inhalt: unknown }).inhalt).length);
    expect(sizes[0]).toBeLessThanOrEqual(3000);
    expect((sizes[0] ?? 0) + (sizes[1] ?? 0)).toBeLessThanOrEqual(5000);
    expect(sizes[1]).toBeLessThan(sizes[0] ?? 0);
    for (const row of rows) {
      expect(row).toMatchObject({
        status: "succeeded",
        outputTruncated: true,
        outputChars: JSON.stringify({ text: "x".repeat(100_000) }).length,
        output: { gekuerzt: true },
      });
    }
  });

  // Gegenprobe: Hülle ohne feste Form an das Modell → rot.
  it("Ergebnisse gehen nur als gekennzeichneter fremder Inhalt (feste Hülle mit Kennung des Werkzeugs) in den nächsten Schritt", async () => {
    const env = await setup(SCRIPTS.fremd, { tools: { allowedByR010: "test_fremd" } });
    await env.ask();
    const tool = body(1).messages.find((m) => m.role === "tool");
    expect(JSON.parse(String(tool?.content))).toMatchObject({
      paibot: "werkzeug-ergebnis",
      werkzeug: "eingebaut/doku.nachschlagen",
      art: "daten",
    });
  });

  // Gegenprobe: draft.delta ungeteilt → ein Stück über der Grenze, rot.
  it("draft.delta ist je Stück auf deltaFlushChars begrenzt", async () => {
    const env = await setup(SCRIPTS.langerText, { extra: { tuning: { deltaFlushChars: 50 } } });
    const { outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "succeeded" });
    const drafts = (await env.events()).filter((e) => e.type === "draft.delta");
    expect(drafts.length).toBeGreaterThan(1);
    for (const draft of drafts)
      expect(Array.from((draft.data as { text: string }).text).length).toBeLessThanOrEqual(50);
  });
});

describe("Schritt-Ende und Rückhalten des Texts", () => {
  // Gegenprobe: Rückhalten aus → text.delta vor dem Aufruf, rot.
  it("mit Werkzeugen: vor dem Schritt-Ende nur draft.delta, keine text.delta, keine Nachricht; der Text wird Zwischentext", async () => {
    const env = await setup(SCRIPTS.textDannAufruf, { tools: { allowedByR010: "test_lesen" } });
    const { runId } = await env.ask();
    const events = await env.events();
    const firstFinished = events.findIndex((e) => e.type === "step.finished");
    const before = types(events.slice(0, firstFinished));
    expect(before).toContain("draft.delta");
    expect(before).not.toContain("text.delta");
    expect(before.filter((type) => type === "message.created")).toHaveLength(1); // nur die Frage
    const messages = await botMessages(env, runId);
    expect(messages.map((m) => [m.step, m.content])).toEqual([
      [0, DRAFT_TEXT],
      [undefined, ANSWER_TEXT],
    ]);
  });

  // Gegenprobe: End-Antwort ohne message.created → rot.
  it("mit Werkzeugen, nur Text: End-Antwort mit genau diesem Text, dann message.created, text.delta, message.completed", async () => {
    const env = await setup(SCRIPTS.nurText);
    const { runId, outcome } = await env.ask();
    const events = (await env.events()).filter((e) => e.runId === runId);
    const tail = types(events).filter((type) => type !== "draft.delta" && type !== "beleg.created");
    expect(tail).toEqual([
      "run.queued",
      "run.started",
      "step.finished",
      "message.created",
      "text.delta",
      "message.completed",
    ]);
    const answer = await repo.messages.get(env.db, outcome.messageId as never);
    expect(answer).toMatchObject({ content: ANSWER_TEXT, status: "complete" });
    expect(answer?.step).toBeUndefined();
  });

  // Gegenprobe: Abdruck über einen anderen Text → rot.
  it("Abdruck im Ergebnis-Beleg = HMAC über genau den gespeicherten Text", async () => {
    const env = await setup(SCRIPTS.textDannAufruf, { tools: { allowedByR010: "test_lesen" } });
    const { runId } = await env.ask();
    const messages = await botMessages(env, runId);
    expect(results(await env.receipts(), "modell.anfragen").map((r) => r.result.digest)).toEqual(
      messages.map((m) => contextDigest(env.deps.keys.context, m.content)),
    );
  });

  // Gegenprobe: Nachricht außerhalb der Transaktion, Fehler dazwischen → halber Zustand, rot.
  it("Fehler mitten in der Transaktion des Schritt-Endes: keine halbe Nachricht, keine Zeilen; kein Werkzeug läuft", async () => {
    const env = await setup(SCRIPTS.textDannAufruf, { tools: { allowedByR010: "test_lesen" } });
    await failOn(env, "insert");
    const { runId } = await env.queueMessage(QUESTION);
    await expect(executeRun(runId, env.deps, never())).rejects.toBeDefined();
    expect(await botMessages(env, runId)).toEqual([]);
    expect(await repo.toolCalls.listForRun(env.db, runId)).toEqual([]);
    expect(env.tools.protocol.count()).toBe(0);
  });

  // Gegenprobe: Zwischentext mit message.created → rot.
  it("Zwischentext bekommt nur step.finished, kein message.created, text.delta oder message.completed", async () => {
    const env = await setup(SCRIPTS.textDannAufruf, { tools: { allowedByR010: "test_lesen" } });
    const { runId } = await env.ask();
    const draft = (await botMessages(env, runId)).find((m) => m.step === 0);
    const about = (await env.events()).filter((e) =>
      JSON.stringify(e.data).includes(String(draft?.id)),
    );
    expect(types(about)).toEqual(["tool.requested"]);
  });
});

/** Lässt das Anlegen bzw. den Wechsel nach `running` einer Zeile in `tool_calls` scheitern. */
async function failOn(env: Env, what: "insert" | "running") {
  await env.sqlExec(`create or replace function test_scheitern() returns trigger language plpgsql as $$
      begin raise exception 'eingespielter Fehler'; end $$`);
  await env.sqlExec(
    what === "insert"
      ? "create trigger test_scheitern before insert on tool_calls for each row execute function test_scheitern()"
      : "create trigger test_scheitern before update on tool_calls for each row when (new.status = 'running') execute function test_scheitern()",
  );
}

describe("Scheitert das Schreiben, läuft nichts", () => {
  // Gegenprobe: Fehler ignorieren und ausführen → Zähler 1, rot.
  it.each(["insert", "running"] as const)(
    "Fehler beim %s der Zeile: test_lesen zählt 0, Lauf endet mit Datenbank-Fehler",
    async (what) => {
      const env = await setup(SCRIPTS.textDannAufruf, { tools: { allowedByR010: "test_lesen" } });
      await failOn(env, what);
      const { runId } = await env.queueMessage(QUESTION);
      await expect(executeRun(runId, env.deps, never())).rejects.toBeDefined();
      expect(env.tools.protocol.count()).toBe(0);
    },
  );
});

async function waitFor(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > until) throw new Error("Zeit abgelaufen");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Startet einen Lauf, hält den Strom nach zwei Stücken an und wartet auf vorläufigen Text. */
async function startHeld(env: Env, script: FakeScript) {
  provider.configure({ script, holdAfterChunks: 2, chunkChars: 4 });
  const { runId } = await env.queueMessage(QUESTION);
  const running = executeRun(runId, env.deps, never());
  await waitFor(async () => (await env.events()).some((e) => e.type === "draft.delta"));
  return { runId, running };
}

describe("Abbruch bleibt Zwischentext", () => {
  // Gegenprobe je Fall: Teiltext als End-Antwort speichern → Nachricht mit leerem step, rot.
  it("Stopp mitten in einem Schritt mit Werkzeugen: keine Nachricht mit leerem step, Text als Zwischentext", async () => {
    const env = await setup(undefined, { tools: { allowedByR010: "test_lesen" } });
    const { runId, running } = await startHeld(env, SCRIPTS.abbruchEntwurf);
    await repo.runs.requestCancel(env.db, runId);
    expect(await running).toMatchObject({ status: "cancelled" });
    const messages = await botMessages(env, runId);
    expect(messages.every((m) => m.step !== undefined)).toBe(true);
    expect(messages).toMatchObject([{ step: 0, status: "cancelled" }]);
  });

  it("Not-Aus mitten in einem Schritt mit Werkzeugen: keine Nachricht mit leerem step, Text als Zwischentext", async () => {
    const env = await setup(undefined, { tools: { allowedByR010: "test_lesen" } });
    const { runId, running } = await startHeld(env, SCRIPTS.abbruchEntwurf);
    await repo.settings.update(env.db, { killSwitch: true });
    expect(await running).toMatchObject({ status: "cancelled", code: "angehalten" });
    expect(await botMessages(env, runId)).toMatchObject([
      { step: 0, status: "cancelled", errorCode: "angehalten" },
    ]);
  });

  it("Fehler des Anbieters mitten in einem Schritt mit Werkzeugen: keine Nachricht mit leerem step", async () => {
    const env = await setup(SCRIPTS.abbruchEntwurf, { tools: { allowedByR010: "test_lesen" } });
    provider.configure({ chunkChars: 4 });
    provider.failNext({ kind: "abbruch", afterChunks: 4 });
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "failed" });
    const messages = await botMessages(env, runId);
    expect(messages.every((m) => m.step !== undefined)).toBe(true);
  });
});

describe("Spätere Läufe sehen nur End-Antworten", () => {
  // Gegenprobe: currentAnswers ohne Filter auf step → Zwischentext im Verlauf, rot.
  it("nach „neu erzeugen“ mit Abbruch im ersten Schritt sieht der nächste Lauf die ältere End-Antwort, keinen Zwischentext, kein role tool", async () => {
    const env = await setup(SCRIPTS.zweiWerkzeugSchritte, {
      tools: { allowedByR010: "test_lesen" },
    });
    const first = await env.queueMessage(QUESTION);
    expect(await executeRun(first.runId, env.deps, never())).toMatchObject({ status: "succeeded" });
    // „Neu erzeugen“: neuer Lauf zur selben Nachricht, mitten im ersten Schritt abgebrochen.
    const again = await repo.withTransaction(env.db, async (tx) => {
      const run = await repo.runs.create(tx, {
        conversationId: env.conversationId,
        triggerMessageId: first.messageId,
        botId: env.botId,
      });
      await repo.events.append(tx, {
        conversationId: env.conversationId,
        type: "run.queued",
        data: { runId: run.id },
      });
      return run;
    });
    provider.configure({ script: SCRIPTS.abbruchEntwurf, holdAfterChunks: 2, chunkChars: 4 });
    const running = executeRun(again.id, env.deps, never());
    await waitFor(async () =>
      (await env.events()).some(
        (e) => e.type === "draft.delta" && (e.data as { runId: string }).runId === again.id,
      ),
    );
    await repo.runs.requestCancel(env.db, again.id);
    await running;
    provider.reset();
    provider.configure({ script: SCRIPTS.nurText });
    await env.ask("Nächste Frage");
    const sent = body(0);
    const text = JSON.stringify(sent.messages);
    expect(text).toContain(ANSWER_TEXT);
    expect(text).not.toContain("ABGEBROCHENER-ENTWURF");
    expect(sent.messages.map((m) => m.role)).not.toContain("tool");
  });

  // Gegenprobe: Verlauf ohne nurAntworten laden → der Zwischentext verdrängt die End-Antwort, rot.
  it("historyMaxMessages zählt nur Nachrichten der Person und End-Antworten", async () => {
    const env = await setup(SCRIPTS.zweiWerkzeugSchritte, {
      tools: { allowedByR010: "test_lesen" },
      extra: { tuning: { historyMaxMessages: 2 } },
    });
    const first = await env.queueMessage(QUESTION);
    expect(await executeRun(first.runId, env.deps, never())).toMatchObject({ status: "succeeded" });
    // Neu erzeugt und abgebrochen: danach steht ein Zwischentext hinter der End-Antwort.
    const again = await repo.withTransaction(env.db, async (tx) => {
      const run = await repo.runs.create(tx, {
        conversationId: env.conversationId,
        triggerMessageId: first.messageId,
        botId: env.botId,
      });
      await repo.events.append(tx, {
        conversationId: env.conversationId,
        type: "run.queued",
        data: { runId: run.id },
      });
      return run;
    });
    provider.configure({ script: SCRIPTS.abbruchEntwurf, holdAfterChunks: 2, chunkChars: 4 });
    const running = executeRun(again.id, env.deps, never());
    await waitFor(async () =>
      (await env.events()).some(
        (e) => e.type === "draft.delta" && (e.data as { runId: string }).runId === again.id,
      ),
    );
    await repo.runs.requestCancel(env.db, again.id);
    await running;
    provider.reset();
    provider.configure({ script: SCRIPTS.nurText });
    await env.ask("Nächste Frage");
    expect(JSON.stringify(body(0).messages)).toContain(ANSWER_TEXT);
  });
});

describe("Chat ohne Werkzeuge", () => {
  // Gegenprobe: maxSteps = 0 → Tor lehnt ab, rot.
  it("ohne angebotene Werkzeuge: ein Schritt, text.delta live, Nachricht streaming wie bisher, Abdruck v1", async () => {
    const env = await setup(SCRIPTS.nurText, { tools: false });
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "succeeded" });
    expect(chats()).toHaveLength(1);
    expect(body(0).tools).toBeUndefined();
    const own = types((await env.events()).filter((e) => e.runId === runId)).filter(
      (type) => type !== "beleg.created",
    );
    expect(own).toEqual([
      "run.queued",
      "run.started",
      "message.created",
      "text.delta",
      "message.completed",
      "step.finished",
    ]);
    expect(types(await env.events())).not.toContain("draft.delta");
    const decision = decisions(await env.receipts(), "modell.anfragen")[0];
    const bot = await repo.bots.get(env.db, env.botId);
    const settings = await repo.settings.get(env.db);
    const system = buildSystemPrompt(bot as never, settings as never, new Date());
    const expected = contextDigest(
      env.deps.keys.context,
      `${REQUEST_DIGEST_PREFIX}${JSON.stringify({ history: [{ role: "user", text: QUESTION }], modelId: env.modelId, route: "direct", system })}`,
    );
    expect(decision?.context?.digest).toBe(expected);
    expect(decision?.facts).toMatchObject({
      step: 0,
      maxSteps: 8,
      runTokens: 0,
      toolCount: 0,
      untrustedInput: false,
      trigger: "chat",
      maxRunTokens: 60000,
    });
  });

  // Gegenprobe: Wunsch ignorieren → Lauf succeeded ohne Beleg, rot.
  it("Wunsch trotz leerer Liste: V-12 mit Beleg-Paar je Wunsch, Lauf failed werkzeug_unbekannt, kein weiterer Schritt", async () => {
    const env = await setup(SCRIPTS.aufrufOhneWerkzeuge, { tools: false });
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "failed", code: "werkzeug_unbekannt" });
    // Ergebnis von modell.anfragen ist `ok` (das Modell hat geantwortet), der Lauf endet trotzdem
    // mit werkzeug_unbekannt; die Prüfung der Kette (wie auf der Belege-Seite) bleibt vertrauenswürdig.
    expect(results(await env.receipts(), "modell.anfragen")).toMatchObject([
      { result: { status: "ok" } },
    ]);
    const bericht = (await env.verify()) as unknown as { ok: boolean; verdict: { level: string } };
    expect(bericht.ok).toBe(true);
    expect(bericht.verdict.level).toBe("vertrauenswuerdig");
    expect(chats()).toHaveLength(1);
    const { row, decision } = await onlyCall(env, runId);
    expect(decision?.facts).toMatchObject({ toolOffered: false, toolRegistered: false });
    expect(row).toMatchObject({ status: "denied", errorCode: "werkzeug_unbekannt" });
    expect(env.tools.protocol.count()).toBe(0);
  });
});

describe("Denk-Text", () => {
  // Der echte Motor gibt Denk-Text gar nicht heraus; die Steuerung verwirft ihn zusätzlich
  // (Gegenprobe mit Motor-Attrappe in `schleife-attrappe.test.ts`).
  it("der echte Motor liefert zu einem Drehbuch mit Denk-Text kein Ereignis, das ihn enthält", async () => {
    const env = await setup(SCRIPTS.mitDenkText, { tools: { allowedByR010: "test_lesen" } });
    const echt = env.deps.motor;
    const ereignisse: unknown[] = [];
    env.deps.motor = {
      ...echt,
      async *runTurn(input, signal) {
        for await (const event of echt.runTurn(input, signal)) {
          ereignisse.push(event);
          yield event;
        }
      },
    };
    expect((await env.ask()).outcome).toMatchObject({ status: "succeeded" });
    expect(JSON.stringify(ereignisse)).toContain("text-delta");
    expect(JSON.stringify(ereignisse)).not.toContain(REASONING_MARKER);
  });

  // Gegenprobe: reasoning als Text durchreichen → Merkmal in Nachricht bzw. Anfrage, rot.
  it("Denk-Text (auch JSON-artig) steht nicht in Nachricht, draft.delta, nächster Anfrage oder Argumenten", async () => {
    const env = await setup(SCRIPTS.mitDenkText, { tools: { allowedByR010: "test_lesen" } });
    const { runId, outcome } = await env.ask();
    expect(outcome).toMatchObject({ status: "succeeded" });
    expect(JSON.stringify(await botMessages(env, runId))).not.toContain(REASONING_MARKER);
    expect(JSON.stringify(await env.events())).not.toContain(REASONING_MARKER);
    expect(JSON.stringify(body(1).messages)).not.toContain(REASONING_MARKER);
    expect(JSON.stringify(await repo.toolCalls.listForRun(env.db, runId))).not.toContain(
      REASONING_MARKER,
    );
  });
});

describe("Für später nichts verbaut", () => {
  // Gegenprobe: chainRootRunId = Kennung der Unterhaltung → anderer Abdruck, rot.
  it("argsDigest über die bereinigte Eingabe mit chainRootRunId = eigener Lauf", async () => {
    const env = await setup(SCRIPTS.textDannAufruf, { tools: { allowedByR010: "test_lesen" } });
    const { runId } = await env.ask();
    const { row, decision } = await onlyCall(env, runId);
    const expected = contextDigest(
      env.deps.keys.context,
      toolCallDigestText({
        actionId: row?.actionId as never,
        args: { q: "Stand" },
        chainRootRunId: runId,
        conversationId: env.conversationId,
        toolDigest: row?.toolDigest as never,
        toolKey: row?.toolKey as never,
      }),
    );
    expect(row?.argsDigest).toBe(expected);
    expect(decision?.facts.argsDigest).toBe(expected);
  });

  // Gegenprobe: run.waiting schreiben bzw. Zeile auf waiting_approval → rot.
  it("nie run.waiting, nie run.resumed, kein Zustand waiting_approval an runs oder tool_calls", async () => {
    const env = await setup(SCRIPTS.fremdDannSchreibenImSchritt, {
      tools: { allowedByR010: "test_fremd" },
    });
    const { runId } = await env.ask();
    expect(types(await env.events())).not.toContain("run.waiting");
    expect(types(await env.events())).not.toContain("run.resumed");
    expect((await repo.toolCalls.listForRun(env.db, runId)).map((r) => r.status)).toEqual([
      "succeeded",
      "denied",
    ]);
    expect((await repo.runs.get(env.db, runId))?.status).toBe("succeeded");
  });
});

describe("Ergebnis mit dem Schlüssel __proto__", () => {
  /** `test_lesen` mit einem Ausgabe-Schema, das beliebige Schlüssel zulässt, und dem gewünschten Ergebnis. */
  async function mitErgebnis(env: Env, ergebnis: string) {
    const lesen = env.tools.byName("test_lesen");
    env.deps.tools = await createToolRegistry([
      {
        ...lesen,
        output: z.record(z.string(), z.unknown()) as unknown as z.ZodType<JsonValue>,
        async run() {
          return { status: "ok" as const, output: JSON.parse(ergebnis) };
        },
      },
    ]);
  }

  // Gegenprobe: Prüfung in `outcomeEnvelope` entfernen → Hülle `ok`, rot.
  it.each([
    ["in einem Wert", '{"a":{"__proto__":{"x":"gefahr"}}}'],
    // erst das Bereinigen macht den Schlüssel zu `__proto__`
    ["getarnt", '{"__pro\u200bto__":{"x":"gefahr"}}'],
    ["verschachtelt", '{"a":[{"__proto__":{"x":"gefahr"}}]}'],
  ])(
    "Ergebnis %s: Hülle fehler/werkzeug_fehler, nichts davon geht an das Modell",
    async (_name, ergebnis) => {
      const env = await setup(SCRIPTS.textDannAufruf, { tools: { allowedByR010: "test_lesen" } });
      await mitErgebnis(env, ergebnis);
      const { runId, outcome } = await env.ask();
      expect(outcome).toMatchObject({ status: "succeeded" });
      const { row, result } = await onlyCall(env, runId);
      expect(row).toMatchObject({ status: "failed", errorCode: "werkzeug_fehler" });
      expect(result?.result).toMatchObject({ status: "error", code: "werkzeug_fehler" });
      const tool = body(1).messages.find((m) => m.role === "tool");
      expect(String(tool?.content)).not.toContain("gefahr");
      expect(JSON.stringify(row)).not.toContain("gefahr");
    },
  );

  it("ein Schlüssel __proto__ auf oberster Ebene entfernt schon das Schema; das Ergebnis kommt ohne ihn an", async () => {
    const env = await setup(SCRIPTS.textDannAufruf, { tools: { allowedByR010: "test_lesen" } });
    await mitErgebnis(env, '{"__proto__":{"x":"gefahr"},"antwort":"gelesen"}');
    const { runId } = await env.ask();
    const { row } = await onlyCall(env, runId);
    expect(row).toMatchObject({ status: "succeeded", output: { inhalt: { antwort: "gelesen" } } });
    expect(JSON.stringify(row)).not.toContain("gefahr");
  });

  // Gegenprobe: Prüfung auf doppelte Schlüssel in `outcomeEnvelope` entfernen → Hülle `ok`, rot.
  it("zwei Schlüssel, die bereinigt gleich sind: Hülle fehler, kein stilles Überschreiben", async () => {
    const env = await setup(SCRIPTS.textDannAufruf, { tools: { allowedByR010: "test_lesen" } });
    await mitErgebnis(env, '{"k":"eins","k\u200b":"zwei"}');
    const { runId } = await env.ask();
    const { row } = await onlyCall(env, runId);
    expect(row).toMatchObject({ status: "failed", errorCode: "werkzeug_fehler" });
  });

  it("ein gewöhnliches Ergebnis desselben Werkzeugs kommt an (die Prüfung weist nicht alles ab)", async () => {
    const env = await setup(SCRIPTS.textDannAufruf, { tools: { allowedByR010: "test_lesen" } });
    await mitErgebnis(env, '{"antwort":"gelesen"}');
    const { runId } = await env.ask();
    const { row } = await onlyCall(env, runId);
    expect(row).toMatchObject({ status: "succeeded" });
  });
});
