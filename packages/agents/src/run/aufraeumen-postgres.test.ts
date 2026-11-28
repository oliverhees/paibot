/**
 * PaiBot – Aufräumen nach einem Absturz zwischen Entscheidung und Ergebnis, gegen echtes Postgres:
 * Wurde eine Aktion abgelehnt und endete der Worker, bevor das Ergebnis „abgelehnt“ belegt war,
 * schreibt das Aufräumen genau dieses Ergebnis, und die Beleg-Kette bleibt gültig. Dasselbe für
 * Werkzeug-Aufrufe (Entscheidung und offene Zeilen in `tool_calls`), auch für eine Entscheidung
 * der Tor-Fassung 1, geschrieben vor dem Update.
 * Läuft nur mit `PAIBOT_TEST_DATABASE_URL`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { belege, createDb, repo } from "@paibot/db";
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { denialCode, evaluate, hashRule, ruleSnapshot } from "@paibot/gate";
import { providerTargetFacts } from "@paibot/llm";
import { createReceiptWriter, hashReceipt, signReceipt, verifyChain } from "@paibot/receipts";
import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import type { ReceiptBody } from "@paibot/shared/belege";
import { newId } from "@paibot/shared/ids";
import { GATE_FORMAT, type RuleDefinition } from "@paibot/shared/tor";
import { afterEach, describe, expect, it } from "vitest";
import { createFakeMotor } from "../testing/fake-motor";
import { setupRun } from "../testing/lauf-umgebung";
import { failStaleRuns } from "./aufraeumen";

const baseUrl = process.env[TEST_DATABASE_URL_ENV];

/** Schlüssel des zuletzt gebauten Schreibers (für einen Beleg wie vom Stand vor dem Update). */
let letzteSchluessel: Parameters<typeof createReceiptWriter>[1] | undefined;

const RECEIPT_TOOLS = {
  createWriter: (...args: Parameters<typeof createReceiptWriter>) => {
    letzteSchluessel = args[1];
    return createReceiptWriter(...args);
  },
  verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
    verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
};

describe.skipIf(baseUrl === undefined)("Aufräumen nach Absturz (echtes Postgres)", () => {
  const cleanup: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const step of cleanup.splice(0).reverse()) await step().catch(() => undefined);
  });

  /** Läuft im Zustand „Worker endete nach der Entscheidung“; `killSwitch` bestimmt Ablehnung. */
  async function abgestuerzterLauf(killSwitch: boolean) {
    const database: PostgresTestDatabase = await createPostgresTestDatabase(baseUrl as string);
    cleanup.push(() => database.drop());
    const pool = createDb(database.url);
    cleanup.push(() => pool.sql.end({ timeout: 1 }));
    const env = await setupRun(pool.db, RECEIPT_TOOLS, {
      providerBaseUrl: "http://127.0.0.1:9/v1",
      providerKey: "sk-test-unbenutzt-000000000000",
      motor: createFakeMotor([]),
    });
    const { runId } = await env.queueMessage("Frage");
    await repo.runs.markRunning(env.db, runId, { now: new Date(Date.now() - 5 * 60_000) });
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
      killSwitch,
      ...providerTargetFacts(env.providerId, "http://127.0.0.1:9/v1"),
      // Werte eines ersten Schritts ohne Werkzeuge mit den Startwerten der Einstellungen.
      step: 0,
      maxSteps: 8,
      runTokens: 0,
      stepTokenEstimate: 2051,
      maxRunTokens: 60000,
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
    return { env, runId, action, decision };
  }

  const spaeter = { now: () => new Date(Date.now() + 60 * 60_000) };

  it("abgelehnte Aktion ohne Ergebnis: das Aufräumen schreibt „abgelehnt“, die Kette bleibt gültig", async () => {
    const { env, runId, action, decision } = await abgestuerzterLauf(true);
    expect(decision.outcome).not.toBe("allow");
    expect(denialCode(decision)).toBe("angehalten");

    await failStaleRuns(
      { db: env.db, clock: spaeter, receipts: env.writer },
      { staleAfterMs: 60_000 },
    );

    expect(await repo.runs.get(env.db, runId)).toMatchObject({ status: "failed" });
    const last = (await env.receipts()).at(-1)?.body;
    expect(last).toMatchObject({
      type: "result",
      action: { actionId: action.actionId },
      result: { status: "denied", code: "angehalten" },
    });
    const entscheidung = (await env.receipts()).find(
      (entry) => entry.body.type === "decision" && entry.body.action.actionId === action.actionId,
    )?.body;
    expect(entscheidung).toMatchObject({ decision: { gateFormat: 4 } });
    expect(
      entscheidung?.type === "decision" && Array.isArray(entscheidung.decision.preconditions),
    ).toBe(true);
    expect(await env.verify()).toMatchObject({ ok: true });
  }, 30_000);

  it("erlaubte Aktion ohne Ergebnis bleibt „unterbrochen“, die Kette bleibt gültig", async () => {
    const { env, action, decision } = await abgestuerzterLauf(false);
    expect(decision.outcome).toBe("allow");

    await failStaleRuns(
      { db: env.db, clock: spaeter, receipts: env.writer },
      { staleAfterMs: 60_000 },
    );

    const last = (await env.receipts()).at(-1)?.body;
    expect(last).toMatchObject({
      type: "result",
      action: { actionId: action.actionId },
      result: { status: "error", code: "unterbrochen" },
    });
    expect(await env.verify()).toMatchObject({ ok: true });
  }, 30_000);

  /** Lauf „abgestürzt“ (Herzschlag alt), ohne Entscheidung; für die Werkzeug-Fälle. */
  async function haengenderLauf() {
    const database: PostgresTestDatabase = await createPostgresTestDatabase(baseUrl as string);
    cleanup.push(() => database.drop());
    const pool = createDb(database.url);
    cleanup.push(() => pool.sql.end({ timeout: 1 }));
    const env = await setupRun(pool.db, RECEIPT_TOOLS, {
      providerBaseUrl: "http://127.0.0.1:9/v1",
      providerKey: "sk-test-unbenutzt-000000000000",
      motor: createFakeMotor([]),
    });
    const { runId, messageId } = await env.queueMessage("Frage");
    await repo.runs.markRunning(env.db, runId, { now: new Date(Date.now() - 5 * 60_000) });
    return { env, runId, messageId, sql: pool.sql };
  }

  /** Eigene Regel nur für diesen Test: erlaubt jeden Werkzeug-Aufruf des Bots (auch schreiben). */
  const ALLES_ERLAUBT: RuleDefinition = {
    id: newId("rule"),
    version: 1,
    action: "werkzeug.aufrufen",
    effect: "allow",
    stage: "execute",
    conditions: [{ fact: "akteur", op: "eq", value: "bot" }],
    priority: 5,
    source: "owner",
    enabled: true,
    title: "Alles erlaubt (Test)",
    reason: "Nur im Test.",
  };

  function werkzeugFakten(
    toolKey: string,
    kind: "lesen" | "schreiben",
    reach: "intern" | "nach_aussen",
  ): Facts<"werkzeug.aufrufen"> {
    return {
      botPaused: false,
      botOfConversation: true,
      runRunning: true,
      toolName:
        toolKey
          .split("/")
          .at(-1)
          ?.replace(/[^A-Za-z0-9_-]/g, "_") ?? "werkzeug",
      toolSource: "eingebaut",
      toolKind: kind,
      argsDigest: `hmac-sha256:${"a7".repeat(32)}`,
      killSwitch: false,
      toolKey,
      toolDigest: `sha256:${"4d".repeat(32)}`,
      toolReach: reach,
      toolForeign: false,
      toolRegistered: true,
      toolOffered: true,
      inputValid: true,
      untrustedInput: false,
      step: 0,
      callIndexInStep: 0,
      maxCallsPerStep: 8,
      callsInRun: 0,
      maxCallsPerRun: 16,
      trigger: "chat",
    } as Facts<"werkzeug.aufrufen">;
  }

  /**
   * Belegt eine Entscheidung `werkzeug.aufrufen` wie das Tor (ohne Ergebnis: der Worker endet
   * danach). Mit `eigeneRegel` gilt zusätzlich `ALLES_ERLAUBT` (Stand + 1); die Prüfung der
   * Kette bekommt sie dann ebenso.
   */
  async function werkzeugEntscheidung(
    lauf: Awaited<ReturnType<typeof haengenderLauf>>,
    facts: Facts<"werkzeug.aufrufen">,
    eigeneRegel = false,
  ) {
    const { env, runId } = lauf;
    const action: ActionRequest<"werkzeug.aufrufen"> = {
      actionId: newId("action"),
      type: "werkzeug.aufrufen",
      actor: `bot:${env.botId}`,
      target: { conversationId: env.conversationId, runId, botId: env.botId },
    };
    const snapshot = await repo.rules.loadSnapshot(env.db);
    const regeln = eigeneRegel
      ? [...snapshot.rules, { ...ALLES_ERLAUBT, seq: snapshot.stand + 1 }]
      : snapshot.rules;
    const decision = evaluate(
      action,
      facts,
      await ruleSnapshot(regeln, snapshot.stand + (eigeneRegel ? 1 : 0)),
    );
    await env.writer.appendDecision({
      action,
      facts,
      decision: { ...decision, gateFormat: GATE_FORMAT },
      time: new Date(),
    });
    return { action, decision };
  }

  async function pruefen(
    env: Awaited<ReturnType<typeof haengenderLauf>>["env"],
    eigeneRegel = false,
  ) {
    const rules = await repo.rules.listActive(env.db);
    const stand = await repo.rules.currentStand(env.db);
    return verifyChain(await env.receipts(), {
      publicKeys: await repo.installationKeys.listPublic(env.db),
      rules: eigeneRegel ? [...rules, { ...ALLES_ERLAUBT, seq: stand + 1 }] : rules,
    });
  }

  async function ergebnisVon(
    env: Awaited<ReturnType<typeof haengenderLauf>>["env"],
    actionId: string,
  ) {
    const body = (await env.receipts()).find(
      (e) => e.body.type === "result" && e.body.action.actionId === actionId,
    )?.body as Extract<ReceiptBody, { type: "result" }> | undefined;
    return body?.result;
  }

  it("Werkzeug „fragen“ (R-005) ohne Ergebnis: das Aufräumen schreibt „abgelehnt“", async () => {
    const lauf = await haengenderLauf();
    const { action, decision } = await werkzeugEntscheidung(
      lauf,
      werkzeugFakten("eingebaut/test_lesen", "lesen", "intern"),
    );
    expect([decision.outcome, decision.matchedRules.map((r) => r.id)]).toEqual(["ask", ["R-005"]]);
    await failStaleRuns(
      { db: lauf.env.db, clock: spaeter, receipts: lauf.env.writer },
      { staleAfterMs: 60_000 },
    );
    expect(await ergebnisVon(lauf.env, action.actionId)).toEqual({
      status: "denied",
      code: denialCode(decision),
    });
    expect((await pruefen(lauf.env)).verdict.level).toBe("vertrauenswuerdig");
  }, 30_000);

  it("Werkzeug erlaubt (lesen, intern, R-010) ohne Ergebnis: „unterbrochen“", async () => {
    const lauf = await haengenderLauf();
    const { action, decision } = await werkzeugEntscheidung(
      lauf,
      werkzeugFakten("eingebaut/doku.nachschlagen", "lesen", "intern"),
    );
    expect(decision.matchedRules.map((r) => r.id)).toEqual(["R-010"]);
    await failStaleRuns(
      { db: lauf.env.db, clock: spaeter, receipts: lauf.env.writer },
      { staleAfterMs: 60_000 },
    );
    expect(await ergebnisVon(lauf.env, action.actionId)).toEqual({
      status: "error",
      code: "unterbrochen",
    });
    expect((await pruefen(lauf.env)).verdict.level).toBe("vertrauenswuerdig");
  }, 30_000);

  it.each([
    ["schreiben", "intern"],
    ["lesen", "nach_aussen"],
  ] as const)(
    "Werkzeug erlaubt (%s, %s) ohne Ergebnis: „ausgang_unbekannt“",
    async (kind, reach) => {
      const lauf = await haengenderLauf();
      const { action, decision } = await werkzeugEntscheidung(
        lauf,
        werkzeugFakten("eingebaut/notiz.schreiben", kind, reach),
        true,
      );
      expect(decision.outcome).toBe("allow");
      expect(await hashRule(ALLES_ERLAUBT)).toBe(decision.matchedRules[0]?.hash);
      await failStaleRuns(
        { db: lauf.env.db, clock: spaeter, receipts: lauf.env.writer },
        { staleAfterMs: 60_000 },
      );
      expect(await ergebnisVon(lauf.env, action.actionId)).toEqual({
        status: "error",
        code: "ausgang_unbekannt",
      });
      expect((await pruefen(lauf.env, true)).verdict.level).toBe("vertrauenswuerdig");
    },
    30_000,
  );

  it("offene Aufrufe enden mit dem Lauf; ein zweiter Durchgang ändert nichts", async () => {
    const lauf = await haengenderLauf();
    const { env, runId, sql } = lauf;
    const antwort = await repo.messages.insert(env.db, {
      conversationId: env.conversationId,
      role: "assistant",
      status: "streaming",
      runId,
    });
    const entscheidungen: {
      action: ActionRequest<"werkzeug.aufrufen">;
      key: string;
      kind: "lesen" | "schreiben";
      reach: "intern" | "nach_aussen";
    }[] = [];
    for (const [key, kind, reach] of [
      ["eingebaut/doku.nachschlagen", "lesen", "intern"],
      ["eingebaut/notiz.schreiben", "schreiben", "intern"],
      ["eingebaut/web.lesen", "lesen", "nach_aussen"],
      ["eingebaut/alt", "lesen", "intern"],
    ] as const) {
      const { action } = await werkzeugEntscheidung(lauf, werkzeugFakten(key, kind, reach), true);
      entscheidungen.push({ action, key, kind, reach });
    }
    const belege = await env.receipts();
    const anlegen = async (
      position: number,
      key: string,
      kind: "lesen" | "schreiben",
      reach: "intern" | "nach_aussen",
      actionId = newId("action"),
    ) =>
      (
        await repo.toolCalls.create(env.db, {
          actionId,
          conversationId: env.conversationId,
          runId,
          messageId: antwort.id,
          position,
          callId: `c${position}`,
          name: "werkzeug",
          source: "eingebaut",
          kind,
          input: {},
          argsDigest: `hmac-sha256:${"b".repeat(64)}` as never,
          toolKey: key as never,
          toolDigest: `sha256:${"4d".repeat(32)}` as never,
          reach,
          foreignContent: false,
          step: 0,
          untrustedInput: false,
        })
      ).actionId;
    // Jede Zeile gehört zur Entscheidung derselben Aktion (der Trigger bindet sie aneinander).
    const aktion = (i: number) => entscheidungen[i]?.action.actionId as never;
    const beleg = (i: number) =>
      belege.find((e) => e.body.type === "decision" && e.body.action.actionId === aktion(i))
        ?.id as never;
    const angefragt = await anlegen(0, "eingebaut/doku.nachschlagen", "lesen", "intern");
    const lesend = await anlegen(1, "eingebaut/doku.nachschlagen", "lesen", "intern", aktion(0));
    await repo.toolCalls.recordDecision(env.db, lesend, {
      outcome: "allow",
      decisionReceiptId: beleg(0),
    });
    const schreibend = await anlegen(
      2,
      "eingebaut/notiz.schreiben",
      "schreiben",
      "intern",
      aktion(1),
    );
    await repo.toolCalls.recordDecision(env.db, schreibend, {
      outcome: "allow",
      decisionReceiptId: beleg(1),
    });
    const draussen = await anlegen(3, "eingebaut/web.lesen", "lesen", "nach_aussen", aktion(2));
    await repo.toolCalls.recordDecision(env.db, draussen, {
      outcome: "allow",
      decisionReceiptId: beleg(2),
    });
    // Zeile aus der Zeit vor den Pflicht-Angaben: läuft, ohne Wirkung und ohne Kennung.
    const alt = aktion(3);
    await sql.begin(async (tx) => {
      await tx.unsafe("set local session_replication_role = replica");
      await tx`insert into tool_calls (action_id, conversation_id, run_id, message_id, position, call_id, name, source, kind, input, args_digest, status, decision_receipt_id)
        values (${alt}, ${env.conversationId}, ${runId}, ${antwort.id}, 4, 'c4', 'alt', 'eingebaut', 'lesen', '{}'::jsonb, ${`hmac-sha256:${"c".repeat(64)}`}, 'running', ${beleg(3) ?? null})`;
    });

    await failStaleRuns(
      { db: env.db, clock: spaeter, receipts: env.writer },
      { staleAfterMs: 60_000 },
    );
    const nachher = await repo.toolCalls.listForRun(env.db, runId);
    const ende = Object.fromEntries(
      nachher.map((c) => [c.actionId, [c.status, c.resultStatus, c.errorCode]]),
    );
    expect(ende).toEqual({
      [angefragt]: ["cancelled", "error", "unterbrochen"],
      [lesend]: ["cancelled", "error", "unterbrochen"],
      [schreibend]: ["cancelled", "error", "ausgang_unbekannt"],
      [draussen]: ["cancelled", "error", "ausgang_unbekannt"],
      [alt]: ["cancelled", "error", "ausgang_unbekannt"],
    });
    const schreibAufruf = nachher.find((c) => c.actionId === schreibend);
    expect(schreibAufruf?.output).toEqual({
      paibot: "werkzeug-ergebnis",
      werkzeug: "eingebaut/notiz.schreiben",
      art: "daten",
      status: "fehler",
      code: "ausgang_unbekannt",
      text: "Ob der Werkzeug-Aufruf gewirkt hat, ist nicht bekannt.",
    });
    expect(nachher.find((c) => c.actionId === alt)?.output).toBeUndefined();
    // Das Aufräumen vermerkt den Ergebnis-Beleg an der Zeile (Gegenprobe: ohne `results` → rot).
    const nachBelegen = await env.receipts();
    for (const id of [lesend, schreibend, draussen, alt]) {
      const ergebnis = nachBelegen.find(
        (e) => e.body.type === "result" && e.body.action.actionId === id,
      );
      expect(nachher.find((c) => c.actionId === id)?.resultReceiptId).toBe(ergebnis?.id);
    }
    expect(nachher.find((c) => c.actionId === angefragt)?.resultReceiptId).toBeUndefined();
    for (const { action, kind, reach } of entscheidungen) {
      expect(await ergebnisVon(env, action.actionId)).toEqual({
        status: "error",
        code:
          kind === "schreiben" || reach === "nach_aussen" ? "ausgang_unbekannt" : "unterbrochen",
      });
    }
    expect((await pruefen(env, true)).verdict.level).toBe("vertrauenswuerdig");

    // Zweiter Durchgang: nichts ändert sich, kein Aufruf wird wieder angefragt oder laufend.
    const belegZahl = (await env.receipts()).length;
    await failStaleRuns(
      { db: env.db, clock: spaeter, receipts: env.writer },
      { staleAfterMs: 60_000 },
    );
    expect(await repo.toolCalls.listForRun(env.db, runId)).toEqual(nachher);
    expect((await env.receipts()).length).toBe(belegZahl);
    expect(await repo.toolCalls.endOpenForRun(env.db, runId)).toBe(0);
  }, 60_000);

  // Gegenprobe: `for update` in `endOpenForRun` entfernen → liest den alten Zustand, Code unterbrochen, rot.
  it("endOpenForRun sperrt die offenen Zeilen: ein gleichzeitiger Wechsel nach running wird abgewartet, der Code passt dazu", async () => {
    const lauf = await haengenderLauf();
    const { env, runId, sql } = lauf;
    const antwort = await repo.messages.insert(env.db, {
      conversationId: env.conversationId,
      role: "assistant",
      status: "streaming",
      runId,
      step: 0,
    });
    const { action } = await werkzeugEntscheidung(
      lauf,
      werkzeugFakten("eingebaut/notiz.schreiben", "schreiben", "nach_aussen"),
      true,
    );
    await repo.toolCalls.create(env.db, {
      actionId: action.actionId,
      conversationId: env.conversationId,
      runId,
      messageId: antwort.id,
      position: 0,
      callId: "c0",
      name: "werkzeug",
      source: "eingebaut",
      kind: "schreiben",
      input: {},
      argsDigest: `hmac-sha256:${"b".repeat(64)}` as never,
      toolKey: "eingebaut/notiz.schreiben" as never,
      toolDigest: `sha256:${"4d".repeat(32)}` as never,
      reach: "nach_aussen",
      foreignContent: false,
      step: 0,
      untrustedInput: false,
    });
    const entscheidung = (await env.receipts()).find(
      (e) => e.body.type === "decision" && e.body.action.actionId === action.actionId,
    );
    // Ein noch lebender Worker schaltet die Zeile gerade nach `running` (Transaktion offen).
    const worker = await sql.reserve();
    await worker`begin`;
    await worker`update tool_calls set status = 'running', decision_receipt_id = ${entscheidung?.id ?? ""} where action_id = ${action.actionId}`;
    const aufraeumen = repo.withTransaction(env.db, (tx) =>
      repo.toolCalls.endOpenForRun(tx, runId),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    await worker`commit`;
    worker.release();
    expect(await aufraeumen).toBe(1);
    expect(await repo.toolCalls.get(env.db, action.actionId)).toMatchObject({
      status: "cancelled",
      errorCode: "ausgang_unbekannt",
    });
  }, 60_000);

  // Gegenprobe: Nachlauf in `failStaleRuns` entfernen → Entscheidung bleibt ohne Ergebnis, rot.
  it("Absturz zwischen dem Beenden des Laufs und dem Schließen der Entscheidungen: der nächste Durchgang schließt sie", async () => {
    const lauf = await haengenderLauf();
    const { env, runId } = lauf;
    const antwort = await repo.messages.insert(env.db, {
      conversationId: env.conversationId,
      role: "assistant",
      status: "streaming",
      runId,
      step: 0,
    });
    const { action } = await werkzeugEntscheidung(
      lauf,
      werkzeugFakten("eingebaut/notiz.schreiben", "schreiben", "intern"),
      true,
    );
    await repo.toolCalls.create(env.db, {
      actionId: action.actionId,
      conversationId: env.conversationId,
      runId,
      messageId: antwort.id,
      position: 0,
      callId: "c0",
      name: "werkzeug",
      source: "eingebaut",
      kind: "schreiben",
      input: {},
      argsDigest: `hmac-sha256:${"b".repeat(64)}` as never,
      toolKey: "eingebaut/notiz.schreiben" as never,
      toolDigest: `sha256:${"4d".repeat(32)}` as never,
      reach: "intern",
      foreignContent: false,
      step: 0,
      untrustedInput: false,
    });
    const entscheidung = (await env.receipts()).find(
      (e) => e.body.type === "decision" && e.body.action.actionId === action.actionId,
    );
    await repo.toolCalls.recordDecision(env.db, action.actionId, {
      outcome: "allow",
      decisionReceiptId: entscheidung?.id as never,
    });
    // Erster Durchgang ohne Beleg-Schreiber: wie ein Absturz nach dem Beenden des Laufs.
    await failStaleRuns({ db: env.db, clock: spaeter }, { staleAfterMs: 60_000 });
    expect((await repo.runs.get(env.db, runId))?.status).toBe("failed");
    expect(await ergebnisVon(env, action.actionId)).toBeUndefined();
    // Nächster Durchgang: Der Lauf ist schon beendet, der Nachlauf schließt die Entscheidung.
    await failStaleRuns(
      { db: env.db, clock: spaeter, receipts: env.writer },
      { staleAfterMs: 60_000 },
    );
    expect(await ergebnisVon(env, action.actionId)).toEqual({
      status: "error",
      code: "ausgang_unbekannt",
    });
    const zeile = await repo.toolCalls.get(env.db, action.actionId);
    expect(zeile).toMatchObject({ status: "cancelled", errorCode: "ausgang_unbekannt" });
    const ergebnis = (await env.receipts()).find(
      (e) => e.body.type === "result" && e.body.action.actionId === action.actionId,
    );
    expect(zeile?.resultReceiptId).toBe(ergebnis?.id);
    expect((await pruefen(env, true)).verdict.level).toBe("vertrauenswuerdig");
  }, 60_000);

  /** Zeile `tool_calls` zur Entscheidung `action` (gebunden an deren Beleg), Zustand `running`. */
  async function laufendeZeile(
    lauf: Awaited<ReturnType<typeof haengenderLauf>>,
    actionId: string,
    kind: "lesen" | "schreiben",
    reach: "intern" | "nach_aussen",
  ) {
    const { env, runId } = lauf;
    const antwort = await repo.messages.insert(env.db, {
      conversationId: env.conversationId,
      role: "assistant",
      status: "complete",
      runId,
      step: 0,
    });
    await repo.toolCalls.create(env.db, {
      actionId: actionId as never,
      conversationId: env.conversationId,
      runId,
      messageId: antwort.id,
      position: 0,
      callId: "c0",
      name: "werkzeug",
      source: "eingebaut",
      kind,
      input: {},
      argsDigest: `hmac-sha256:${"b".repeat(64)}` as never,
      toolKey: "eingebaut/notiz.schreiben" as never,
      toolDigest: `sha256:${"4d".repeat(32)}` as never,
      reach,
      foreignContent: false,
      step: 0,
      untrustedInput: false,
    });
    const entscheidung = (await env.receipts()).find(
      (e) => e.body.type === "decision" && e.body.action.actionId === actionId,
    );
    await repo.toolCalls.recordDecision(env.db, actionId as never, {
      outcome: "allow",
      decisionReceiptId: entscheidung?.id as never,
    });
  }

  // Gegenprobe: Code für einen erlaubten, nie beendeten Aufruf immer `unterbrochen` → rot.
  it("schreibendes Werkzeug: Absturz nach „erlaubt“, vor dem Ergebnis → Aufräumen ausgang_unbekannt, kein zweiter Aufruf", async () => {
    const lauf = await haengenderLauf();
    const { env, runId, sql } = lauf;
    const { action } = await werkzeugEntscheidung(
      lauf,
      werkzeugFakten("eingebaut/notiz.schreiben", "schreiben", "nach_aussen"),
      true,
    );
    await laufendeZeile(lauf, action.actionId, "schreiben", "nach_aussen");
    await failStaleRuns(
      { db: env.db, clock: spaeter, receipts: env.writer },
      { staleAfterMs: 60_000 },
    );
    expect(await ergebnisVon(env, action.actionId)).toEqual({
      status: "error",
      code: "ausgang_unbekannt",
    });
    expect(await repo.toolCalls.get(env.db, action.actionId)).toMatchObject({
      status: "cancelled",
      errorCode: "ausgang_unbekannt",
    });
    expect((await repo.runs.get(env.db, runId))?.status).toBe("failed");
    // Nie wiederholt: Der Trigger lässt keinen Weg zurück nach `running` zu.
    const zurueck =
      await sql`update tool_calls set status = 'running' where action_id = ${action.actionId}`.then(
        () => undefined,
        (error: { code?: string }) => error.code,
      );
    expect(zurueck).toBe("23001");
    const entscheidungen = (await env.receipts()).filter(
      (e) => e.body.type === "decision" && e.body.action.actionId === action.actionId,
    );
    expect(entscheidungen).toHaveLength(1);
    expect((await pruefen(env, true)).verdict.level).toBe("vertrauenswuerdig");
  }, 60_000);

  // Gegenprobe: fehlende Wirkung wie „intern“ zählen (milder Code) → `unterbrochen`, rot.
  it("Entscheidung „erlaubt“ ohne toolReach in den Fakten: Ergebnis ausgang_unbekannt, gleich streng wie die Zeile", async () => {
    const lauf = await haengenderLauf();
    const { env, runId } = lauf;
    const action: ActionRequest<"werkzeug.aufrufen"> = {
      actionId: newId("action"),
      type: "werkzeug.aufrufen",
      actor: `bot:${env.botId}`,
      target: { conversationId: env.conversationId, runId, botId: env.botId },
    };
    const volle = werkzeugFakten("eingebaut/doku.nachschlagen", "lesen", "intern");
    const snapshot = await repo.rules.loadSnapshot(env.db);
    const decision = evaluate(
      action,
      volle,
      await ruleSnapshot(
        [...snapshot.rules, { ...ALLES_ERLAUBT, seq: snapshot.stand + 1 }],
        snapshot.stand + 1,
      ),
    );
    expect(decision.outcome).toBe("allow");
    // Fakten ohne Wirkung (wie eine ältere Entscheidung); der heutige Schreiber nähme sie nicht an.
    const { toolReach: _ohne, ...facts } = volle;
    const schluessel = await letzteSchluessel?.current();
    if (schluessel === undefined) throw new Error("kein Schlüssel");
    const kopf = (await env.receipts()).at(-1);
    const body = {
      v: 1,
      id: newId("receipt"),
      seq: (kopf?.seq ?? 0) + 1,
      time: new Date().toISOString(),
      prev: kopf?.hash,
      keyId: schluessel.keyId,
      type: "decision",
      action,
      decision: { ...decision, rules: decision.matchedRules, gateFormat: GATE_FORMAT },
      facts,
    } as unknown as ReceiptBody;
    const hash = await hashReceipt(body);
    await env.db.insert(belege).values({
      seq: body.seq,
      id: body.id,
      entryType: "decision",
      actionId: action.actionId,
      action: action.type,
      actor: action.actor,
      conversationId: env.conversationId,
      body,
      prevHash: body.prev,
      hash,
      keyId: schluessel.keyId,
      signature: signReceipt(hash, schluessel.privateKey),
    });
    await failStaleRuns(
      { db: env.db, clock: spaeter, receipts: env.writer },
      { staleAfterMs: 60_000 },
    );
    expect(await ergebnisVon(env, action.actionId)).toEqual({
      status: "error",
      code: "ausgang_unbekannt",
    });
  }, 60_000);

  it("Entscheidung der Tor-Fassung 1 (vor dem Update) mit Not-Aus: das Aufräumen schreibt „angehalten“", async () => {
    const lauf = await haengenderLauf();
    const { env, runId } = lauf;
    const action: ActionRequest<"modell.anfragen"> = {
      actionId: newId("action"),
      type: "modell.anfragen",
      actor: `bot:${env.botId}`,
      target: { conversationId: env.conversationId, runId, botId: env.botId, modelId: env.modelId },
    };
    // Fakten und Auswertung so, wie der Stand mit Fassung 1 sie schrieb (ohne Schritt-Fakten).
    const facts = {
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
      killSwitch: true,
      ...providerTargetFacts(env.providerId, "http://127.0.0.1:9/v1"),
    };
    const snapshot = await repo.rules.loadSnapshot(env.db);
    const decision = evaluate(
      action,
      facts as never,
      await ruleSnapshot(snapshot.rules, snapshot.stand),
      { format: 1 },
    );
    expect(decision.limits.find((l) => l.name === "not_aus")?.result).toBe("verletzt");
    // Der heutige Schreiber nimmt nur Entscheidungen der aktuellen Fassung an; deshalb wie der
    // Stand davor: Körper ohne `gateFormat`, Prüfsumme und Signatur mit dem aktiven Schlüssel.
    const schluessel = await letzteSchluessel?.current();
    if (schluessel === undefined) throw new Error("kein Schlüssel");
    const kopf = (await env.receipts()).at(-1);
    const body = {
      v: 1,
      id: newId("receipt"),
      seq: (kopf?.seq ?? 0) + 1,
      time: new Date().toISOString(),
      prev: kopf?.hash,
      keyId: schluessel.keyId,
      type: "decision",
      action,
      decision: {
        outcome: decision.outcome,
        stage: decision.stage,
        rules: decision.matchedRules,
        limits: decision.limits,
        ...(decision.preconditions === undefined ? {} : { preconditions: decision.preconditions }),
        ...(decision.ruleStand === undefined ? {} : { ruleStand: decision.ruleStand }),
        reason: decision.reason,
      },
      facts,
    } as unknown as ReceiptBody;
    const hash = await hashReceipt(body);
    await env.db.insert(belege).values({
      seq: body.seq,
      id: body.id,
      entryType: "decision",
      actionId: action.actionId,
      action: action.type,
      actor: action.actor,
      conversationId: env.conversationId,
      body,
      prevHash: body.prev,
      hash,
      keyId: schluessel.keyId,
      signature: signReceipt(hash, schluessel.privateKey),
    });
    const entscheidung = (await env.receipts()).at(-1)?.body;
    expect(entscheidung?.type === "decision" && "gateFormat" in entscheidung.decision).toBe(false);

    await failStaleRuns(
      { db: env.db, clock: spaeter, receipts: env.writer },
      { staleAfterMs: 60_000 },
    );
    expect(await ergebnisVon(env, action.actionId)).toEqual({
      status: "denied",
      code: "angehalten",
    });
    expect((await pruefen(env)).verdict.level).toBe("vertrauenswuerdig");
  }, 30_000);
});
