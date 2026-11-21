/**
 * PaiBot – Tor-Pflicht im Worker: Ein Auftrag aus der Warteschlange läuft über den echten
 * Auftrags-Handler und die echten Abhängigkeiten (`buildRunDeps`). Ein Schreib-Protokoll in der
 * Datenbank (Trigger auf jeder Tabelle) zeigt: Jede Modell-Anfrage hinterlässt Entscheidung und
 * Ergebnis, der Motor (der Weg zum Anbieter) läuft nur zwischen diesen beiden Belegen, eine
 * Ablehnung erreicht den Motor nie, und der Worker schreibt nur Lauf, Antwort, Ereignisse und
 * Belege. Die Liste der Bot-Aktionen kommt aus dem Vertrag.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { randomBytes } from "node:crypto";
import { executeRun } from "@paibot/agents";
import { createFakeMotor, type FakeMotorStep, setupRun } from "@paibot/agents/testing";
import { repo } from "@paibot/db";
import { createTestDb, type TestDb } from "@paibot/db/testing";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import { ACTION_TYPES, ACTIONS, type ActionType } from "@paibot/shared/aktionen";
import type { Motor } from "@paibot/shared/motor";
import { describe, expect, it, vi } from "vitest";
import { buildRunDeps } from "./abhaengigkeiten";
import { createRunHandler } from "./lauf";

type PGlite = TestDb["client"];

vi.setConfig({ testTimeout: 60_000 });

const TOOLS = {
  createWriter: createReceiptWriter,
  verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
    verifyChain(entries, options as never),
};

interface Schreiben {
  nr: number;
  tabelle: string;
  art: string;
  belegTyp: string | null;
  aktion: string | null;
  aktionId: string | null;
}

async function schreibProtokollAnlegen(client: PGlite): Promise<void> {
  await client.exec(`
    create table public.zz_schreiben (
      nr bigserial primary key, tabelle text not null, art text not null,
      beleg_typ text, aktion text, aktion_id text
    );
    create function public.zz_schreiben_merken() returns trigger language plpgsql as $f$
    begin
      if tg_table_name = 'belege' then
        insert into public.zz_schreiben (tabelle, art, beleg_typ, aktion, aktion_id)
          values (tg_table_name, tg_op, new.entry_type, new.action, new.action_id);
      elsif tg_table_name = 'conversations' and tg_op = 'UPDATE'
        and (to_jsonb(new) - 'last_message_at' - 'updated_at')
          = (to_jsonb(old) - 'last_message_at' - 'updated_at') then
        -- Nur der Zeitpunkt der letzten Nachricht (kommt mit jeder neuen Nachricht).
        insert into public.zz_schreiben (tabelle, art) values (tg_table_name, 'ZEIT');
      else
        insert into public.zz_schreiben (tabelle, art) values (tg_table_name, tg_op);
      end if;
      return null;
    end
    $f$;
  `);
  const { rows } = await client.query<{ name: string }>(
    `select table_name as name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'zz_schreiben'`,
  );
  for (const { name } of rows) {
    await client.exec(
      `create trigger zz_schreiben_${name} after insert or update or delete on public."${name}"
         for each row execute function public.zz_schreiben_merken();`,
    );
  }
}

async function letzteNr(client: PGlite): Promise<number> {
  const { rows } = await client.query<{ nr: string | null }>(
    "select max(nr) as nr from public.zz_schreiben",
  );
  return Number(rows[0]?.nr ?? 0);
}

async function protokollAb(client: PGlite, ab: number): Promise<Schreiben[]> {
  const { rows } = await client.query<Record<string, string | null>>(
    "select * from public.zz_schreiben where nr > $1 order by nr",
    [ab],
  );
  return rows.map((r) => ({
    nr: Number(r.nr),
    tabelle: r.tabelle as string,
    art: r.art as string,
    belegTyp: r.beleg_typ ?? null,
    aktion: r.aktion ?? null,
    aktionId: r.aktion_id ?? null,
  }));
}

/**
 * Was ein Lauf schreiben darf: Lauf, Antwort, Ereignisse, Belege und an der Unterhaltung nur den
 * Zeitpunkt der letzten Nachricht.
 */
const LAUF_TABELLEN = ["runs", "messages", "conversation_events", "belege"];
const lauffremd = (s: Schreiben) =>
  !LAUF_TABELLEN.includes(s.tabelle) && !(s.tabelle === "conversations" && s.art === "ZEIT");

/** Motor, der sich bei jedem Aufruf die Stelle im Schreib-Protokoll merkt. */
function beobachteterMotor(client: PGlite, schritte: readonly FakeMotorStep[]) {
  const innen = createFakeMotor(schritte);
  const aufrufe: number[] = [];
  const motor: Motor = {
    id: innen.id,
    capabilities: () => innen.capabilities(),
    async *runTurn(input, signal) {
      aufrufe.push(await letzteNr(client));
      yield* innen.runTurn(input, signal);
    },
  };
  return { motor, aufrufe };
}

const ANTWORT: FakeMotorStep[] = [
  { type: "text-delta", text: "Hallo, hier ist Pai." },
  { type: "finish", finishReason: "stop", usage: { input: 5, output: 4 } },
];

async function umgebung(schritte: readonly FakeMotorStep[] = ANTWORT) {
  const { db, client } = await createTestDb();
  await schreibProtokollAnlegen(client);
  const secret = randomBytes(32).toString("base64");
  const beobachtet = beobachteterMotor(client, schritte);
  const setup = await setupRun(db, TOOLS, {
    secret,
    providerBaseUrl: "http://127.0.0.1:9/v1",
    providerKey: "sk-test-unbenutzt-000000000000",
    motor: beobachtet.motor,
  });
  const quelle = buildRunDeps(db, { PAIBOT_SECRET: secret });
  const log: string[] = [];
  const handler = createRunHandler({
    db,
    executeRun,
    prepareRunDeps: async () => ({ ...(await quelle.prepare()), motor: beobachtet.motor }),
    log: { info: (z) => log.push(z), warn: (z) => log.push(z), error: (z) => log.push(z) },
    secrets: [secret],
  });
  /** Reiht eine Nachricht ein wie die Web-App und lässt den Auftrag laufen. */
  async function auftrag() {
    const { runId } = await setup.queueMessage("Hallo Pai");
    const ab = await letzteNr(client);
    await handler.handler(
      { runId, conversationId: setup.conversationId },
      new AbortController().signal,
    );
    return { runId, protokoll: await protokollAb(client, ab) };
  }
  return { db, client, setup, aufrufe: beobachtet.aufrufe, auftrag, log };
}

function fensterVon(protokoll: readonly Schreiben[], aktion: ActionType) {
  const belege = protokoll.filter((s) => s.tabelle === "belege" && s.aktion === aktion);
  const ids = [...new Set(belege.map((b) => b.aktionId))];
  return ids.map((id) => {
    const eigene = belege.filter((b) => b.aktionId === id);
    expect(eigene.map((b) => b.belegTyp)).toEqual(["decision", "result"]);
    return { entscheidung: eigene[0]?.nr ?? 0, ergebnis: eigene[1]?.nr ?? 0 };
  });
}

type BotAktion = {
  [T in ActionType]: (typeof ACTIONS)[T]["actor"] extends "bot" ? T : never;
}[ActionType];

/**
 * Jede Aktion eines Bots aus dem Vertrag: `lauf` = jeder Auftrag geht hier durch das Tor;
 * `werkzeug` = in der Basis gibt der Motor keine Werkzeuge heraus, ein Werkzeug-Wunsch führt nichts
 * aus (geprüft unten).
 */
const BOT_AKTIONEN: Record<BotAktion, "lauf" | "werkzeug"> = {
  "modell.anfragen": "lauf",
  "werkzeug.aufrufen": "werkzeug",
  "werkzeug.ausfuehren": "werkzeug",
};

describe("Tor-Pflicht im Worker", () => {
  it("jede Aktion eines Bots aus dem Vertrag ist hier eingeordnet", () => {
    const ausVertrag = ACTION_TYPES.filter((t) => ACTIONS[t].actor === "bot").sort();
    expect(Object.keys(BOT_AKTIONEN).sort()).toEqual(ausVertrag);
  });

  it("ein Auftrag: Entscheidung und Ergebnis, Motor nur dazwischen, nur Lauf-Tabellen", async () => {
    const u = await umgebung();
    const { runId, protokoll } = await u.auftrag();
    expect((await repo.runs.get(u.db, runId))?.status).toBe("succeeded");
    const fenster = fensterVon(protokoll, "modell.anfragen");
    expect(fenster).toHaveLength(1);
    expect(u.aufrufe).toHaveLength(1);
    const [f] = fenster;
    const [aufruf] = u.aufrufe;
    expect(aufruf).toBeGreaterThanOrEqual(f?.entscheidung ?? Number.POSITIVE_INFINITY);
    expect(aufruf).toBeLessThan(f?.ergebnis ?? 0);
    // Die Antwort entsteht in der Ausführung: die neue Nachricht liegt zwischen den Belegen.
    const antwort = protokoll.filter((s) => s.tabelle === "messages" && s.art === "INSERT");
    expect(antwort.length).toBeGreaterThan(0);
    for (const s of antwort) {
      expect(s.nr).toBeGreaterThan(f?.entscheidung ?? 0);
      expect(s.nr).toBeLessThan(f?.ergebnis ?? 0);
    }
    const fremd = protokoll.filter(lauffremd);
    expect(fremd.map((s) => `${s.art} ${s.tabelle}`)).toEqual([]);
    expect((await u.setup.verify()).ok).toBe(true);
  });

  it("Ablehnung durch das Tor (Not-Aus): beide Belege, der Motor wird nie gerufen", async () => {
    const u = await umgebung();
    await repo.settings.update(u.db, { killSwitch: true });
    const { runId, protokoll } = await u.auftrag();
    expect(u.aufrufe).toEqual([]);
    expect(fensterVon(protokoll, "modell.anfragen")).toHaveLength(1);
    const ergebnis = (await u.setup.receipts()).at(-1);
    expect(ergebnis?.body.type === "result" && ergebnis.body.result.status).toBe("denied");
    expect((await repo.runs.get(u.db, runId))?.status).not.toBe("succeeded");
    const fremd = protokoll.filter(lauffremd);
    expect(fremd.map((s) => `${s.art} ${s.tabelle}`)).toEqual([]);
  });

  it("Werkzeug-Wunsch des Motors: nichts ausgeführt, kein Werkzeug-Beleg, kein Werkzeug-Aufruf gespeichert", async () => {
    const u = await umgebung([
      { type: "tool-call", callId: "c1", name: "dateien_loeschen", input: { pfad: "/" } },
      { type: "finish", finishReason: "tool-calls", usage: { input: 3, output: 1 } },
    ]);
    const { protokoll } = await u.auftrag();
    const werkzeug = Object.entries(BOT_AKTIONEN)
      .filter(([, art]) => art === "werkzeug")
      .map(([a]) => a);
    expect(protokoll.filter((s) => s.aktion !== null && werkzeug.includes(s.aktion))).toEqual([]);
    expect(protokoll.filter((s) => s.tabelle === "tool_calls")).toEqual([]);
    expect(fensterVon(protokoll, "modell.anfragen")).toHaveLength(1);
  });
});
