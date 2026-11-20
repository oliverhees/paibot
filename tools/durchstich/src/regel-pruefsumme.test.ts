/**
 * PaiBot – eine Prüfsumme für Regeln: Tor und Belege rechnen für jede Regel dieselbe.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  hashRule as gateHashRule,
  STANDARD_RULE_VERSIONS,
  UNSTORED_STANDARD_RULE_VERSIONS,
} from "@paibot/gate";
import { hashRule as receiptHashRule } from "@paibot/receipts/pruefen";
import type { RuleDefinition } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";

const OWN_RULE: RuleDefinition = {
  id: "R-123",
  version: 3,
  action: "werkzeug.aufrufen",
  effect: "allow",
  stage: "execute",
  conditions: [
    { fact: "toolName", op: "in", value: ["notiz_lesen", "kalender_lesen"] },
    { fact: "argsDigest", op: "ne", value: { fact: "toolName" } },
  ],
  priority: 7,
  source: "owner",
  enabled: false,
  title: "Eigene Regel mit „Anführungszeichen“ und Ümläuten 🙂",
  reason: 'Zeichen wie \\ " \n und   gehen genauso ein.',
};

describe("Prüfsumme der Regeln", () => {
  it("Tor und Belege rechnen für jede Fassung der Standard-Regeln dieselbe Prüfsumme", async () => {
    for (const rule of [...STANDARD_RULE_VERSIONS, ...UNSTORED_STANDARD_RULE_VERSIONS]) {
      expect(await gateHashRule(rule), `${rule.id}@${rule.version}`).toBe(receiptHashRule(rule));
    }
  });

  it("auch für eigene Regeln mit Sonderzeichen, Listen und Vergleichen zweier Fakten", async () => {
    expect(await gateHashRule(OWN_RULE)).toBe(receiptHashRule(OWN_RULE));
    const changed = { ...OWN_RULE, priority: 8 };
    expect(await gateHashRule(changed)).not.toBe(await gateHashRule(OWN_RULE));
    expect(await gateHashRule(changed)).toBe(receiptHashRule(changed));
  });

  it("fester Wert für R-001 in Fassung 1", async () => {
    const r001 = STANDARD_RULE_VERSIONS.find((rule) => rule.id === "R-001" && rule.version === 1);
    if (r001 === undefined) throw new Error("R-001 fehlt");
    const expected = "sha256:d6237b3d436f3d49131b62b21bfe68b7134caaae097bd0c145a49e75c03b793e";
    expect(await gateHashRule(r001)).toBe(expected);
    expect(receiptHashRule(r001)).toBe(expected);
  });
});

describe("Tor im Browser", () => {
  it("kein Quelltext des Tors und der Verträge lädt ein Node-Modul", async () => {
    const roots = ["../../../packages/gate/src/", "../../../packages/shared/src/"].map(
      (path) => new URL(path, import.meta.url).pathname,
    );
    const files: string[] = [];
    for (const root of roots) {
      for (const entry of await readdir(root, { recursive: true })) {
        const name = String(entry);
        if (name.endsWith(".ts") && !name.endsWith(".test.ts")) files.push(join(root, name));
      }
    }
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const text = await readFile(file, "utf8");
      expect(/from\s+["']node:|import\(\s*["']node:|require\(/.test(text), file).toBe(false);
    }
  });
});
