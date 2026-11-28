/**
 * PaiBot – Test: Sicherung und Wiederherstellung gegen echtes Postgres (deploy/sicherung-db.sh).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  contextDigest,
  createSigningKeyHolder,
  type DerivedKey,
  decryptSecret,
  deriveKey,
  encryptSecret,
  fingerprint,
  generateSigningKey,
  hashPassword,
  isCryptoError,
  loadMasterSecret,
} from "@paibot/crypto";
import { createDb, type Database, repo } from "@paibot/db";
import { checkAppRole, runMigrations } from "@paibot/db/migrate";
import {
  createPostgresTestDatabase,
  MIGRATIONS_FOLDER,
  migrationsUpTo,
  newPostgresTestRole,
  type PostgresTestDatabase,
  type PostgresTestRole,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { createGate, ruleSnapshot } from "@paibot/gate";
import { providerTargetFacts } from "@paibot/llm";
import { createReceiptWriter, parseJsonl, runCli, verifyChain } from "@paibot/receipts";
import { providerSecretBinding, secretAad, signingKeySecretBinding } from "@paibot/shared/bindung";
import { type InstallationId, type KeyId, newId, type ProviderId } from "@paibot/shared/ids";
import { readStand } from "@paibot/shared/stand";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Ablauf wie im Betrieb, nur ohne Docker: Daten anlegen (Einrichtung, Anbieter mit Schlüssel,
 * Unterhaltungen, Belege, aktive Läufe, Warteschlange), mit `sicherung-db.sh sichern` sichern, in
 * eine leere und in eine frische Datenbank zurückspielen, den Migrations-Schritt laufen lassen und
 * vergleichen. Braucht `PAIBOT_TEST_DATABASE_URL` (Superuser eines Wegwerf-Servers) und psql,
 * pg_dump und pg_restore mindestens in der Hauptversion des Servers (`PAIBOT_TEST_PG_BIN` oder
 * /usr/lib/postgresql/<Version>/bin oder im Pfad). Fehlt etwas, überspringt sich der Test mit
 * Meldung; mit `PAIBOT_TEST_SICHERUNG_PFLICHT=1` schlägt er stattdessen fehl.
 */

const SKRIPT = fileURLToPath(new URL("../../../deploy/sicherung-db.sh", import.meta.url));
const BASIS = process.env[TEST_DATABASE_URL_ENV];
const PFLICHT = process.env.PAIBOT_TEST_SICHERUNG_PFLICHT === "1";
const PROVIDER_KEY = `sk-test-${randomBytes(12).toString("base64url")}`;
const SECRET = randomBytes(32).toString("base64");

/** Eine Verbindung (postgres-js, fester Suchpfad wie in der App). */
function verbinden(url: string) {
  return createDb(url).sql;
}

/** Hauptversion eines Werkzeugs aus „pg_dump (PostgreSQL) 17.2“. */
function hauptversion(bin: string | undefined, werkzeug: string): number | undefined {
  const lauf = spawnSync(bin === undefined ? werkzeug : path.join(bin, werkzeug), ["--version"], {
    encoding: "utf8",
  });
  const treffer = /(\d+)(?:\.\d+)?/.exec(lauf.stdout ?? "");
  return lauf.status === 0 && treffer ? Number(treffer[1]) : undefined;
}

/** Ordner mit psql, pg_dump und pg_restore (undefined: aus dem Pfad), höchste Version zuerst. */
function werkzeugOrdner(): Array<string | undefined> {
  if (process.env.PAIBOT_TEST_PG_BIN) return [process.env.PAIBOT_TEST_PG_BIN];
  const wurzel = "/usr/lib/postgresql";
  const ordner = existsSync(wurzel)
    ? readdirSync(wurzel)
        .filter((name) => /^\d+$/.test(name))
        .sort((a, b) => Number(b) - Number(a))
        .map((name) => path.join(wurzel, name, "bin"))
    : [];
  return [...ordner, undefined];
}

async function vorbereitung(): Promise<{ grund?: string; bin?: string | undefined }> {
  if (!BASIS) return { grund: `${TEST_DATABASE_URL_ENV} ist nicht gesetzt` };
  const sql = verbinden(BASIS);
  let server: number;
  try {
    const [zeile] = await sql<{ n: string }[]>`show server_version_num`;
    server = Math.floor(Number(zeile?.n ?? 0) / 10000);
  } finally {
    await sql.end({ timeout: 2 });
  }
  for (const bin of werkzeugOrdner()) {
    const versionen = ["psql", "pg_dump", "pg_restore"].map((w) => hauptversion(bin, w));
    if (versionen.every((v) => v !== undefined && v >= server)) return { bin };
  }
  return {
    grund: `psql, pg_dump und pg_restore ab Version ${server} fehlen (PAIBOT_TEST_PG_BIN setzen)`,
  };
}

const bereit = await vorbereitung();
if (bereit.grund !== undefined) {
  const text = `Sicherung gegen echtes Postgres übersprungen: ${bereit.grund}.`;
  if (PFLICHT) throw new Error(text);
  process.stderr.write(`${text}\n`);
}

interface Lauf {
  status: number | null;
  stdout: Buffer;
  stderr: string;
}

/** Ruft `sicherung-db.sh <befehl>` gegen die Datenbank hinter `url` auf (als Superuser). */
function skript(url: string, befehl: string, eingabe?: Buffer | string): Lauf {
  const adresse = new URL(url);
  const ordner = bereit.bin;
  const lauf = spawnSync("sh", [SKRIPT, befehl], {
    input: eingabe,
    maxBuffer: 256 * 1024 * 1024,
    env: {
      PATH: ordner === undefined ? (process.env.PATH ?? "") : `${ordner}:${process.env.PATH ?? ""}`,
      HOME: tmpdir(),
      PGHOST: adresse.hostname,
      PGPORT: adresse.port || "5432",
      PGUSER: decodeURIComponent(adresse.username),
      PGPASSWORD: decodeURIComponent(adresse.password),
      PGDATABASE: adresse.pathname.slice(1),
      ...(process.env.DOCKER_HOST === undefined ? {} : { DOCKER_HOST: process.env.DOCKER_HOST }),
    },
  });
  return { status: lauf.status, stdout: lauf.stdout, stderr: lauf.stderr.toString("utf8") };
}

/** Zeilen je Tabelle, unabhängig vom Skript gezählt (alle Schemas außer System und pgboss). */
async function zaehlen(url: string): Promise<Record<string, number>> {
  const sql = verbinden(url);
  try {
    const tabellen = await sql<{ schema: string; name: string }[]>`
      select n.nspname as schema, c.relname as name from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p') and not c.relispartition
        and n.nspname not in ('information_schema', 'pgboss') and n.nspname !~ '^pg_'
      order by 1, 2`;
    const ergebnis: Record<string, number> = {};
    for (const { schema, name } of tabellen) {
      const [zeile] = await sql<
        { n: number }[]
      >`select count(*)::int as n from ${sql(schema)}.${sql(name)}`;
      ergebnis[`${schema}.${name}`] = zeile?.n ?? -1;
    }
    return ergebnis;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

/** Rechte der Rolle auf Tabellen, Spalten, Sequenzen und Schemas, als sortierte Liste. */
async function rechte(url: string, rolle: string): Promise<string[]> {
  const sql = verbinden(url);
  try {
    const zeilen = await sql<{ r: string }[]>`
      select 'tabelle ' || table_schema || '.' || table_name || ' ' || privilege_type as r
        from information_schema.role_table_grants where grantee = ${rolle}
      union all
      select 'spalte ' || table_schema || '.' || table_name || '.' || column_name || ' ' || privilege_type
        from information_schema.column_privileges where grantee = ${rolle}
      union all
      select 'sequenz ' || n.nspname || '.' || c.relname || ' ' || p.privilege_type
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        cross join lateral aclexplode(c.relacl) a
        cross join lateral (select a.privilege_type) p
        where c.relkind = 'S' and a.grantee = (select oid from pg_roles where rolname = ${rolle})
      union all
      select 'schema ' || n.nspname || ' ' || a.privilege_type
        from pg_namespace n cross join lateral aclexplode(n.nspacl) a
        where a.grantee = (select oid from pg_roles where rolname = ${rolle})
      order by 1`;
    // Tabellen der Warteschlange legt pg-boss zur Laufzeit selbst an; sie sind nicht in der Sicherung.
    return zeilen.map((z) => z.r).filter((r) => !/^(tabelle|spalte|sequenz) pgboss\./.test(r));
  } finally {
    await sql.end({ timeout: 2 });
  }
}

function mitDatenbank(url: string, name: string): string {
  const adresse = new URL(url);
  adresse.pathname = `/${name}`;
  return adresse.toString();
}

const master = loadMasterSecret({ PAIBOT_SECRET: SECRET });
const secretsKey = deriveKey(master, "secrets-v1");
const keysKey = deriveKey(master, "keys-v1");
const contextKey = deriveKey(master, "context-v1");
const anderesGeheimnis = loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") });

function signaturSchluessel(db: Database, schluessel: DerivedKey<"keys-v1">) {
  return createSigningKeyHolder(async () => {
    const aktiv = await repo.installationKeys.getActive(db);
    if (aktiv === undefined) throw new Error("kein aktiver Schlüssel");
    return {
      keyId: aktiv.id,
      publicKey: aktiv.publicKey,
      privateKey: decryptSecret(aktiv.privateKeyEnc, schluessel, {
        aad: secretAad(signingKeySecretBinding(aktiv.id, aktiv.publicKey)),
      }),
    };
  });
}

/** Füllt eine Installation wie im Betrieb (mit der App-Rolle). Liefert die Kennungen. */
async function befuellen(appUrl: string) {
  const { db, sql } = createDb(appUrl);
  try {
    const installationId = newId("installation") as InstallationId;
    await repo.settings.completeSetup(db, { installationId });
    await repo.owner.create(db, { passwordHash: await hashPassword("beispiel-passwort-nur-test") });
    const paar = generateSigningKey();
    const keyId = newId("key") as KeyId;
    await repo.installationKeys.create(db, {
      id: keyId,
      publicKey: paar.publicKey,
      privateKeyEnc: encryptSecret(paar.privateKey, keysKey, {
        aad: secretAad(signingKeySecretBinding(keyId, paar.publicKey)),
      }),
      fingerprint: fingerprint(paar.publicKey),
    });
    const halter = signaturSchluessel(db, keysKey);
    await halter.load();
    const writer = createReceiptWriter(db, halter);
    await writer.appendStart({
      installationId,
      key: { keyId, publicKey: paar.publicKey, privateKey: paar.privateKey },
      software: readStand({}),
      time: new Date(),
    });
    const gate = createGate({
      rules: {
        load: async () => {
          const { stand, rules } = await repo.rules.loadSnapshot(db);
          return ruleSnapshot(rules, stand);
        },
      },
      receipts: writer,
      clock: { now: () => new Date() },
    });

    const providerId = newId("provider") as ProviderId;
    const baseUrl = "http://127.0.0.1:9/v1";
    const provider = await repo.providers.create(db, {
      id: providerId,
      name: "Beispiel-Anbieter",
      baseUrl,
      apiKeyEnc: encryptSecret(PROVIDER_KEY, secretsKey, {
        aad: secretAad(providerSecretBinding(providerId, baseUrl)),
      }),
      region: "local",
    });
    const model = await repo.models.create(db, {
      providerId,
      slug: "beispiel/modell",
      displayName: "Beispiel-Modell",
    });
    const bot = await repo.bots.create(db, {
      name: "Pai",
      modelId: model.id,
      avatarShape: "blatt",
      color: "limette",
    });

    // Unterhaltung 1: eine fertige Antwort, durchs Tor, mit zwei Belegen.
    const fertig = await repo.conversations.create(db, { botId: bot.id, title: "Beispiel" });
    const frage = "Wie spät ist es?";
    const nachricht = await repo.messages.insert(db, {
      conversationId: fertig.id,
      role: "user",
      content: frage,
    });
    const lauf = await repo.runs.create(db, {
      conversationId: fertig.id,
      triggerMessageId: nachricht.id,
      botId: bot.id,
    });
    await repo.runs.markRunning(db, lauf.id);
    await gate.run(
      {
        actionId: newId("action"),
        type: "modell.anfragen",
        actor: `bot:${bot.id}`,
        target: { conversationId: fertig.id, runId: lauf.id, botId: bot.id, modelId: model.id },
      },
      {
        botPaused: false,
        conversationKind: "direkt",
        botHatAuftrag: false,
        auftragArt: "keiner",
        zweck: "chat",
        botOfConversation: true,
        providerId,
        providerEnabled: provider.enabled,
        region: provider.region,
        route: "direct",
        requestedMode: "off",
        schleuseReachable: false,
        inputChars: frage.length,
        maxInputChars: 32000,
        maxOutputTokens: 1024,
        botMaxOutputTokens: bot.maxOutputTokens,
        tokensToday: 0,
        killSwitch: false,
        // Übergangswerte, bis ein Lauf mehrere Schritte macht.
        step: 0,
        maxSteps: 1,
        runTokens: 0,
        stepTokenEstimate: 0,
        maxRunTokens: 500000,
        toolCount: 0,
        untrustedInput: false,
        trigger: "chat",
        ...providerTargetFacts(providerId, baseUrl),
      },
      async () => ({
        value: "Kurz nach zwei.",
        result: {
          status: "ok" as const,
          digest: contextDigest(contextKey, "Kurz nach zwei."),
          tokens: { input: 4, output: 4 },
        },
      }),
      { context: { digest: contextDigest(contextKey, frage) } },
    );
    // Antwort mit Zwischentext und vorläufigem Text eines Schritts, Werkzeug-Aufrufe in jedem
    // Zustand dieser Fassung (Entscheidungen durchs Tor über R-010).
    const antwort = await repo.messages.insert(db, {
      conversationId: fertig.id,
      role: "assistant",
      status: "streaming",
      runId: lauf.id,
    });
    await sql`insert into public.messages (id, conversation_id, role, content, run_id, step)
      values (${newId("message")}, ${fertig.id}, 'assistant', 'Ich schaue nach.', ${lauf.id}, 0)`;
    await repo.events.append(db, {
      conversationId: fertig.id,
      type: "draft.delta",
      data: { runId: lauf.id, step: 0, text: "Ich schaue nach." },
    });
    await repo.events.append(db, {
      conversationId: fertig.id,
      type: "step.finished",
      data: { runId: lauf.id, step: 0, ending: "zwischentext" },
    });
    // Je Aufruf eine eigene Aktion; der Trigger bindet jede Zeile an die Belege genau ihrer Aktion.
    // Die vierte wird abgelehnt (nicht angeboten, V-12), die anderen erlaubt R-010.
    const belegt: { decision: { receiptId: string }; result: { receiptId: string } }[] = [];
    const aktionen: ReturnType<typeof newId<"action">>[] = [];
    for (let i = 0; i < 4; i++) {
      const actionId = newId("action");
      aktionen.push(actionId);
      const r = await gate
        .run(
          {
            actionId,
            type: "werkzeug.aufrufen",
            actor: `bot:${bot.id}`,
            target: { conversationId: fertig.id, runId: lauf.id, botId: bot.id },
          },
          {
            botPaused: false,
            auftragArt: "keiner",
            botOfConversation: true,
            runRunning: true,
            toolName: "doku_nachschlagen",
            toolSource: "eingebaut",
            toolKind: "lesen",
            argsDigest: `hmac-sha256:${"a7".repeat(32)}`,
            killSwitch: false,
            toolKey: "eingebaut/doku.nachschlagen",
            toolDigest: `sha256:${"4d".repeat(32)}`,
            toolReach: "intern",
            toolForeign: false,
            toolRegistered: true,
            toolOffered: i !== 3,
            inputValid: true,
            untrustedInput: false,
            step: 0,
            callIndexInStep: i,
            maxCallsPerStep: 8,
            callsInRun: i,
            maxCallsPerRun: 16,
            trigger: "chat",
          },
          async () => ({ value: undefined, result: { status: "ok" as const } }),
        )
        .then(
          (ok) => ok.receipts,
          (abgelehnt: {
            receipts: { decision: { receiptId: string }; result: { receiptId: string } };
          }) => abgelehnt.receipts,
        );
      belegt.push(r);
    }
    const aufruf = async (position: number, actionId = newId("action")) =>
      (
        await repo.toolCalls.create(db, {
          actionId: actionId as never,
          conversationId: fertig.id,
          runId: lauf.id,
          messageId: antwort.id,
          position,
          callId: `aufruf-${position}`,
          name: "doku_nachschlagen",
          source: "eingebaut",
          kind: "lesen",
          input: { frage: "Not-Aus" },
          argsDigest: `hmac-sha256:${"b".repeat(64)}` as never,
          toolKey: "eingebaut/doku.nachschlagen",
          toolDigest: `sha256:${"4d".repeat(32)}` as never,
          reach: "intern",
          foreignContent: false,
          step: 0,
          untrustedInput: false,
        })
      ).actionId;
    const entschieden = async (position: number, i: number) => {
      const id = await aufruf(position, aktionen[i]);
      await repo.toolCalls.recordDecision(db, id, {
        outcome: "allow",
        decisionReceiptId: belegt[i]?.decision.receiptId as never,
      });
      return id;
    };
    await aufruf(0);
    await entschieden(1, 0);
    await repo.toolCalls.finish(db, await entschieden(2, 1), {
      status: "succeeded",
      output: { text: "gefunden" },
      resultReceiptId: belegt[1]?.result.receiptId as never,
    });
    await repo.toolCalls.finish(db, await entschieden(3, 2), {
      status: "failed",
      output: null,
      resultReceiptId: belegt[2]?.result.receiptId as never,
    });
    await repo.toolCalls.recordDecision(db, await aufruf(4, aktionen[3]), {
      outcome: "deny",
      decisionReceiptId: belegt[3]?.decision.receiptId as never,
      resultReceiptId: belegt[3]?.result.receiptId as never,
      output: "Abgelehnt.",
    });
    await repo.toolCalls.cancel(db, await aufruf(5), { output: null });
    await repo.messages.finalize(db, antwort.id, {
      status: "complete",
      content: "Kurz nach zwei.",
    });
    await repo.runs.finish(db, lauf.id, { status: "succeeded" });

    // Unterhaltung 2 und 3: ein Lauf, der gerade läuft, und einer, der noch wartet.
    const laufend = await repo.conversations.create(db, { botId: bot.id, title: "Läuft" });
    const m2 = await repo.messages.insert(db, {
      conversationId: laufend.id,
      role: "user",
      content: "Erzähl etwas.",
    });
    const aktiv = await repo.runs.create(db, {
      conversationId: laufend.id,
      triggerMessageId: m2.id,
      botId: bot.id,
    });
    await repo.runs.markRunning(db, aktiv.id);
    const wartend = await repo.conversations.create(db, { botId: bot.id, title: "Wartet" });
    const m3 = await repo.messages.insert(db, {
      conversationId: wartend.id,
      role: "user",
      content: "Und jetzt?",
    });
    const offen = await repo.runs.create(db, {
      conversationId: wartend.id,
      triggerMessageId: m3.id,
      botId: bot.id,
    });

    // Ein Auftrag in der Warteschlange (Schema pgboss gehört der App-Rolle).
    await sql`create table pgboss.beispiel_auftrag (id int)`;
    await sql`insert into pgboss.beispiel_auftrag values (1)`;
    return { installationId, providerId, aktiv: aktiv.id, offen: offen.id };
  } finally {
    await sql.end({ timeout: 2 });
  }
}

describe.skipIf(bereit.grund !== undefined)(
  "Sicherung und Wiederherstellung (echtes Postgres)",
  () => {
    const basis = BASIS ?? "";
    let arbeit: string;
    let quelle: PostgresTestDatabase;
    let leer: PostgresTestDatabase;
    let frisch: PostgresTestDatabase;
    let rolle: PostgresTestRole;
    let kennungen: Awaited<ReturnType<typeof befuellen>>;
    let vorher: Record<string, number>;
    let dump: Buffer;
    let begleit: string;
    let rolleVorher = false;

    beforeAll(async () => {
      arbeit = mkdtempSync(path.join(tmpdir(), "paibot-sicherung-test-"));
      const admin = verbinden(basis);
      try {
        const [zeile] = await admin<{ n: number }[]>`
        select count(*)::int as n from pg_roles where rolname = 'paibot_sicherung'`;
        rolleVorher = (zeile?.n ?? 0) > 0;
      } finally {
        await admin.end({ timeout: 2 });
      }
      quelle = await createPostgresTestDatabase(basis, { migrate: false });
      rolle = newPostgresTestRole(quelle.url);
      await runMigrations(quelle.url, MIGRATIONS_FOLDER, { appUrl: rolle.url });
      kennungen = await befuellen(rolle.url);
      vorher = await zaehlen(quelle.url);
      leer = await createPostgresTestDatabase(basis, { migrate: false });
      frisch = await createPostgresTestDatabase(basis, { migrate: false });
      const appFrisch = mitDatenbank(rolle.url, new URL(frisch.url).pathname.slice(1));
      await runMigrations(frisch.url, MIGRATIONS_FOLDER, { appUrl: appFrisch });
      // Wie nach dem ersten Start: Einrichtungs-Code gesetzt, aber noch nicht eingerichtet.
      const offen = createDb(appFrisch);
      try {
        await repo.settings.setSetupCode(offen.db, { hash: `sha256:${"0".repeat(64)}` });
      } finally {
        await offen.sql.end({ timeout: 2 });
      }
    }, 120_000);

    afterAll(async () => {
      for (const db of [quelle, leer, frisch]) await db?.drop();
      await rolle?.drop(basis);
      if (!rolleVorher) {
        const admin = verbinden(basis);
        try {
          await admin`drop role if exists paibot_sicherung`;
        } finally {
          await admin.end({ timeout: 2 });
        }
      }
      if (arbeit) rmSync(arbeit, { recursive: true, force: true });
    });

    it("sichern: Dump und Stand aus demselben Snapshot, ohne Warteschlange und ohne Geheimnisse", () => {
      const lauf = skript(quelle.url, "sichern");
      expect(lauf.stderr).not.toContain("FEHLER");
      expect(lauf.status).toBe(0);
      dump = lauf.stdout;
      writeFileSync(path.join(arbeit, "datenbank.dump"), dump);
      const zeile = lauf.stderr.split("\n").find((z) => z.startsWith("PAIBOT-STAND "));
      expect(zeile).toBeDefined();
      const stand = JSON.parse((zeile ?? "").slice("PAIBOT-STAND ".length));
      begleit = JSON.stringify({ format: "pb-sicherung", v: 1, stand });

      expect(stand.tabellen).toEqual(vorher);
      expect(Object.keys(stand.tabellen).some((t) => t.startsWith("pgboss."))).toBe(false);
      expect(stand.migrationen.anzahl).toBe(vorher["drizzle.__drizzle_migrations"]);
      expect(stand.belege.anzahl).toBe(vorher["public.belege"]);
      expect(stand.belege.anker).toMatchObject({
        format: "pb-anker",
        installationId: kennungen.installationId,
        seq: vorher["public.belege"],
      });

      const liste = skript(quelle.url, "liste", dump);
      expect(liste.status).toBe(0);
      const text = dump.toString("latin1");
      expect(text).not.toContain("beispiel_auftrag");
      expect(text).not.toContain(PROVIDER_KEY);
      expect(text).not.toContain(SECRET);
    });

    it("weigert sich, in eine benutzte Datenbank zurückzuspielen, und nennt den Ausweg", async () => {
      expect(skript(quelle.url, "zustand").stdout.toString()).toMatch(/^benutzt: Einrichtung/);
      const lauf = skript(quelle.url, "zurueckspielen", dump);
      expect(lauf.status).toBe(3);
      expect(lauf.stderr).toContain("nur in eine frische Installation");
      expect(lauf.stderr).toContain("down -v");
      expect(await zaehlen(quelle.url)).toEqual(vorher);
    });

    it("spielt in eine leere Datenbank zurück: gleiche Zeilen in allen Tabellen", async () => {
      // Wie auf einem neuen Server: Die Rolle zum Lesen gibt es dort noch nicht.
      const admin = verbinden(basis);
      try {
        await admin`drop role if exists paibot_sicherung`;
      } finally {
        await admin.end({ timeout: 2 });
      }
      expect(skript(leer.url, "zustand").stdout.toString().trim()).toBe("leer");
      const lauf = skript(leer.url, "zurueckspielen", dump);
      expect(lauf.stderr).not.toContain("FEHLER");
      expect(lauf.status).toBe(0);
      expect(lauf.stderr).toContain("als unterbrochen beendet: 2.");
      expect(await zaehlen(leer.url)).toEqual(vorher);

      const vergleich = skript(leer.url, "vergleichen", begleit)
        .stdout.toString()
        .trim()
        .split("\n");
      const tabellen = vergleich.filter((z) => z.startsWith("T|"));
      expect(tabellen).toHaveLength(Object.keys(vorher).length);
      for (const z of tabellen) {
        const [, , erwartet, jetzt] = z.split("|");
        expect(jetzt, z).toBe(erwartet);
      }
      const n = vorher["public.belege"];
      const belege = vergleich.find((z) => z.startsWith("B|"))?.split("|");
      expect(belege?.slice(1, 4)).toEqual([String(n), String(n), String(n)]);
      expect(belege?.[4]).toBe(belege?.[5]);
      expect(belege?.[6]).toBe("true");
    });

    it("frische Installation (migriert, nie eingerichtet) wird geleert und eingespielt", async () => {
      expect(await zaehlen(frisch.url)).toMatchObject({ "public.settings": 1 });
      expect(skript(frisch.url, "zustand").stdout.toString().trim()).toBe("frisch");
      const lauf = skript(frisch.url, "zurueckspielen", dump);
      expect(lauf.stderr).not.toContain("FEHLER");
      expect(lauf.status).toBe(0);
      expect(await zaehlen(frisch.url)).toEqual(vorher);
    });

    it("nach dem Migrations-Schritt: App-Rolle hat genau die vorgesehenen Rechte, Warteschlange leer", async () => {
      const appZiel = mitDatenbank(rolle.url, new URL(leer.url).pathname.slice(1));
      const sql = verbinden(leer.url);
      try {
        const [vorMigration] = await sql<{ ok: boolean }[]>`
        select to_regnamespace('pgboss') is null as ok`;
        expect(vorMigration?.ok).toBe(true);
      } finally {
        await sql.end({ timeout: 2 });
      }
      await runMigrations(leer.url, MIGRATIONS_FOLDER, { appUrl: appZiel });
      expect(await rechte(leer.url, rolle.role)).toEqual(await rechte(quelle.url, rolle.role));

      const app = verbinden(appZiel);
      try {
        expect(await checkAppRole(app)).toMatchObject({ status: "eingeschraenkt", issues: [] });
        const [boss] = await app<{ besitzer: string; tabellen: number }[]>`
        select pg_get_userbyid(n.nspowner) as besitzer,
          (select count(*)::int from pg_class c where c.relnamespace = n.oid) as tabellen
        from pg_namespace n where n.nspname = 'pgboss'`;
        expect(boss).toEqual({ besitzer: rolle.role, tabellen: 0 });
      } finally {
        await app.end({ timeout: 2 });
      }
    });

    it("Belege: Export aus der Datenbank, Kette gültig gegen den Anker der Begleit-Datei", async () => {
      const exportText = skript(leer.url, "export").stdout.toString("utf8");
      const gelesen = parseJsonl(exportText);
      expect(gelesen.entries).toHaveLength(vorher["public.belege"] ?? 0);
      expect((await verifyChain(gelesen.entries, gelesen.header.publicKeys)).ok).toBe(true);

      const anker = skript(leer.url, "anker", begleit).stdout.toString("utf8").trim();
      const aus: string[] = [];
      const code = await runCli(["belege.jsonl", "--anker", anker], {
        readFile: async () => exportText,
        out: (zeile) => aus.push(zeile),
        err: (zeile) => aus.push(zeile),
      });
      expect({ code, aus }).toMatchObject({ code: 0 });
      expect(aus.join("\n")).toContain("Kette gültig");

      // Gegenprobe: ein verändertes Ergebnis im Export fällt auf.
      const veraendert = exportText.replace(/"status": ?"ok"/, '"status": "error"');
      expect(veraendert).not.toBe(exportText);
      const rot = await runCli(["belege.jsonl", "--anker", anker], {
        readFile: async () => veraendert,
        out: () => undefined,
        err: () => undefined,
      });
      expect(rot).toBe(1);
    });

    it("gespeicherte Schlüssel: mit demselben PAIBOT_SECRET lesbar, mit einem anderen nicht", async () => {
      const appZiel = mitDatenbank(rolle.url, new URL(leer.url).pathname.slice(1));
      const { db, sql } = createDb(appZiel);
      try {
        const gespeichert = await repo.providers.getWithKey(db, kennungen.providerId);
        const bindung = {
          aad: secretAad(
            providerSecretBinding(kennungen.providerId, gespeichert?.provider.baseUrl ?? ""),
          ),
        };
        const verschluesselt = gespeichert?.apiKeyEnc ?? "";
        expect(decryptSecret(verschluesselt, secretsKey, bindung)).toBe(PROVIDER_KEY);
        await expect(signaturSchluessel(db, keysKey).load()).resolves.toMatchObject({
          publicKey: expect.any(String),
        });

        let fehler: unknown;
        try {
          decryptSecret(verschluesselt, deriveKey(anderesGeheimnis, "secrets-v1"), bindung);
        } catch (error) {
          fehler = error;
        }
        expect(isCryptoError(fehler, "entschluesseln_fehlgeschlagen")).toBe(true);
        expect(String(fehler)).not.toContain(PROVIDER_KEY);
        await expect(
          signaturSchluessel(db, deriveKey(anderesGeheimnis, "keys-v1")).load(),
        ).rejects.toSatisfy((error: unknown) =>
          isCryptoError(error, "entschluesseln_fehlgeschlagen"),
        );
      } finally {
        await sql.end({ timeout: 2 });
      }
    });

    it("aktive Läufe: kein wartender mehr, beide fallen beim Start des Workers unter das Aufräumen", async () => {
      const appZiel = mitDatenbank(rolle.url, new URL(leer.url).pathname.slice(1));
      const { db, sql } = createDb(appZiel);
      try {
        const veraltet = await repo.runs.findStale(db, {
          before: new Date(Date.now() - 60_000),
          statuses: ["running", "queued"],
        });
        expect(veraltet.map((lauf) => lauf.id).sort()).toEqual(
          [kennungen.aktiv, kennungen.offen].sort(),
        );
        const [wartend] = await sql<{ n: number }[]>`
        select count(*)::int as n from public.runs where status = 'queued'`;
        expect(wartend?.n).toBe(0);
      } finally {
        await sql.end({ timeout: 2 });
      }
    });

    it("Werkzeug-Aufrufe, Zwischentext und vorläufiger Text kommen mit zurück", async () => {
      expect(vorher["public.tool_calls"]).toBe(6);
      const sql = verbinden(leer.url);
      try {
        const zustaende = await sql<{ status: string }[]>`
          select status from public.tool_calls order by position`;
        expect(zustaende.map((z) => z.status)).toEqual([
          "requested",
          "running",
          "succeeded",
          "failed",
          "denied",
          "cancelled",
        ]);
        const [schritt] = await sql<{ n: number }[]>`
          select count(*)::int as n from public.messages where step = 0`;
        expect(schritt?.n).toBe(1);
        const [entwurf] = await sql<{ n: number }[]>`
          select count(*)::int as n from public.conversation_events where type = 'draft.delta'`;
        expect(entwurf?.n).toBe(1);
        const [r010] = await sql<{ n: number }[]>`
          select count(*)::int as n from public.rules where id = 'R-010'`;
        expect(r010?.n).toBe(1);
      } finally {
        await sql.end({ timeout: 2 });
      }
    });

    it("eine Sicherung vom Stand 0013 (veröffentlichte Fassung) wird zurückgespielt und danach auf den neuen Stand gehoben", async () => {
      const alt = await createPostgresTestDatabase(basis, { migrate: false });
      const ziel = await createPostgresTestDatabase(basis, { migrate: false });
      try {
        await runMigrations(alt.url, migrationsUpTo(14));
        const daten = readFileSync(
          new URL("./testdaten/stand-0013-rc.sql", import.meta.url),
          "utf8",
        );
        const laden = verbinden(alt.url);
        try {
          await laden.begin(async (tx) => {
            await tx.unsafe("set local session_replication_role = replica");
            await tx.unsafe(daten).simple();
          });
        } finally {
          await laden.end({ timeout: 2 });
        }
        const altZeilen = await zaehlen(alt.url);
        const gesichert = skript(alt.url, "sichern");
        expect(gesichert.stderr).not.toContain("FEHLER");
        expect(gesichert.status).toBe(0);
        const zeile = gesichert.stderr.split("\n").find((z) => z.startsWith("PAIBOT-STAND "));
        const altBegleit = JSON.stringify({
          format: "pb-sicherung",
          v: 1,
          stand: JSON.parse((zeile ?? "").slice("PAIBOT-STAND ".length)),
        });

        const lauf = skript(ziel.url, "zurueckspielen", gesichert.stdout);
        expect(lauf.stderr).not.toContain("FEHLER");
        expect(lauf.status).toBe(0);
        expect(await zaehlen(ziel.url)).toEqual(altZeilen);
        // „Alles aus der Sicherung ist da“: der Vergleich mit der Begleit-Datei.
        const vergleich = skript(ziel.url, "vergleichen", altBegleit)
          .stdout.toString()
          .trim()
          .split("\n");
        for (const z of vergleich.filter((v) => v.startsWith("T|"))) {
          const [, , erwartet, jetzt] = z.split("|");
          expect(jetzt, z).toBe(erwartet);
        }
        const belege = vergleich.find((z) => z.startsWith("B|"))?.split("|");
        expect(belege?.[6]).toBe("true");

        // Migrations-Schritt mit dem neuen Code: auf den neuesten Stand (ab 0014), gleiche Daten.
        // Dazu kommen genau die Standard-Regeln späterer Fassungen: R-010, R-014 und die der Tor-Fassung 5.
        const regelnLesen = async (url: string) => {
          const sql = verbinden(url);
          try {
            return await sql<{ id: string; version: number; r: unknown }[]>`
              select id, version, to_jsonb(r) as r from public.rules r order by seq`;
          } finally {
            await sql.end({ timeout: 2 });
          }
        };
        const regelnVorher = await regelnLesen(ziel.url);
        await runMigrations(ziel.url, MIGRATIONS_FOLDER);
        const regelnNachher = await regelnLesen(ziel.url);
        // Die alten Regeln bleiben mit Inhalt und Version unverändert (verglichen über die Spalten von vorher).
        const spalten = Object.keys((regelnVorher[0]?.r ?? {}) as Record<string, unknown>);
        expect(spalten.length).toBeGreaterThan(0);
        expect(
          regelnNachher.slice(0, regelnVorher.length).map(({ id, version, r }) => ({
            id,
            version,
            r: Object.fromEntries(spalten.map((s) => [s, (r as Record<string, unknown>)[s]])),
          })),
        ).toEqual(regelnVorher);
        expect(
          regelnNachher.slice(regelnVorher.length).map(({ id, version }) => ({ id, version })),
        ).toEqual(
          ["R-010", "R-014", "R-009", "R-015", "R-016", "R-017", "R-018", "R-019"].map((id) => ({
            id,
            version: 1,
          })),
        );
        const neu = await zaehlen(ziel.url);
        expect(neu["public.rules"]).toBe((altZeilen["public.rules"] ?? 0) + 8);
        expect(neu["drizzle.__drizzle_migrations"]).toBe(20);
        for (const tabelle of Object.keys(altZeilen).filter(
          (t) => t !== "public.rules" && t !== "drizzle.__drizzle_migrations",
        )) {
          expect(neu[tabelle], tabelle).toBe(altZeilen[tabelle]);
        }
        const exportText = skript(ziel.url, "export").stdout.toString("utf8");
        const gelesen = parseJsonl(exportText);
        expect((await verifyChain(gelesen.entries, gelesen.header.publicKeys)).ok).toBe(true);
      } finally {
        await alt.drop();
        await ziel.drop();
      }
    });

    it("Gegenprobe: eine Abweichung nach dem Einspielen meldet der Vergleich", async () => {
      const sql = verbinden(frisch.url);
      try {
        // Ein Bot mit Läufen lässt sich nicht löschen; die Abweichung ist deshalb ein Bot mehr.
        await sql`insert into public.bots (id, name, avatar_shape, color)
          values (${newId("bot")}, 'Zusatz nach dem Einspielen', 'blatt', 'blau')`;
      } finally {
        await sql.end({ timeout: 2 });
      }
      const vergleich = skript(frisch.url, "vergleichen", begleit).stdout.toString().trim();
      const bots = vergleich.split("\n").find((z) => z.startsWith("T|public.bots|"));
      expect(bots).toBe(
        `T|public.bots|${vorher["public.bots"]}|${(vorher["public.bots"] ?? 0) + 1}`,
      );
    });
  },
);

/** Ruft ein Postgres-Werkzeug (pg_dump, pg_restore, psql) als Superuser gegen `url` auf. */
function werkzeug(url: string, name: string, args: string[], eingabe?: Buffer): Lauf {
  const adresse = new URL(url);
  const ordner = bereit.bin;
  const lauf = spawnSync(ordner === undefined ? name : path.join(ordner, name), args, {
    input: eingabe,
    maxBuffer: 256 * 1024 * 1024,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: tmpdir(),
      PGHOST: adresse.hostname,
      PGPORT: adresse.port || "5432",
      PGUSER: decodeURIComponent(adresse.username),
      PGPASSWORD: decodeURIComponent(adresse.password),
      PGDATABASE: adresse.pathname.slice(1),
    },
  });
  return { status: lauf.status, stdout: lauf.stdout, stderr: lauf.stderr.toString("utf8") };
}

describe("Liste der erlaubten Funktionen beim Zurückspielen", () => {
  it("enthält genau die Funktions-Rümpfe aus allen Migrationen", () => {
    const ordner = fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));
    const ausDateien = new Set<string>();
    for (const datei of readdirSync(ordner).filter((n) => n.endsWith(".sql"))) {
      const text = readFileSync(path.join(ordner, datei), "utf8");
      for (const treffer of text.matchAll(
        /CREATE (?:OR REPLACE )?FUNCTION (\w+)\([^)]*\)[^$]*?AS \$\$([\s\S]*?)\$\$/g,
      )) {
        const rumpf = treffer[2] ?? "";
        ausDateien.add(`${treffer[1]}:${createHash("md5").update(rumpf).digest("hex")}`);
      }
    }
    const skriptText = readFileSync(SKRIPT, "utf8");
    const liste = /ERLAUBTE_FUNKTIONEN="([^"]*)"/.exec(skriptText)?.[1] ?? "";
    const imSkript = new Set(liste.split(/\s+/).filter((z) => z !== ""));
    expect(ausDateien.size).toBeGreaterThan(0);
    expect([...imSkript].sort()).toEqual([...ausDateien].sort());
  });
});

describe.skipIf(bereit.grund !== undefined)(
  "Zurückspielen fremder oder veränderter Sicherungen (echtes Postgres)",
  () => {
    const basis = BASIS ?? "";
    const datenbanken: PostgresTestDatabase[] = [];
    const rollen: string[] = [];

    /** Name einer Rolle, die nur entsteht, wenn Code aus der Sicherung mit vollen Rechten läuft. */
    function spurRolle(): string {
      const name = `paibot_test_spur_${randomBytes(4).toString("hex")}`;
      rollen.push(name);
      return name;
    }

    async function rolleDa(name: string): Promise<boolean> {
      const sql = verbinden(basis);
      try {
        const [zeile] = await sql<{ n: number }[]>`
          select count(*)::int as n from pg_roles where rolname = ${name}`;
        return (zeile?.n ?? 0) > 0;
      } finally {
        await sql.end({ timeout: 2 });
      }
    }

    async function einspielRollen(): Promise<number> {
      const sql = verbinden(basis);
      try {
        const [zeile] = await sql<{ n: number }[]>`
          select count(*)::int as n from pg_roles where rolname like 'paibot\_einspielen\_%'`;
        return zeile?.n ?? -1;
      } finally {
        await sql.end({ timeout: 2 });
      }
    }

    async function neueDatenbank(migriert = false): Promise<PostgresTestDatabase> {
      const db = await createPostgresTestDatabase(basis, { migrate: migriert });
      datenbanken.push(db);
      return db;
    }

    /** Legt in einer eigenen Datenbank als Superuser an, was `sql` beschreibt, und sichert sie. */
    async function praeparierteSicherung(anweisungen: string, migriert = false): Promise<Buffer> {
      const quelle = await neueDatenbank(migriert);
      const sql = verbinden(quelle.url);
      try {
        await sql.unsafe(anweisungen);
      } finally {
        await sql.end({ timeout: 2 });
      }
      const lauf = werkzeug(quelle.url, "pg_dump", ["-Fc"]);
      expect(lauf.status, lauf.stderr).toBe(0);
      return lauf.stdout;
    }

    afterAll(async () => {
      for (const db of datenbanken) await db.drop();
      const sql = verbinden(basis);
      try {
        for (const name of rollen) await sql`drop role if exists ${sql(name)}`;
      } finally {
        await sql.end({ timeout: 2 });
      }
    });

    it("Code aus der Sicherung läuft beim Einspielen ohne Sonderrechte (keine neue Rolle, nichts eingespielt)", async () => {
      const spur = spurRolle();
      // Wirkt nur außerhalb der Quell-Datenbank: Dort darf die Zeile ohne Folgen entstehen.
      const dump = await praeparierteSicherung(`
        create function public.pruefe(n int) returns boolean language plpgsql as $f$
        begin
          if pg_catalog.current_database() <> pg_catalog.current_setting('paibot.quelle', true)
             or pg_catalog.current_setting('paibot.quelle', true) is null then
            execute 'create role ${spur} superuser';
          end if;
          return true;
        end $f$;
        set paibot.quelle = '';
        select pg_catalog.set_config('paibot.quelle', pg_catalog.current_database(), false);
        create table public.harmlos (n int check (public.pruefe(n)));
        insert into public.harmlos values (1);`);
      expect(await rolleDa(spur)).toBe(false);

      // Vergleich: Als Superuser eingespielt, legt dieselbe Datei die Rolle an.
      const vergleich = await neueDatenbank();
      const direkt = werkzeug(
        vergleich.url,
        "pg_restore",
        [
          "--no-owner",
          "--no-privileges",
          "--single-transaction",
          "-d",
          new URL(vergleich.url).pathname.slice(1),
        ],
        dump,
      );
      expect(direkt.status, direkt.stderr).toBe(0);
      expect(await rolleDa(spur)).toBe(true);
      const sql = verbinden(basis);
      try {
        await sql`drop role ${sql(spur)}`;
      } finally {
        await sql.end({ timeout: 2 });
      }

      const ziel = await neueDatenbank();
      const lauf = skript(ziel.url, "zurueckspielen", dump);
      expect(lauf.status).toBe(1);
      expect(lauf.stderr).toContain("permission denied");
      expect(await rolleDa(spur)).toBe(false);
      expect(skript(ziel.url, "zustand").stdout.toString().trim()).toBe("leer");
      expect(await einspielRollen()).toBe(0);
    });

    it("Ausdrücke mit Funktionen, die PaiBot nicht nutzt, werden nicht eingespielt", async () => {
      const dump = await praeparierteSicherung(
        `create table public.notizen (t text check (
           pg_catalog.query_to_xml('select 1', false, false, '') is not null));
         insert into public.notizen values ('a');
         create function public.extra() returns int language sql as 'select 1';`,
        true,
      );
      const ziel = await neueDatenbank();
      const lauf = skript(ziel.url, "zurueckspielen", dump);
      expect(lauf.status).toBe(4);
      expect(lauf.stderr).toContain("Funktion query_to_xml(");
      expect(lauf.stderr).toContain("Funktion extra()");
      expect(lauf.stderr).toContain("Spiel nur Sicherungen zurück, die du selbst");
      expect(skript(ziel.url, "zustand").stdout.toString().trim()).toBe("leer");
      expect(await einspielRollen()).toBe(0);
    });

    it("ein veränderter Rumpf einer Funktion von PaiBot wird nicht eingespielt", async () => {
      const dump = await praeparierteSicherung(
        `create or replace function public.paibot_regeln_nummer() returns trigger
           language plpgsql set search_path = pg_catalog, public as $f$
         begin return new; end $f$;`,
        true,
      );
      const ziel = await neueDatenbank();
      const lauf = skript(ziel.url, "zurueckspielen", dump);
      expect(lauf.status).toBe(4);
      expect(lauf.stderr).toContain("Funktion paibot_regeln_nummer()");
      expect(skript(ziel.url, "zustand").stdout.toString().trim()).toBe("leer");
    });

    it("Quarantäne und fremde Schemas: nicht gesichert und aus älteren Dateien nicht eingespielt", async () => {
      const spur = spurRolle();
      const falle = `pg_catalog.query_to_xml(case when pg_catalog.current_setting('is_superuser') = 'on'
        and pg_catalog.current_database() <> pg_catalog.current_setting('paibot.quelle', true)
        then 'select 1 from (select pg_catalog.set_config(''x'', ''1'', false)) a' else 'select 1' end,
        false, false, '') is not null`;
      const anweisungen = `
        select pg_catalog.set_config('paibot.quelle', pg_catalog.current_database(), false);
        create schema paibot_quarantaene;
        create table paibot_quarantaene.bots_alt (n int check (${falle}));
        insert into paibot_quarantaene.bots_alt values (1);
        create function paibot_quarantaene.spur() returns boolean language plpgsql as $f$
        begin execute 'create role ${spur}'; return true; end $f$;
        create schema fremd;
        create table fremd.notiz (n int);
        insert into fremd.notiz values (1);`;
      // Neue Sicherung mit dem Skript: nur public und drizzle stehen im Inhaltsverzeichnis.
      const quelle = await neueDatenbank(true);
      const sql = verbinden(quelle.url);
      try {
        await sql.unsafe(anweisungen);
      } finally {
        await sql.end({ timeout: 2 });
      }
      const gesichert = skript(quelle.url, "sichern");
      expect(gesichert.status, gesichert.stderr).toBe(0);
      const inhalt = werkzeug(
        quelle.url,
        "pg_restore",
        ["--list"],
        gesichert.stdout,
      ).stdout.toString();
      expect(inhalt).toContain("TABLE public settings");
      expect(inhalt).not.toMatch(/paibot_quarantaene|fremd/);

      // Ältere Datei der ganzen Datenbank (mit beiden Schemas): eingespielt werden nur public und drizzle.
      const alt = werkzeug(quelle.url, "pg_dump", ["-Fc"]);
      expect(werkzeug(quelle.url, "pg_restore", ["--list"], alt.stdout).stdout.toString()).toMatch(
        /paibot_quarantaene/,
      );
      const ziel = await neueDatenbank();
      const lauf = skript(ziel.url, "zurueckspielen", alt.stdout);
      expect(lauf.stderr).not.toContain("FEHLER");
      expect(lauf.status).toBe(0);
      const pruefen = verbinden(ziel.url);
      try {
        const schemas = await pruefen<{ name: string }[]>`
          select nspname as name from pg_namespace
          where nspname !~ '^pg_' and nspname <> 'information_schema' order by 1`;
        expect(schemas.map((z) => z.name)).toEqual(["drizzle", "public"]);
      } finally {
        await pruefen.end({ timeout: 2 });
      }
      expect(await rolleDa(spur)).toBe(false);
      expect(skript(ziel.url, "inhalt").stdout.toString()).toBe("");
      expect(await einspielRollen()).toBe(0);
    });
  },
);
