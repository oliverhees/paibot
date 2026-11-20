/**
 * PaiBot – Test: Migrationen auf frischer Datenbank und im Aufstieg von der ersten Fassung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { createDb, settings } from "./index";
import { createTestDb, MIGRATIONS_FOLDER } from "./testing";

const TABLES = [
  "belege",
  "bots",
  "conversation_events",
  "conversations",
  "installation_keys",
  "messages",
  "models",
  "owner",
  "providers",
  "rate_limits",
  "rules",
  "runs",
  "sessions",
  "settings",
];

async function tableNames(client: PGlite) {
  const result = await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' order by table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

/** Kopie des Migrations-Ordners mit nur der ersten Migration (Stand der ersten Fassung). */
function firstMigrationOnly() {
  const folder = mkdtempSync(path.join(tmpdir(), "paibot-migration-"));
  mkdirSync(path.join(folder, "meta"));
  cpSync(path.join(MIGRATIONS_FOLDER, "0000_init.sql"), path.join(folder, "0000_init.sql"));
  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"),
  );
  journal.entries = journal.entries.slice(0, 1);
  writeFileSync(path.join(folder, "meta", "_journal.json"), JSON.stringify(journal));
  return folder;
}

describe("Migrationen", () => {
  it("bringen eine frische Datenbank auf den aktuellen Stand", async () => {
    const { db, client } = await createTestDb();

    expect(await tableNames(client)).toEqual(TABLES);

    await db.insert(settings).values({});
    const [row] = await db.select().from(settings).where(eq(settings.id, "singleton"));

    expect(row?.locale).toBe("de");
    expect(row?.schleuseModeDefault).toBe("off");
    expect(row?.maxHops).toBe(8);
    expect(row?.killSwitch).toBe(false);
    expect(row?.installationId).toBeNull();
    expect(row?.defaultBotId).toBeNull();
    expect(row?.historyTokenLimit).toBeNull();
  });

  it("steigen von der ersten Fassung auf, behalten die Einstellungen und setzen auto auf off", async () => {
    const oldFolder = firstMigrationOnly();

    const client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: oldFolder });
    expect(await tableNames(client)).toEqual(["settings"]);

    await client.query(
      `insert into settings (locale, timezone, schleuse_mode_default, max_hops, daily_token_budget)
       values ('en', 'Europe/Vienna', 'auto', 5, 1000)`,
    );

    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    expect(await tableNames(client)).toEqual(TABLES);
    const [row] = (
      await client.query<{
        id: string;
        locale: string;
        timezone: string;
        schleuse_mode_default: string;
        max_hops: number;
        daily_token_budget: number;
        kill_switch: boolean;
      }>("select * from settings")
    ).rows;
    expect(row).toMatchObject({
      id: "singleton",
      locale: "en",
      timezone: "Europe/Vienna",
      schleuse_mode_default: "off",
      max_hops: 5,
      daily_token_budget: 1000,
      kill_switch: false,
    });

    const rules = await client.query<{ id: string }>("select id from rules order by id");
    expect(rules.rows.map((r) => r.id)).toEqual(["R-001", "R-002", "R-999"]);
  });

  it("lassen die Einstellung mit on unverändert", async () => {
    const oldFolder = firstMigrationOnly();

    const client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: oldFolder });
    await client.query("insert into settings (schleuse_mode_default) values ('on')");
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    const result = await client.query<{ schleuse_mode_default: string }>(
      "select schleuse_mode_default from settings",
    );
    expect(result.rows[0]?.schleuse_mode_default).toBe("on");
  });

  it("lassen sich ein zweites Mal anwenden, ohne etwas zu ändern", async () => {
    const { db, client } = await createTestDb();
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    expect(await tableNames(client)).toEqual(TABLES);
  });

  it("lassen das Paket weiter mit createDb und dem Schema nutzen", () => {
    expect(typeof createDb).toBe("function");
    expect(settings.id.name).toBe("id");
  });
});
