/**
 * PaiBot – Test: Migrationen auf frischer Datenbank und im Aufstieg von der ersten Fassung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { newId, STANDARD_RULE_VERSIONS, ZERO_PREV } from "@paibot/shared";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { createDb, settings } from "./index";
import { belegRow, keyRow, providerRow } from "./testdaten";
import { createTestDb, MIGRATIONS_FOLDER } from "./testing";

const TABLES = [
  "belege",
  "bots",
  "conversation_events",
  "conversations",
  "geraete",
  "installation_keys",
  "messages",
  "models",
  "owner",
  "providers",
  "rate_limits",
  "rules",
  "runs",
  "schleuse_zustand",
  "sessions",
  "settings",
  "tool_calls",
];

async function tableNames(client: PGlite) {
  const result = await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' order by table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

/** Kopie des Migrations-Ordners mit nur den ersten `count` Migrationen. */
function migrationsUpTo(count: number) {
  const folder = mkdtempSync(path.join(tmpdir(), "paibot-migration-"));
  mkdirSync(path.join(folder, "meta"));
  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"),
  );
  journal.entries = journal.entries.slice(0, count);
  for (const entry of journal.entries as { tag: string }[]) {
    cpSync(path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), path.join(folder, `${entry.tag}.sql`));
  }
  writeFileSync(path.join(folder, "meta", "_journal.json"), JSON.stringify(journal));
  return folder;
}

/** Stand der ersten Fassung (nur 0000). */
const firstMigrationOnly = () => migrationsUpTo(1);

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

    const rules = await client.query<{ id: string; version: number }>(
      "select id, version from rules order by seq",
    );
    expect(rules.rows.map((r) => [r.id, r.version])).toEqual(
      STANDARD_RULE_VERSIONS.map((r) => [r.id, r.version]),
    );
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
    const { client } = await createTestDb();
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    expect(await tableNames(client)).toEqual(TABLES);
  });

  it("steigen vom Stand 0004 mit Bestandsdaten auf: Vorlagen, Regeln, Belege bleiben gültig", async () => {
    const client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: migrationsUpTo(5) });
    expect(await tableNames(client)).not.toContain("tool_calls");

    const eurouter = providerRow({ baseUrl: "https://api.eurouter.ai/v1" });
    const eigener = providerRow();
    for (const p of [eurouter, eigener]) {
      await client.query(
        `insert into providers (id, kind, name, base_url, api_key_enc, region)
         values ($1, $2, $3, $4, $5, $6)`,
        [p.id, p.kind, p.name, p.baseUrl, p.apiKeyEnc, p.region],
      );
    }
    const key = keyRow();
    await client.query(
      `insert into installation_keys (id, purpose, public_key, private_key_enc, fingerprint)
       values ($1, $2, $3, $4, $5)`,
      [key.id, key.purpose, key.publicKey, key.privateKeyEnc, key.fingerprint],
    );
    const start = belegRow(key.id, { seq: 1, prevHash: ZERO_PREV });
    const entscheidung = belegRow(key.id, { seq: 2, prevHash: start.hash });
    for (const b of [start, entscheidung]) {
      const r = b as typeof b & {
        actionId?: string;
        action?: string;
        actor?: string;
        conversationId?: string;
      };
      await client.query(
        `insert into belege (seq, id, entry_type, action_id, action, actor, conversation_id, body, prev_hash, hash, key_id, signature)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          r.seq,
          r.id,
          r.entryType,
          r.actionId ?? null,
          r.action ?? null,
          r.actor ?? null,
          r.conversationId ?? null,
          JSON.stringify(r.body),
          r.prevHash,
          r.hash,
          r.keyId,
          r.signature,
        ],
      );
    }

    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    expect(await tableNames(client)).toEqual(TABLES);
    const vorlagen = await client.query<{ id: string; template_key: string }>(
      "select id, template_key from providers",
    );
    expect(Object.fromEntries(vorlagen.rows.map((r) => [r.id, r.template_key]))).toEqual({
      [eurouter.id]: "eurouter",
      [eigener.id]: "eigener",
    });
    const belegZahl = await client.query<{ n: number }>("select count(*)::int as n from belege");
    expect(belegZahl.rows[0]?.n).toBe(2);
    const regeln = await client.query<{ id: string; seq: number }>(
      "select id, seq from rules order by seq",
    );
    expect(regeln.rows.map((r) => r.id)).toEqual(STANDARD_RULE_VERSIONS.map((r) => r.id));
    expect(regeln.rows.map((r) => Number(r.seq))).toEqual(
      STANDARD_RULE_VERSIONS.map((_, i) => i + 1),
    );
    const f = await client
      .query("update rules set enabled = false")
      .catch((e: { code?: string }) => e);
    expect((f as { code?: string }).code).toBe("23001");
  });

  it("brechen ab statt still weiterzumachen, wenn ein Bestands-Beleg nicht zu seinem Körper passt", async () => {
    const client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: migrationsUpTo(5) });
    const key = keyRow();
    await client.query(
      `insert into installation_keys (id, purpose, public_key, private_key_enc, fingerprint)
       values ($1, $2, $3, $4, $5)`,
      [key.id, key.purpose, key.publicKey, key.privateKeyEnc, key.fingerprint],
    );
    const start = belegRow(key.id, { seq: 1, prevHash: ZERO_PREV });
    await client.query(
      `insert into belege (seq, id, entry_type, conversation_id, body, prev_hash, hash, key_id, signature)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        start.seq,
        start.id,
        start.entryType,
        newId("conversation"),
        JSON.stringify(start.body),
        start.prevHash,
        start.hash,
        start.keyId,
        start.signature,
      ],
    );
    await expect(migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })).rejects.toThrow();
  });

  it("lassen das Paket weiter mit createDb und dem Schema nutzen", () => {
    expect(typeof createDb).toBe("function");
    expect(settings.id.name).toBe("id");
  });
});
