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

import { randomBytes } from "node:crypto";
import { createDb, repo } from "@paibot/db";
import { checkWorkerRole, prepareDatabase, runMigrations } from "@paibot/db/migrate";
import {
  createPostgresTestDatabase,
  MIGRATIONS_FOLDER,
  newPostgresTestRole,
  type PostgresTestDatabase,
  type PostgresTestRole,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { createQueue, type RunJob } from "@paibot/jobs";
import { newId } from "@paibot/shared/ids";
import { afterAll, describe, expect, it } from "vitest";
import { prepareStart } from "./betrieb";
import { alteZaehlerLoeschen } from "./rate-limit";

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

  it("der Migrations-Schritt hebt Sperren der Anmeldung auf, andere Zähler bleiben", async () => {
    const db = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
    opened.push(db);
    const appUrl = newRole(db);
    const exit = (() => undefined) as unknown as (code: number) => never;
    const migrate = {
      // Nicht „production“: Dort gelten zusätzlich die Regeln für Passwörter der Zugänge.
      NODE_ENV: "test",
      PAIBOT_ROLE: "migrate",
      DATABASE_URL: appUrl,
      DATABASE_MIGRATION_URL: db.url,
      MIGRATIONS_DIR: MIGRATIONS_FOLDER,
    } as NodeJS.ProcessEnv;
    await prepareStart(migrate, { log: silent, exit });
    const { db: app, sql } = createDb(appUrl);
    try {
      const now = new Date();
      for (const key of [
        "anmelden:gesamt",
        "anmelden:ip:192.0.2.1",
        "anmelden:takt:2",
        "nachricht:x",
      ]) {
        await repo.rateLimit.hit(app, { key, max: 1, windowSeconds: 900, now });
      }
      await prepareStart(migrate, { log: silent, exit });
      const rest = await sql<{ key: string }[]>`select key from public.rate_limits order by key`;
      expect(rest.map((r) => r.key)).toEqual(["nachricht:x"]);
    } finally {
      await sql.end({ timeout: 2 });
    }
  }, 60_000);

  it("alte Zähler der Limits werden mit der App-Rolle gelöscht, laufende und vorige Fenster bleiben", async () => {
    const db = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
    opened.push(db);
    const appUrl = newRole(db);
    await runMigrations(db.url, MIGRATIONS_FOLDER, { appUrl });
    const { db: app, sql } = createDb(appUrl);
    try {
      const jetzt = new Date("2026-11-21T12:00:00.000Z");
      const vor = (minuten: number) => new Date(jetzt.getTime() - minuten * 60_000);
      const zaehle = (key: string, windowSeconds: number, now: Date) =>
        repo.rateLimit.hit(app, { key, max: 5, windowSeconds, now });
      await zaehle("anmelden:ip:alt", 900, vor(60));
      await zaehle("anmelden:takt:2", 2, vor(45));
      await zaehle("nachricht:x", 60, vor(40));
      await zaehle("anmelden:ip:vorig", 900, vor(20));
      await zaehle("anmelden:ip:jetzt", 900, jetzt);
      await zaehle("anmelden:tag:gestern", 86_400, vor(24 * 60));
      await zaehle("anmelden:geraet_tag:gestern", 86_400, vor(24 * 60));
      await zaehle("anmelden:tag:vorgestern", 86_400, vor(3 * 24 * 60));
      expect(await alteZaehlerLoeschen(app, jetzt)).toBe(4);
      const rest = await sql<{ key: string }[]>`select key from public.rate_limits order by key`;
      expect(rest.map((r) => r.key)).toEqual([
        "anmelden:geraet_tag:gestern",
        "anmelden:ip:jetzt",
        "anmelden:ip:vorig",
        "anmelden:tag:gestern",
      ]);
    } finally {
      await sql.end({ timeout: 2 });
    }
  }, 60_000);

  it("bestehende Installation: Warteschlange des bisherigen Besitzers wird an die App-Rolle übergeben", async () => {
    const db = await createPostgresTestDatabase(BASE_URL ?? "");
    opened.push(db);
    await roundTrip(db.url);

    const appUrl = newRole(db);
    await runMigrations(db.url, MIGRATIONS_FOLDER, { appUrl });
    await roundTrip(appUrl);
  }, 60_000);
  it("Rolle migrate richtet alles ein und endet mit 0; danach startet web nur mit der App-Rolle, ohne zu migrieren", async () => {
    const db = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
    opened.push(db);
    const appUrl = newRole(db);
    const secret = randomBytes(32).toString("base64");
    const exitCodes: number[] = [];
    const exit = ((code: number) => {
      exitCodes.push(code);
    }) as (code: number) => never;
    const env = (extra: Record<string, string>) =>
      ({
        NODE_ENV: "production",
        APP_URL: "https://paibot.example.de",
        PAIBOT_SECRET: secret,
        MIGRATIONS_DIR: MIGRATIONS_FOLDER,
        ...extra,
      }) as NodeJS.ProcessEnv;

    // Noch nicht migriert: web bricht ab, statt selbst zu migrieren.
    await prepareStart(env({ DATABASE_URL: appUrl }), { log: silent, exit, attempts: 1 });
    expect(exitCodes).toEqual([1]);

    await prepareStart(
      env({
        NODE_ENV: "test",
        PAIBOT_ROLE: "migrate",
        DATABASE_URL: appUrl,
        DATABASE_MIGRATION_URL: db.url,
      }),
      { log: silent, exit, attempts: 1 },
    );
    expect(exitCodes).toEqual([1, 0]);
    // Einrichtung offen, ein Code gilt: Der nächste Lauf von migrate verwirft ihn.
    const app = createDb(appUrl);
    try {
      expect(
        await repo.settings.setSetupCode(app.db, { hash: `sha256:${"a".repeat(64)}` as never }),
      ).toBe(true);
    } finally {
      await app.sql.end({ timeout: 2 });
    }
    // Ein zweiter Lauf macht nichts kaputt. (Das Passwort des Test-Superusers ist kurz, deshalb
    // ohne die Prüfungen für den Betrieb; migriert wird trotzdem wie im Betrieb.)
    await prepareStart(
      env({
        NODE_ENV: "test",
        PAIBOT_ROLE: "migrate",
        DATABASE_URL: appUrl,
        DATABASE_MIGRATION_URL: db.url,
      }),
      { log: silent, exit, attempts: 1 },
    );
    expect(exitCodes).toEqual([1, 0, 0]);
    const danach = createDb(appUrl);
    try {
      expect(await repo.settings.getSetupCode(danach.db)).toBeUndefined();
    } finally {
      await danach.sql.end({ timeout: 2 });
    }

    await prepareStart(env({ DATABASE_URL: appUrl }), { log: silent, exit, attempts: 1 });
    expect(exitCodes).toEqual([1, 0, 0]);
  }, 60_000);

  it("Update einer Installation ohne Worker-Rolle: migrate legt sie an, der Worker arbeitet danach mit ihr einen alten Auftrag ab", async () => {
    const db = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
    opened.push(db);
    const appUrl = newRole(db);
    const workerUrl = newRole(db);
    const workerName = new URL(workerUrl).username;
    const exitCodes: number[] = [];
    const exit = ((code: number) => {
      exitCodes.push(code);
    }) as (code: number) => never;
    const lines: string[] = [];
    const log = {
      info: (m: string) => lines.push(`info ${m}`),
      warn: (m: string) => lines.push(`warn ${m}`),
      error: (m: string) => lines.push(`error ${m}`),
    };
    // Nicht „production“: Das Passwort des Test-Superusers ist kurz (wie im Test darüber).
    const migrate = (extra: Record<string, string> = {}) =>
      ({
        NODE_ENV: "test",
        PAIBOT_ROLE: "migrate",
        DATABASE_URL: appUrl,
        DATABASE_MIGRATION_URL: db.url,
        MIGRATIONS_DIR: MIGRATIONS_FOLDER,
        ...extra,
      }) as NodeJS.ProcessEnv;

    // 1. Bestehende Installation (bisheriger Stand): nur App-Rolle, die Web-App legt die
    //    Warteschlange selbst an, ein Lauf wartet noch.
    await runMigrations(db.url, MIGRATIONS_FOLDER, { appUrl });
    const alt = createQueue(appUrl);
    const wartend = { runId: newId("run"), conversationId: newId("conversation") };
    try {
      await alt.start();
      await alt.enqueueRun(wartend);
    } finally {
      await alt.stop({ timeoutMs: 1000 });
    }

    // 2. Update ohne neuen Wert in der .env: migrate läuft durch, warnt aber.
    await prepareStart(migrate(), { log, exit, attempts: 1 });
    expect(exitCodes).toEqual([0]);
    expect(lines).toContainEqual(expect.stringMatching(/^warn DATABASE_WORKER_URL fehlt/));

    // 3. Wert ergänzt (sh deploy/env-ergaenzen.sh): migrate legt die Worker-Rolle an und gibt ihr
    //    die Rechte in der Warteschlange; ein zweiter Lauf ändert nichts mehr.
    lines.length = 0;
    await prepareStart(migrate({ DATABASE_WORKER_URL: workerUrl }), { log, exit, attempts: 1 });
    await prepareStart(migrate({ DATABASE_WORKER_URL: workerUrl }), { log, exit, attempts: 1 });
    expect(exitCodes).toEqual([0, 0, 0]);
    expect(lines).toContain(`info Worker-Rolle ${workerName} angelegt.`);
    expect(lines.filter((l) => l.includes(`angelegt.`) && l.includes(workerName))).toHaveLength(1);
    expect(lines.join("\n")).not.toContain(new URL(workerUrl).password);

    // 4. Der Worker mit seiner Rolle: eingeschränkt, arbeitet den alten Lauf ab, schreibt keine Bots.
    const worker = createDb(workerUrl);
    const queue = createQueue(workerUrl, { rolle: "worker" });
    try {
      expect(await checkWorkerRole(worker.sql)).toMatchObject({
        status: "eingeschraenkt",
        role: workerName,
        issues: [],
      });
      const seen: RunJob[] = [];
      await queue.start();
      await queue.startRunWorker(
        async (job) => {
          seen.push(job);
        },
        { concurrency: 1 },
      );
      await waitFor(() => seen.length > 0);
      expect(seen[0]).toEqual(wartend);
      const code = await worker.sql`insert into bots (id, name) values (${newId("bot")}, 'x')`.then(
        () => undefined,
        (error: { code?: string }) => error.code,
      );
      expect(code).toBe("42501");
    } finally {
      await queue.stop({ timeoutMs: 1000 });
      await worker.sql.end({ timeout: 2 });
    }

    // 5. Die Web-App startet danach weiter mit der App-Rolle.
    await roundTrip(appUrl);
  }, 90_000);
});
