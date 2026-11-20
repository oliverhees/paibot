/**
 * PaiBot – Tests für die Schnittstelle der Warteschlange.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { newId } from "@paibot/shared/ids";
import { describe, expect, it } from "vitest";
import { createQueue, RUN_QUEUE, runJobSchema } from "./index";

describe("Schnittstelle", () => {
  it("RunJob nimmt nur Lauf- und Unterhaltungs-IDs", () => {
    const job = { runId: newId("run"), conversationId: newId("conversation") };
    expect(runJobSchema.parse(job)).toEqual(job);
    expect(runJobSchema.safeParse({ ...job, runId: newId("message") }).success).toBe(false);
    expect(runJobSchema.safeParse({ ...job, extra: 1 }).success).toBe(false);
  });

  it("die Warteschlange läuft ohne Wiederholung, ein Lauf pro Unterhaltung", () => {
    expect(RUN_QUEUE).toMatchObject({ name: "run", policy: "key_strict_fifo", retryLimit: 0 });
  });

  it("die Bibliothek ist installiert", async () => {
    const lib: Record<string, unknown> = await import("pg-boss");
    expect(typeof (lib.PgBoss ?? lib.default)).toBe("function");
  });

  it("createQueue verbindet erst mit start", async () => {
    // Auf Port 1 lauscht niemand: ohne `start` darf nichts verbunden werden.
    const queue = createQueue("postgres://localhost:1/paibot");
    expect(typeof queue.start).toBe("function");
    await queue.stop();
  });

  it("createQueue prüft maxConnections", () => {
    expect(() => createQueue("postgres://localhost:1/paibot", { maxConnections: 0 })).toThrow(
      RangeError,
    );
  });
});
