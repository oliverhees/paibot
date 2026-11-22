/**
 * PaiBot – Neustart des Workers mitten in der Schleife: gebündelter Worker als eigener
 * Kindprozess mit Test-Werkzeugen, hart beendet (SIGKILL) während eines Werkzeugs, danach ein
 * neuer Worker und das Aufräumen; dazu sanftes Beenden mitten im Werkzeug. Nur mit
 * `PAIBOT_TEST_DATABASE_URL`. Der harte Fall dauert über eine Minute, weil ein Lauf erst nach
 * `staleAfterMs` (60 s) ohne Herzschlag als hängend gilt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFakeMotor, setupRun, testDokuEnv } from "@paibot/agents/testing";
import { createDb, repo } from "@paibot/db";
import {
  createPostgresTestDatabase,
  MIGRATIONS_FOLDER,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { createQueue } from "@paibot/jobs";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import type { RunId } from "@paibot/shared/ids";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const KEY = `sk-test-${"k".repeat(24)}`;
/** Zeile, die das Test-Werkzeug beim Start in die Ausgabe des Workers schreibt. */
const STARTED = "TESTWERKZEUG-START";

async function waitFor(condition: () => Promise<boolean> | boolean, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (!(await condition())) {
    if (Date.now() > until) throw new Error("Zeit abgelaufen");
    await sleep(50);
  }
}

/**
 * Einstieg des Test-Workers: der echte Worker (`runWorker`, `realWorkerDeps`), nur das Register
 * enthält `test_langsam` mit der Kennung von R-010 (also durch das echte Tor erlaubt).
 */
function entry(): string {
  const at = (file: string) => JSON.stringify(path.join(ROOT, file));
  return `
import { createTestTools } from ${at("packages/agents/src/testing/werkzeuge.ts")};
import { createToolRegistry } from ${at("packages/agents/src/werkzeuge/register.ts")};
import { realWorkerDeps } from ${at("apps/worker/src/abhaengigkeiten.ts")};
import { consoleLog } from ${at("apps/worker/src/protokoll.ts")};
import { installProcessHandlers } from ${at("apps/worker/src/prozess.ts")};
import { loadWorkerConfig, runWorker } from ${at("apps/worker/src/worker.ts")};
const tools = createTestTools({
  allowedByR010: "test_langsam",
  slowMs: 600000,
  onSlowStarted: () => console.log(${JSON.stringify(STARTED)}),
});
const registry = await createToolRegistry(tools.tools);
const real = realWorkerDeps();
await installProcessHandlers({
  env: process.env,
  log: consoleLog,
  load: loadWorkerConfig,
  start: (config, env) =>
    runWorker(config, env, {
      log: consoleLog,
      ...real,
      buildRunDeps: (db, e) => {
        const source = real.buildRunDeps(db, e);
        return { base: source.base, prepare: async () => ({ ...(await source.prepare()), tools: registry }) };
      },
    }),
  exit: (code) => process.exit(code),
  on: (event, listener) => process.on(event, listener),
});
`;
}

/** Kleiner Anbieter: die erste Anfrage wünscht `test_langsam`, jede weitere antwortet mit Text. */
function provider(): { server: Server; requests: () => number } {
  let count = 0;
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
        res.writeHead(404).end();
        return;
      }
      count += 1;
      const chunk = (delta: object, finish: string | null = null, extra: object = {}) =>
        `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "fake/test-modell", choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`;
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(chunk({ role: "assistant", content: "" }));
      if (count === 1) {
        res.write(
          chunk({
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                type: "function",
                function: { name: "test_langsam", arguments: '{"q":"x"}' },
              },
            ],
          }),
        );
        res.write(chunk({}, "tool_calls"));
      } else {
        res.write(chunk({ content: "Antwort nach dem Neustart." }));
        res.write(chunk({}, "stop"));
      }
      res.write(
        `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "fake/test-modell", choices: [], usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 } })}\n\n`,
      );
      res.end("data: [DONE]\n\n");
    });
  });
  return { server, requests: () => count };
}

describe.skipIf(BASE_URL === undefined)("Worker mitten im Werkzeug beendet", () => {
  async function umgebung() {
    const folder = await mkdtemp(path.join(tmpdir(), "paibot-schleife-"));
    const children: ChildProcess[] = [];
    const fake = provider();
    const testDb = await createPostgresTestDatabase(BASE_URL ?? "");
    const { db, sql } = createDb(testDb.url);
    const sender = createQueue(testDb.url);
    const entryFile = path.join(folder, "einstieg.ts");
    await writeFile(entryFile, entry());
    const bundle = path.join(folder, "worker.mjs");
    await build({
      entryPoints: [entryFile],
      outfile: bundle,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node26",
      external: ["pg-native"],
      banner: {
        js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
      },
      logLevel: "warning",
    });
    await new Promise<void>((resolve) => fake.server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}/v1`;
    const secret = randomBytes(32).toString("base64");
    const setup = await setupRun(
      db,
      {
        createWriter: createReceiptWriter,
        verify: (entries, options) => verifyChain(entries, options as never),
      },
      { secret, providerBaseUrl: baseUrl, providerKey: KEY, motor: createFakeMotor([]) },
    );
    const log: string[] = [];
    const spawnWorker = (name: string) => {
      const child = spawn(process.execPath, [bundle], {
        env: {
          PATH: process.env.PATH ?? "",
          PAIBOT_SECRET: secret,
          DATABASE_URL: testDb.url,
          MIGRATIONS_DIR: MIGRATIONS_FOLDER,
          NODE_ENV: "test",
          ...testDokuEnv(),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      children.push(child);
      const collect = (chunk: Buffer) => {
        for (const line of chunk.toString().split("\n"))
          if (line.trim() !== "") log.push(`${name}: ${line}`);
      };
      child.stdout?.on("data", collect);
      child.stderr?.on("data", collect);
      return child;
    };
    const status = async (id: RunId) => (await repo.runs.get(db, id))?.status;
    const starts = () => log.filter((l) => l.includes(STARTED)).length;
    const close = async () => {
      // Nur die eigenen Kindprozesse beenden.
      for (const child of children) if (child.exitCode === null) child.kill("SIGKILL");
      await sleep(300);
      await sender.stop({ timeoutMs: 1000 }).catch(() => undefined);
      fake.server.closeAllConnections();
      fake.server.close();
      await sql.end({ timeout: 2 }).catch(() => undefined);
      await testDb.drop().catch(() => undefined);
      await rm(folder, { recursive: true, force: true });
    };
    return { db, sender, setup, log, spawnWorker, status, starts, close, fake };
  }

  // Gegenprobe: Aufräumen ohne endOpenForRun → Zeile bleibt running, rot.
  it("kill -9 während test_langsam: Lauf failed unterbrochen, Zeile cancelled, Entscheidung mit Ergebnis error, Kette vertrauenswürdig, Werkzeug nie wiederholt, neuer Lauf möglich", async () => {
    const u = await umgebung();
    try {
      const w1 = u.spawnWorker("w1");
      await waitFor(() => u.log.some((l) => l.includes("Bereit")), 60_000);
      const a = await u.setup.queueMessage("Frage A");
      await u.sender.enqueueRun({ runId: a.runId, conversationId: u.setup.conversationId });
      await waitFor(() => u.starts() === 1, 30_000);
      w1.kill("SIGKILL");
      await sleep(200);
      u.spawnWorker("w2");
      // Nach `staleAfterMs` ohne Herzschlag räumt der neue Worker den Lauf auf.
      await waitFor(async () => (await u.status(a.runId)) === "failed", 110_000);
      expect(await repo.runs.get(u.db, a.runId)).toMatchObject({ errorCode: "unterbrochen" });
      expect(await repo.toolCalls.listForRun(u.db, a.runId)).toMatchObject([
        { status: "cancelled", errorCode: "unterbrochen" },
      ]);
      // Das Aufräumen schreibt die fehlenden Ergebnisse nach dem Beenden des Laufs.
      await waitFor(
        async () => (await u.setup.receipts()).filter((e) => e.body.type === "result").length >= 2,
        30_000,
      );
      const belege = await u.setup.receipts();
      const vonAktion = (type: string) =>
        belege.flatMap((e) =>
          (e.body.type === "decision" || e.body.type === "result") && e.body.action.type === type
            ? [e.body]
            : [],
        );
      const werkzeug = vonAktion("werkzeug.aufrufen");
      expect(werkzeug.map((b) => [b.type, b.type === "result" ? b.result : undefined])).toEqual([
        ["decision", undefined],
        ["result", { status: "error", code: "unterbrochen" }],
      ]);
      expect(vonAktion("modell.anfragen").map((b) => b.type)).toEqual(["decision", "result"]);
      const nachrichten = (
        await repo.messages.listForConversation(u.db, u.setup.conversationId)
      ).filter((m) => m.runId === a.runId);
      expect(nachrichten.filter((m) => m.step === undefined)).toEqual([]);
      expect((await u.setup.verify()).ok).toBe(true);
      // Ein neuer Lauf in derselben Unterhaltung; das Werkzeug läuft nicht noch einmal.
      const b = await u.setup.queueMessage("Frage B");
      await u.sender.enqueueRun({ runId: b.runId, conversationId: u.setup.conversationId });
      await waitFor(async () => (await u.status(b.runId)) === "succeeded", 30_000);
      expect(u.starts()).toBe(1);
    } finally {
      await u.close();
    }
  }, 240_000);

  // Gegenprobe: abortAll reicht das Signal nicht weiter → Werkzeug läuft weiter, Zeile bleibt running, rot.
  it("sanftes Beenden (SIGTERM, abortAll) mitten im Werkzeug: Lauf cancelled, Zeile cancelled", async () => {
    const u = await umgebung();
    try {
      const w1 = u.spawnWorker("w1");
      await waitFor(() => u.log.some((l) => l.includes("Bereit")), 60_000);
      const a = await u.setup.queueMessage("Frage A");
      await u.sender.enqueueRun({ runId: a.runId, conversationId: u.setup.conversationId });
      await waitFor(() => u.starts() === 1, 30_000);
      w1.kill("SIGTERM");
      await waitFor(() => w1.exitCode !== null, 30_000);
      expect(await repo.runs.get(u.db, a.runId)).toMatchObject({ status: "cancelled" });
      expect(await repo.toolCalls.listForRun(u.db, a.runId)).toMatchObject([
        { status: "cancelled", errorCode: "unterbrochen" },
      ]);
      expect((await u.setup.verify()).ok).toBe(true);
    } finally {
      await u.close();
    }
  }, 120_000);
});
