/**
 * PaiBot – Aufwärts-Test mit Bestandsdaten: Datenbanken im Stand der Migration 0013 (vom
 * veröffentlichten Stand mit Tor-Fassung 1 und vom Stand mit Tor-Fassung 2) steigen auf den
 * aktuellen Stand, ohne Daten zu verlieren, und ihre Beleg-Kette bleibt vertrauenswürdig. Gegen
 * PGlite und (mit PAIBOT_TEST_DATABASE_URL) gegen echtes Postgres.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readFileSync } from "node:fs";
import { createDb, type Database, repo } from "@paibot/db";
import { runMigrations } from "@paibot/db/migrate";
import {
  createPostgresTestDatabase,
  createTestDbFrom,
  MIGRATIONS_FOLDER,
  migrateTestDb,
  migrationsUpTo,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import type { RuleVersion } from "@paibot/receipts";
import {
  decisionFormat,
  exportHeader,
  exportJsonl,
  parseJsonl,
  reevaluate,
  verifyChain,
} from "@paibot/receipts";
import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];

/** Einträge im Journal bis einschließlich Migration 0013. */
const BIS_0013 = 14;

/** Bestands-Dateien (Herkunft und Befehl in `testdaten/stand-0013-erzeugen.test.ts`). */
const BESTAND = [
  { name: "veröffentlichter Stand (Tor-Fassung 1)", datei: "stand-0013-rc.sql", fassung: 1 },
  { name: "Stand mit Tor-Fassung 2", datei: "stand-0013-fassung-2.sql", fassung: 2 },
] as const;

/** Erwartete Zeilen je Tabelle in beiden Dateien. */
const ZEILEN: Readonly<Record<string, number>> = {
  belege: 42,
  bots: 2,
  conversation_events: 76,
  conversations: 2,
  geraete: 0,
  installation_keys: 2,
  messages: 10,
  models: 1,
  owner: 1,
  providers: 1,
  rate_limits: 0,
  runs: 6,
  schleuse_zustand: 0,
  sessions: 0,
  settings: 1,
  tool_calls: 0,
};

function bestand(datei: string): string {
  return readFileSync(new URL(`./testdaten/${datei}`, import.meta.url), "utf8");
}

/** Eine Datenbank im Test: Zugriff wie die App und rohe Abfragen. */
interface Umgebung {
  db: Database;
  abfrage<T>(text: string): Promise<T[]>;
  /** Spielt die Bestands-Datei ein (Trigger aus, wie bei `pg_restore --disable-triggers`). */
  einspielen(text: string): Promise<void>;
  migrieren(ordner?: string): Promise<void>;
  schliessen(): Promise<void>;
}

const SUCHPFAD = `select pg_catalog.set_config('search_path', '"$user", public', false);`;

async function pglite(ordner: string): Promise<Umgebung> {
  const test = await createTestDbFrom(ordner);
  return {
    db: test.db,
    abfrage: async <T>(text: string) => (await test.client.query<T>(text)).rows,
    einspielen: async (text) => {
      await test.client.exec(
        `set session_replication_role = replica;\n${text}\nset session_replication_role = origin;\n${SUCHPFAD}`,
      );
    },
    migrieren: (weiter) => migrateTestDb(test, weiter),
    schliessen: () => test.client.close(),
  };
}

async function echtesPostgres(ordner: string): Promise<Umgebung> {
  const datenbank = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
  await runMigrations(datenbank.url, ordner);
  const { db, sql } = createDb(datenbank.url);
  return {
    db: db as unknown as Database,
    abfrage: async <T>(text: string) => (await sql.unsafe(text)) as unknown as T[],
    einspielen: async (text) => {
      // Eigene Verbindung: die Datei setzt Einstellungen der Sitzung (z. B. den Suchpfad).
      const eine = createDb(datenbank.url).sql;
      try {
        await eine.begin(async (tx) => {
          await tx.unsafe("set local session_replication_role = replica");
          await tx.unsafe(text).simple();
        });
      } finally {
        await eine.end({ timeout: 2 });
      }
    },
    migrieren: async (weiter) => {
      await runMigrations(datenbank.url, weiter ?? MIGRATIONS_FOLDER);
    },
    schliessen: async () => {
      await sql.end({ timeout: 2 });
      await datenbank.drop();
    },
  };
}

/** Zeilen je Tabelle im Schema `public`. */
async function zeilenJeTabelle(u: Umgebung): Promise<Record<string, number>> {
  const tabellen = await u.abfrage<{ name: string }>(
    "select table_name as name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1",
  );
  const ergebnis: Record<string, number> = {};
  for (const { name } of tabellen) {
    const [zeile] = await u.abfrage<{ n: number }>(
      `select count(*)::int as n from public."${name}"`,
    );
    ergebnis[name] = Number(zeile?.n);
  }
  return ergebnis;
}

/** Alle Fassungen aller Regeln aus der Datenbank, nach Nummer. */
async function regelFassungen(u: Umgebung): Promise<RuleVersion[]> {
  const ids = await u.abfrage<{ id: string }>("select distinct id from public.rules order by 1");
  const fassungen: RuleVersion[] = [];
  for (const { id } of ids) fassungen.push(...(await repo.rules.listVersions(u.db, id)));
  return fassungen.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

/** Export wie in der App, gelesen und geprüft wie mit dem Befehl, Regeln aus der Datenbank. */
async function ketteUeberExport(u: Umgebung) {
  let text = "";
  for await (const zeile of exportJsonl(
    await exportHeader(u.db, new Date()),
    await repo.belege.listFrom(u.db),
  )) {
    text += zeile;
  }
  const { header, entries } = parseJsonl(text);
  const regeln = await regelFassungen(u);
  const report = await verifyChain(entries, {
    publicKeys: header.publicKeys,
    rules: regeln,
    ...(header.anchor === undefined ? {} : { anchor: header.anchor }),
  });
  return { report, entries, regeln };
}

const umgebungen = [
  { name: "PGlite", anlegen: pglite, aktiv: true },
  { name: "Postgres", anlegen: echtesPostgres, aktiv: BASE_URL !== undefined },
] as const;

for (const umgebung of umgebungen) {
  for (const fall of BESTAND) {
    describe.skipIf(!umgebung.aktiv)(
      `Aufstieg mit Bestandsdaten (${umgebung.name}): ${fall.name}`,
      () => {
        const offen: Umgebung[] = [];
        afterAll(async () => {
          for (const u of offen) await u.schliessen();
        });

        async function vorDemAufstieg(): Promise<Umgebung> {
          const u = await umgebung.anlegen(migrationsUpTo(BIS_0013));
          offen.push(u);
          await u.einspielen(bestand(fall.datei));
          return u;
        }

        it("vor dem Aufstieg: Daten vollständig, Kette vertrauenswürdig, Entscheidungen nachgerechnet", async () => {
          const u = await vorDemAufstieg();
          const zeilen = await zeilenJeTabelle(u);
          expect(Object.fromEntries(Object.entries(zeilen).filter(([t]) => t !== "rules"))).toEqual(
            ZEILEN,
          );
          const { report, entries, regeln } = await ketteUeberExport(u);
          expect(report.firstFailure).toBeUndefined();
          expect(report.verdict).toStrictEqual({
            level: "vertrauenswuerdig",
            findings: [],
            anchor: "geprueft",
          });
          let entscheidungen = 0;
          for (const entry of entries) {
            if (entry.body.type !== "decision") continue;
            expect(decisionFormat(entry.body), String(entry.seq)).toStrictEqual({
              status: "passt",
              format: fall.fassung,
            });
            expect(reevaluate(entry, regeln).status, String(entry.seq)).toBe("ok");
            entscheidungen++;
          }
          expect(entscheidungen).toBe(20);
        });
      },
    );
  }
}
