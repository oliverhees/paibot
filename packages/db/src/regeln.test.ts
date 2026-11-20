/**
 * PaiBot – Test: die Standard-Regeln stehen nach den Migrationen in der Datenbank und stimmen mit den Verträgen überein.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { ruleSchema, STANDARD_RULES } from "@paibot/shared";
import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { rules } from "./schema";
import { createTestDb, MIGRATIONS_FOLDER } from "./testing";

describe("Standard-Regeln", () => {
  it("sind nach den Migrationen vorhanden und entsprechen STANDARD_RULES", async () => {
    const { db } = await createTestDb();
    const rows = await db.select().from(rules).orderBy(asc(rules.id));

    expect(rows).toHaveLength(STANDARD_RULES.length);
    for (const soll of STANDARD_RULES) {
      const row = rows.find((r) => r.id === soll.id);
      expect(row).toBeDefined();
      expect({ ...row, createdAt: undefined }).toEqual({ ...soll, createdAt: undefined });
    }
  });

  it("sind gültige Regeln im Sinne der Verträge", async () => {
    const { db } = await createTestDb();
    for (const row of await db.select().from(rules)) {
      const parsed = ruleSchema.safeParse({ ...row, createdAt: row.createdAt.toISOString() });
      expect(parsed.success).toBe(true);
    }
  });

  it("haben die Reihenfolge R-001, R-002, dann R-999 als letzte Auffang-Regel", async () => {
    const { db } = await createTestDb();
    const rows = await db
      .select()
      .from(rules)
      .where(eq(rules.enabled, true))
      .orderBy(asc(rules.priority), asc(rules.id));
    expect(rows.map((r) => r.id)).toEqual(["R-001", "R-002", "R-999"]);
  });

  it("werden beim erneuten Ausführen der Migration nicht verdoppelt oder überschrieben", async () => {
    const { db, client } = await createTestDb();
    await client.query("update rules set enabled = false where id = 'R-002'");

    const sql = readFileSync(path.join(MIGRATIONS_FOLDER, "0003_standard_regeln.sql"), "utf8");
    await client.exec(sql);

    const rows = await db.select().from(rules);
    expect(rows).toHaveLength(3);
    const [r2] = await db
      .select()
      .from(rules)
      .where(and(eq(rules.id, "R-002"), eq(rules.version, 1)));
    expect(r2?.enabled).toBe(false);
  });
});
