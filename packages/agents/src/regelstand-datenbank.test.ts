/**
 * PaiBot – Der Regelstand, wie der Betrieb ihn aus der Datenbank lädt (`loadSnapshot`), wird vom
 * Tor angenommen: Er enthält alle aktiven Standard-Regeln, und eine erlaubte Aktion läuft durch.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { ACTIVE_STANDARD_RULES, createGate, ruleSnapshot, verifyRuleSnapshot } from "@paibot/gate";
import { newId } from "@paibot/shared/ids";
import { describe, expect, it, vi } from "vitest";
import { memoryReceipts, steppingClock } from "./testing/test-umgebung";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

describe("Regelstand aus der Datenbank", () => {
  it("enthält alle aktiven Standard-Regeln und wird vom Tor angenommen", async () => {
    const { db, client } = await createTestDb();
    try {
      const { stand, rules } = await repo.rules.loadSnapshot(db);
      const snapshot = await ruleSnapshot(rules, stand);
      const ids = snapshot.rules.map((rule) => rule.id);
      for (const rule of ACTIVE_STANDARD_RULES) expect(ids).toContain(rule.id);
      await expect(verifyRuleSnapshot(snapshot)).resolves.toMatchObject({ stand });

      const receipts = memoryReceipts();
      const gate = createGate({
        rules: { load: async () => ruleSnapshot(rules, stand) },
        receipts,
        clock: steppingClock(),
      });
      const result = await gate.run(
        {
          actionId: newId("action"),
          type: "zugang.abmelden",
          actor: "besitzer",
          target: { ownerId: newId("owner") },
        },
        { credential: "sitzung" },
        async () => ({ value: "fertig", result: { status: "ok" } }),
      );
      expect(result.decision.outcome).toBe("allow");
    } finally {
      await client.close();
    }
  });
});
