/**
 * PaiBot – Start gegen echtes Postgres (nur mit PAIBOT_TEST_DATABASE_URL): getrennte Rollen,
 * danach läuft die Warteschlange mit der App-Rolle; eine bestehende Warteschlange wird übernommen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  newPostgresTestRole,
  type PostgresTestRole,
  prepareDatabase,
  runMigrations,
} from "@paibot/db/migrate";
import {
  createPostgresTestDatabase,
  MIGRATIONS_FOLDER,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { createQueue, type RunJob } from "@paibot/jobs";
import { newId } from "@paibot/shared/ids";
import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];
const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

async function waitFor(condition: () => boolean, ms = 15_000): Promise<void> {
  const until = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > until) throw new Error("Zeit abgelaufen");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Startet eine Warteschlange, stellt einen Lauf ein und wartet, bis er bearbeitet ist. */
async function roundTrip(url: string): Promise<void> {
  const queue = createQueue(url);
  try {
    const seen: RunJob[] = [];
    await queue.start();
    await queue.startRunWorker(
      async (job) => {
        seen.push(job);
      },
      { concurrency: 1 },
    );
    const job = { runId: newId("run"), conversationId: newId("conversation") };
    await queue.enqueueRun(job);
    await waitFor(() => seen.length > 0);
    expect(seen[0]).toEqual(job);
  } finally {
    await queue.stop({ timeoutMs: 1000 });
  }
}

describe.skipIf(BASE_URL === undefined)("Start mit getrennten Rollen gegen echtes Postgres", () => {
  const opened: PostgresTestDatabase[] = [];
  const roles: PostgresTestRole[] = [];

  afterAll(async () => {
    for (const db of opened) await db.drop();
    for (const role of roles) await role.drop(BASE_URL ?? "");
  });

  function newRole(db: PostgresTestDatabase): string {
    const role = newPostgresTestRole(db.url);
    roles.push(role);
    return role.url;
  }

  it("frische Installation: die Warteschlange startet mit der App-Rolle, beim nächsten Start ohne Anlege-Recht", async () => {
    const db = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
    opened.push(db);
    const appUrl = newRole(db);
    const env = { DATABASE_URL: appUrl, DATABASE_MIGRATION_URL: db.url };
    const first = await prepareDatabase({
      env,
      migrationsFolder: MIGRATIONS_FOLDER,
      production: true,
      log: silent,
    });
    expect(first).toMatchObject({ ok: true, role: { status: "eingeschraenkt" } });
    await roundTrip(appUrl);

    const second = await prepareDatabase({
      env,
      migrationsFolder: MIGRATIONS_FOLDER,
      production: true,
      log: silent,
    });
    expect(second).toMatchObject({ ok: true, role: { status: "eingeschraenkt" } });
    await roundTrip(appUrl);
  }, 60_000);

  it("bestehende Installation: Warteschlange des bisherigen Besitzers wird an die App-Rolle übergeben", async () => {
    const db = await createPostgresTestDatabase(BASE_URL ?? "");
    opened.push(db);
    await roundTrip(db.url);

    const appUrl = newRole(db);
    await runMigrations(db.url, MIGRATIONS_FOLDER, { appUrl });
    await roundTrip(appUrl);
  }, 60_000);
});
