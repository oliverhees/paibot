/**
 * PaiBot – Tests für `gate.run`: Reihenfolge der Belege, Ausführung nur bei Erlaubnis,
 * Berechtigungen und Fehlerfälle.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ActionRequest, ActionType, Facts } from "@paibot/shared/aktionen";
import { PaiBotError } from "@paibot/shared/fehler";
import { newId } from "@paibot/shared/ids";
import { type GatePermit, type RuleDefinition, STANDARD_RULES } from "@paibot/shared/tor";
import { describe, expect, it, vi } from "vitest";
import {
  createGate,
  type DecisionRecord,
  type Execute,
  GateDenied,
  type GatePorts,
  isGateDenied,
  type ReceiptRef,
  type ResultRecord,
} from "./gate";
import { isGatePermit } from "./permit";
import { ACTION_TYPES, sampleAction, sampleFacts } from "./testdaten";

type Entry =
  | { kind: "decision"; record: DecisionRecord; ref: ReceiptRef }
  | { kind: "result"; record: ResultRecord; ref: ReceiptRef };

function dec(entries: readonly Entry[], index = 0): DecisionRecord | undefined {
  const entry = entries[index];
  return entry?.kind === "decision" ? entry.record : undefined;
}

function res(entries: readonly Entry[], index = 1): ResultRecord | undefined {
  const entry = entries[index];
  return entry?.kind === "result" ? entry.record : undefined;
}

/** Beleg-Schreiber im Speicher, der jeden Schritt in ein gemeinsames Protokoll schreibt. */
function memoryPorts(options: { rules?: readonly RuleDefinition[]; failDecision?: boolean } = {}) {
  const log: string[] = [];
  const entries: Entry[] = [];
  let seq = 1;
  let tick = 0;
  const ports: GatePorts = {
    rules: {
      listActive: async () => {
        log.push("rules");
        return options.rules ?? STANDARD_RULES;
      },
    },
    receipts: {
      appendDecision: async (record) => {
        if (options.failDecision) {
          log.push("decision-failed");
          throw new Error("Speicher voll");
        }
        seq += 1;
        const ref = { receiptId: newId("receipt"), seq };
        entries.push({ kind: "decision", record, ref });
        log.push("decision");
        return ref;
      },
      appendResult: async (record) => {
        seq += 1;
        const ref = { receiptId: newId("receipt"), seq };
        entries.push({ kind: "result", record, ref });
        log.push(`result:${record.result.status}`);
        return ref;
      },
    },
    clock: {
      now: () => {
        tick += 1;
        return new Date(Date.UTC(2026, 10, 20, 10, 0, 0, tick));
      },
    },
  };
  return { ports, log, entries };
}

function okExecute<T extends ActionType>(log: string[], value = "fertig"): Execute<T, string> {
  return async () => {
    log.push("execute");
    return { value, result: { status: "ok" } };
  };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("kein Fehler geworfen");
}

describe("erlaubte Aktion", () => {
  it.each(ACTION_TYPES)(
    "%s: Entscheidung, Ausführung, Ergebnis – genau zwei Belege",
    async (type) => {
      const { ports, log, entries } = memoryPorts();
      const action = sampleAction(type);
      const facts = sampleFacts(type);
      const result = await createGate(ports).run(action, facts, okExecute(log));
      expect(log).toEqual(["rules", "decision", "execute", "result:ok"]);
      expect(result.value).toBe("fertig");
      expect(result.decision.outcome).toBe("allow");
      expect(entries).toHaveLength(2);
      const [decision, outcome] = entries;
      expect(decision?.record.action.actionId).toBe(action.actionId);
      expect(outcome?.record.action.actionId).toBe(action.actionId);
      expect(dec(entries)?.facts).toEqual(facts);
      expect(dec(entries)?.decision).toEqual(result.decision);
      expect(result.receipts).toEqual({ decision: decision?.ref, result: outcome?.ref });
      expect(decision?.record.time.getTime() ?? 0).toBeLessThan(
        outcome?.record.time.getTime() ?? 0,
      );
    },
  );

  it("die Berechtigung trägt Aktion, Fakten und den Beleg der Entscheidung", async () => {
    const { ports, entries } = memoryPorts();
    const action = sampleAction("modell.anfragen");
    const facts = sampleFacts("modell.anfragen");
    let seen: GatePermit<"modell.anfragen"> | undefined;
    await createGate(ports).run(action, facts, async (permit) => {
      expect(isGatePermit(permit)).toBe(true);
      expect(isGatePermit(permit, "modell.anfragen")).toBe(true);
      expect(isGatePermit(permit, "nachricht.senden")).toBe(false);
      seen = permit;
      return { value: null, result: { status: "ok", tokens: { input: 10, output: 20 } } };
    });
    expect(seen).toMatchObject({
      actionId: action.actionId,
      action: "modell.anfragen",
      actor: action.actor,
      target: action.target,
      facts,
      decisionReceiptId: entries[0]?.ref.receiptId,
    });
    expect(seen?.issuedAt).toMatch(/^2026-11-20T10:00:00\.\d{3}Z$/);
    expect(Object.isFrozen(seen)).toBe(true);
    expect(Object.isFrozen(seen?.facts)).toBe(true);
    expect(res(entries)?.result).toEqual({ status: "ok", tokens: { input: 10, output: 20 } });
  });

  it("gibt Kontext und Rücknahme an den Beleg „Entscheidung“ weiter", async () => {
    const { ports, log, entries } = memoryPorts();
    const context = { digest: `hmac-sha256:${"ab".repeat(32)}` };
    const undo = { possible: true, hint: "Einstellung zurücksetzen auf: aus" };
    await createGate(ports).run(
      sampleAction("schleuse.umschalten"),
      sampleFacts("schleuse.umschalten"),
      okExecute(log),
      { context, undo },
    );
    expect(entries[0]?.record).toMatchObject({ context, undo });
    expect(entries[1]?.record).not.toHaveProperty("undo");
  });

  it("ohne Optionen stehen keine leeren Felder im Beleg", async () => {
    const { ports, log, entries } = memoryPorts();
    await createGate(ports).run(
      sampleAction("zugang.abmelden"),
      sampleFacts("zugang.abmelden"),
      okExecute(log),
    );
    expect(Object.keys(entries[0]?.record ?? {}).sort()).toEqual([
      "action",
      "decision",
      "facts",
      "time",
    ]);
  });
});

describe("Ausführung wirft", () => {
  it("Ergebnis-Beleg mit Fehlercode, danach der ursprüngliche Fehler", async () => {
    const { ports, log, entries } = memoryPorts();
    const boom = new PaiBotError("anbieter_nicht_erreichbar");
    const error = await caught(
      createGate(ports).run(
        sampleAction("modell.anfragen"),
        sampleFacts("modell.anfragen"),
        async () => {
          log.push("execute");
          throw boom;
        },
      ),
    );
    expect(error).toBe(boom);
    expect(log).toEqual(["rules", "decision", "execute", "result:error"]);
    expect(res(entries)?.result).toEqual({
      status: "error",
      code: "anbieter_nicht_erreichbar",
    });
  });

  it("unbekannter Fehler → Code intern", async () => {
    const { ports, entries } = memoryPorts();
    const boom = new TypeError("kaputt");
    const error = await caught(
      createGate(ports).run(sampleAction("bot.aendern"), sampleFacts("bot.aendern"), async () => {
        throw boom;
      }),
    );
    expect(error).toBe(boom);
    expect(res(entries)?.result).toEqual({ status: "error", code: "intern" });
  });

  it("Abbruch → Ergebnis abgebrochen", async () => {
    const { ports, entries } = memoryPorts();
    const controller = new AbortController();
    controller.abort();
    const error = await caught(
      createGate(ports).run(
        sampleAction("modell.anfragen"),
        sampleFacts("modell.anfragen"),
        async () => {
          controller.signal.throwIfAborted();
          return { value: 1, result: { status: "ok" } };
        },
      ),
    );
    expect((error as Error).name).toBe("AbortError");
    expect(res(entries)?.result).toEqual({ status: "cancelled" });
  });

  it("synchron geworfener Fehler wird ebenso belegt", async () => {
    const { ports, log } = memoryPorts();
    const execute = (() => {
      throw new Error("sofort");
    }) as unknown as Execute<"zugang.abmelden", never>;
    await caught(
      createGate(ports).run(
        sampleAction("zugang.abmelden"),
        sampleFacts("zugang.abmelden"),
        execute,
      ),
    );
    expect(log).toEqual(["rules", "decision", "result:error"]);
  });
});

describe("nicht erlaubte Aktion", () => {
  it.each([
    ["deny", "abgelehnt"],
    ["ask", "regel_fehlt"],
    ["prepare", "regel_fehlt"],
  ] as const)(
    "%s: Ausführung nie aufgerufen, Ergebnis-Beleg denied, GateDenied",
    async (outcome, code) => {
      const rules: RuleDefinition[] = [
        {
          ...STANDARD_RULES[0],
          id: "R-010",
          priority: 1,
          effect: outcome === "deny" ? "deny" : outcome === "ask" ? "ask" : "allow",
          stage: outcome === "prepare" ? "prepare" : "ask",
          conditions: [],
          reason: "Testgrund.",
        },
      ];
      const { ports, log, entries } = memoryPorts({ rules });
      const execute = vi.fn();
      const error = await caught(
        createGate(ports).run(
          sampleAction("anbieter.loeschen"),
          sampleFacts("anbieter.loeschen"),
          execute,
        ),
      );
      expect(execute).not.toHaveBeenCalled();
      expect(log).toEqual(["rules", "decision", "result:denied"]);
      expect(isGateDenied(error)).toBe(true);
      const denied = error as GateDenied;
      expect(denied.code).toBe(code);
      expect(denied.outcome).toBe(outcome);
      expect(denied.text).toBe("Testgrund.");
      expect(denied.decision).toEqual(dec(entries)?.decision);
      expect(denied.receipts).toEqual({ decision: entries[0]?.ref, result: entries[1]?.ref });
      expect(res(entries)?.result).toEqual({ status: "denied", code });
    },
  );

  it("fragen: der Fehler trägt den Zustand zum Warten (Entscheidung, Stufe, Belege)", async () => {
    const { ports, entries } = memoryPorts();
    const facts = { ...sampleFacts("modell.anfragen"), botOfConversation: false };
    const error = (await caught(
      createGate(ports).run(sampleAction("modell.anfragen"), facts, vi.fn()),
    )) as GateDenied;
    expect(error.outcome).toBe("ask");
    expect(error.decision).toMatchObject({ outcome: "ask", stage: "ask" });
    expect(error.receipts.decision).toEqual(entries[0]?.ref);
    expect(error.text).toBe("Dafür gibt es noch keine Regel.");
  });

  it("Not-Aus: Bot-Anfrage abgelehnt, nichts ausgeführt", async () => {
    const { ports, entries } = memoryPorts();
    const execute = vi.fn();
    const facts = { ...sampleFacts("modell.anfragen"), killSwitch: true };
    const error = await caught(
      createGate(ports).run(sampleAction("modell.anfragen"), facts, execute),
    );
    expect(execute).not.toHaveBeenCalled();
    expect((error as GateDenied).code).toBe("abgelehnt");
    expect(entries.map((e) => e.kind)).toEqual(["decision", "result"]);
  });

  it("Datenschleuse gefordert, aber nicht erreichbar: abgelehnt, kein Rückfall", async () => {
    const { ports } = memoryPorts();
    const execute = vi.fn();
    const facts = { ...sampleFacts("modell.anfragen"), schleuseReachable: false };
    const error = await caught(
      createGate(ports).run(sampleAction("modell.anfragen"), facts, execute),
    );
    expect(execute).not.toHaveBeenCalled();
    expect((error as GateDenied).decision.reason).toContain("G-01");
  });
});

describe("Beleg „Entscheidung“ scheitert", () => {
  it("es wird nichts ausgeführt und kein Ergebnis geschrieben", async () => {
    const { ports, log, entries } = memoryPorts({ failDecision: true });
    const execute = vi.fn();
    const error = await caught(
      createGate(ports).run(
        sampleAction("zugang.abmelden"),
        sampleFacts("zugang.abmelden"),
        execute,
      ),
    );
    expect((error as Error).message).toBe("Speicher voll");
    expect(execute).not.toHaveBeenCalled();
    expect(log).toEqual(["rules", "decision-failed"]);
    expect(entries).toEqual([]);
  });

  it("auch eine abgelehnte Aktion bekommt dann keinen Ergebnis-Beleg", async () => {
    const { ports, log } = memoryPorts({ failDecision: true, rules: [] });
    await caught(
      createGate(ports).run(
        sampleAction("zugang.abmelden"),
        sampleFacts("zugang.abmelden"),
        vi.fn(),
      ),
    );
    expect(log).toEqual(["rules", "decision-failed"]);
  });
});

describe("ungültige Eingaben", () => {
  it("unbekannte Aktion → eingabe_ungueltig, kein Beleg, keine Ausführung", async () => {
    const { ports, log } = memoryPorts();
    const execute = vi.fn();
    const action = { ...sampleAction("zugang.abmelden"), type: "datei.loeschen" };
    const error = await caught(
      createGate(ports).run(
        action as unknown as ActionRequest<"zugang.abmelden">,
        sampleFacts("zugang.abmelden"),
        execute,
      ),
    );
    expect((error as PaiBotError).code).toBe("eingabe_ungueltig");
    expect(execute).not.toHaveBeenCalled();
    expect(log).toEqual([]);
  });

  it("Fakten passen nicht zur Aktion → eingabe_ungueltig", async () => {
    const { ports, log } = memoryPorts();
    const error = await caught(
      createGate(ports).run(
        sampleAction("nachricht.senden"),
        { credential: "sitzung" } as unknown as Facts<"nachricht.senden">,
        vi.fn(),
      ),
    );
    expect((error as PaiBotError).code).toBe("eingabe_ungueltig");
    expect(log).toEqual([]);
  });

  it("Regel-Quelle wirft → kein Beleg, keine Ausführung", async () => {
    const { ports, entries } = memoryPorts();
    ports.rules.listActive = async () => {
      throw new Error("Datenbank weg");
    };
    const execute = vi.fn();
    await caught(
      createGate(ports).run(
        sampleAction("zugang.abmelden"),
        sampleFacts("zugang.abmelden"),
        execute,
      ),
    );
    expect(execute).not.toHaveBeenCalled();
    expect(entries).toEqual([]);
  });
});

describe("Berechtigungen lassen sich nicht fälschen", () => {
  it("ein nachgebautes Objekt mit allen Feldern wird nicht anerkannt", () => {
    const action = sampleAction("modell.anfragen");
    const fake = {
      actionId: action.actionId,
      action: "modell.anfragen",
      actor: action.actor,
      target: action.target,
      facts: sampleFacts("modell.anfragen"),
      decisionReceiptId: newId("receipt"),
      issuedAt: "2026-11-20T10:00:00.000Z",
    };
    expect(isGatePermit(fake)).toBe(false);
    expect(isGatePermit(fake, "modell.anfragen")).toBe(false);
    expect(isGatePermit(Object.freeze(fake))).toBe(false);
  });

  it.each([null, undefined, 1, "permit", [], {}])("%o ist keine Berechtigung", (value) => {
    expect(isGatePermit(value)).toBe(false);
  });

  it("Kopien und abgelaufene Berechtigungen werden nicht anerkannt", async () => {
    const { ports } = memoryPorts();
    let kept: unknown;
    await createGate(ports).run(
      sampleAction("modell.anfragen"),
      sampleFacts("modell.anfragen"),
      async (permit) => {
        expect(isGatePermit({ ...permit })).toBe(false);
        expect(isGatePermit(Object.create(permit))).toBe(false);
        expect(isGatePermit(structuredClone(permit))).toBe(false);
        kept = permit;
        return { value: 1, result: { status: "ok" } };
      },
    );
    expect(isGatePermit(kept)).toBe(false);
  });

  it("auch nach einem Fehler in der Ausführung gilt die Berechtigung nicht mehr", async () => {
    const { ports } = memoryPorts();
    let kept: unknown;
    await caught(
      createGate(ports).run(
        sampleAction("modell.anfragen"),
        sampleFacts("modell.anfragen"),
        async (permit) => {
          kept = permit;
          throw new Error("x");
        },
      ),
    );
    expect(isGatePermit(kept)).toBe(false);
  });

  it("die Berechtigung lässt sich nicht verändern", async () => {
    const { ports } = memoryPorts();
    await createGate(ports).run(
      sampleAction("modell.anfragen"),
      sampleFacts("modell.anfragen"),
      async (permit) => {
        expect(() => {
          (permit.facts as { route: string }).route = "direct";
        }).toThrow(TypeError);
        return { value: 1, result: { status: "ok" } };
      },
    );
  });

  it("GateDenied ist ein PaiBotError", () => {
    const ref = { receiptId: newId("receipt"), seq: 2 };
    const denied = new GateDenied(
      { outcome: "deny", stage: "execute", matchedRules: [], limits: [], reason: "Nein." },
      { decision: ref, result: ref },
    );
    expect(denied).toBeInstanceOf(PaiBotError);
    expect(denied.code).toBe("abgelehnt");
  });
});

describe("Eingaben des Aufrufers", () => {
  it("spätere Änderungen an den Fakten ändern die Berechtigung nicht", async () => {
    const { ports } = memoryPorts();
    const facts = sampleFacts("modell.anfragen") as Facts<"modell.anfragen">;
    await createGate(ports).run(sampleAction("modell.anfragen"), facts, async (permit) => {
      (facts as { route: string }).route = "direct";
      expect(permit.facts.route).toBe("schleuse");
      return { value: 1, result: { status: "ok" } };
    });
  });
});
