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
import { t } from "@paibot/shared/texte";
import {
  ACTIVE_STANDARD_RULES,
  GATE_FORMAT,
  type GatePermit,
  type RuleDefinition,
  type RuleSnapshot,
} from "@paibot/shared/tor";
import { describe, expect, it, vi } from "vitest";
import {
  createGate,
  type DecisionRecord,
  type DeniedToolCall,
  type Execute,
  GateDenied,
  type GatePorts,
  isGateDenied,
  type ReceiptRef,
  type ResultRecord,
  type RuleProvider,
  type RuleSnapshotProvider,
} from "./gate";
import { isGatePermit } from "./permit";
import { ruleSnapshot } from "./regel-hash";
import { DECIDED_ACTIONS as ACTION_TYPES, sampleAction, sampleFacts } from "./testdaten";

/** Aktionen, die die Standard-Regeln mit den Beispiel-Fakten erlauben. */
/**
 * Mit den gespeicherten Standard-Regeln erlaubt: jede Aktion der aktuellen Fassung außer dem
 * Werkzeug-Aufruf (R-005 fragt). Die Freigabe-Aktionen kennt die aktuelle Fassung nicht (Tests
 * dazu in `freigabe.test.ts`).
 */
const ALLOWED_BY_DEFAULT = ACTION_TYPES.filter((type) => type !== "werkzeug.aufrufen");

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
function memoryPorts(
  options: {
    rules?: readonly RuleDefinition[];
    snapshot?: RuleSnapshot;
    failDecision?: boolean;
  } = {},
) {
  const log: string[] = [];
  const entries: Entry[] = [];
  let seq = 1;
  let tick = 0;
  const rules: RuleSnapshotProvider = {
    load: async () => {
      log.push("rules");
      return options.snapshot ?? ruleSnapshot(options.rules ?? ACTIVE_STANDARD_RULES);
    },
  };
  const ports: GatePorts & { rules: RuleSnapshotProvider } = {
    rules,
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
  it.each(ALLOWED_BY_DEFAULT)(
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
      expect(dec(entries)?.decision).toEqual({ ...result.decision, gateFormat: GATE_FORMAT });
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
          ...ACTIVE_STANDARD_RULES[0],
          id: "R-110",
          source: "owner",
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
      expect({ ...denied.decision, gateFormat: GATE_FORMAT }).toEqual(dec(entries)?.decision);
      expect(denied.receipts).toEqual({ decision: entries[0]?.ref, result: entries[1]?.ref });
      expect(res(entries)?.result).toEqual({ status: "denied", code });
    },
  );

  it("fragen: der Fehler trägt Entscheidung, Stufe und Belege", async () => {
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
    // Eigener Code mit festem Text und Ausweg; der Grund des Tors steht im Beleg.
    expect((error as GateDenied).code).toBe("angehalten");
    expect((error as GateDenied).text).toBeUndefined();
    expect((error as GateDenied).decision.reason).toContain("G-05");
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
    ports.rules.load = async () => {
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
      {
        outcome: "deny",
        stage: "execute",
        matchedRules: [],
        limits: [],
        preconditions: [],
        ruleStand: 1,
        reason: "Nein.",
      },
      { decision: ref, result: ref },
      { actionId: newId("action"), type: "anbieter.loeschen" },
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

describe("Regelstand: geprüft, bevor entschieden wird", () => {
  async function runWith(snapshot: RuleSnapshot) {
    const { ports, log, entries } = memoryPorts({ snapshot });
    const execute = vi.fn();
    const error = await caught(
      createGate(ports).run(
        sampleAction("zugang.abmelden"),
        sampleFacts("zugang.abmelden"),
        execute,
      ),
    );
    return { error: error as PaiBotError, log, entries, execute };
  }

  it("der Beleg „Entscheidung“ trägt Prüfsumme, Stand und Vorbedingungen", async () => {
    const { ports, log, entries } = memoryPorts();
    const result = await createGate(ports).run(
      sampleAction("nachricht.senden"),
      sampleFacts("nachricht.senden"),
      okExecute(log),
    );
    // Ohne Angabe ist der Stand die Zahl der Regeln im Schnappschuss (die aktiven Standard-Regeln).
    const stand = ACTIVE_STANDARD_RULES.length;
    const snapshot = await ruleSnapshot(ACTIVE_STANDARD_RULES, stand);
    const r001 = snapshot.rules.find((rule) => rule.id === "R-001");
    expect(dec(entries)?.decision).toEqual({ ...result.decision, gateFormat: GATE_FORMAT });
    expect(result.decision).toMatchObject({
      outcome: "allow",
      matchedRules: [{ id: "R-001", version: 1, hash: r001?.hash }],
      ruleStand: stand,
      preconditions: [
        { name: "unterhaltung_vorhanden", result: "ok" },
        { name: "kein_lauf_aktiv", result: "ok" },
      ],
    });
  });

  it("Standard-Regel in der Datenbank verändert (gleiche Fassung) → intern, nichts belegt", async () => {
    const tampered = ACTIVE_STANDARD_RULES.map((rule) =>
      rule.id === "R-999" ? { ...rule, effect: "allow" as const, stage: "execute" as const } : rule,
    );
    const { error, log, entries, execute } = await runWith(await ruleSnapshot(tampered, 7));
    expect(error.code).toBe("intern");
    expect(log).toEqual(["rules"]);
    expect(entries).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("eigene Regeln (reg_…) brauchen keine Fassung im Code, kommen aber nach den Standard-Regeln", async () => {
    const own = {
      ...ACTIVE_STANDARD_RULES[0],
      id: newId("rule"),
      source: "owner" as const,
      effect: "deny" as const,
      priority: 1000,
    };
    const { ports, log } = memoryPorts({ rules: [...ACTIVE_STANDARD_RULES, own] });
    const result = await createGate(ports).run(
      sampleAction("zugang.abmelden"),
      sampleFacts("zugang.abmelden"),
      okExecute(log),
    );
    expect(result.decision.matchedRules[0]?.id).toBe("R-001");
  });

  const r006 = ACTIVE_STANDARD_RULES.find((rule) => rule.id === "R-006");
  const own = (fields: Partial<RuleDefinition>): RuleDefinition => ({
    ...ACTIVE_STANDARD_RULES[0],
    id: newId("rule"),
    source: "owner",
    priority: 1000,
    conditions: [],
    ...fields,
  });

  it.each([
    [
      "eine Standard-Regel fehlt (z. B. von einer abgeschalteten höheren Fassung verdeckt)",
      ACTIVE_STANDARD_RULES.filter((rule) => rule.id !== "R-006"),
    ],
    [
      "eine Standard-Kennung mit anderer Quelle",
      [
        ...ACTIVE_STANDARD_RULES.filter((rule) => rule.id !== "R-006"),
        { ...(r006 as RuleDefinition), version: 2, source: "owner" as const },
      ],
    ],
    [
      "eine unbekannte Standard-Kennung",
      [...ACTIVE_STANDARD_RULES, { ...ACTIVE_STANDARD_RULES[0], id: "R-777" }],
    ],
    [
      "eine bekannte, aber nicht aktuelle Fassung",
      [
        ...ACTIVE_STANDARD_RULES.filter((rule) => rule.id !== "R-001"),
        { ...ACTIVE_STANDARD_RULES[0], version: 2 },
      ],
    ],
    ["eine eigene Regel vor den Standard-Regeln", [...ACTIVE_STANDARD_RULES, own({ priority: 1 })]],
    [
      "eine eigene Regel hinter der Auffang-Regel",
      [...ACTIVE_STANDARD_RULES, own({ priority: 1_000_000 })],
    ],
    [
      "eine eigene Regel mit lesbarer Kennung",
      [...ACTIVE_STANDARD_RULES, own({ id: "R-120" as RuleDefinition["id"] })],
    ],
    ["ein eingeschalteter Vorschlag", [...ACTIVE_STANDARD_RULES, own({ source: "proposal" })]],
    [
      "eine Standard-Kennung mit anderer Quelle, auch ohne Standard-Regeln",
      [{ ...ACTIVE_STANDARD_RULES[0], source: "owner" as const }],
    ],
    ["zweimal dieselbe Kennung", [...ACTIVE_STANDARD_RULES, ACTIVE_STANDARD_RULES[0]]],
  ] as const)("%s → intern, nichts belegt", async (_label, rules) => {
    const { error, entries, execute } = await runWith(
      await ruleSnapshot(rules as readonly RuleDefinition[], 30),
    );
    expect(error.code).toBe("intern");
    expect(entries).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("unbekannte Quelle → intern, keine stille Annahme", async () => {
    const snapshot = await ruleSnapshot(ACTIVE_STANDARD_RULES, 7);
    const changed = {
      ...snapshot,
      rules: [
        ...snapshot.rules,
        { ...own({}), source: "fremd", hash: snapshot.rules[0]?.hash, seq: 7 },
      ],
    } as unknown as RuleSnapshot;
    const { error, entries } = await runWith(changed);
    expect(error.code).toBe("intern");
    expect(entries).toEqual([]);
  });

  it("ausgeschaltete Vorschläge zählen nie", async () => {
    const proposal = own({ source: "proposal", enabled: false, effect: "deny", action: "*" });
    const { ports, log } = memoryPorts({ rules: [...ACTIVE_STANDARD_RULES, proposal] });
    const result = await createGate(ports).run(
      sampleAction("zugang.abmelden"),
      sampleFacts("zugang.abmelden"),
      okExecute(log),
    );
    expect(result.decision.matchedRules.map((rule) => rule.id)).toEqual(["R-001"]);
  });

  it.each([
    [
      "Prüfsumme passt nicht zum Inhalt",
      (s: RuleSnapshot) => ({
        ...s,
        rules: s.rules.map((r, i) => (i === 0 ? { ...r, hash: `sha256:${"0".repeat(64)}` } : r)),
      }),
    ],
    [
      "Inhalt nach dem Hashen geändert",
      (s: RuleSnapshot) => ({
        ...s,
        rules: s.rules.map((r) => (r.id === "R-001" ? { ...r, priority: 1 } : r)),
      }),
    ],
    [
      "Nummer größer als der Stand",
      (s: RuleSnapshot) => ({
        ...s,
        rules: s.rules.map((r, i) => (i === 0 ? { ...r, seq: 99 } : r)),
      }),
    ],
    ["Stand fehlt", (s: RuleSnapshot) => ({ ...s, stand: 0 })],
    [
      "Inhalt ungültig",
      (s: RuleSnapshot) => ({
        ...s,
        rules: s.rules.map((r, i) => (i === 0 ? { ...r, effect: "vielleicht" } : r)),
      }),
    ],
  ] as const)("%s → intern, nichts belegt", async (_label, change) => {
    const snapshot = change(await ruleSnapshot(ACTIVE_STANDARD_RULES, 7)) as RuleSnapshot;
    const { error, entries, execute } = await runWith(snapshot);
    expect(error.code).toBe("intern");
    expect(entries).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("eine Regel-Quelle ohne Regelstand (nur eine Liste) wird nicht angenommen", async () => {
    const receipts = memoryPorts().ports.receipts;
    const clock = { now: () => new Date(Date.UTC(2026, 10, 20)) };
    const legacy = { listActive: async () => ACTIVE_STANDARD_RULES } as unknown as RuleProvider;
    const error = await caught(
      createGate({ rules: legacy, receipts, clock }).run(
        sampleAction("zugang.abmelden"),
        sampleFacts("zugang.abmelden"),
        async () => ({ value: 1, result: { status: "ok" } }),
      ),
    );
    expect((error as PaiBotError).code).toBe("intern");
  });

  it("jede Entscheidung trägt Regelstand und Prüfsumme der Regel", async () => {
    const { ports, log } = memoryPorts();
    const result = await createGate(ports).run(
      sampleAction("zugang.abmelden"),
      sampleFacts("zugang.abmelden"),
      okExecute(log),
    );
    expect(result.decision.ruleStand).toBeGreaterThan(0);
    expect(result.decision.matchedRules[0]?.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("Vorbedingungen in gate.run", () => {
  it("Nachricht bei aktivem Lauf: nichts ausgeführt, Code lauf_aktiv in Fehler und Beleg", async () => {
    const { ports, log, entries } = memoryPorts();
    const facts = { ...sampleFacts("nachricht.senden"), runActive: true };
    const error = (await caught(
      createGate(ports).run(sampleAction("nachricht.senden"), facts, okExecute(log)),
    )) as GateDenied;
    expect(log).toEqual(["rules", "decision", "result:denied"]);
    expect(error.code).toBe("lauf_aktiv");
    expect(error.status).toBe(409);
    expect(res(entries)?.result).toEqual({ status: "denied", code: "lauf_aktiv" });
    expect(dec(entries)?.decision.preconditions).toContainEqual({
      name: "kein_lauf_aktiv",
      result: "verletzt",
    });
  });
});

describe("werkzeug.aufrufen", () => {
  const ARGS = { notiz: "Geheimes Rezept für Linsensuppe", id: 4711 };

  it("Standard: fragen – nichts ausgeführt, als Werkzeug-Aufruf abgelehnt (freigabe_noetig)", async () => {
    const { ports, log, entries } = memoryPorts();
    const action = sampleAction("werkzeug.aufrufen");
    const execute = vi.fn();
    const error = (await caught(
      createGate(ports).run(action, sampleFacts("werkzeug.aufrufen"), execute),
    )) as GateDenied;
    expect(execute).not.toHaveBeenCalled();
    expect(log).toEqual(["rules", "decision", "result:denied"]);
    expect(error.outcome).toBe("ask");
    expect(error.waitsForApproval).toBe(true);
    expect(error.actionId).toBe(action.actionId);
    expect(error.action).toBe("werkzeug.aufrufen");
    expect(error.decision.matchedRules).toMatchObject([{ id: "R-005", version: 1 }]);
    // In dieser Fassung gibt es keine Freigabe: „fragen“ ist abgelehnt, mit beiden Belegen.
    expect(error.toolCallDecision()).toEqual({
      outcome: "deny",
      actionId: action.actionId,
      decisionReceiptId: entries[0]?.ref.receiptId,
      resultReceiptId: entries[1]?.ref.receiptId,
      output: t("werkzeug.huelle.freigabe_noetig"),
      errorCode: "freigabe_noetig",
    });
    expect(res(entries)?.result).toEqual({ status: "denied", code: "regel_fehlt" });
  });

  it("der Typ kennt keinen wartenden Aufruf", () => {
    const decision: DeniedToolCall = {
      outcome: "deny",
      actionId: newId("action"),
      decisionReceiptId: newId("receipt"),
      resultReceiptId: newId("receipt"),
      output: "x",
      errorCode: "freigabe_noetig",
    };
    expect(decision.outcome).toBe("deny");
    const wartet: DeniedToolCall = {
      // @ts-expect-error In dieser Fassung gibt es keine Variante „wartet“.
      outcome: "ask",
      actionId: newId("action"),
      decisionReceiptId: newId("receipt"),
    };
    expect(wartet.outcome).toBe("ask");
  });

  it("abgelehnt: Angaben für den gespeicherten Aufruf mit beiden Belegen, Grund und Code", async () => {
    const { ports, entries } = memoryPorts();
    const action = sampleAction("werkzeug.aufrufen");
    const facts = { ...sampleFacts("werkzeug.aufrufen"), runRunning: false };
    const error = (await caught(createGate(ports).run(action, facts, vi.fn()))) as GateDenied;
    expect(error.waitsForApproval).toBe(false);
    expect(error.toolCallDecision()).toEqual({
      outcome: "deny",
      actionId: action.actionId,
      decisionReceiptId: entries[0]?.ref.receiptId,
      resultReceiptId: entries[1]?.ref.receiptId,
      output: error.decision.reason,
      errorCode: "nicht_gefunden",
    });
  });

  it("erlaubt durch eigene Regel: ausgeführt; der Beleg kennt nur den Abdruck der Argumente", async () => {
    const allow: RuleDefinition = {
      ...ACTIVE_STANDARD_RULES[0],
      id: newId("rule"),
      action: "werkzeug.aufrufen",
      source: "owner",
      priority: 1000,
      conditions: [{ fact: "akteur", op: "eq", value: "bot" }],
    };
    // Nur in Tests: ein Regelstand ohne Standard-Regeln (die Datenbank liefert ihn nie).
    const { ports, log, entries } = memoryPorts({ rules: [allow] });
    const facts = sampleFacts("werkzeug.aufrufen");
    const result = await createGate(ports).run(
      sampleAction("werkzeug.aufrufen"),
      facts,
      async () => {
        log.push("execute");
        return { value: ARGS, result: { status: "ok" } };
      },
    );
    expect(result.value).toEqual(ARGS);
    expect(log).toEqual(["rules", "decision", "execute", "result:ok"]);
    expect(dec(entries)?.facts).toEqual(facts);
    expect(dec(entries)?.facts).toHaveProperty("argsDigest", facts.argsDigest);
    const written = JSON.stringify(entries.map((e) => e.record));
    expect(written).not.toContain(ARGS.notiz);
    expect(written).not.toContain("4711");
  });

  it("Argumente in den Fakten → eingabe_ungueltig, kein Beleg", async () => {
    const { ports, entries } = memoryPorts();
    const facts = {
      ...sampleFacts("werkzeug.aufrufen"),
      args: ARGS,
    } as unknown as Facts<"werkzeug.aufrufen">;
    const error = await caught(
      createGate(ports).run(sampleAction("werkzeug.aufrufen"), facts, vi.fn()),
    );
    expect((error as PaiBotError).code).toBe("eingabe_ungueltig");
    expect(entries).toEqual([]);
  });
});

describe("Ziel der Modell-Anfrage in der Berechtigung", () => {
  it("die Berechtigung trägt Ziel-Origin und Ziel-Abdruck unveränderlich", async () => {
    const { ports } = memoryPorts();
    const facts = { ...sampleFacts("modell.anfragen") } as Facts<"modell.anfragen">;
    const { targetOrigin, targetDigest } = facts;
    expect(targetOrigin).toBeDefined();
    expect(targetDigest).toBeDefined();
    await createGate(ports).run(sampleAction("modell.anfragen"), facts, async (permit) => {
      // Spätere Änderungen am Objekt des Aufrufers erreichen die Berechtigung nicht.
      (facts as { targetDigest?: string }).targetDigest = `sha256:${"1".repeat(64)}`;
      expect(permit.facts.targetDigest).toBe(targetDigest);
      expect(permit.facts.targetOrigin).toBe(targetOrigin);
      expect(Object.isFrozen(permit.facts)).toBe(true);
      expect(() => {
        (permit.facts as { targetDigest?: string }).targetDigest = `sha256:${"2".repeat(64)}`;
      }).toThrow(TypeError);
      expect(() => {
        (permit.facts as { targetOrigin?: string }).targetOrigin = "https://anderswo.example";
      }).toThrow(TypeError);
      expect(() => {
        delete (permit.facts as { targetDigest?: string }).targetDigest;
      }).toThrow(TypeError);
      expect(() => Object.defineProperty(permit.facts, "targetDigest", { value: "x" })).toThrow(
        TypeError,
      );
      // Eine Kopie mit anderem Ziel ist keine Berechtigung.
      const copy = {
        ...permit,
        facts: { ...permit.facts, targetOrigin: "https://anderswo.example" },
      };
      expect(isGatePermit(copy)).toBe(false);
      expect(permit.facts.targetDigest).toBe(targetDigest);
      return { value: 1, result: { status: "ok" } };
    });
  });
});

describe("dieselbe Aktion zweimal gleichzeitig", () => {
  it("die zweite wird ohne Beleg und ohne Ausführung abgewiesen", async () => {
    const { ports, entries } = memoryPorts();
    const gate = createGate(ports);
    const action = sampleAction("zugang.abmelden");
    let executions = 0;
    let release: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = async () => {
      executions++;
      await waiting;
      return { value: 1, result: { status: "ok" as const } };
    };
    const first = gate.run(action, sampleFacts("zugang.abmelden"), execute);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await caught(gate.run(action, sampleFacts("zugang.abmelden"), execute));
    release();
    await first;
    expect((second as PaiBotError).code).toBe("intern");
    expect(executions).toBe(1);
    expect(entries.map((e) => e.kind)).toEqual(["decision", "result"]);
  });
});

describe("Fassung des Tors", () => {
  it("gibt dem Schreiber die Entscheidung mit gateFormat = GATE_FORMAT", async () => {
    const { ports, log, entries } = memoryPorts();
    const action = sampleAction("nachricht.senden");
    await createGate(ports).run(action, sampleFacts("nachricht.senden"), okExecute(log));
    expect(GATE_FORMAT).toBe(2);
    expect(dec(entries)?.decision.gateFormat).toBe(GATE_FORMAT);
  });

  it("gate.run hat keine Option für die Fassung", async () => {
    const { ports, log } = memoryPorts();
    const gate = createGate(ports);
    const action = sampleAction("nachricht.senden");
    const facts = sampleFacts("nachricht.senden");
    // @ts-expect-error Die Fassung wählt nur das Nachrechnen, nie das Tor.
    await gate.run(action, facts, okExecute(log), { format: 1 });
    // @ts-expect-error Auch nicht unter dem Namen im Beleg.
    await gate.run(action, facts, okExecute(log), { gateFormat: 1 });
  });
});
