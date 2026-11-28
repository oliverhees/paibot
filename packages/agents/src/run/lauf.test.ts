/**
 * PaiBot – Verhaltens-Tests der Lauf-Steuerung mit dem Test-Motor gegen eine Datenbank im
 * Speicher: Glücksfall, Ablehnungen, Abbruch, Fehler, Werkzeug-Wunsch, Verlauf, Aufräumen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { repo, teams, conversations as unterhaltungen } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { evaluate, ruleSnapshot } from "@paibot/gate";
import { providerTargetFacts } from "@paibot/llm";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import type { ConversationEvent } from "@paibot/shared/ereignisse";
import { isPaiBotError } from "@paibot/shared/fehler";
import { newId } from "@paibot/shared/ids";
import type { MotorEvent } from "@paibot/shared/motor";
import { GATE_FORMAT } from "@paibot/shared/tor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeMotor, type FakeMotor, type FakeMotorScript } from "../testing/fake-motor";
import { type RunSetup, type RunSetupOptions, setupRun } from "../testing/lauf-umgebung";
import { failStaleRuns } from "./aufraeumen";
import { executeRun } from "./ausfuehren";

const MARKER = "Zitronenfalterwiese";
const QUESTION = `Was weißt du über die ${MARKER}?`;
const PROVIDER_KEY = `sk-test-${"q".repeat(24)}`;

const finish = (input = 12, output = 7): MotorEvent => ({
  type: "finish",
  finishReason: "stop",
  usage: { input, output },
});
const text = (value: string): MotorEvent => ({ type: "text-delta", text: value });

async function setup(
  script: FakeMotorScript,
  extra: Partial<RunSetupOptions> = {},
): Promise<RunSetup & { motor: FakeMotor }> {
  const { db } = await createTestDb();
  const motor = createFakeMotor(script);
  const env = await setupRun(db, RECEIPT_TOOLS, {
    providerBaseUrl: "http://127.0.0.1:9/v1",
    providerKey: PROVIDER_KEY,
    motor,
    ...extra,
  });
  return { ...env, motor };
}

const RECEIPT_TOOLS = {
  createWriter: createReceiptWriter,
  verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
    verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
};

const never = () => new AbortController().signal;
const types = (events: ConversationEvent[]) => events.map((e) => e.type);

afterEach(() => vi.restoreAllMocks());

describe("Glücksfall", () => {
  it("Ereignisse in fester Reihenfolge, Nachricht gespeichert, zwei Belege, Kette gültig, kein Inhalt in Belegen und Logs", async () => {
    const logs = vi.spyOn(console, "log");
    const errors = vi.spyOn(console, "error");
    const warns = vi.spyOn(console, "warn");
    const env = await setup([text("Die "), text("Wiese "), text("blüht."), finish(12, 7)]);
    const before = (await env.receipts()).length;
    const { runId, messageId } = await env.queueMessage(QUESTION);

    const outcome = await executeRun(runId, env.deps, never());

    expect(outcome).toMatchObject({ runId, status: "succeeded" });
    const events = await env.events();
    expect(types(events)).toEqual([
      "message.created",
      "run.queued",
      "run.started",
      "beleg.created",
      "message.created",
      "text.delta",
      "message.completed",
      "step.finished",
      "beleg.created",
    ]);
    const answer = await repo.messages.get(env.db, outcome.messageId as never);
    expect(answer).toMatchObject({
      role: "assistant",
      status: "complete",
      content: "Die Wiese blüht.",
      runId,
      modelId: env.modelId,
      providerId: env.providerId,
      route: "direct",
      tokensIn: 12,
      tokensOut: 7,
    });
    expect(events[6]?.data).toEqual({
      messageId: answer?.id,
      route: "direct",
      modelLabel: "Test-Modell",
      tokens: { input: 12, output: 7 },
    });
    expect(events[5]?.data).toEqual({ runId, messageId: answer?.id, text: "Die Wiese blüht." });
    expect((await repo.runs.get(env.db, runId))?.status).toBe("succeeded");

    const receipts = (await env.receipts()).slice(before);
    expect(receipts.map((r) => r.body.type)).toEqual(["decision", "result"]);
    const [decision, result] = receipts.map((r) => r.body);
    if (decision?.type !== "decision" || result?.type !== "result") throw new Error("Belege");
    expect(decision.action.actionId).toBe(result.action.actionId);
    expect(decision.action).toMatchObject({
      type: "modell.anfragen",
      actor: `bot:${env.botId}`,
      target: { conversationId: env.conversationId, runId, botId: env.botId, modelId: env.modelId },
    });
    expect(decision.decision.outcome).toBe("allow");
    expect(decision.facts).toMatchObject({
      route: "direct",
      requestedMode: "off",
      killSwitch: false,
    });
    expect(decision.context?.digest).toMatch(/^hmac-sha256:[0-9a-f]{64}$/);
    expect(result.result).toMatchObject({ status: "ok", tokens: { input: 12, output: 7 } });
    expect(result.result.digest).toMatch(/^hmac-sha256:[0-9a-f]{64}$/);
    expect(events[3]?.data).toMatchObject({ action: "modell.anfragen" });
    expect((await env.verify()).ok).toBe(true);

    const allReceipts = JSON.stringify(await env.receipts());
    expect(allReceipts).not.toContain(MARKER);
    expect(allReceipts).not.toContain("blüht");
    expect(allReceipts).not.toContain(PROVIDER_KEY);
    const logged = JSON.stringify([logs.mock.calls, errors.mock.calls, warns.mock.calls]);
    expect(logged).not.toContain(MARKER);
    expect(logged).not.toContain(PROVIDER_KEY);

    // Der Motor bekam Anweisung, Verlauf und Grenzen; keine Werkzeuge.
    const call = env.motor.calls[0];
    expect(call?.history).toEqual([{ role: "user", text: QUESTION }]);
    expect(call?.system).toContain("Du bist Pai, ein persönlicher Assistent in PaiBot.");
    expect(call?.tools).toBeUndefined();
    expect(call?.limits.maxOutputTokens).toBe(4096);
    expect(messageId).toBeDefined();
  });

  it("Text-Stücke werden gebündelt: weniger Ereignisse als Stücke, zusammen der ganze Text", async () => {
    const pieces = Array.from({ length: 60 }, (_, i) => text(String.fromCharCode(97 + (i % 26))));
    const env = await setup([...pieces, finish()], { tuning: { deltaFlushChars: 10 } });
    const { runId } = await env.queueMessage("Hallo");
    await executeRun(runId, env.deps, never());
    const deltas = (await env.events()).filter((e) => e.type === "text.delta");
    expect(deltas.length).toBeGreaterThanOrEqual(6);
    expect(deltas.length).toBeLessThan(60);
    const joined = deltas.map((e) => (e.type === "text.delta" ? e.data.text : "")).join("");
    expect(joined).toBe(pieces.map((p) => (p.type === "text-delta" ? p.text : "")).join(""));
  });

  it("Anweisung des Bots und Datum stehen in der Anweisung an das Modell", async () => {
    const env = await setup([text("ok"), finish()]);
    await repo.bots.update(env.db, env.botId, { instructions: "Antworte kurz." });
    const { runId } = await env.queueMessage("Hallo");
    await executeRun(runId, env.deps, never());
    expect(env.motor.calls[0]?.system).toMatch(/Heute ist \d{2}\.\d{2}\.\d{4} \(Zeitzone /);
    expect(
      env.motor.calls[0]?.system.endsWith("Anweisung der Person für dich:\nAntworte kurz."),
    ).toBe(true);
  });
});

describe("Ablehnung durch das Tor: kein Abruf beim Anbieter", () => {
  async function expectDenied(
    env: RunSetup & { motor: FakeMotor },
    runId: string,
    code: string,
    motorCalls = 0,
  ) {
    const before = (await env.receipts()).length;
    const outcome = await executeRun(runId as never, env.deps, never());
    expect(outcome).toMatchObject({ status: "denied", code });
    expect(env.motor.calls).toHaveLength(motorCalls);
    expect((await repo.runs.get(env.db, runId as never))?.status).toBe("denied");
    const events = await env.events();
    const denied = events.find((e) => e.type === "run.denied");
    expect(denied?.data).toMatchObject({ runId, code });
    const added = (await env.receipts()).slice(before).map((r) => r.body);
    expect(added.map((b) => b.type)).toEqual(["decision", "result"]);
    const last = added;
    expect(last.map((b) => b.type)).toEqual(["decision", "result"]);
    if (last[1]?.type === "result") expect(last[1].result).toEqual({ status: "denied", code });
    expect((await env.verify()).ok).toBe(true);
    return events;
  }

  it("Regel: der Bot des Laufs gehört nicht zur Unterhaltung (R-002 greift nicht)", async () => {
    const env = await setup([text("nie"), finish()]);
    const other = await repo.bots.create(env.db, {
      name: "Fremd",
      avatarShape: "kiesel",
      color: "gruen",
      modelId: env.modelId,
    });
    const message = await repo.messages.insert(env.db, {
      conversationId: env.conversationId,
      role: "user",
      content: QUESTION,
    });
    const run = await repo.runs.create(env.db, {
      conversationId: env.conversationId,
      triggerMessageId: message.id,
      botId: other.id,
    });
    await expectDenied(env, run.id, "regel_fehlt");
  });

  it("Grenze Not-Aus", async () => {
    const env = await setup([text("nie"), finish()]);
    await repo.settings.update(env.db, { killSwitch: true });
    const { runId } = await env.queueMessage(QUESTION);
    await expectDenied(env, runId, "angehalten");
  });

  it("Grenze Tagesbudget", async () => {
    const env = await setup([text("ok"), finish(600, 500)]);
    await repo.settings.update(env.db, { dailyTokenBudget: 1000 });
    const first = await env.queueMessage("eins");
    expect((await executeRun(first.runId, env.deps, never())).status).toBe("succeeded");
    const second = await env.queueMessage("zwei");
    await expectDenied(env, second.runId, "abgelehnt", 1);
  });

  it("Datenschleuse gefordert, aber nicht erreichbar: schleuse.blockiert, kein Rückfall auf direkt", async () => {
    const env = await setup([text("nie"), finish()], {
      schleuse: { baseUrl: "http://127.0.0.1:9/v1", apiKey: "schleuse-schluessel" },
      schleuseStatus: async () => ({ installed: true, reachable: false }),
    });
    await repo.conversations.setSchleuseMode(env.db, env.conversationId, "on");
    const { runId } = await env.queueMessage(QUESTION);
    const events = await expectDenied(env, runId, "abgelehnt");
    const blocked = events.findIndex((e) => e.type === "schleuse.blockiert");
    expect(blocked).toBeGreaterThan(-1);
    expect(blocked).toBeLessThan(events.findIndex((e) => e.type === "run.denied"));
    const decision = (await env.receipts()).at(-2)?.body;
    expect(decision?.type === "decision" && decision.facts).toMatchObject({
      route: "schleuse",
      requestedMode: "on",
      schleuseReachable: false,
    });
  });

  it("Datenschleuse gefordert, aber nicht installiert: abgelehnt, kein Abruf", async () => {
    const env = await setup([text("nie"), finish()]);
    await repo.settings.update(env.db, { schleuseModeDefault: "on" });
    const { runId } = await env.queueMessage(QUESTION);
    await expectDenied(env, runId, "abgelehnt");
  });

  it("Vorbedingung der Steuerung: ohne Modell endet der Lauf mit kein_modell, ohne Tor und ohne Abruf", async () => {
    const env = await setup([text("nie"), finish()]);
    await repo.bots.setModel(env.db, env.botId, null);
    const before = (await env.receipts()).length;
    const { runId } = await env.queueMessage(QUESTION);
    const outcome = await executeRun(runId, env.deps, never());
    expect(outcome).toMatchObject({ status: "failed", code: "kein_modell" });
    expect(env.motor.calls).toHaveLength(0);
    expect((await env.receipts()).length).toBe(before);
    expect(types(await env.events()).slice(-2)).toEqual(["run.started", "run.failed"]);
  });
});

describe("Abbruch", () => {
  it("per Signal mitten im Strom: Teiltext bleibt als abgebrochen, Ereignis, Beleg „abgebrochen“", async () => {
    const env = await setup([text("Ein Teil"), { type: "bis-abbruch" }]);
    const { runId } = await env.queueMessage(QUESTION);
    const controller = new AbortController();
    const running = executeRun(runId, env.deps, controller.signal);
    await waitFor(async () => (await env.events()).some((e) => e.type === "text.delta"));
    controller.abort();
    const outcome = await running;
    expect(outcome).toMatchObject({ status: "cancelled", code: "unterbrochen" });
    const message = await repo.messages.get(env.db, outcome.messageId as never);
    expect(message).toMatchObject({ status: "cancelled", content: "Ein Teil" });
    const events = types(await env.events());
    expect(events.slice(-2)).toEqual(["beleg.created", "run.cancelled"]);
    const result = (await env.receipts()).at(-1)?.body;
    expect(result?.type === "result" && result.result).toEqual({ status: "cancelled" });
    expect((await repo.runs.get(env.db, runId))?.status).toBe("cancelled");
  });

  it("per Abbruch-Wunsch in der Datenbank mitten im Strom", async () => {
    const env = await setup([text("Ein Teil"), { type: "bis-abbruch" }], {
      tuning: { cancelPollMs: 20 },
    });
    const { runId } = await env.queueMessage(QUESTION);
    const running = executeRun(runId, env.deps, never());
    await waitFor(async () => (await env.events()).some((e) => e.type === "text.delta"));
    await repo.runs.requestCancel(env.db, runId);
    const outcome = await running;
    expect(outcome.status).toBe("cancelled");
    expect((await env.receipts()).at(-1)?.body).toMatchObject({ result: { status: "cancelled" } });
  });

  it("Not-Aus mitten im Strom: Lauf endet als angehalten, Teiltext bleibt", async () => {
    const env = await setup([text("Ein Teil"), { type: "bis-abbruch" }], {
      tuning: { cancelPollMs: 20 },
    });
    const { runId } = await env.queueMessage(QUESTION);
    const running = executeRun(runId, env.deps, never());
    await waitFor(async () => (await env.events()).some((e) => e.type === "text.delta"));
    await repo.settings.update(env.db, { killSwitch: true });
    const outcome = await running;
    expect(outcome).toMatchObject({ status: "cancelled", code: "angehalten" });
    const message = await repo.messages.get(env.db, outcome.messageId as never);
    expect(message).toMatchObject({
      status: "cancelled",
      content: "Ein Teil",
      errorCode: "angehalten",
    });
    expect(await repo.runs.get(env.db, runId)).toMatchObject({
      status: "cancelled",
      errorCode: "angehalten",
    });
    const ende = (await env.events()).at(-1);
    expect(ende).toMatchObject({ type: "run.cancelled", data: { code: "angehalten" } });
    expect((await env.receipts()).at(-1)?.body).toMatchObject({ result: { status: "cancelled" } });
  });

  it("Abbruch-Wunsch vor dem Start: kein Tor, kein Motor", async () => {
    const env = await setup([text("nie"), finish()]);
    const { runId } = await env.queueMessage(QUESTION);
    await repo.runs.requestCancel(env.db, runId);
    const before = (await env.receipts()).length;
    expect((await executeRun(runId, env.deps, never())).status).toBe("cancelled");
    expect(env.motor.calls).toHaveLength(0);
    expect((await env.receipts()).length).toBe(before);
    expect(types(await env.events()).at(-1)).toBe("run.cancelled");
  });
});

describe("Fehler", () => {
  it.each([
    "anbieter_nicht_erreichbar",
    "schluessel_ungueltig",
    "limit_erreicht",
    "unterbrochen",
    "intern",
  ] as const)(
    "Motor meldet %s → fehlgeschlagen mit Code, Beleg mit Code, kein zweiter Versuch",
    async (code) => {
      const env = await setup([{ type: "error", code, retryable: true }]);
      const { runId } = await env.queueMessage(QUESTION);
      const outcome = await executeRun(runId, env.deps, never());
      expect(outcome).toMatchObject({ status: "failed", code });
      expect(env.motor.calls).toHaveLength(1);
      const failed = (await env.events()).find((e) => e.type === "run.failed");
      expect(failed?.data).toMatchObject({ runId, code });
      expect((await env.receipts()).at(-1)?.body).toMatchObject({
        result: { status: "error", code },
      });
      expect((await repo.runs.get(env.db, runId))?.errorCode).toBe(code);
    },
  );

  it("Datenschleuse stoppt die Anfrage: schleuse.blockiert und run.failed", async () => {
    const env = await setup([{ type: "error", code: "schleuse_blockiert", retryable: false }]);
    const { runId } = await env.queueMessage(QUESTION);
    await executeRun(runId, env.deps, never());
    expect(types(await env.events()).slice(-2)).toEqual(["schleuse.blockiert", "run.failed"]);
  });

  it("Teiltext vor einem Fehler bleibt als fehlgeschlagen gespeichert", async () => {
    const env = await setup([
      text("Halb"),
      { type: "error", code: "anbieter_nicht_erreichbar", retryable: true },
    ]);
    const { runId } = await env.queueMessage(QUESTION);
    const outcome = await executeRun(runId, env.deps, never());
    expect(await repo.messages.get(env.db, outcome.messageId as never)).toMatchObject({
      status: "failed",
      content: "Halb",
      errorCode: "anbieter_nicht_erreichbar",
    });
  });

  it("Strom ohne Ende → unterbrochen", async () => {
    const env = await setup([text("ohne Schluss")]);
    const { runId } = await env.queueMessage(QUESTION);
    expect(await executeRun(runId, env.deps, never())).toMatchObject({
      status: "failed",
      code: "unterbrochen",
    });
  });

  it("Leerlauf des Motors → Zeitgrenze, anbieter_nicht_erreichbar", async () => {
    const env = await setup([text("a"), { type: "bis-abbruch" }], {
      tuning: { idleTimeoutMs: 50 },
    });
    const { runId } = await env.queueMessage(QUESTION);
    expect(await executeRun(runId, env.deps, never())).toMatchObject({
      status: "failed",
      code: "anbieter_nicht_erreichbar",
    });
  });

  it("Gesamtdauer überschritten → anbieter_nicht_erreichbar", async () => {
    const env = await setup([{ type: "pause", ms: 5000 }, finish()], {
      tuning: { totalTimeoutMs: 50 },
    });
    const { runId } = await env.queueMessage(QUESTION);
    expect(await executeRun(runId, env.deps, never())).toMatchObject({
      status: "failed",
      code: "anbieter_nicht_erreichbar",
    });
  });

  it("Antwort größer als erlaubt → limit_erreicht, Text bis zur Grenze", async () => {
    const env = await setup([text("x".repeat(30)), text("y".repeat(30)), finish()], {
      tuning: { maxAnswerChars: 40 },
    });
    const { runId } = await env.queueMessage(QUESTION);
    const outcome = await executeRun(runId, env.deps, never());
    expect(outcome).toMatchObject({ status: "failed", code: "limit_erreicht" });
    expect((await repo.messages.get(env.db, outcome.messageId as never))?.content).toBe(
      "x".repeat(30),
    );
  });

  it("Werkzeug-Wunsch ohne Werkzeuge: jeder Wunsch belegt abgelehnt (V-12), Lauf endet mit werkzeug_unbekannt, nichts wird ausgeführt", async () => {
    const env = await setup([
      { type: "tool-call", callId: "c1", name: "dateien_loeschen", input: { pfad: "/" } },
      { type: "finish", finishReason: "tool-calls", usage: { input: 3, output: 1 } },
    ]);
    const { runId } = await env.queueMessage(QUESTION);
    const outcome = await executeRun(runId, env.deps, never());
    expect(outcome).toMatchObject({ status: "failed", code: "werkzeug_unbekannt" });
    expect(env.motor.calls).toHaveLength(1);
    const bodies = (await env.receipts()).map((r) => r.body);
    const toolDecision = bodies.find(
      (b) => b.type === "decision" && b.action.type === "werkzeug.aufrufen",
    );
    expect(toolDecision).toMatchObject({
      decision: { outcome: "deny" },
      facts: { toolName: "dateien_loeschen", toolRegistered: false, toolOffered: false },
    });
    expect(bodies.at(-1)).toMatchObject({
      action: { type: "werkzeug.aufrufen" },
      result: { status: "denied", code: "werkzeug_unbekannt" },
    });
    const calls = await repo.toolCalls.listForRun(env.db, runId);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ status: "denied", errorCode: "werkzeug_unbekannt" });
    expect(await env.verify()).toMatchObject({ ok: true });
  });
});

describe("Reihenfolge und Zustand", () => {
  it("zweiter Lauf derselben Unterhaltung startet nicht, solange der erste läuft", async () => {
    const env = await setup([text("a"), { type: "bis-abbruch" }]);
    const { runId } = await env.queueMessage(QUESTION);
    const controller = new AbortController();
    const running = executeRun(runId, env.deps, controller.signal);
    await waitFor(async () => (await repo.runs.get(env.db, runId))?.status === "running");
    const error = await env.queueMessage("noch eine").catch((e: unknown) => e);
    expect(isPaiBotError(error) && error.code).toBe("lauf_aktiv");
    // Ein zweiter Aufruf für denselben Lauf tut nichts.
    expect(await executeRun(runId, env.deps, never())).toMatchObject({
      status: "failed",
      code: "lauf_aktiv",
    });
    controller.abort();
    await running;
    expect(env.motor.calls).toHaveLength(1);
    const next = await env.queueMessage("jetzt geht es");
    expect(next.runId).toBeDefined();
  });

  it("unbekannter Lauf: nichts geschrieben", async () => {
    const env = await setup([finish()]);
    const outcome = await executeRun(newId("run"), env.deps, never());
    expect(outcome).toMatchObject({ status: "failed", code: "nicht_gefunden" });
  });

  // Gegenprobe: die Prüfung `conversation.kind === "faden"` in `loadRunContext` entfernen → das Modell
  // wird gefragt (motor.calls ist 1) und es entsteht eine Antwort im Faden (rot).
  it("ein Lauf in einem Faden endet mit nicht_gefunden: kein Modell gefragt, keine Antwort", async () => {
    const env = await setup([text("ok"), finish()]);
    const team = newId("team");
    const faden = newId("conversation");
    await env.db.insert(teams).values({ id: team, name: "Studio" });
    await env.db
      .insert(unterhaltungen)
      .values({ id: faden, kind: "faden", teamId: team, title: "Ein Faden" });
    const { runId } = await env.queueMessage("Hallo Team", faden);
    const outcome = await executeRun(runId, env.deps, never());
    expect(outcome).toMatchObject({ runId, status: "failed", code: "nicht_gefunden" });
    expect(env.motor.calls).toHaveLength(0);
    const nachrichten = await repo.messages.listForConversation(env.db, faden);
    expect(nachrichten.map((m) => m.role)).toEqual(["user"]);
  });

  it("Verlauf: höchstens historyMaxMessages Nachrichten, älteres abgeschnitten, auslösende Nachricht immer dabei", async () => {
    const env = await setup([text("ok"), finish()], { tuning: { historyMaxMessages: 10 } });
    for (let i = 0; i < 30; i++) {
      await repo.messages.insert(env.db, {
        conversationId: env.conversationId,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Nachricht ${i}`,
      });
    }
    const { runId } = await env.queueMessage("letzte Frage");
    await executeRun(runId, env.deps, never());
    const history = env.motor.calls[0]?.history ?? [];
    expect(history).toHaveLength(10);
    expect(history.at(-1)).toEqual({ role: "user", text: "letzte Frage" });
    expect(history[0]).toEqual({ role: "assistant", text: "Nachricht 21" });
  });

  it("Verlauf nach „neu erzeugen“: neuer Lauf zur selben Nachricht, ersetzte Fassung fehlt", async () => {
    const env = await setup((_input, turn) => [text(`Fassung ${turn + 1}`), finish()]);
    const erste = await env.queueMessage("Frage");
    await executeRun(erste.runId, env.deps, never());
    // Neu erzeugen wie die Web-App: ein weiterer Lauf mit derselben auslösenden Nachricht.
    const neu = await repo.runs.create(env.db, {
      conversationId: env.conversationId,
      triggerMessageId: erste.messageId,
      botId: env.botId,
    });
    await repo.events.append(env.db, {
      conversationId: env.conversationId,
      type: "run.queued",
      data: { runId: neu.id },
    });
    expect((await executeRun(neu.id, env.deps, never())).status).toBe("succeeded");
    // Das Modell sah die alte Fassung nicht (sie steht hinter der auslösenden Nachricht).
    expect(env.motor.calls[1]?.history).toEqual([{ role: "user", text: "Frage" }]);
    const antworten = (await repo.messages.listForConversation(env.db, env.conversationId)).filter(
      (m) => m.role === "assistant",
    );
    expect(antworten.map((m) => [m.content, m.status, m.runId])).toEqual([
      ["Fassung 1", "complete", erste.runId],
      ["Fassung 2", "complete", neu.id],
    ]);
    // Nächste Nachricht: nur die neueste Fassung im Verlauf.
    const zweite = await env.queueMessage("Noch eine Frage");
    await executeRun(zweite.runId, env.deps, never());
    expect(env.motor.calls[2]?.history).toEqual([
      { role: "user", text: "Frage" },
      { role: "assistant", text: "Fassung 2" },
      { role: "user", text: "Noch eine Frage" },
    ]);
    // Jede Erzeugung hat eigene Belege.
    const anfragen = (await env.receipts()).filter(
      (b) => b.body.type === "decision" && b.body.action.type === "modell.anfragen",
    );
    expect(anfragen).toHaveLength(3);
    expect((await env.verify()).ok).toBe(true);
  });

  it("Verlauf: Token-Grenze der Einstellungen schneidet ältere Nachrichten ab", async () => {
    const env = await setup([text("ok"), finish()]);
    await repo.settings.update(env.db, { historyTokenLimit: 10 });
    await repo.messages.insert(env.db, {
      conversationId: env.conversationId,
      role: "user",
      content: "a".repeat(30),
    });
    const { runId } = await env.queueMessage("b".repeat(20));
    await executeRun(runId, env.deps, never());
    expect(env.motor.calls[0]?.history).toEqual([{ role: "user", text: "b".repeat(20) }]);
    const decision = (await env.receipts()).at(-2)?.body;
    expect(decision?.type === "decision" && decision.facts.inputChars).toBe(
      (env.motor.calls[0]?.system.length ?? 0) + 20,
    );
  });
});

describe("failStaleRuns", () => {
  it("räumt hängende Läufe auf, schreibt das fehlende Ergebnis und gibt die Unterhaltung frei", async () => {
    const env = await setup([finish()]);
    const { runId } = await env.queueMessage(QUESTION);
    const startedAt = new Date(Date.now() - 5 * 60_000);
    await repo.runs.markRunning(env.db, runId, { now: startedAt });
    // Ein Worker hatte die Entscheidung schon belegt und ist dann abgestürzt.
    const action: ActionRequest<"modell.anfragen"> = {
      actionId: newId("action"),
      type: "modell.anfragen",
      actor: `bot:${env.botId}`,
      target: { conversationId: env.conversationId, runId, botId: env.botId, modelId: env.modelId },
    };
    const facts: Facts<"modell.anfragen"> = {
      botPaused: false,
      conversationKind: "direkt",
      botHatAuftrag: false,
      auftragArt: "keiner",
      zweck: "chat",
      botOfConversation: true,
      providerId: env.providerId,
      providerEnabled: true,
      region: "local",
      route: "direct",
      requestedMode: "off",
      schleuseReachable: false,
      inputChars: 10,
      maxInputChars: 120000,
      maxOutputTokens: 2048,
      botMaxOutputTokens: 2048,
      tokensToday: 0,
      killSwitch: false,
      ...providerTargetFacts(env.providerId, "http://127.0.0.1:9/v1"),
      step: 0,
      maxSteps: 1,
      runTokens: 0,
      stepTokenEstimate: Math.ceil(10 / 4) + 2048,
      maxRunTokens: 500000,
      toolCount: 0,
      untrustedInput: false,
      trigger: "chat",
    };
    const snapshot = await repo.rules.loadSnapshot(env.db);
    const decision = evaluate(action, facts, await ruleSnapshot(snapshot.rules, snapshot.stand));
    await env.writer.appendDecision({
      action,
      facts,
      decision: { ...decision, gateFormat: GATE_FORMAT },
      time: new Date(),
    });
    const message = await repo.messages.insert(env.db, {
      conversationId: env.conversationId,
      role: "assistant",
      status: "streaming",
      runId,
    });
    await repo.events.append(env.db, {
      conversationId: env.conversationId,
      type: "text.delta",
      data: { runId, messageId: message.id, text: "bis hier" },
    });

    // Ein zweiter, nie abgeholter Lauf in einer anderen Unterhaltung.
    const other = await env.newConversation();
    const lost = await env.queueMessage("verloren", other);

    const clock = { now: () => new Date(Date.now() + 60 * 60_000) };
    const failed = await failStaleRuns(
      { db: env.db, clock, receipts: env.writer },
      { staleAfterMs: 60_000, queuedStaleAfterMs: 15 * 60_000 },
    );
    expect(failed.sort()).toEqual([runId, lost.runId].sort());
    for (const id of [runId, lost.runId]) {
      expect(await repo.runs.get(env.db, id)).toMatchObject({
        status: "failed",
        errorCode: "unterbrochen",
      });
    }
    expect(await repo.messages.get(env.db, message.id)).toMatchObject({
      status: "failed",
      content: "bis hier",
    });
    expect(types(await env.events()).slice(-2)).toEqual(["run.failed", "beleg.created"]);
    const last = (await env.receipts()).at(-1)?.body;
    expect(last).toMatchObject({
      type: "result",
      action: { actionId: action.actionId },
      result: { status: "error", code: "unterbrochen" },
    });
    expect((await env.verify()).ok).toBe(true);
    // Ein zweiter Durchlauf findet nichts mehr.
    expect(await failStaleRuns({ db: env.db, clock, receipts: env.writer })).toEqual([]);
    // Die Unterhaltungen sind wieder frei.
    await env.queueMessage("weiter");
    await env.queueMessage("weiter", other);
  });

  it("frische Läufe bleiben unberührt", async () => {
    const env = await setup([finish()]);
    const { runId } = await env.queueMessage(QUESTION);
    expect(await failStaleRuns({ db: env.db, clock: { now: () => new Date() } })).toEqual([]);
    expect((await repo.runs.get(env.db, runId))?.status).toBe("queued");
  });
});

async function waitFor(check: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > until) throw new Error("Zeit abgelaufen");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
