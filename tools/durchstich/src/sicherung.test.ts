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
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

    it("Gegenprobe: eine Abweichung nach dem Einspielen meldet der Vergleich", async () => {
      const sql = verbinden(frisch.url);
      try {
        const [bot] = await sql<{ id: string }[]>`select id from public.bots limit 1`;
        await sql`delete from public.bots where id = ${bot?.id ?? ""}`;
      } finally {
        await sql.end({ timeout: 2 });
      }
      const vergleich = skript(frisch.url, "vergleichen", begleit).stdout.toString().trim();
      const bots = vergleich.split("\n").find((z) => z.startsWith("T|public.bots|"));
      expect(bots).toBe(
        `T|public.bots|${vorher["public.bots"]}|${(vorher["public.bots"] ?? 0) - 1}`,
      );
    });
  },
);
