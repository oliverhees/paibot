/**
 * PaiBot – Tests des Prozesses: Signale, zweites Signal, unerwartete Fehler, Exit-Codes.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { redact, secretsOf } from "./protokoll";
import { installProcessHandlers, type ProcessDeps } from "./prozess";
import { loadWorkerConfig, type RunningWorker, WorkerStartError } from "./worker";

const SECRET = randomBytes(32).toString("base64");
const PASSWORD = randomBytes(16).toString("hex");
const baseEnv = () => ({
  PAIBOT_SECRET: SECRET,
  DATABASE_URL: `postgres://paibot_app:${PASSWORD}@postgres:5432/paibot`,
  DATABASE_MIGRATION_URL: `postgres://paibot:${PASSWORD}x@postgres:5432/paibot`,
});

function harness(start?: ProcessDeps["start"]) {
  const lines: string[] = [];
  const exits: number[] = [];
  const listeners = new Map<string, (...args: unknown[]) => void>();
  let stops = 0;
  let release: (() => void) | undefined;
  const worker: RunningWorker = {
    stop: () => {
      stops += 1;
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    },
  };
  const env: Record<string, string | undefined> = baseEnv();
  const deps: ProcessDeps = {
    env,
    log: {
      info: (m) => lines.push(`info ${m}`),
      warn: (m) => lines.push(`warn ${m}`),
      error: (m) => lines.push(`error ${m}`),
    },
    load: loadWorkerConfig,
    start: start ?? (async () => worker),
    exit: (code) => exits.push(code),
    on: (event, listener) => listeners.set(event, listener),
    fatalStopTimeoutMs: 50,
  };
  const emit = (event: string, ...args: unknown[]) => listeners.get(event)?.(...args);
  return {
    deps,
    env,
    lines,
    exits,
    emit,
    stops: () => stops,
    release: () => release?.(),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("Prozess", () => {
  it("SIGTERM beendet sauber mit Exit-Code 0; die Migrations-Adresse ist danach weg", async () => {
    const h = harness();
    await installProcessHandlers(h.deps);
    expect(h.env.DATABASE_MIGRATION_URL).toBeUndefined();
    h.emit("SIGTERM");
    expect(h.stops()).toBe(1);
    expect(h.exits).toEqual([]);
    h.release();
    await tick();
    expect(h.exits).toEqual([0]);
    expect(h.lines).toContain("info Signal SIGTERM empfangen.");
  });

  it("ein zweites Signal beendet sofort mit Exit-Code 1", async () => {
    const h = harness();
    await installProcessHandlers(h.deps);
    h.emit("SIGINT");
    h.emit("SIGTERM");
    expect(h.exits).toEqual([1]);
    expect(h.lines).toContain("warn Zweites Signal (SIGTERM): beende sofort.");
  });

  it("ein Signal während des Starts beendet mit 0", async () => {
    let finish: ((w: RunningWorker) => void) | undefined;
    const h = harness(() => new Promise((resolve) => (finish = resolve)));
    const installed = installProcessHandlers(h.deps);
    await tick();
    h.emit("SIGTERM");
    expect(h.exits).toEqual([0]);
    let stopped = false;
    finish?.({
      stop: async () => {
        stopped = true;
      },
    });
    await installed;
    expect(stopped).toBe(true);
  });

  it("abgebrochener Start endet mit Exit-Code 1", async () => {
    const h = harness(async () => {
      throw new WorkerStartError("keine_datenbank");
    });
    await installProcessHandlers(h.deps);
    expect(h.exits).toEqual([1]);
  });

  it("fehlende Pflichtwerte: alle Meldungen, Exit-Code 1, Start wird nicht versucht", async () => {
    let started = false;
    const h = harness(async () => {
      started = true;
      throw new Error("nein");
    });
    delete h.env.PAIBOT_SECRET;
    delete h.env.DATABASE_URL;
    await installProcessHandlers(h.deps);
    expect(started).toBe(false);
    expect(h.exits).toEqual([1]);
    expect(h.lines).toEqual([
      "error PAIBOT_SECRET fehlt. Erzeuge es mit: openssl rand -base64 32",
      "error DATABASE_URL fehlt.",
      "error Start abgebrochen: Einstellungen unvollständig.",
    ]);
  });

  it("unerwartete Fehler: eine Zeile ohne Geheimnisse, Beenden, Exit-Code 1", async () => {
    const h = harness();
    await installProcessHandlers(h.deps);
    h.emit(
      "unhandledRejection",
      new Error(
        `Verbindung zu postgres://paibot_app:${PASSWORD}@postgres fehlgeschlagen ${SECRET}`,
      ),
    );
    expect(h.stops()).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(h.exits).toEqual([1]);
    const all = h.lines.join("\n");
    expect(all).toContain(
      "error Unerwarteter Fehler: Error: Verbindung zu postgres://***@postgres",
    );
    expect(all).not.toContain(PASSWORD);
    expect(all).not.toContain(SECRET);
  });

  it("Schwärzen: Passwörter aus beiden Adressen, Schlüssel, Zugangsdaten in fremden Adressen", () => {
    const secrets = secretsOf({ ...baseEnv(), SCHLEUSE_KEY: "sk-schleuse-geheim" });
    const text = redact(
      `a ${PASSWORD} b ${PASSWORD}x c sk-schleuse-geheim d https://u:p@host/x ${SECRET}`,
      secrets,
    );
    expect(text).toBe("a *** b *** c *** d https://***@host/x ***");
  });
});
