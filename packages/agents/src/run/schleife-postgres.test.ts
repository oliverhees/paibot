/**
 * PaiBot – Tests der Schritt-Schleife gegen echtes Postgres 16: keine Sperre während eines
 * Werkzeugs, Abbruch und Not-Aus mitten im Werkzeug, Datenbank-Halt, Schritt-Ende in einer
 * Transaktion, Absturz mitten im Schritt. Läuft nur mit `PAIBOT_TEST_DATABASE_URL`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { createDb, repo } from "@paibot/db";
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { createFakeProvider, type FakeProvider, type FakeScript } from "@paibot/fake-provider";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAiSdkMotor } from "../motor-aisdk";
import { type RunSetupOptions, setupRun } from "../testing/lauf-umgebung";
import { createTestTools, type TestToolCall, type TestToolOptions } from "../testing/werkzeuge";
import { createToolRegistry } from "../werkzeuge/register";
import { failStaleRuns } from "./aufraeumen";
import { executeRun } from "./ausfuehren";
import { ANSWER_TEXT, SCRIPTS } from "./testdaten/drehbuecher";

const baseUrl = process.env[TEST_DATABASE_URL_ENV];
const PROVIDER_KEY = `sk-test-${"p".repeat(24)}`;

const RECEIPT_TOOLS = {
  createWriter: createReceiptWriter,
  verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
    verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
};

async function waitFor(check: () => Promise<boolean>, ms = 10_000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Zeitgrenze beim Warten");
}

describe.skipIf(baseUrl === undefined)("Schleife gegen Postgres", () => {
  let provider: FakeProvider;
  let providerUrl: string;
  const cleanup: (() => Promise<void>)[] = [];

  beforeAll(async () => {
    provider = createFakeProvider({ apiKey: PROVIDER_KEY, reply: ANSWER_TEXT });
    ({ baseUrl: providerUrl } = await provider.start({ port: 0 }));
  });
  afterAll(async () => {
    await provider.stop();
  });
  afterEach(async () => {
    provider.reset();
    for (const step of cleanup.splice(0).reverse()) await step().catch(() => undefined);
  });

  /**
   * Eigene Datenbank, Installation mit Test-Werkzeugen (`test_langsam` mit der Kennung von R-010,
   * also durch das echte Tor erlaubt), Worker-Verbindung und Verwalter-Verbindung zum Kappen.
   */
  async function umgebung(
    script: FakeScript,
    tools: TestToolOptions = {},
    extra: Partial<RunSetupOptions> = {},
  ) {
    const database: PostgresTestDatabase = await createPostgresTestDatabase(baseUrl as string);
    cleanup.push(() => database.drop());
    const name = new URL(database.url).pathname.slice(1);
    const main = createDb(database.url);
    const worker = createDb(database.url);
    cleanup.push(() => main.sql.end({ timeout: 1 }));
    cleanup.push(() => worker.sql.end({ timeout: 1 }));
    const verwalter = createDb(baseUrl as string);
    cleanup.push(() => verwalter.sql.end({ timeout: 1 }));
    const admin = await verwalter.sql.reserve();
    cleanup.push(async () => admin.release());
    const motor = createAiSdkMotor();
    let started: (call: TestToolCall) => void = () => undefined;
    const slowStarted = new Promise<TestToolCall>((resolve) => {
      started = resolve;
    });
    const set = createTestTools({
      allowedByR010: "test_langsam",
      onSlowStarted: (c) => started(c),
      ...tools,
    });
    const env = await setupRun(main.db, RECEIPT_TOOLS, {
      providerBaseUrl: providerUrl,
      providerKey: PROVIDER_KEY,
      motor,
      tuning: { cancelPollMs: 50, heartbeatMs: 100 },
      ...extra,
    });
    const deps = env.depsFor(worker.db, motor);
    deps.tools = await createToolRegistry(set.tools);
    provider.reset();
    provider.configure({ reply: ANSWER_TEXT, script });
    const kappen = async () => {
      await admin.unsafe(`alter database ${name} with allow_connections false`);
      await admin`select pg_catalog.pg_terminate_backend(pid) from pg_catalog.pg_stat_activity where datname = ${name}`;
    };
    const zurueck = () => admin.unsafe(`alter database ${name} with allow_connections true`);
    cleanup.push(async () => {
      await zurueck();
    });
    const starten = async () => {
      const { runId } = await env.queueMessage("Frage");
      const lauf = executeRun(runId, deps, new AbortController().signal).then(
        (ergebnis) => ({ ergebnis }),
        (fehler: unknown) => ({ fehler }),
      );
      return { runId, lauf };
    };
    const chats = () => provider.requests.filter((r) => r.path.endsWith("/chat/completions"));
    return { env, deps, set, slowStarted, starten, kappen, zurueck, chats, url: database.url };
  }

  describe("keine Sperre während eines Werkzeugs", () => {
    // Gegenprobe: Werkzeug in einer Transaktion mit `for update` ausführen → Zeitüberschreitung, rot.
    it("während test_langsam läuft, sperrt eine zweite Verbindung runs, tool_calls und settings des Laufs", async () => {
      const u = await umgebung(SCRIPTS.langsam, { slowMs: 60_000 });
      const { runId, lauf } = await u.starten();
      await u.slowStarted;
      const zweite = createDb(u.url).sql;
      cleanup.push(() => zweite.end({ timeout: 1 }));
      await zweite.begin(async (tx) => {
        await tx.unsafe("set local lock_timeout = '200ms'");
        await tx`select id from runs where id = ${runId} for update`;
        await tx`select action_id from tool_calls where run_id = ${runId} for update`;
        await tx`select id from settings for update`;
      });
      await repo.runs.requestCancel(u.env.db, runId);
      const ende = await lauf;
      expect(ende).toMatchObject({ ergebnis: { status: "cancelled" } });
    }, 30_000);
  });

  describe("Abbruch mitten im Werkzeug", () => {
    // Gegenprobe: Signal nicht ins Werkzeug weiterreichen → Werkzeug läuft zu Ende, rot.
    it("Not-Aus während test_langsam: Signal binnen 1 s im Werkzeug, Zeile cancelled, kein weiterer Schritt, Lauf cancelled angehalten", async () => {
      const u = await umgebung(SCRIPTS.langsam, { slowMs: 60_000 });
      const { runId, lauf } = await u.starten();
      const call = await u.slowStarted;
      const gesetzt = Date.now();
      await repo.settings.update(u.env.db, { killSwitch: true });
      expect(await lauf).toMatchObject({ ergebnis: { status: "cancelled", code: "angehalten" } });
      expect(call.abortedAt).toBeDefined();
      expect((call.abortedAt ?? Infinity) - gesetzt).toBeLessThan(1000);
      expect(call.finished).toBe(false);
      expect(u.chats()).toHaveLength(1);
      expect(await repo.toolCalls.listForRun(u.env.db, runId)).toMatchObject([
        { status: "cancelled", errorCode: "unterbrochen" },
      ]);
      expect((await u.env.verify()).ok).toBe(true);
    }, 30_000);

    it("Stopp während test_langsam: Zeile cancelled unterbrochen, kein weiterer Schritt, Lauf cancelled", async () => {
      const u = await umgebung(SCRIPTS.langsam, { slowMs: 60_000 });
      const { runId, lauf } = await u.starten();
      await u.slowStarted;
      await repo.runs.requestCancel(u.env.db, runId);
      expect(await lauf).toMatchObject({ ergebnis: { status: "cancelled" } });
      expect(u.chats()).toHaveLength(1);
      expect(await repo.toolCalls.listForRun(u.env.db, runId)).toMatchObject([
        { status: "cancelled", errorCode: "unterbrochen" },
      ]);
      const ergebnis = (await u.env.receipts()).find(
        (e) => e.body.type === "result" && e.body.action.type === "werkzeug.aufrufen",
      );
      expect(ergebnis?.body).toMatchObject({ result: { status: "cancelled" } });
    }, 30_000);

    // Gegenprobe: Wächter-Grund datenbank ignorieren → Lauf hängt bis zur Zeitgrenze, rot.
    it("Datenbank-Verbindung während test_langsam gekappt: Wächter hält an, Zeile nicht succeeded", async () => {
      const u = await umgebung(SCRIPTS.langsam, { slowMs: 60_000 });
      const { runId, lauf } = await u.starten();
      const call = await u.slowStarted;
      const gekappt = Date.now();
      await u.kappen();
      const ende = await Promise.race([
        lauf,
        new Promise<"haengt">((resolve) => setTimeout(() => resolve("haengt"), 10_000)),
      ]);
      expect(ende).not.toBe("haengt");
      expect(Date.now() - gekappt).toBeLessThan(10_000);
      expect(call.finished).toBe(false);
      await u.zurueck();
      const spaeter = new Date(Date.now() + 61_000);
      await failStaleRuns({ db: u.env.db, clock: { now: () => spaeter }, receipts: u.env.writer });
      const [zeile] = await repo.toolCalls.listForRun(u.env.db, runId);
      expect(zeile?.status).not.toBe("succeeded");
      expect(zeile?.status).toBe("cancelled");
      expect(await repo.runs.get(u.env.db, runId)).toMatchObject({
        status: expect.stringMatching(/failed|cancelled/),
      });
      expect((await u.env.verify()).ok).toBe(true);
    }, 40_000);

    // Gegenprobe: Teiltext als End-Antwort speichern → Nachricht mit leerem step, rot.
    it("Datenbank-Halt mitten in einem Schritt mit Werkzeugen: keine Nachricht mit leerem step", async () => {
      const u = await umgebung(SCRIPTS.abbruchEntwurf);
      provider.configure({ holdAfterChunks: 2, chunkChars: 4 });
      const { runId, lauf } = await u.starten();
      await waitFor(async () => (await u.env.events()).some((e) => e.type === "draft.delta"));
      await u.kappen();
      await Promise.race([lauf, new Promise((resolve) => setTimeout(resolve, 10_000))]);
      await u.zurueck();
      const spaeter = new Date(Date.now() + 61_000);
      await failStaleRuns({ db: u.env.db, clock: { now: () => spaeter }, receipts: u.env.writer });
      const nachrichten = (
        await repo.messages.listForConversation(u.env.db, u.env.conversationId, { limit: 50 })
      ).filter((m) => m.runId === runId);
      expect(nachrichten.every((m) => m.step !== undefined)).toBe(true);
      expect((await u.env.verify()).ok).toBe(true);
    }, 40_000);
  });

  describe("Schritt-Ende", () => {
    // Gegenprobe: Nachricht außerhalb der Transaktion des Schritt-Endes anlegen → sie bleibt stehen, rot.
    it("Fehler mitten in der Transaktion des Schritt-Endes: keine halbe Nachricht, keine Zeilen, kein Werkzeug", async () => {
      const u = await umgebung(SCRIPTS.textDannAufruf, {}, {});
      u.deps.tools = await createToolRegistry(
        createTestTools({ allowedByR010: "test_lesen" }).tools,
      );
      const zweite = createDb(u.url).sql;
      cleanup.push(() => zweite.end({ timeout: 1 }));
      await zweite.unsafe(`create function test_scheitern() returns trigger language plpgsql as $$
        begin raise exception 'eingespielter Fehler'; end $$`);
      await zweite.unsafe(
        "create trigger test_scheitern before insert on tool_calls for each row execute function test_scheitern()",
      );
      const { runId, lauf } = await u.starten();
      expect(await lauf).toMatchObject({ fehler: expect.anything() });
      const nachrichten = (
        await repo.messages.listForConversation(u.env.db, u.env.conversationId, { limit: 50 })
      ).filter((m) => m.runId === runId);
      expect(nachrichten).toEqual([]);
      expect(await repo.toolCalls.listForRun(u.env.db, runId)).toEqual([]);
    }, 30_000);

    // Gegenprobe: failRun liest draft.delta als Text → End-Antwort entsteht, rot.
    it("Absturz mitten im Schritt (Lauf ohne Herzschlag, Aufräumen): keine Nachricht mit leerem step, draft.delta bleibt nur Ereignis", async () => {
      const u = await umgebung(SCRIPTS.abbruchEntwurf);
      provider.configure({ holdAfterChunks: 2, chunkChars: 4 });
      const { runId, lauf } = await u.starten();
      await waitFor(async () => (await u.env.events()).some((e) => e.type === "draft.delta"));
      // Wie ein abgestürzter Worker: niemand arbeitet mehr am Lauf; das Aufräumen kommt später.
      const spaeter = new Date(Date.now() + 61_000);
      await failStaleRuns(
        { db: u.env.db, clock: { now: () => spaeter }, receipts: u.env.writer },
        { staleAfterMs: 60_000 },
      );
      await lauf;
      const nachrichten = (
        await repo.messages.listForConversation(u.env.db, u.env.conversationId, { limit: 50 })
      ).filter((m) => m.runId === runId);
      expect(nachrichten.filter((m) => m.step === undefined)).toEqual([]);
      expect((await u.env.events()).some((e) => e.type === "draft.delta")).toBe(true);
      expect((await repo.runs.get(u.env.db, runId))?.status).toBe("failed");
      expect((await u.env.verify()).ok).toBe(true);
    }, 40_000);
  });
});
