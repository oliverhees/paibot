/**
 * PaiBot – Test: die Standard-Regeln stehen nach den Migrationen in der Datenbank, stimmen mit den
 * Verträgen überein und lassen sich weder ändern noch löschen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { ACTIVE_STANDARD_RULES, ruleSchema, STANDARD_RULE_VERSIONS } from "@paibot/shared";
import { asc } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { rules } from "./schema";
import { createTestDb, MIGRATIONS_FOLDER, type TestDb } from "./testing";

const RESTRICT = "23001";

async function fehler(statement: Promise<unknown>): Promise<{ code?: string; message?: string }> {
  try {
    await statement;
  } catch (error) {
    return error as { code?: string; message?: string };
  }
  throw new Error("Die Anweisung hätte scheitern müssen.");
}

const inhalt = ({ seq: _seq, createdAt: _createdAt, ...rest }: typeof rules.$inferSelect) => rest;

describe("Standard-Regeln", () => {
  it("sind nach den Migrationen vorhanden: genau alle Fassungen, in ihrer Reihenfolge", async () => {
    const { db } = await createTestDb();
    const rows = await db.select().from(rules).orderBy(asc(rules.seq));
    expect(rows.map(inhalt)).toEqual(STANDARD_RULE_VERSIONS);
    expect(rows.map((row) => row.seq)).toEqual(STANDARD_RULE_VERSIONS.map((_, i) => i + 1));
  });

  it("sind gültige Regeln im Sinne der Verträge", async () => {
    const { db } = await createTestDb();
    for (const row of await db.select().from(rules)) {
      const parsed = ruleSchema.safeParse({ ...row, createdAt: row.createdAt.toISOString() });
      expect(parsed.success).toBe(true);
    }
  });

  it("die aktiven Fassungen sind die der Verträge, R-999 zuletzt", async () => {
    const { db } = await createTestDb();
    const { listActive } = await import("./repo/regeln");
    const aktiv = await listActive(db);
    expect(aktiv.map((r) => `${r.id}@${r.version}`).sort()).toEqual(
      ACTIVE_STANDARD_RULES.map((r) => `${r.id}@${r.version}`).sort(),
    );
    expect(aktiv.at(-1)?.id).toBe("R-999");
  });

  it("werden beim erneuten Ausführen der Migrationen nicht verdoppelt", async () => {
    const { db, client } = await createTestDb();
    for (const datei of [
      "0003_standard_regeln.sql",
      "0005_haertung.sql",
      "0014_werkzeug_kern.sql",
    ]) {
      const sql = readFileSync(path.join(MIGRATIONS_FOLDER, datei), "utf8");
      const ab = sql.lastIndexOf('INSERT INTO "rules"');
      const ende = sql.indexOf("DO NOTHING;", ab) + "DO NOTHING;".length;
      expect(ab).toBeGreaterThanOrEqual(0);
      await client.exec(sql.slice(ab, ende));
    }
    expect(await db.select().from(rules)).toHaveLength(STANDARD_RULE_VERSIONS.length);
  });
});

describe("Regeln sind unveränderlich", () => {
  let ctx: TestDb;
  beforeEach(async () => {
    ctx = await createTestDb();
  });

  it.each([
    ["Wirkung lockern", "update rules set effect = 'allow', stage = 'execute' where id = 'R-999'"],
    ["ausschalten", "update rules set enabled = false where id = 'R-002'"],
    ["Fassung umnummerieren", "update rules set version = 9 where id = 'R-001'"],
    ["Bedingungen leeren", "update rules set conditions = '[]'::jsonb where id = 'R-006'"],
    ["löschen", "delete from rules where id = 'R-006'"],
    ["alles löschen", "delete from rules"],
  ])("weist ab: %s", async (_name, statement) => {
    const f = await fehler(ctx.client.query(statement));
    expect(f.code).toBe(RESTRICT);
    expect(f.message).toContain("Regeln sind unveränderlich");
  });

  it("weist TRUNCATE ab", async () => {
    const f = await fehler(ctx.client.query("truncate rules"));
    expect(f.code).toBe(RESTRICT);
  });

  it("lässt die Zeilen unverändert und nimmt eine neue Fassung an", async () => {
    await fehler(ctx.client.query("update rules set enabled = false"));
    const rows = await ctx.db.select().from(rules).orderBy(asc(rules.seq));
    expect(rows.map(inhalt)).toEqual(STANDARD_RULE_VERSIONS);

    await ctx.client.query(
      `insert into rules (id, version, action, effect, stage, conditions, priority, source, enabled, title, reason)
       values ('R-002', 2, 'modell.anfragen', 'allow', 'execute', '[]'::jsonb, 100, 'standard', false, 'Aus', 'Ausgeschaltet.')`,
    );
    expect(await ctx.db.select().from(rules)).toHaveLength(STANDARD_RULE_VERSIONS.length + 1);
  });

  it("die Nummer im Regel-Protokoll vergibt nur die Datenbank, eindeutig und steigend", async () => {
    const f = await fehler(
      ctx.client.query(
        `insert into rules (seq, id, version, action, effect, stage, priority, source, title, reason)
         values (1, 'R-300', 1, '*', 'deny', 'execute', 1, 'standard', 'x', 'x')`,
      ),
    );
    expect(f.code).toBe("428C9");
  });

  it.each([
    ["unter eins", -5],
    ["eine schon vergebene", 1],
    ["eine frei gewählte hohe", 999_999],
  ])(
    "eine selbst gesetzte Nummer (%s) wird auch mit OVERRIDING SYSTEM VALUE abgewiesen",
    async (_name, seq) => {
      const f = await fehler(
        ctx.client.query(
          `insert into rules (seq, id, version, action, effect, stage, priority, source, title, reason)
         overriding system value
         values (${seq}, 'R-301', 1, '*', 'deny', 'execute', 1, 'standard', 'x', 'x')`,
        ),
      );
      expect(f.code).toBe("23514");
      const [row] = (
        await ctx.client.query<{ n: number }>(
          "select count(*)::int as n from rules where id = 'R-301'",
        )
      ).rows;
      expect(row?.n).toBe(0);
    },
  );
});
