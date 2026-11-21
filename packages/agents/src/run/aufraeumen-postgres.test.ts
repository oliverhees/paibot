/**
 * PaiBot – Aufräumen nach einem Absturz zwischen Entscheidung und Ergebnis, gegen echtes Postgres:
 * Wurde eine Aktion abgelehnt und endete der Worker, bevor das Ergebnis „abgelehnt“ belegt war,
 * schreibt das Aufräumen genau dieses Ergebnis, und die Beleg-Kette bleibt gültig.
 * Läuft nur mit `PAIBOT_TEST_DATABASE_URL`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createDb, repo } from "@paibot/db";
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { denialCode, evaluate, ruleSnapshot } from "@paibot/gate";
import { providerTargetFacts } from "@paibot/llm";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import { newId } from "@paibot/shared/ids";
import { afterEach, describe, expect, it } from "vitest";
import { createFakeMotor } from "../testing/fake-motor";
import { setupRun } from "../testing/lauf-umgebung";
import { failStaleRuns } from "./aufraeumen";

const baseUrl = process.env[TEST_DATABASE_URL_ENV];

const RECEIPT_TOOLS = {
  createWriter: createReceiptWriter,
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
    };
    const snapshot = await repo.rules.loadSnapshot(env.db);
    const decision = evaluate(action, facts, await ruleSnapshot(snapshot.rules, snapshot.stand));
    await env.writer.appendDecision({ action, facts, decision, time: new Date() });
    return { env, runId, action, decision };
  }

  const spaeter = { now: () => new Date(Date.now() + 60 * 60_000) };

  it("abgelehnte Aktion ohne Ergebnis: das Aufräumen schreibt „abgelehnt“, die Kette bleibt gültig", async () => {
    const { env, runId, action, decision } = await abgestuerzterLauf(true);
    expect(decision.outcome).not.toBe("allow");

    await failStaleRuns(
      { db: env.db, clock: spaeter, receipts: env.writer },
      { staleAfterMs: 60_000 },
    );

    expect(await repo.runs.get(env.db, runId)).toMatchObject({ status: "failed" });
    const last = (await env.receipts()).at(-1)?.body;
    expect(last).toMatchObject({
      type: "result",
      action: { actionId: action.actionId },
      result: { status: "denied", code: denialCode(decision) },
    });
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
});
