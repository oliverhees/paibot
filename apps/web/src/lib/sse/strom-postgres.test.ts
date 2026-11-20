/**
 * PaiBot – Ereignis-Strom gegen echtes Postgres (nur mit PAIBOT_TEST_DATABASE_URL): Meldungen über
 * getrennte Verbindungen, eine LISTEN-Verbindung für viele Ströme, Wiederaufbau mit Nachholen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createDb } from "@paibot/db";
import { events } from "@paibot/db/repo";
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { type ConversationId, newId } from "@paibot/shared/ids";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { erstelleEreignisRoute } from "./ereignis-route";
import { createStromZaehler } from "./grenzen";
import { beispielUnterhaltung, sseLeser, warten } from "./testhilfe";
import { ausPostgres, createVerteiler } from "./verteiler";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];

describe.skipIf(!BASE_URL)("Ereignis-Strom gegen Postgres", () => {
  let testDb: PostgresTestDatabase;
  let web: ReturnType<typeof createDb>;
  let schreiber: ReturnType<typeof createDb>;
  let cid: ConversationId;

  beforeAll(async () => {
    testDb = await createPostgresTestDatabase(BASE_URL ?? "");
    web = createDb(testDb.url);
    schreiber = createDb(testDb.url);
    cid = await beispielUnterhaltung(schreiber.db);
  }, 60_000);

  afterAll(async () => {
    await web?.sql.end({ timeout: 2 });
    await schreiber?.sql.end({ timeout: 2 });
    await testDb?.drop();
  });

  async function anhaengen(anzahl = 1): Promise<void> {
    for (let i = 0; i < anzahl; i += 1) {
      await events.append(schreiber.db, {
        conversationId: cid,
        type: "run.queued",
        data: { runId: newId("run") },
      });
    }
  }

  async function lauscher(): Promise<number> {
    const zeilen = await schreiber.sql<{ n: number }[]>`
      select count(*)::int as n from pg_stat_activity
      where datname = current_database() and query ilike 'listen %'`;
    return zeilen[0]?.n ?? 0;
  }

  it("liefert live, teilt eine LISTEN-Verbindung, setzt nach Trennen ohne Lücke fort, holt nach Wiederaufbau nach", async () => {
    const verteiler = createVerteiler(ausPostgres(web.sql));
    const GET = erstelleEreignisRoute({
      sitzungPruefen: async () => ({ ok: true, sitzung: "s" }),
      dienste: () => ({ db: web.db, verteiler, zaehler: createStromZaehler() }),
    });
    const oeffnen = async (kopf: Record<string, string> = {}) => {
      const abbruch = new AbortController();
      const antwort = await GET(
        new Request(`http://localhost/api/unterhaltungen/${cid}/ereignisse`, {
          headers: kopf,
          signal: abbruch.signal,
        }),
        { params: Promise.resolve({ id: cid }) },
      );
      expect(antwort.status).toBe(200);
      if (!antwort.body) throw new Error("kein Körper");
      const leser = sseLeser(antwort.body);
      return {
        leser,
        trennen: async () => {
          abbruch.abort();
          await leser.abbrechen();
        },
      };
    };
    const bis = (n: number) => (b: { id?: string }[]) => b.some((x) => x.id === String(n));

    await anhaengen(2);
    const eins = await oeffnen();
    const zwei = await oeffnen();
    await anhaengen(1);
    await eins.leser.bis(bis(3), 10_000);
    await zwei.leser.bis(bis(3), 10_000);
    expect(eins.leser.nummern()).toEqual([1, 2, 3]);
    expect(zwei.leser.nummern()).toEqual([1, 2, 3]);
    expect(await lauscher()).toBe(1);

    // Trennen, dazwischen schreiben, mit Last-Event-ID fortsetzen.
    await zwei.trennen();
    await anhaengen(2);
    await eins.leser.bis(bis(5), 10_000);
    const drei = await oeffnen({ "Last-Event-ID": "3" });
    await drei.leser.bis(bis(5), 10_000);
    expect(drei.leser.nummern()).toEqual([4, 5]);

    // LISTEN-Verbindung abschießen; was danach geschrieben wird, kommt nach dem Wiederaufbau an.
    const beendet = await schreiber.sql<{ ok: boolean }[]>`
      select pg_terminate_backend(pid) as ok from pg_stat_activity
      where datname = current_database() and query ilike 'listen %'`;
    expect(beendet.map((z) => z.ok)).toEqual([true]);
    await anhaengen(2);
    await eins.leser.bis(bis(7), 20_000);
    await drei.leser.bis(bis(7), 20_000);
    expect(eins.leser.nummern()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(drei.leser.nummern()).toEqual([4, 5, 6, 7]);
    expect(await lauscher()).toBe(1);

    await eins.trennen();
    await drei.trennen();
    await warten(() => verteiler.anzahl === 0 && !verteiler.hoertZu, 5000);
  }, 60_000);
});
