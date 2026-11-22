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

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { decryptSecret, deriveKey, loadMasterSecret } from "@paibot/crypto";
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
import { ACTIVE_STANDARD_RULES, createGate, evaluate, ruleSnapshot } from "@paibot/gate";
import type { RuleVersion } from "@paibot/receipts";
import {
  createReceiptWriter,
  decisionFormat,
  exportHeader,
  exportJsonl,
  parseJsonl,
  reevaluate,
  verifyChain,
} from "@paibot/receipts";
import { botActor } from "@paibot/shared/aktionen";
import type { ReceiptBody } from "@paibot/shared/belege";
import { secretAad, signingKeySecretBinding } from "@paibot/shared/bindung";
import { isPaiBotError } from "@paibot/shared/fehler";
import { type BotId, type ConversationId, type KeyId, newId } from "@paibot/shared/ids";
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

/** Öffentliches Wurzel-Geheimnis der Testdaten (so hergeleitet wie im Erzeuger-Skript). */
const STAND_TEST_GEHEIMNIS = createHash("sha256")
  .update("PaiBot Bestandsdaten nur für Tests")
  .digest("base64");

/** Neue Spalten der Migration 0014 je Tabelle. */
const NEUE_SPALTEN: Readonly<Record<string, readonly string[]>> = {
  messages: ["step", "origin"],
  settings: [
    "max_steps_per_run",
    "max_tool_calls_per_step",
    "max_tool_calls_per_run",
    "max_tokens_per_run",
    "tool_result_max_chars",
    "tool_results_max_chars_per_step",
  ],
  tool_calls: [
    "tool_key",
    "tool_digest",
    "reach",
    "foreign_content",
    "step",
    "untrusted_input",
    "raw_name",
    "output_truncated",
    "output_chars",
  ],
};

/** Inhalt jeder Tabelle (alle Zeilen als JSON, ohne die neuen Spalten), sortiert. */
async function inhalt(u: Umgebung): Promise<Record<string, string[]>> {
  const tabellen = await u.abfrage<{ name: string }>(
    "select table_name as name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1",
  );
  const ergebnis: Record<string, string[]> = {};
  for (const { name } of tabellen) {
    const zeilen = await u.abfrage<{ z: Record<string, unknown> | string }>(
      `select to_jsonb(t) as z from public."${name}" t`,
    );
    ergebnis[name] = zeilen
      .map(({ z }) => {
        const objekt = (typeof z === "string" ? JSON.parse(z) : z) as Record<string, unknown>;
        for (const spalte of NEUE_SPALTEN[name] ?? []) delete objekt[spalte];
        return JSON.stringify(objekt);
      })
      .sort();
  }
  return ergebnis;
}

/**
 * Hängt mit dem neuen Code neue Entscheidungen an dieselbe Kette: echtes Tor, echter Schreiber,
 * Regeln aus der Datenbank, der gespeicherte Schlüssel (entschlüsselt mit dem Test-Geheimnis).
 */
async function neueEntscheidungen(u: Umgebung) {
  const aktiv = await repo.installationKeys.getActive(u.db);
  if (aktiv === undefined) throw new Error("kein aktiver Schlüssel");
  const keysKey = deriveKey(loadMasterSecret({ PAIBOT_SECRET: STAND_TEST_GEHEIMNIS }), "keys-v1");
  const privateKey = decryptSecret(aktiv.privateKeyEnc, keysKey, {
    aad: secretAad(signingKeySecretBinding(aktiv.id as KeyId, aktiv.publicKey)),
  });
  const writer = createReceiptWriter(u.db, {
    current: async () => ({ keyId: aktiv.id as KeyId, privateKey }),
  });
  const gate = createGate({
    rules: {
      load: async () => {
        const { stand, rules } = await repo.rules.loadSnapshot(u.db);
        return ruleSnapshot(rules, stand);
      },
    },
    receipts: writer,
    clock: { now: () => new Date() },
  });
  const [zeile] = await u.abfrage<{ bot: string; unterhaltung: string }>(
    "select b.id as bot, c.id as unterhaltung from public.bots b join public.conversations c on c.bot_id = b.id order by b.created_at limit 1",
  );
  const botId = zeile?.bot as BotId;
  const conversationId = zeile?.unterhaltung as ConversationId;
  const runId = newId("run");
  const werkzeug = (toolKey: string) => ({
    botOfConversation: true,
    runRunning: true,
    toolName: "doku_nachschlagen",
    toolSource: "eingebaut",
    toolKind: "lesen",
    argsDigest: `hmac-sha256:${"a7".repeat(32)}`,
    killSwitch: false,
    toolKey,
    toolDigest: `sha256:${"4d".repeat(32)}`,
    toolReach: "intern",
    toolForeign: false,
    toolRegistered: true,
    toolOffered: true,
    inputValid: true,
    untrustedInput: false,
    step: 0,
    callIndexInStep: 0,
    maxCallsPerStep: 8,
    callsInRun: 0,
    maxCallsPerRun: 16,
    trigger: "chat",
  });
  const ausfuehren = async () => ({ value: undefined, result: { status: "ok" as const } });
  const ergebnisse: { type: string; outcome?: string; rules?: string[]; error?: string }[] = [];
  const lauf = async (type: string, actor: string, target: object, facts: object) => {
    try {
      const r = await gate.run(
        { actionId: newId("action"), type, actor, target } as never,
        facts as never,
        ausfuehren,
        { context: { digest: `hmac-sha256:${"7e".repeat(32)}` } },
      );
      ergebnisse.push({
        type,
        outcome: r.decision.outcome,
        rules: r.decision.matchedRules.map((m) => m.id),
      });
    } catch (error) {
      if (!isPaiBotError(error)) throw error;
      ergebnisse.push({ type, error: error.code });
    }
  };
  await lauf(
    "nachricht.senden",
    "besitzer",
    { conversationId, messageId: newId("message") },
    {
      credential: "sitzung",
      inputChars: 20,
      maxInputChars: 32000,
      conversationExists: true,
      runActive: false,
      killSwitch: false,
    },
  );
  const ziel = { conversationId, runId, botId };
  await lauf("werkzeug.aufrufen", botActor(botId), ziel, werkzeug("eingebaut/doku.nachschlagen"));
  await lauf("werkzeug.aufrufen", botActor(botId), ziel, werkzeug("eingebaut/test_lesen"));
  return ergebnisse;
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

        it("nach dem Aufstieg: nichts verloren, Startwerte gesetzt, Kette vertrauenswürdig, neue Entscheidungen hängen an", async () => {
          const u = await vorDemAufstieg();
          const vorher = await inhalt(u);
          await u.migrieren();

          const zeilen = await zeilenJeTabelle(u);
          const vorherZeilen = Object.fromEntries(
            Object.entries(vorher).map(([t, z]) => [t, z.length + (t === "rules" ? 1 : 0)]),
          );
          expect(zeilen).toEqual(vorherZeilen);
          const nachher = await inhalt(u);
          for (const [tabelle, alt] of Object.entries(vorher)) {
            const neu = nachher[tabelle] ?? [];
            if (tabelle === "rules") {
              expect(
                alt.every((z) => neu.includes(z)),
                tabelle,
              ).toBe(true);
            } else {
              expect(neu, tabelle).toEqual(alt);
            }
          }
          const nachrichten = await u.abfrage<{ origin: string; step: number | null }>(
            "select origin, step from public.messages",
          );
          expect(nachrichten).toHaveLength(ZEILEN.messages ?? 0);
          for (const n of nachrichten) expect(n).toEqual({ origin: "modell", step: null });
          const [einstellungen] = await u.abfrage<{ n: number }>(
            "select max_tokens_per_run as n from public.settings",
          );
          expect(Number(einstellungen?.n)).toBe(130000);

          const { report, entries, regeln } = await ketteUeberExport(u);
          expect(report.firstFailure).toBeUndefined();
          expect(report.verdict).toStrictEqual({
            level: "vertrauenswuerdig",
            findings: [],
            anchor: "geprueft",
          });
          for (const entry of entries) {
            if (entry.body.type !== "decision") continue;
            expect(decisionFormat(entry.body).status, String(entry.seq)).toBe("passt");
            expect(reevaluate(entry, regeln).status, String(entry.seq)).toBe("ok");
          }

          // Mit dem neuen Code an dieselbe Kette: R-010 erlaubt das Nachschlagen in der Doku, ein
          // anderes Werkzeug fragt weiter (R-005, das Tor lehnt in dieser Fassung ab).
          expect(await neueEntscheidungen(u)).toEqual([
            { type: "nachricht.senden", outcome: "allow", rules: ["R-001"] },
            { type: "werkzeug.aufrufen", outcome: "allow", rules: ["R-010"] },
            { type: "werkzeug.aufrufen", error: "regel_fehlt" },
          ]);
          const danach = await ketteUeberExport(u);
          expect(danach.report.firstFailure).toBeUndefined();
          expect(danach.report.verdict).toStrictEqual({
            level: "vertrauenswuerdig",
            findings: [],
            anchor: "geprueft",
          });
          const neu = danach.entries.slice(entries.length);
          const neuEntschieden = neu.filter((e) => e.body.type === "decision");
          expect(neuEntschieden).toHaveLength(3);
          for (const entry of neuEntschieden) {
            expect(reevaluate(entry, danach.regeln), String(entry.seq)).toMatchObject({
              status: "ok",
            });
          }
          const r010 = neuEntschieden[1]?.body as Extract<ReceiptBody, { type: "decision" }>;
          expect(r010.decision.rules.map((m) => m.id)).toEqual(["R-010"]);
          const r005 = neuEntschieden[2]?.body as Extract<ReceiptBody, { type: "decision" }>;
          expect([r005.decision.outcome, r005.decision.rules.map((m) => m.id)]).toEqual([
            "ask",
            ["R-005"],
          ]);
        });
      },
    );
  }
}

describe("Startwert der Token-Grenze im Tor (Bestandsdaten)", () => {
  it("mit dem migrierten Wert besteht ein voller Schritt des Bots mit 100 000 die Grenze G-18", async () => {
    const u = await pglite(migrationsUpTo(BIS_0013));
    try {
      await u.einspielen(bestand("stand-0013-rc.sql"));
      await u.migrieren();
      const [zeile] = await u.abfrage<{ n: number; bot: string; ausgabe: number }>(
        "select s.max_tokens_per_run as n, b.id as bot, b.max_output_tokens as ausgabe from public.settings s, public.bots b where b.max_output_tokens = 100000",
      );
      expect(Number(zeile?.ausgabe)).toBe(100000);
      const grenze = (maxRunTokens: number) => {
        const botId = zeile?.bot as BotId;
        const decision = evaluate(
          {
            actionId: newId("action"),
            type: "modell.anfragen",
            actor: botActor(botId),
            target: {
              conversationId: newId("conversation"),
              runId: newId("run"),
              botId,
              modelId: newId("model"),
            },
          },
          {
            botOfConversation: true,
            providerId: newId("provider"),
            providerEnabled: true,
            region: "eu",
            route: "direct",
            requestedMode: "off",
            schleuseReachable: false,
            inputChars: 120000,
            maxInputChars: 120000,
            maxOutputTokens: 100000,
            botMaxOutputTokens: 100000,
            tokensToday: 0,
            killSwitch: false,
            targetOrigin: "https://api.example.com",
            targetDigest: `sha256:${"5e".repeat(32)}`,
            step: 0,
            maxSteps: 1,
            runTokens: 0,
            stepTokenEstimate: 130000,
            maxRunTokens,
            toolCount: 0,
            untrustedInput: false,
            trigger: "chat",
          },
          ACTIVE_STANDARD_RULES.map((rule) => ({ ...rule, hash: "" })) as never,
        );
        return decision.limits.find((l) => l.name === "lauf_token")?.result;
      };
      expect(grenze(Number(zeile?.n))).toBe("ok");
      // Gegenstück: mit dem festen Startwert einer neuen Installation wäre derselbe Schritt zu groß.
      expect(grenze(60000)).toBe("verletzt");
    } finally {
      await u.schliessen();
    }
  });
});
