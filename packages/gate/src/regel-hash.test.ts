/**
 * PaiBot – Tests der Prüfsumme einer Regel und des Regelstands in der Entscheidung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import { RULE_HASH_PREFIX } from "@paibot/shared/bindung";
import {
  ACTIVE_STANDARD_RULES,
  decisionSchema,
  type RuleDefinition,
  STANDARD_RULE_VERSIONS,
} from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate";
import { hashRule, ruleSnapshot } from "./regel-hash";
import { ACTION_TYPES, sampleAction, sampleFacts } from "./testdaten";

async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return `sha256:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function standard(id: string): RuleDefinition {
  const found = ACTIVE_STANDARD_RULES.find((rule) => rule.id === id);
  if (!found) throw new Error(id);
  return found;
}

describe("hashRule", () => {
  it("folgt dem festen Format: Präfix + kanonisches JSON des Inhalts", async () => {
    // Von Hand geschrieben: Schlüssel sortiert, ohne Leerzeichen, Listen in ihrer Reihenfolge.
    const r999 =
      '{"action":"*","conditions":[],"effect":"ask","enabled":true,"id":"R-999",' +
      '"priority":1000000,"reason":"Dafür gibt es noch keine Regel.","source":"standard",' +
      '"stage":"ask","title":"Ohne passende Regel","version":1}';
    const r001 =
      '{"action":"*","conditions":[{"fact":"akteur","op":"eq","value":"besitzer"},' +
      '{"fact":"credential","op":"in","value":["sitzung","passwort","einrichtungs_code"]}],' +
      '"effect":"allow","enabled":true,"id":"R-001","priority":100,' +
      '"reason":"Der Besitzer hat sich ausgewiesen und verwaltet seine eigene Installation.",' +
      '"source":"standard","stage":"execute","title":"Besitzer verwaltet seine Installation",' +
      '"version":1}';
    expect(RULE_HASH_PREFIX).toBe("pb-regel/v1\n");
    expect(await hashRule(standard("R-999"))).toBe(await sha256(`${RULE_HASH_PREFIX}${r999}`));
    expect(await hashRule(standard("R-001"))).toBe(await sha256(`${RULE_HASH_PREFIX}${r001}`));
  });

  it("gleiche Kennung und Fassung mit geändertem Inhalt ergibt einen anderen Hash", async () => {
    const original = standard("R-999");
    const base = await hashRule(original);
    const changes: Partial<RuleDefinition>[] = [
      { effect: "allow" },
      { stage: "execute" },
      { priority: 999999 },
      { enabled: false },
      { action: "nachricht.senden" },
      { reason: "Dafür gibt es noch keine Regel!" },
      { title: "Ohne passende Regel " },
      { source: "owner" },
      { conditions: [{ fact: "akteur", op: "eq", value: "bot" }] },
    ];
    const hashes = new Set([base]);
    for (const change of changes) {
      const hash = await hashRule({ ...original, ...change });
      expect(hash, JSON.stringify(change)).not.toBe(base);
      hashes.add(hash);
    }
    expect(hashes.size).toBe(changes.length + 1);
  });

  it("Reihenfolge der Schlüssel, Zeit, Nummer und alte Prüfsumme zählen nicht", async () => {
    const rule = standard("R-001");
    const reversed = Object.fromEntries(Object.entries(rule).reverse()) as RuleDefinition;
    const stored = {
      ...rule,
      createdAt: "2026-11-20T10:00:00.000Z",
      seq: 42,
      hash: `sha256:${"0".repeat(64)}`,
    };
    expect(await hashRule(reversed)).toBe(await hashRule(rule));
    expect(await hashRule(stored)).toBe(await hashRule(rule));
  });

  it("jede Fassung der Standard-Regeln hat eine eigene Prüfsumme", async () => {
    const hashes = await Promise.all(STANDARD_RULE_VERSIONS.map((rule) => hashRule(rule)));
    expect(new Set(hashes).size).toBe(STANDARD_RULE_VERSIONS.length);
    for (const hash of hashes) expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("lehnt Werte ab, die in Regeln nicht vorkommen", async () => {
    const bad = { ...standard("R-001"), priority: 1.5 };
    await expect(hashRule(bad)).rejects.toThrow(TypeError);
  });
});

describe("Regelstand in der Entscheidung", () => {
  it("ruleSnapshot: Prüfsumme und Nummer je Regel, Stand = höchste Nummer", async () => {
    const snapshot = await ruleSnapshot(
      ACTIVE_STANDARD_RULES.map((rule, index) => ({ ...rule, seq: index + 3 })),
    );
    expect(snapshot.stand).toBe(ACTIVE_STANDARD_RULES.length + 2);
    for (const [index, rule] of snapshot.rules.entries()) {
      expect(rule.seq).toBe(index + 3);
      expect(rule.hash).toBe(await hashRule(rule));
    }
    expect((await ruleSnapshot(ACTIVE_STANDARD_RULES, 99)).stand).toBe(99);
  });

  it.each(ACTION_TYPES)(
    "%s: angewandte Regel mit Kennung, Fassung und Prüfsumme, dazu der Stand",
    async (type) => {
      const snapshot = await ruleSnapshot(ACTIVE_STANDARD_RULES, 7);
      const decision = evaluate(sampleAction(type), sampleFacts(type), snapshot);
      expect(decisionSchema.safeParse(decision).success).toBe(true);
      expect(decision.ruleStand).toBe(7);
      expect(decision.matchedRules).toHaveLength(1);
      const [ref] = decision.matchedRules;
      const rule = snapshot.rules.find((r) => r.id === ref?.id && r.version === ref?.version);
      expect(ref?.hash).toBe(rule?.hash);
      expect(ref?.hash).toBe(rule === undefined ? undefined : await hashRule(rule));
    },
  );

  it("ohne Regelstand: kein Stand, Prüfsumme nur, wenn die Regel sie mitbringt", () => {
    const decision = evaluate(
      sampleAction("zugang.abmelden"),
      sampleFacts("zugang.abmelden"),
      ACTIVE_STANDARD_RULES,
    );
    expect(decision).not.toHaveProperty("ruleStand");
    expect(decision.matchedRules).toEqual([{ id: "R-001", version: 1 }]);
  });

  it("nachrechenbar: mit den Regeln zum damaligen Stand gleich, mit geänderter Regel nicht", async () => {
    const action = sampleAction("unterhaltung.loeschen") as ActionRequest;
    const facts = sampleFacts("unterhaltung.loeschen") as Facts;
    const damals = await ruleSnapshot(ACTIVE_STANDARD_RULES, 7);
    const decision = evaluate(action, facts, damals);

    // Gleicher Stand, frisch aufgebaut (z. B. aus einem Beleg und der Datenbank): gleiche Entscheidung.
    const nochmal = await ruleSnapshot(structuredClone([...ACTIVE_STANDARD_RULES]), 7);
    expect(evaluate(structuredClone(action), structuredClone(facts), nochmal)).toEqual(decision);

    // Dieselbe Kennung und Fassung, aber geänderter Inhalt: die Prüfsumme verrät es.
    const geaendert = ACTIVE_STANDARD_RULES.map((rule) =>
      rule.id === "R-001" ? { ...rule, title: "Besitzer verwaltet alles" } : rule,
    );
    const heute = evaluate(action, facts, await ruleSnapshot(geaendert, 7));
    expect(heute.outcome).toBe(decision.outcome);
    expect(heute.matchedRules[0]?.id).toBe(decision.matchedRules[0]?.id);
    expect(heute.matchedRules[0]?.version).toBe(decision.matchedRules[0]?.version);
    expect(heute.matchedRules[0]?.hash).not.toBe(decision.matchedRules[0]?.hash);
  });
});
