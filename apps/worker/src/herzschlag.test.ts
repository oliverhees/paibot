/**
 * PaiBot – Tests des Herzschlags: schreibt nur, solange die Prüfung rechtzeitig gelingt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { startHeartbeat } from "./herzschlag";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function setup(probe: () => Promise<void>) {
  const writes: string[] = [];
  const removed: string[] = [];
  const lines: string[] = [];
  const heartbeat = startHeartbeat({
    file: "/tmp/herz",
    intervalMs: 15,
    probeTimeoutMs: 20,
    probe,
    secrets: ["geheim-0123456789"],
    log: {
      info: (m) => lines.push(`info ${m}`),
      warn: (m) => lines.push(`warn ${m}`),
      error: (m) => lines.push(`error ${m}`),
    },
    write: async (_file, content) => {
      writes.push(content);
    },
    remove: async (file) => {
      removed.push(file);
    },
  });
  return { heartbeat, writes, removed, lines };
}

describe("Herzschlag", () => {
  it("schreibt die Zeit in Sekunden, solange die Prüfung gelingt", async () => {
    const { heartbeat, writes, removed } = setup(async () => undefined);
    await sleep(80);
    expect(heartbeat.beats()).toBeGreaterThan(2);
    expect(writes[0]).toMatch(/^\d{10}\n$/);
    await heartbeat.stop();
    const count = writes.length;
    await sleep(40);
    expect(writes.length).toBe(count);
    expect(removed).toEqual(["/tmp/herz"]);
  });

  it("hängt die Prüfung (z. B. die Warteschlange), bleibt der Herzschlag aus", async () => {
    let hang = false;
    const { heartbeat, lines } = setup(() =>
      hang ? new Promise<void>(() => undefined) : Promise.resolve(),
    );
    await sleep(50);
    hang = true;
    await sleep(40);
    const stuck = heartbeat.beats();
    await sleep(100);
    expect(heartbeat.beats()).toBe(stuck);
    expect(lines.filter((l) => l.startsWith("warn Herzschlag ausgesetzt"))).toHaveLength(1);
    hang = false;
    await sleep(80);
    expect(heartbeat.beats()).toBeGreaterThan(stuck);
    expect(lines.at(-1)).toBe("info Herzschlag läuft.");
    await heartbeat.stop();
  });

  it("scheitert die Prüfung, wird nichts geschrieben", async () => {
    const { heartbeat, lines } = setup(async () => {
      throw new Error("Datenbank antwortet nicht");
    });
    await sleep(60);
    expect(heartbeat.beats()).toBe(0);
    expect(lines).toEqual(["warn Herzschlag ausgesetzt: Error: Datenbank antwortet nicht."]);
    await heartbeat.stop();
  });

  it("Geheimnisse aus der Fehlermeldung erscheinen nicht im Log", async () => {
    const { heartbeat, lines } = setup(async () => {
      throw new Error("Verbindung postgres://app:geheim-0123456789@db/paibot abgelehnt");
    });
    await sleep(40);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^warn Herzschlag ausgesetzt: Error: /);
    expect(lines.join("\n")).not.toContain("geheim-0123456789");
    await heartbeat.stop();
  });
});
