/**
 * PaiBot – Tests für die Freigabe eines Werkzeug-Aufrufs. Die aktuelle Fassung des Tors kennt
 * keine Freigabe: Antwort des Besitzers und Ausführung danach sind dort ungültig und werden
 * abgelehnt. Wie Fassung 1 (nur noch zum Nachrechnen älterer Belege) die Freigabe entschied, hält
 * der zweite Teil fest: Antwort und Ausführung als eigene Entscheidung, Regel „einmal erlaubt“.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type ActionRequest, botActor, type Facts } from "@paibot/shared/aktionen";
import type { HmacDigest } from "@paibot/shared/grundtypen";
import { type ActionId, type BotId, newId } from "@paibot/shared/ids";
import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate";
import {
  ACTIVE_STANDARD_RULES,
  createGate,
  type DecisionRecord,
  denialCode,
  type Gate,
  GateDenied,
  hashRule,
  isGateDenied,
  type ResultRecord,
  ruleSnapshot,
  UNSTORED_STANDARD_RULE_VERSIONS,
  verifyRuleSnapshot,
} from "./index";
import { sampleFacts } from "./testdaten";

const RULES = [...ACTIVE_STANDARD_RULES, ...UNSTORED_STANDARD_RULE_VERSIONS];
const DIGEST = `hmac-sha256:${"a7".repeat(32)}` as HmacDigest;
const OTHER_DIGEST = `hmac-sha256:${"b8".repeat(32)}` as HmacDigest;

type Entry =
  | { kind: "decision"; record: DecisionRecord }
  | { kind: "result"; record: ResultRecord };

/**
 * Zustand, wie ihn die Datenbank später hält (Zeile in `tool_calls` mit den Angaben zur
 * Freigabe). Die Test-Steuerung bildet daraus die Fakten und hält Freigabe und Verbrauch fest.
 */
interface WaitingCall {
  toolCallId: ActionId;
  argsDigest: HmacDigest;
  status: "waiting_approval" | "approved" | "running" | "succeeded" | "denied";
  waitExpired: boolean;
  approval?: {
    approvalId: ActionId;
    answer: "erteilen" | "ablehnen";
    argsDigest: HmacDigest;
    expired: boolean;
    consumed: boolean;
  };
}

/**
 * Ein Tor, das wie `gate.run` abläuft, aber mit Fassung 1 entscheidet (`evaluate` mit
 * `format: 1`). Nur für Tests: So bleibt sichtbar, wie Fassung 1 die Freigabe entschied.
 */
function fassung1Gate(entries: Entry[], next: () => number, now: () => Date): Pick<Gate, "run"> {
  return {
    async run(action, facts, execute) {
      const decision = evaluate(action, facts, await ruleSnapshot(RULES), { format: 1 });
      entries.push({
        kind: "decision",
        record: structuredClone({
          action,
          facts,
          decision: { ...decision, gateFormat: 1 },
          time: now(),
        }),
      });
      const decisionRef = { receiptId: newId("receipt"), seq: next() };
      if (decision.outcome !== "allow") {
        const result = { status: "denied" as const, code: denialCode(decision) };
        entries.push({ kind: "result", record: { action, result, time: now() } });
        const resultRef = { receiptId: newId("receipt"), seq: next() };
        throw new GateDenied(
          decision,
          { decision: decisionRef, result: resultRef },
          { actionId: action.actionId, type: action.type },
        );
      }
      const executed = await execute(undefined as never);
      entries.push({ kind: "result", record: { action, result: executed.result, time: now() } });
      return {
        value: executed.value,
        decision,
        receipts: { decision: decisionRef, result: { receiptId: newId("receipt"), seq: next() } },
      };
    },
  };
}

function setup(format: 1 | 2 = 1) {
  const entries: Entry[] = [];
  let seq = 0;
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 10, 20, 10, 0, 0, ++tick));
  const gate: Pick<Gate, "run"> =
    format === 1
      ? fassung1Gate(entries, () => ++seq, now)
      : createGate({
          rules: { load: () => ruleSnapshot(RULES) },
          receipts: {
            async appendDecision(record) {
              entries.push({ kind: "decision", record: structuredClone(record) });
              return { receiptId: newId("receipt"), seq: ++seq };
            },
            async appendResult(record) {
              entries.push({ kind: "result", record: structuredClone(record) });
              return { receiptId: newId("receipt"), seq: ++seq };
            },
          },
          clock: { now },
        });
  const botId = newId("bot") as BotId;
  const conversationId = newId("conversation");
  const runId = newId("run");
  const toolFacts = {
    toolName: "notiz_schreiben",
    toolSource: "eingebaut",
    toolKind: "schreiben",
  } as const;
  let toolRuns = 0;

  /** 1. Der Bot wünscht ein Werkzeug; R-005 fragt nach, der Aufruf wartet. */
  async function request(argsDigest: HmacDigest = DIGEST): Promise<WaitingCall> {
    const action: ActionRequest<"werkzeug.aufrufen"> = {
      actionId: newId("action"),
      type: "werkzeug.aufrufen",
      actor: botActor(botId),
      target: { conversationId, runId, botId },
    };
    // Fassung 1 kennt nur die Fakten von damals; die aktuelle Fassung verlangt alle.
    const facts = (
      format === 1
        ? { botOfConversation: true, runRunning: true, ...toolFacts, argsDigest, killSwitch: false }
        : {
            ...sampleFacts("werkzeug.aufrufen"),
            ...toolFacts,
            toolKey: "eingebaut/notiz.schreiben",
            argsDigest,
          }
    ) as Facts<"werkzeug.aufrufen">;
    const error = await gate
      .run(action, facts, async () => ({
        value: undefined,
        result: { status: "ok" },
      }))
      .catch((caught: unknown) => caught);
    // Das Tor fragt (R-005); in Fassung 2 ist das abgelehnt, in Fassung 1 wartete der Aufruf.
    expect(isGateDenied(error) && error.waitsForApproval).toBe(true);
    if (format === 2 && isGateDenied(error)) {
      expect(error.toolCallDecision()).toMatchObject({
        outcome: "deny",
        errorCode: "freigabe_noetig",
      });
    }
    return {
      toolCallId: action.actionId,
      argsDigest,
      status: "waiting_approval",
      waitExpired: false,
    };
  }

  /** 2. Der Besitzer antwortet; die Fakten stammen aus dem gespeicherten Aufruf. */
  async function answer(
    call: WaitingCall,
    options: {
      answer?: "erteilen" | "ablehnen";
      seenDigest?: HmacDigest;
      credential?: "sitzung" | "passwort";
    } = {},
  ) {
    const action: ActionRequest<"werkzeug.freigeben"> = {
      actionId: newId("action"),
      type: "werkzeug.freigeben",
      actor: "besitzer",
      target: { conversationId, runId, toolCallId: call.toolCallId },
    };
    const facts: Facts<"werkzeug.freigeben"> = {
      credential: options.credential ?? "sitzung",
      answer: options.answer ?? "erteilen",
      callWaiting: call.status === "waiting_approval",
      callExpired: call.waitExpired,
      argsDigest: options.seenDigest ?? call.argsDigest,
      waitingArgsDigest: call.argsDigest,
    };
    return gate.run(action, facts, async () => {
      call.approval = {
        approvalId: action.actionId,
        answer: facts.answer,
        argsDigest: facts.argsDigest,
        expired: false,
        consumed: false,
      };
      call.status = facts.answer === "erteilen" ? "approved" : "denied";
      return { value: action.actionId, result: { status: "ok" } };
    });
  }

  /** 3. Die Lauf-Steuerung führt aus: neue Entscheidung, die auf die Freigabe verweist. */
  async function execute(
    call: WaitingCall,
    options: { approvalId?: ActionId; argsDigest?: HmacDigest; killSwitch?: boolean } = {},
  ) {
    const approval = call.approval;
    const approvalId = options.approvalId ?? approval?.approvalId ?? newId("action");
    const matches = approval !== undefined && approval.approvalId === approvalId;
    const action: ActionRequest<"werkzeug.ausfuehren"> = {
      actionId: newId("action"),
      type: "werkzeug.ausfuehren",
      actor: botActor(botId),
      target: { conversationId, runId, botId, toolCallId: call.toolCallId, approvalId },
    };
    const facts: Facts<"werkzeug.ausfuehren"> = {
      botOfConversation: true,
      runRunning: true,
      ...toolFacts,
      argsDigest: options.argsDigest ?? call.argsDigest,
      killSwitch: options.killSwitch ?? false,
      approvalGranted: matches && approval.answer === "erteilen",
      approvalConsumed: matches ? approval.consumed : false,
      approvalExpired: matches ? approval.expired : false,
      approvalArgsDigest: matches ? approval.argsDigest : call.argsDigest,
    };
    return gate.run(action, facts, async () => {
      // Erst verbrauchen, dann ausführen: Ein zweiter Versuch sieht die Freigabe als benutzt.
      if (approval !== undefined) approval.consumed = true;
      call.status = "running";
      toolRuns += 1;
      call.status = "succeeded";
      return { value: "gespeichert", result: { status: "ok" } };
    });
  }

  return { gate, entries, request, answer, execute, toolRuns: () => toolRuns };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("kein Fehler geworfen");
    },
    (error: unknown) => error,
  );
}

/** Je Aktion genau zwei Belege (Entscheidung, Ergebnis). */
function receiptsPerAction(entries: readonly Entry[]): Map<string, string[]> {
  const byAction = new Map<string, string[]>();
  for (const entry of entries) {
    const id = entry.record.action.actionId;
    byAction.set(id, [...(byAction.get(id) ?? []), entry.kind]);
  }
  return byAction;
}

describe("aktuelle Fassung: keine Freigabe", () => {
  it("fragt das Tor bei einem Werkzeug-Aufruf, gibt es keine Antwort und keine Ausführung danach", async () => {
    const s = setup(2);
    const call = await s.request();
    const answered = await caught(s.answer(call));
    expect(isGateDenied(answered)).toBe(true);
    if (!isGateDenied(answered)) return;
    // Die Aktion gibt es in der aktuellen Fassung nicht: Eingabe ungültig, abgelehnt.
    expect(answered.outcome).toBe("deny");
    expect(answered.decision).toMatchObject({ matchedRules: [], preconditions: [] });
    expect(answered.code).toBe("abgelehnt");
    expect(call.approval).toBeUndefined();

    const executed = await caught(s.execute(call));
    expect(isGateDenied(executed)).toBe(true);
    if (!isGateDenied(executed)) return;
    expect(executed.outcome).toBe("deny");
    expect(executed.decision.matchedRules).toEqual([]);
    expect(s.toolRuns()).toBe(0);

    // Auch abgelehnte Aktionen haben je zwei Belege, alle mit der aktuellen Fassung.
    const perAction = receiptsPerAction(s.entries);
    expect(perAction.size).toBe(3);
    for (const kinds of perAction.values()) expect(kinds).toEqual(["decision", "result"]);
    for (const entry of s.entries) {
      if (entry.kind === "decision") expect(entry.record.decision.gateFormat).toBe(2);
    }
  });
});

describe("Fassung 1: Freigabe und Ausführung eines wartenden Werkzeug-Aufrufs", () => {
  it("Ablauf: fragen → Freigabe erteilen → genau eine Ausführung, je Aktion zwei Belege", async () => {
    const s = setup();
    const call = await s.request();
    const answered = await s.answer(call);
    expect(answered.decision.outcome).toBe("allow");
    expect(answered.decision.preconditions).toEqual([
      { name: "freigabe_wartet", result: "ok" },
      { name: "freigabe_passt", result: "ok" },
    ]);
    expect(call.status).toBe("approved");

    const run = await s.execute(call);
    expect(run.value).toBe("gespeichert");
    expect(s.toolRuns()).toBe(1);
    const r007 = UNSTORED_STANDARD_RULE_VERSIONS.find((rule) => rule.id === "R-007");
    if (r007 === undefined) throw new Error("R-007 fehlt");
    expect(run.decision).toMatchObject({
      outcome: "allow",
      stage: "execute",
      matchedRules: [{ id: "R-007", version: 1, hash: await hashRule(r007) }],
      preconditions: [{ name: "lauf_laeuft", result: "ok" }],
    });

    const perAction = receiptsPerAction(s.entries);
    expect(perAction.size).toBe(3);
    for (const kinds of perAction.values()) expect(kinds).toEqual(["decision", "result"]);
    const types = s.entries.filter((e) => e.kind === "decision").map((e) => e.record.action.type);
    expect(types).toEqual(["werkzeug.aufrufen", "werkzeug.freigeben", "werkzeug.ausfuehren"]);
    // Die Ausführung verweist auf den wartenden Aufruf und auf die Freigabe.
    const last = s.entries.at(-2)?.record.action as ActionRequest<"werkzeug.ausfuehren">;
    expect(last.target.toolCallId).toBe(call.toolCallId);
    expect(last.target.approvalId).toBe(call.approval?.approvalId);
    expect(last.actionId).not.toBe(call.toolCallId);
  });

  it("verbrauchte Freigabe gilt nicht: der zweite Versuch wird abgelehnt, nichts läuft", async () => {
    const s = setup();
    const call = await s.request();
    await s.answer(call);
    await s.execute(call);
    const error = await caught(s.execute(call));
    expect(isGateDenied(error)).toBe(true);
    if (!isGateDenied(error)) return;
    expect(error.outcome).toBe("deny");
    expect(error.code).toBe("abgelehnt");
    expect(error.decision.matchedRules.map((rule) => rule.id)).toEqual(["R-008"]);
    expect(s.toolRuns()).toBe(1);
  });

  it("Freigabe für einen anderen Abdruck gilt nicht", async () => {
    const s = setup();
    const call = await s.request();
    await s.answer(call);
    // Die Argumente des Aufrufs sind andere als die, für die freigegeben wurde.
    const error = await caught(s.execute(call, { argsDigest: OTHER_DIGEST }));
    expect(isGateDenied(error) && error.decision.matchedRules[0]?.id).toBe("R-008");
    expect(s.toolRuns()).toBe(0);
  });

  it("Freigabe zu einer anderen Freigabe-Kennung gilt nicht", async () => {
    const s = setup();
    const call = await s.request();
    await s.answer(call);
    const error = await caught(s.execute(call, { approvalId: newId("action") }));
    expect(isGateDenied(error) && error.decision.matchedRules[0]?.id).toBe("R-008");
    expect(s.toolRuns()).toBe(0);
  });

  it("abgelaufene Freigabe gilt nicht", async () => {
    const s = setup();
    const call = await s.request();
    await s.answer(call);
    if (call.approval) call.approval.expired = true;
    const error = await caught(s.execute(call));
    expect(isGateDenied(error) && error.decision.matchedRules[0]?.id).toBe("R-008");
    expect(s.toolRuns()).toBe(0);
  });

  it("abgelehnte Freigabe erlaubt keine Ausführung", async () => {
    const s = setup();
    const call = await s.request();
    const answered = await s.answer(call, { answer: "ablehnen" });
    expect(answered.decision.outcome).toBe("allow");
    expect(call.status).toBe("denied");
    const error = await caught(s.execute(call));
    expect(isGateDenied(error) && error.code).toBe("abgelehnt");
    expect(s.toolRuns()).toBe(0);
  });

  it("ohne jede Freigabe: die Ausführung wird abgelehnt", async () => {
    const s = setup();
    const call = await s.request();
    const error = await caught(s.execute(call));
    expect(isGateDenied(error) && error.decision.matchedRules[0]?.id).toBe("R-008");
    expect(s.toolRuns()).toBe(0);
  });

  it("Antwort auf einen Aufruf, der nicht (mehr) wartet: V-08, nicht_gefunden", async () => {
    const s = setup();
    const call = await s.request();
    await s.answer(call);
    const again = await caught(s.answer(call));
    expect(isGateDenied(again) && again.code).toBe("nicht_gefunden");

    const expired = await s.request();
    expired.waitExpired = true;
    const late = await caught(s.answer(expired));
    expect(isGateDenied(late)).toBe(true);
    if (!isGateDenied(late)) return;
    expect(late.code).toBe("nicht_gefunden");
    expect(late.decision.preconditions).toContainEqual({
      name: "freigabe_wartet",
      result: "verletzt",
    });
    expect(expired.approval).toBeUndefined();
  });

  it("Antwort für einen anderen Abdruck als den gespeicherten: V-09, abgelehnt", async () => {
    const s = setup();
    const call = await s.request();
    const error = await caught(s.answer(call, { seenDigest: OTHER_DIGEST }));
    expect(isGateDenied(error)).toBe(true);
    if (!isGateDenied(error)) return;
    expect(denialCode(error.decision)).toBe("abgelehnt");
    expect(error.decision.preconditions).toContainEqual({
      name: "freigabe_passt",
      result: "verletzt",
    });
    expect(call.approval).toBeUndefined();
  });

  it("die Freigabe gilt nur mit Sitzung, nicht mit Passwort (R-006)", async () => {
    const s = setup();
    const call = await s.request();
    const error = await caught(s.answer(call, { credential: "passwort" }));
    expect(isGateDenied(error) && error.decision.matchedRules[0]?.id).toBe("R-006");
    expect(call.approval).toBeUndefined();
  });

  it("der Not-Aus gilt auch für die Ausführung nach Freigabe", async () => {
    const s = setup();
    const call = await s.request();
    await s.answer(call);
    const error = await caught(s.execute(call, { killSwitch: true }));
    expect(isGateDenied(error)).toBe(true);
    if (!isGateDenied(error)) return;
    expect(error.decision.limits).toContainEqual(
      expect.objectContaining({ name: "not_aus", result: "verletzt" }),
    );
    expect(s.toolRuns()).toBe(0);
    expect(call.approval?.consumed).toBe(false);
  });
});

describe("Regeln der Freigabe als Standard-Regeln", () => {
  it("R-007 und R-008 gelten als Standard-Regeln aus dem Code", async () => {
    const snapshot = await ruleSnapshot(RULES);
    await expect(verifyRuleSnapshot(snapshot)).resolves.toBe(snapshot);
  });

  it("eine veränderte R-007 in der Quelle zählt nie", async () => {
    const changed = RULES.map((rule) =>
      rule.id === "R-007" ? { ...rule, conditions: rule.conditions.slice(0, 2) } : rule,
    );
    await expect(verifyRuleSnapshot(await ruleSnapshot(changed))).rejects.toMatchObject({
      code: "intern",
    });
  });
});
