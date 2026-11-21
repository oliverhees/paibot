/**
 * PaiBot – Test: das Tor mit dem echten Beleg-Schreiber gegen eine Datenbank im Speicher (PGlite).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type Database, installationKeys, repo } from "@paibot/db";
import { createTestDb, type TestDb } from "@paibot/db/testing";
import { createGate, type Gate, isGateDenied, isGatePermit, ruleSnapshot } from "@paibot/gate";
import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import type { ReceiptBody } from "@paibot/shared/belege";
import { PaiBotError } from "@paibot/shared/fehler";
import { newId } from "@paibot/shared/ids";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { keyInfo, TEST_INSTALLATION, type TestKey, testKey } from "./testhilfen";
import { verifyChain } from "./verify";
import { createReceiptWriter } from "./writer";

let ctx: TestDb;
let key: TestKey;
let gate: Gate;
let tick = 0;

/** Steigende Uhr, damit jeder Beleg eine eigene Zeit hat. */
const clock = { now: () => new Date(Date.UTC(2026, 10, 20, 10, 0, 0) + tick++ * 1000) };

async function chain(db: Database) {
  return repo.belege.listFrom(db);
}

async function checkAll(db: Database) {
  return verifyChain(await chain(db), [keyInfo(key)], { rules: await repo.rules.listActive(db) });
}

function ownerAction<T extends "unterhaltung.anlegen" | "bot.aendern">(
  type: T,
  target: ActionRequest<T>["target"],
): ActionRequest<T> {
  return { actionId: newId("action"), type, actor: "besitzer", target } as ActionRequest<T>;
}

beforeAll(async () => {
  ctx = await createTestDb();
  key = testKey();
  await ctx.db.insert(installationKeys).values({
    id: key.keyId,
    purpose: "receipts",
    publicKey: key.publicKey,
    privateKeyEnc: "v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AA",
    fingerprint: key.fingerprint,
  });
  const writer = createReceiptWriter(ctx.db, {
    current: async () => ({ keyId: key.keyId, privateKey: key.privateKey }),
  });
  await writer.appendStart({
    installationId: TEST_INSTALLATION,
    key,
    software: "0.3.0+dev",
    time: clock.now(),
  });
  gate = createGate({
    rules: {
      load: async () => {
        const { stand, rules } = await repo.rules.loadSnapshot(ctx.db);
        return ruleSnapshot(rules, stand);
      },
    },
    receipts: writer,
    clock,
  });
});

afterAll(async () => {
  await ctx.client.close();
});

describe("Tor mit dem echten Beleg-Schreiber", () => {
  it("erlaubte Aktion: Entscheidung und Ergebnis landen als gültige Kette", async () => {
    const action = ownerAction("unterhaltung.anlegen", {
      conversationId: newId("conversation"),
      botId: newId("bot"),
    });
    const facts: Facts<"unterhaltung.anlegen"> = { credential: "sitzung" };
    const run = await gate.run(action, facts, async (permit) => {
      expect(isGatePermit(permit, "unterhaltung.anlegen")).toBe(true);
      return { value: "angelegt", result: { status: "ok" } };
    });
    expect(run.value).toBe("angelegt");
    expect(run.decision.outcome).toBe("allow");
    expect(run.decision.matchedRules).toMatchObject([{ id: "R-001", version: 1 }]);
    expect(run.decision.matchedRules[0]?.hash).toMatch(/^sha256:/);

    const entries = await chain(ctx.db);
    const decision = entries.find((e) => e.id === run.receipts.decision.receiptId);
    const result = entries.find((e) => e.id === run.receipts.result.receiptId);
    expect(decision?.seq).toBe(run.receipts.decision.seq);
    expect(result?.seq).toBe(run.receipts.decision.seq + 1);
    const decisionBody = decision?.body as ReceiptBody;
    const resultBody = result?.body as ReceiptBody;
    expect(decisionBody.type).toBe("decision");
    expect(resultBody).toMatchObject({ type: "result", result: { status: "ok" } });
    if (decisionBody.type !== "decision" || resultBody.type !== "result") throw new Error("Typ");
    expect(resultBody.action.actionId).toBe(decisionBody.action.actionId);
    expect(resultBody.prev).toBe(decision?.hash);

    const report = await checkAll(ctx.db);
    expect(report).toMatchObject({ ok: true, checked: entries.length });
  });

  it("abgelehnte Aktion: nichts wird ausgeführt, Ergebnis „abgelehnt“, Kette bleibt gültig", async () => {
    // Abgelehnt von R-006: Der Einrichtungs-Code gilt nicht für diese Aktion.
    const ruleId = "R-006";
    const action = ownerAction("bot.aendern", { botId: newId("bot") });
    let executed = false;
    const error = await gate
      .run(action, { credential: "einrichtungs_code", fields: ["name"] }, async () => {
        executed = true;
        return { value: undefined, result: { status: "ok" } };
      })
      .catch((e: unknown) => e);
    expect(executed).toBe(false);
    expect(isGateDenied(error)).toBe(true);
    if (!isGateDenied(error)) throw error;
    expect(error.code).toBe("abgelehnt");
    expect(error.decision).toMatchObject({
      outcome: "deny",
      matchedRules: [{ id: ruleId, version: 1 }],
      reason: "Für diese Aktion gilt nur eine Anmeldung mit Sitzung.",
    });
    const entries = await chain(ctx.db);
    const result = entries.find((e) => e.id === error.receipts.result.receiptId);
    expect(result?.body).toMatchObject({
      type: "result",
      result: { status: "denied", code: error.code },
    });
    expect((await checkAll(ctx.db)).ok).toBe(true);
  });

  it("Fehler in der Ausführung: Ergebnis „error“ mit Code, Fehler geht weiter, Kette gültig", async () => {
    const action = ownerAction("unterhaltung.anlegen", {
      conversationId: newId("conversation"),
      botId: newId("bot"),
    });
    const error = await gate
      .run(action, { credential: "sitzung" }, async () => {
        throw new PaiBotError("anbieter_nicht_erreichbar");
      })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "anbieter_nicht_erreichbar" });
    const last = (await chain(ctx.db)).at(-1);
    expect(last?.body).toMatchObject({
      type: "result",
      action: { actionId: action.actionId },
      result: { status: "error", code: "anbieter_nicht_erreichbar" },
    });
    expect((await checkAll(ctx.db)).ok).toBe(true);
  });

  it("gleichzeitige Aktionen bleiben eine lückenlose Kette mit Paaren je Aktion", async () => {
    const before = (await chain(ctx.db)).length;
    const actions = Array.from({ length: 8 }, () =>
      ownerAction("unterhaltung.anlegen", {
        conversationId: newId("conversation"),
        botId: newId("bot"),
      }),
    );
    await Promise.all(
      actions.map((action) =>
        gate.run(action, { credential: "sitzung" }, async () => ({
          value: action.actionId,
          result: { status: "ok" },
        })),
      ),
    );
    const entries = await chain(ctx.db);
    expect(entries).toHaveLength(before + 16);
    expect(entries.map((e) => e.seq)).toEqual(entries.map((_, i) => i + 1));
    for (const action of actions) {
      const types = entries
        .map((e) => e.body as ReceiptBody)
        .filter(
          (b) =>
            (b.type === "decision" || b.type === "result") && b.action.actionId === action.actionId,
        )
        .map((b) => b.type);
      expect(types).toEqual(["decision", "result"]);
    }
    expect((await checkAll(ctx.db)).ok).toBe(true);
  });

  it("dieselbe Aktions-Kennung zweimal: nur einmal ausgeführt, die Kette bleibt gültig", async () => {
    const action = ownerAction("unterhaltung.anlegen", {
      conversationId: newId("conversation"),
      botId: newId("bot"),
    });
    const facts: Facts<"unterhaltung.anlegen"> = { credential: "sitzung" };
    let executions = 0;
    const execute = async () => {
      executions++;
      return { value: 1, result: { status: "ok" as const } };
    };
    const results = await Promise.allSettled([
      gate.run(action, facts, execute),
      gate.run(action, facts, execute),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(executions).toBe(1);
    const own = (await chain(ctx.db)).filter(
      (e) => (e.body as { action?: { actionId?: string } }).action?.actionId === action.actionId,
    );
    expect(own.map((e) => e.body.type)).toEqual(["decision", "result"]);
    expect((await checkAll(ctx.db)).ok).toBe(true);
  });

  it("eine nachträglich veränderte Regel fällt bei der Prüfung auf", async () => {
    const active = await repo.rules.listActive(ctx.db);
    const changed = active.map((rule) =>
      rule.id === "R-001" ? { ...rule, effect: "deny" as const } : rule,
    );
    const report = await verifyChain(await chain(ctx.db), [keyInfo(key)], { rules: changed });
    expect(report.ok).toBe(false);
    expect(report.firstFailure?.checks).toContainEqual(
      expect.objectContaining({ check: "entscheidung", status: "fehler" }),
    );
  });
});
