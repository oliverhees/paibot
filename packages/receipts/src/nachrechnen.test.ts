/**
 * PaiBot – Tests des Nachrechnens: Prüfsumme einer Regel, damaliger Regelstand, nachträglich
 * geänderte Regeln, Standard-Regeln aus dem Code und ältere Belege ohne Regelstand.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createHash } from "node:crypto";
import { evaluate } from "@paibot/gate";
import type { ReceiptEntry } from "@paibot/shared/belege";
import { RULE_HASH_PREFIX } from "@paibot/shared/bindung";
import {
  ACTIVE_STANDARD_RULES,
  type ListDecision,
  type RuleDefinition,
  ruleContent,
  STANDARD_RULE_VERSIONS,
} from "@paibot/shared/tor";
import { beforeAll, describe, expect, it } from "vitest";
import { canonicalize } from "./canonical";
import { hashRule, type RuleHistory, type RuleVersion, reevaluate, rulesAsOf } from "./nachrechnen";
import { sha256Bytes, sha256Hex } from "./sha256";
import {
  sendAction,
  sendFacts,
  signedEntry,
  TEST_INSTALLATION,
  TEST_RULE,
  type TestKey,
  testKey,
} from "./testhilfen";
import { verifyChain } from "./verify";

const ALLOW: RuleVersion = { ...TEST_RULE, seq: 1 };
const LATER_DENY: RuleVersion = {
  id: "R-200",
  version: 1,
  action: "nachricht.senden",
  effect: "deny",
  stage: "execute",
  conditions: [],
  priority: 1,
  source: "owner",
  enabled: true,
  title: "Später dazugekommen",
  reason: "Nachrichten sind jetzt gesperrt.",
  seq: 2,
};

let key: TestKey;
let start: ReceiptEntry;

beforeAll(async () => {
  key = testKey();
  start = await signedEntry(
    {
      type: "start",
      facts: { installationId: TEST_INSTALLATION, publicKey: key.publicKey, software: "0.3.0+dev" },
    },
    undefined,
    key,
  );
});

/** Entscheidung wie vom Tor mit Regelstand und Prüfsummen der angewandten Regeln. */
function decided(
  rules: readonly RuleVersion[],
  stand: number | undefined,
): ListDecision & {
  action: ReturnType<typeof sendAction>;
  facts: ReturnType<typeof sendFacts>;
} {
  const action = sendAction();
  const facts = sendFacts();
  const decision = evaluate(action, facts, rules);
  return {
    ...decision,
    matchedRules: decision.matchedRules.map((ref) => {
      const rule = rules.find((r) => r.id === ref.id && r.version === ref.version);
      return rule === undefined ? ref : { ...ref, hash: hashRule(rule) };
    }),
    ...(stand === undefined ? {} : { ruleStand: stand }),
    action,
    facts,
  };
}

async function entryFor(d: ReturnType<typeof decided>): Promise<ReceiptEntry> {
  const { action, facts, ...decision } = d;
  return signedEntry({ type: "decision", action, decision, facts }, start, key);
}

describe("sha256 (ohne Web Crypto)", () => {
  it("gleicht node:crypto für viele Längen, auch an Blockgrenzen", () => {
    for (const length of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 31 + length) & 0xff);
      expect(Buffer.from(sha256Bytes(bytes)).toString("hex"), String(length)).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
    }
    expect(sha256Hex("äöü€𝄞")).toBe(createHash("sha256").update("äöü€𝄞", "utf8").digest("hex"));
  });
});

describe("hashRule", () => {
  it("SHA-256 über Präfix und kanonischen Inhalt, Zeit und Nummer zählen nicht", () => {
    for (const rule of [...STANDARD_RULE_VERSIONS, TEST_RULE] as RuleDefinition[]) {
      const expected = `sha256:${createHash("sha256")
        .update(RULE_HASH_PREFIX + canonicalize(ruleContent(rule) as never), "utf8")
        .digest("hex")}`;
      expect(hashRule(rule)).toBe(expected);
      expect(hashRule({ ...rule, seq: 9, createdAt: "2026-11-20T10:00:00.000Z" } as never)).toBe(
        expected,
      );
    }
  });

  it("jede inhaltliche Änderung ändert die Prüfsumme", () => {
    const base = hashRule(TEST_RULE);
    expect(hashRule({ ...TEST_RULE, effect: "deny" })).not.toBe(base);
    expect(hashRule({ ...TEST_RULE, priority: 11 })).not.toBe(base);
    expect(hashRule({ ...TEST_RULE, reason: "Anders." })).not.toBe(base);
    expect(hashRule({ ...TEST_RULE, conditions: [] })).not.toBe(base);
  });
});

describe("rulesAsOf", () => {
  it("nimmt je Regel die höchste Fassung bis zum Stand und nur eingeschaltete", () => {
    const v2 = { ...ALLOW, version: 2, enabled: false, seq: 3 };
    expect(rulesAsOf([ALLOW, LATER_DENY, v2], 1)).toEqual([ALLOW]);
    expect(rulesAsOf([ALLOW, LATER_DENY, v2], 2)).toEqual([ALLOW, LATER_DENY]);
    expect(rulesAsOf([ALLOW, LATER_DENY, v2], 3)).toEqual([LATER_DENY]);
  });
});

describe("reevaluate mit dem damaligen Regelstand", () => {
  it("baut Regelstand und Prüfsummen in den Beleg ein", async () => {
    const entry = await entryFor(decided([ALLOW], 1));
    expect(entry.body).toMatchObject({
      decision: { ruleStand: 1, rules: [{ id: "R-001", version: 1, hash: hashRule(ALLOW) }] },
    });
  });

  it("eine später dazugekommene Regel lässt alte Entscheidungen gültig", async () => {
    const entry = await entryFor(decided([ALLOW], 1));
    expect(reevaluate(entry, [ALLOW, LATER_DENY])).toMatchObject({ status: "ok", ruleStand: 1 });
    // Neue Entscheidungen zum neuen Stand rechnen mit der neuen Regel.
    const later = await entryFor(decided([ALLOW, LATER_DENY], 2));
    expect(reevaluate(later, [ALLOW, LATER_DENY])).toMatchObject({
      status: "ok",
      ruleStand: 2,
      expected: { outcome: "deny" },
    });
  });

  it("die ganze Kette bleibt mit dem Regel-Protokoll prüfbar", async () => {
    const entry = await entryFor(decided([ALLOW], 1));
    const report = await verifyChain([start, entry], { rules: [ALLOW, LATER_DENY] });
    expect(report.ok).toBe(true);
    expect(report.firstFailure).toBeUndefined();
  });

  it("nachträglich geänderte Regel: genau diese Regel wird gemeldet", async () => {
    const entry = await entryFor(decided([ALLOW], 1));
    const changed = { ...ALLOW, conditions: [{ fact: "akteur", op: "eq", value: "besitzer" }] };
    expect(reevaluate(entry, [changed as RuleVersion])).toEqual({
      status: "fehler",
      ruleStand: 1,
      problem: "regel_geaendert",
      rule: { id: "R-001", version: 1, hash: hashRule(ALLOW) },
    });
  });

  it("geändert und Entscheidung käme gleich heraus: trotzdem gemeldet", async () => {
    const entry = await entryFor(decided([ALLOW], 1));
    const reworded = { ...ALLOW, title: "Anderer Titel" };
    expect(reevaluate(entry, [reworded])).toMatchObject({
      status: "fehler",
      problem: "regel_geaendert",
    });
  });

  it("fehlt eine damals angewandte Regel zum Stand, wird das gemeldet", async () => {
    const entry = await entryFor(decided([ALLOW], 1));
    expect(reevaluate(entry, [LATER_DENY])).toMatchObject({
      status: "fehler",
      problem: "regel_fehlt",
      rule: { id: "R-001", version: 1 },
    });
    // Eine Fassung, die erst nach dem Stand entstand, zählt nicht.
    expect(reevaluate(entry, [{ ...ALLOW, seq: 5 }])).toMatchObject({ problem: "regel_fehlt" });
  });

  it("andere Entscheidung bei gleichen Regeln: entscheidung_abweichend", async () => {
    const d = decided([ALLOW], 1);
    const entry = await entryFor({ ...d, outcome: "deny" });
    expect(reevaluate(entry, [ALLOW])).toMatchObject({
      status: "fehler",
      problem: "entscheidung_abweichend",
      expected: { outcome: "allow" },
    });
  });

  it("Vorbedingungen im Beleg werden mit verglichen", async () => {
    const d = decided([ALLOW], 1);
    const entry = await entryFor({
      ...d,
      preconditions: [
        { name: "unterhaltung_vorhanden", result: "ok" },
        { name: "kein_lauf_aktiv", result: "verletzt" },
      ],
    });
    expect(entry.body).toMatchObject({ decision: { preconditions: expect.any(Array) } });
    expect(reevaluate(entry, [ALLOW])).toMatchObject({
      status: "fehler",
      problem: "entscheidung_abweichend",
    });
  });

  it("Standard-Regeln zählen mit ihrem Inhalt aus dem Code", async () => {
    const standard = ACTIVE_STANDARD_RULES.map((rule, i) => ({ ...rule, seq: i + 1 }));
    const entry = await entryFor(decided(standard, standard.length));
    expect(reevaluate(entry, standard)).toMatchObject({ status: "ok" });
    // Eine in der Datenbank geänderte Standard-Regel (gleiche Fassung) fällt auf.
    const tampered = standard.map((rule) =>
      rule.id === "R-001" ? { ...rule, conditions: [] } : rule,
    );
    expect(reevaluate(entry, tampered)).toMatchObject({
      status: "fehler",
      problem: "regel_geaendert",
      rule: { id: "R-001", version: 1 },
    });
  });

  it("über eine Quelle wie die Datenbank: holt die Regeln zum Stand des Belegs", async () => {
    const asked: (number | "aktuell")[] = [];
    const history: RuleHistory = {
      asOf: async (stand) => {
        asked.push(stand);
        return rulesAsOf([ALLOW, LATER_DENY], stand);
      },
      current: async () => {
        asked.push("aktuell");
        return [ALLOW, LATER_DENY];
      },
    };
    const entry = await entryFor(decided([ALLOW], 1));
    expect(await reevaluate(entry, history)).toMatchObject({ status: "ok", ruleStand: 1 });
    const old = await entryFor(decided([ALLOW], undefined));
    expect(await reevaluate(old, history)).toMatchObject({
      status: "fehler",
      ruleStand: "nicht_festgehalten",
    });
    expect(asked).toEqual([1, "aktuell"]);
    const report = await verifyChain([start, entry], { ruleHistory: history });
    expect(report.ok).toBe(true);
  });
});

describe("reevaluate bei Belegen ohne Regelstand", () => {
  it("rechnet mit der übergebenen Liste und sagt, dass der Regelstand fehlt", async () => {
    const entry = await entryFor(decided([ALLOW], undefined));
    expect(reevaluate(entry, [ALLOW])).toMatchObject({
      status: "ok",
      ruleStand: "nicht_festgehalten",
    });
    // Ohne Regelstand ändert eine später dazugekommene Regel das Ergebnis (bekannte Grenze).
    expect(reevaluate(entry, [ALLOW, LATER_DENY])).toMatchObject({
      status: "fehler",
      ruleStand: "nicht_festgehalten",
      problem: "entscheidung_abweichend",
    });
  });
});
