/**
 * PaiBot – Belege der Tor-Fassung 2: geschrieben mit dem echten Tor, geprüft und nachgerechnet.
 * Fassung, Vorbedingungen und Deckel sind Pflicht und werden immer verglichen; Aktionen, die
 * Fassung 2 nicht kennt, und Belege ohne Fassungsangabe passen nicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createGate, type Execute, evaluate, GATE_FORMATS, ruleSnapshot } from "@paibot/gate";
import { ACTIONS, type ActionRequest, type ActionType } from "@paibot/shared/aktionen";
import { RECEIPT_CHAIN_FORMAT, type ReceiptBody, type ReceiptEntry } from "@paibot/shared/belege";
import { isPaiBotError, PaiBotError } from "@paibot/shared/fehler";
import { newId } from "@paibot/shared/ids";
import { ACTIVE_STANDARD_RULES, type RuleDefinition, type RuleSnapshot } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { sampleAction, sampleFacts } from "../../gate/src/testdaten";
import { digestBytes, hashReceipt } from "./hash";
import { decisionFormat, reevaluate } from "./nachrechnen";
import { signedEntry, TEST_INSTALLATION, type TestKey, testKey, testSign } from "./testhilfen";
import { verifyChain } from "./verify";

/** Eigene Regel für Werkzeug-Aufrufe; nur für `evaluate` (das Tor lässt sie im Betrieb nie vor R-005 kommen). */
const ERLAUBT_WERKZEUG: RuleDefinition = {
  id: "reg_01m7zempyq9rbb8ybyt536hjy0" as RuleDefinition["id"],
  version: 1,
  action: "werkzeug.aufrufen",
  effect: "allow",
  stage: "execute",
  conditions: [{ fact: "akteur", op: "eq", value: "bot" }],
  priority: 1000,
  source: "owner",
  enabled: true,
  title: "Werkzeuge erlaubt",
  reason: "Test: Werkzeuge sind erlaubt.",
};

type Roh = Record<string, unknown>;

/** Kette im Speicher mit dem echten Tor; Belege lassen sich zusätzlich roh (unverändert geprüft) anhängen. */
class Kette {
  readonly key: TestKey = testKey();
  readonly entries: ReceiptEntry[] = [];
  #tick = 0;
  snapshot: RuleSnapshot | undefined;

  time(): Date {
    return new Date(Date.UTC(2026, 10, 21, 12, 0, 0, ++this.#tick));
  }

  static async neu(rules: readonly RuleDefinition[]): Promise<Kette> {
    const kette = new Kette();
    kette.snapshot = await ruleSnapshot(rules);
    kette.entries.push(
      await signedEntry(
        {
          type: "start",
          facts: {
            installationId: TEST_INSTALLATION,
            publicKey: kette.key.publicKey,
            software: "0.3.0+dev",
            format: RECEIPT_CHAIN_FORMAT,
          },
        },
        undefined,
        kette.key,
        kette.time(),
      ),
    );
    return kette;
  }

  gate() {
    const append = async (draft: Parameters<typeof signedEntry>[0]) => {
      const entry = await signedEntry(draft, this.entries.at(-1), this.key, this.time());
      this.entries.push(entry);
      return { receiptId: entry.id, seq: entry.seq };
    };
    const snapshot = this.snapshot as RuleSnapshot;
    return createGate({
      rules: { load: async () => snapshot },
      clock: { now: () => this.time() },
      receipts: {
        appendDecision: (record) =>
          append({
            type: "decision",
            action: record.action,
            decision: record.decision,
            facts: record.facts as Record<string, unknown>,
          }),
        appendResult: (record) =>
          append({ type: "result", action: record.action, result: record.result }),
      },
    });
  }

  /** Durch das Tor; eine Ablehnung ist kein Fehler des Tests. */
  async run(type: ActionType, facts: Roh, execute: Execute<never, string> = ok): Promise<void> {
    try {
      await this.gate().run(sampleAction(type) as never, facts as never, execute);
    } catch (error) {
      if (!isPaiBotError(error)) throw error;
    }
  }

  /** Hängt einen Körper roh an (ohne Schreib-Schema), signiert mit dem Schlüssel der Kette. */
  async roh(body: Roh): Promise<ReceiptEntry> {
    const prev = this.entries.at(-1) as ReceiptEntry;
    const full = {
      ...body,
      v: 1,
      id: newId("receipt"),
      seq: prev.seq + 1,
      time: this.time().toISOString(),
      prev: prev.hash,
      keyId: this.key.keyId,
    };
    const hash = await hashReceipt(full as unknown as ReceiptBody);
    const entry = {
      seq: full.seq,
      id: full.id,
      hash,
      signature: testSign(this.key.privateKey, digestBytes(hash)),
      keyId: this.key.keyId,
      body: full as unknown as ReceiptBody,
    };
    this.entries.push(entry);
    return entry;
  }

  /** Entscheidung der Fassung 2 wie vom Tor (mit Regelstand), danach `aendern`, roh angehängt. */
  async entscheidung(
    type: ActionType,
    facts: Roh,
    aendern: (decision: Roh) => void = () => {},
  ): Promise<ReceiptEntry> {
    const action = sampleAction(type) as ActionRequest;
    const decided = evaluate(
      action,
      facts as never,
      this.snapshot as RuleSnapshot,
    ) as unknown as Roh;
    const { matchedRules, ...rest } = decided;
    const decision: Roh = { gateFormat: 2, ...rest, rules: matchedRules };
    aendern(decision);
    return this.roh({ type: "decision", action, decision, facts });
  }

  async pruefe() {
    return verifyChain(this.entries, { rules: (this.snapshot as RuleSnapshot).rules });
  }
}

const ok: Execute<never, string> = async () => ({ value: "fertig", result: { status: "ok" } });

function decisions(kette: Kette) {
  return kette.entries.filter((entry) => entry.body.type === "decision");
}

/** Regeln wie aus der Datenbank (die gespeicherten Standard-Regeln). */
const STANDARD = [...ACTIVE_STANDARD_RULES];

describe("Belege der Fassung 2 schreiben und prüfen", () => {
  it("jede neue Entscheidung trägt gateFormat 2 und Vorbedingungen, die Kette ist vertrauenswürdig", async () => {
    const kette = await Kette.neu(STANDARD);
    for (const type of ["nachricht.senden", "modell.anfragen", "werkzeug.aufrufen"] as const) {
      await kette.run(type, sampleFacts(type) as Roh);
    }
    await kette.run("modell.anfragen", sampleFacts("modell.anfragen") as Roh, async () => ({
      value: "fertig",
      result: { status: "ok", modelReported: "mistral-small-3.2", tokens: { input: 1, output: 2 } },
    }));
    expect(decisions(kette)).toHaveLength(4);
    for (const entry of decisions(kette)) {
      if (entry.body.type !== "decision") continue;
      expect(entry.body.decision.gateFormat).toBe(2);
      expect(Array.isArray(entry.body.decision.preconditions)).toBe(true);
      expect(Object.hasOwn(entry.body.decision, "caps")).toBe(
        entry.body.action.type === "werkzeug.aufrufen",
      );
      expect(decisionFormat(entry.body)).toStrictEqual({ status: "passt", format: 2 });
      expect(reevaluate(entry, (kette.snapshot as RuleSnapshot).rules).status).toBe("ok");
    }
    const report = await kette.pruefe();
    expect(report.verdict).toStrictEqual({
      level: "vertrauenswuerdig",
      findings: [],
      anchor: "fehlt",
    });
  });

  it("Entscheidung mit Fakten der Fassung 2 ohne Feld wird als Fassung 1 gelesen: unpassend, ungültig", async () => {
    const kette = await Kette.neu(STANDARD);
    await kette.entscheidung("modell.anfragen", sampleFacts("modell.anfragen") as Roh, (d) => {
      delete d.gateFormat;
    });
    const report = await kette.pruefe();
    expect(report.verdict.level).toBe("ungueltig");
    expect(report.verdict.findings).toContainEqual({ problem: "fassung_unpassend", seq: 2 });
  });

  it("gateFormat 99: nicht prüfbar", async () => {
    const kette = await Kette.neu(STANDARD);
    await kette.entscheidung("nachricht.senden", sampleFacts("nachricht.senden") as Roh, (d) => {
      d.gateFormat = 99;
    });
    const report = await kette.pruefe();
    expect(report.verdict.level).toBe("nicht_pruefbar");
    expect(report.verdict.findings).toEqual([{ problem: "fassung_unbekannt", seq: 2 }]);
  });
});

describe("Vorbedingungen und Deckel: Pflicht und immer verglichen", () => {
  it("ohne Vorbedingungen: ungültig", async () => {
    const kette = await Kette.neu(STANDARD);
    await kette.entscheidung("nachricht.senden", sampleFacts("nachricht.senden") as Roh, (d) => {
      delete d.preconditions;
    });
    const report = await kette.pruefe();
    expect(report.verdict.level).toBe("ungueltig");
    expect(report.firstFailure?.seq).toBe(2);
  });

  it("werkzeug.aufrufen ohne Deckel: ungültig", async () => {
    const kette = await Kette.neu(STANDARD);
    await kette.entscheidung("werkzeug.aufrufen", sampleFacts("werkzeug.aufrufen") as Roh, (d) => {
      delete d.caps;
    });
    const report = await kette.pruefe();
    expect(report.verdict.level).toBe("ungueltig");
    expect(report.verdict.findings).toContainEqual({ problem: "fassung_unpassend", seq: 2 });
  });

  it("falsches Ergebnis des Deckels: entscheidung_abweichend", async () => {
    const kette = await Kette.neu(STANDARD);
    const entry = await kette.entscheidung(
      "werkzeug.aufrufen",
      sampleFacts("werkzeug.aufrufen") as Roh,
      (d) => {
        d.caps = [{ name: "fremd_dann_fragen", result: "gedeckelt" }];
      },
    );
    expect(reevaluate(entry, (kette.snapshot as RuleSnapshot).rules)).toMatchObject({
      status: "fehler",
      problem: "entscheidung_abweichend",
    });
    expect((await kette.pruefe()).verdict.level).toBe("ungueltig");
  });

  it("falsches Ergebnis einer Vorbedingung: entscheidung_abweichend", async () => {
    const kette = await Kette.neu(STANDARD);
    const entry = await kette.entscheidung(
      "nachricht.senden",
      sampleFacts("nachricht.senden") as Roh,
      (d) => {
        d.preconditions = [
          { name: "unterhaltung_vorhanden", result: "ok" },
          { name: "kein_lauf_aktiv", result: "entfaellt" },
        ];
      },
    );
    expect(reevaluate(entry, (kette.snapshot as RuleSnapshot).rules)).toMatchObject({
      status: "fehler",
      problem: "entscheidung_abweichend",
    });
  });

  it("Deckel bei einer anderen Aktion: fassung_unpassend", async () => {
    const kette = await Kette.neu(STANDARD);
    await kette.entscheidung("nachricht.senden", sampleFacts("nachricht.senden") as Roh, (d) => {
      d.caps = [{ name: "fremd_dann_fragen", result: "entfaellt" }];
    });
    const report = await kette.pruefe();
    expect(report.verdict.level).toBe("ungueltig");
    expect(report.verdict.findings).toContainEqual({ problem: "fassung_unpassend", seq: 2 });
  });
});

describe("Aktionen, die Fassung 2 nicht kennt", () => {
  it.each(["werkzeug.freigeben", "werkzeug.ausfuehren"] as const)(
    "%s mit gateFormat 2: fassung_unpassend, ungültig",
    async (type) => {
      const kette = await Kette.neu(STANDARD);
      // Inhalt so, wie Fassung 1 ihn entschieden hätte, aber als Fassung 2 ausgegeben.
      const action = sampleAction(type) as ActionRequest;
      const facts = sampleFacts(type) as Roh;
      const decided = evaluate(action, facts as never, kette.snapshot as RuleSnapshot, {
        format: 1,
      }) as unknown as Roh;
      const { matchedRules, ...rest } = decided;
      expect(ACTIONS[type]).toBeDefined();
      await kette.roh({
        type: "decision",
        action,
        decision: { gateFormat: 2, ...rest, rules: matchedRules },
        facts,
      });
      const report = await kette.pruefe();
      expect(report.verdict.level).toBe("ungueltig");
      expect(report.verdict.findings).toContainEqual({ problem: "fassung_unpassend", seq: 2 });
      expect(GATE_FORMATS[2].actions).not.toContain(type);
    },
  );
});

describe("Deckel D-01 im Beleg", () => {
  it("gedeckelte Entscheidung: fragen, Ergebnis abgelehnt mit regel_fehlt, nachrechnen ok", async () => {
    // Im Betrieb steht R-005 („fragen“) vor jeder eigenen Regel, ein erlaubtes schreibendes
    // Werkzeug gibt es dort nicht. Den Deckel zeigt deshalb die Entscheidung mit `evaluate` und
    // eigenem Regelstand; die Belege werden roh angehängt (wie das Tor sie schriebe).
    const kette = await Kette.neu([ERLAUBT_WERKZEUG]);
    const facts = {
      ...sampleFacts("werkzeug.aufrufen"),
      untrustedInput: true,
      toolKind: "schreiben",
    } as Roh;
    const entscheidung = await kette.entscheidung("werkzeug.aufrufen", facts);
    await kette.roh({
      type: "result",
      action: entscheidung.body.type === "decision" ? entscheidung.body.action : undefined,
      result: { status: "denied", code: "regel_fehlt" },
    });
    const [decision, result] = kette.entries.slice(1).map((entry) => entry.body);
    expect(decision?.type === "decision" && decision.decision).toMatchObject({
      outcome: "ask",
      stage: "ask",
      caps: [{ name: "fremd_dann_fragen", result: "gedeckelt" }],
    });
    expect(result?.type === "result" && result.result).toEqual({
      status: "denied",
      code: "regel_fehlt",
    });
    expect(
      reevaluate(kette.entries[1] as ReceiptEntry, (kette.snapshot as RuleSnapshot).rules),
    ).toMatchObject({ status: "ok" });
    expect((await kette.pruefe()).verdict.level).toBe("vertrauenswuerdig");
  });

  it("durch das Tor mit allen Standard-Regeln: R-005 fragt, nichts läuft, Ergebnis regel_fehlt, nachrechnen ok", async () => {
    const kette = await Kette.neu(STANDARD);
    const facts = {
      ...sampleFacts("werkzeug.aufrufen"),
      untrustedInput: true,
      toolKind: "schreiben",
    } as Roh;
    let ran = false;
    await kette.run("werkzeug.aufrufen", facts, async () => {
      ran = true;
      return { value: "x", result: { status: "ok" } };
    });
    expect(ran).toBe(false);
    const [decision, result] = kette.entries.slice(1).map((entry) => entry.body);
    expect(decision?.type === "decision" && decision.decision).toMatchObject({
      outcome: "ask",
      rules: [{ id: "R-005" }],
    });
    expect(result?.type === "result" && result.result).toEqual({
      status: "denied",
      code: "regel_fehlt",
    });
    expect(
      reevaluate(kette.entries[1] as ReceiptEntry, (kette.snapshot as RuleSnapshot).rules),
    ).toMatchObject({ status: "ok" });
    expect((await kette.pruefe()).verdict.level).toBe("vertrauenswuerdig");
  });

  it("dieselbe Entscheidung ohne Deckel (erlaubt) im Beleg: entscheidung_abweichend", async () => {
    const kette = await Kette.neu([ERLAUBT_WERKZEUG]);
    const facts = {
      ...sampleFacts("werkzeug.aufrufen"),
      untrustedInput: true,
      toolKind: "schreiben",
    } as Roh;
    const entry = await kette.entscheidung("werkzeug.aufrufen", facts, (d) => {
      d.outcome = "allow";
      d.stage = "execute";
      d.caps = [{ name: "fremd_dann_fragen", result: "entfaellt" }];
    });
    expect(reevaluate(entry, (kette.snapshot as RuleSnapshot).rules)).toMatchObject({
      status: "fehler",
      problem: "entscheidung_abweichend",
    });
  });
});

describe("Angaben aus der Regel-Liste", () => {
  it("anbieter.speichern mit zweitem Schlüssel und ein Ergebnis regel_unbekannt werden geschrieben", async () => {
    const kette = await Kette.neu(STANDARD);
    for (const managementKeySet of [true, false]) {
      await kette.run("anbieter.speichern", {
        ...sampleFacts("anbieter.speichern"),
        managementKeySet,
      });
    }
    await kette.run("modell.anfragen", sampleFacts("modell.anfragen") as Roh, async () => {
      throw new PaiBotError("regel_unbekannt");
    });
    const bodies = kette.entries.map((entry) => entry.body);
    expect(
      bodies
        .filter((b) => b.type === "decision" && b.action.type === "anbieter.speichern")
        .map((b) => b.type === "decision" && b.decision.outcome),
    ).toEqual(["allow", "allow"]);
    expect(bodies.at(-1)?.type === "result" && bodies.at(-1)).toMatchObject({
      result: { status: "error", code: "regel_unbekannt" },
    });
    expect((await kette.pruefe()).verdict.level).toBe("vertrauenswuerdig");
  });
});
