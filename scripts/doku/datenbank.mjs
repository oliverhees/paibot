/**
 * PaiBot – Wegwerf-Datenbank für die Doku-Bilder: eigener Postgres oder eigene Datenbank auf einem
 * vorhandenen Server, am Ende wieder gelöscht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Zwei Wege, in beiden legt das Skript eine EIGENE Datenbank an und löscht sie am Ende:
//
//   1. PAIBOT_DOKU_DATABASE_URL gesetzt: Adresse eines Postgres-Servers mit einem Benutzer, der
//      Datenbanken und Rollen anlegen darf. Angelegt werden die Datenbank paibot_doku_<zufall> und
//      (vom Migrations-Schritt) die Rolle paibot_doku_<zufall>_app. Gelöscht wird nur, was diesen
//      Namen trägt UND an der Datenbank den Vermerk mit der Kennung dieses Laufs hat.
//   2. Sonst: ein eigener Postgres-Server aus den Programmen des Systems (initdb, pg_ctl) in einem
//      neuen temporären Ordner, nur an 127.0.0.1. Am Ende gestoppt und der Ordner gelöscht.
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  chownSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import {
  datenbankVermerk,
  istDokuDatenbank,
  istDokuRolle,
  neuerDatenbankName,
  rollenName,
  wegwerfWert,
} from "./lauf.mjs";

/** Der Postgres-Treiber des Projekts (Abhängigkeit von packages/db), keine neue Abhängigkeit. */
function postgresTreiber(root) {
  const modul = createRequire(path.join(root, "packages", "db", "package.json"))("postgres");
  return typeof modul === "function" ? modul : modul.default;
}

/** Ordner mit initdb und pg_ctl: PAIBOT_DOKU_PG_BIN, der Suchpfad oder /usr/lib/postgresql/<n>/bin. */
export function findePostgresProgramme(env = process.env) {
  if (env.PAIBOT_DOKU_PG_BIN) return env.PAIBOT_DOKU_PG_BIN;
  const imPfad = spawnSync("sh", ["-c", "command -v initdb"], { encoding: "utf8" });
  if (imPfad.status === 0 && imPfad.stdout.trim()) return path.dirname(imPfad.stdout.trim());
  const basis = "/usr/lib/postgresql";
  if (existsSync(basis)) {
    const versionen = readdirSync(basis)
      .filter((v) => /^\d+$/.test(v) && existsSync(path.join(basis, v, "bin", "initdb")))
      .sort((a, b) => Number(b) - Number(a));
    if (versionen[0]) return path.join(basis, versionen[0], "bin");
  }
  return undefined;
}

/** Als root laufen initdb und postgres nicht; dann über den Benutzer „postgres“. */
function alsBenutzer() {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) return undefined;
  const uid = spawnSync("id", ["-u", "postgres"], { encoding: "utf8" });
  const gid = spawnSync("id", ["-g", "postgres"], { encoding: "utf8" });
  if (uid.status !== 0) {
    throw new Error(
      "Als root startet Postgres nicht, und es gibt keinen Benutzer „postgres“. " +
        "Ohne root starten oder PAIBOT_DOKU_DATABASE_URL setzen.",
    );
  }
  return { name: "postgres", uid: Number(uid.stdout), gid: Number(gid.stdout) };
}

function programm(bin, name, args, benutzer) {
  const pfad = path.join(bin, name);
  if (benutzer) return ["runuser", ["-u", benutzer.name, "--", pfad, ...args]];
  return [pfad, args];
}

/** Startet einen eigenen Postgres-Server; liefert die Adresse des Verwalters und `stop()`. */
export function starteEigenenServer({ port }) {
  const bin = findePostgresProgramme();
  if (!bin) {
    throw new Error(
      "Kein Postgres gefunden (initdb). Postgres installieren, PAIBOT_DOKU_PG_BIN setzen oder " +
        "PAIBOT_DOKU_DATABASE_URL auf einen Wegwerf-Server zeigen lassen.",
    );
  }
  const benutzer = alsBenutzer();
  const ordner = mkdtempSync(path.join(os.tmpdir(), "paibot-doku-pg-"));
  const daten = path.join(ordner, "daten");
  const passwort = wegwerfWert(32);
  const pwDatei = path.join(ordner, "pw");
  writeFileSync(pwDatei, `${passwort}\n`, { mode: 0o600 });
  if (benutzer) {
    chownSync(ordner, benutzer.uid, benutzer.gid);
    chownSync(pwDatei, benutzer.uid, benutzer.gid);
  }
  chmodSync(ordner, 0o700);
  const stop = () => {
    if (existsSync(path.join(daten, "postmaster.pid"))) {
      const [cmd, args] = programm(
        bin,
        "pg_ctl",
        ["-D", daten, "-m", "fast", "-w", "stop"],
        benutzer,
      );
      spawnSync(cmd, args, { stdio: "ignore" });
    }
    rmSync(ordner, { recursive: true, force: true });
  };
  try {
    const [initCmd, initArgs] = programm(
      bin,
      "initdb",
      [
        "-D",
        daten,
        "-U",
        "postgres",
        "--pwfile",
        pwDatei,
        "--auth-host=scram-sha-256",
        "--auth-local=scram-sha-256",
        "-E",
        "UTF8",
        "--locale=C",
      ],
      benutzer,
    );
    execFileSync(initCmd, initArgs, { stdio: "ignore" });
    rmSync(pwDatei, { force: true });
    const optionen = `-p ${port} -k ${ordner} -c listen_addresses=127.0.0.1 -c fsync=off`;
    const [ctlCmd, ctlArgs] = programm(
      bin,
      "pg_ctl",
      ["-D", daten, "-o", optionen, "-l", path.join(ordner, "postgres.log"), "-w", "start"],
      benutzer,
    );
    execFileSync(ctlCmd, ctlArgs, { stdio: "ignore" });
  } catch (error) {
    stop();
    throw new Error(`Postgres ließ sich nicht starten: ${error.message}`);
  }
  return {
    adresse: `postgres://postgres:${passwort}@127.0.0.1:${port}/postgres`,
    ordner,
    stop,
  };
}

function mitDatenbank(adresse, name) {
  const url = new URL(adresse);
  url.pathname = `/${name}`;
  return url.href;
}

/**
 * Legt auf dem Server `verwalter` eine neue Datenbank mit Vermerk an. Liefert die Adressen für
 * Migration (Verwalter) und App (eigene Rolle, legt der Migrations-Schritt an) und `loesche()`.
 */
export async function legeDatenbankAn(root, verwalter, kennung) {
  const postgres = postgresTreiber(root);
  const name = neuerDatenbankName();
  const rolle = rollenName(name);
  const sql = postgres(verwalter, { max: 1, onnotice: () => undefined, connect_timeout: 10 });
  try {
    const [vorhanden] = await sql`
      select
        exists (select 1 from pg_database where datname = ${name}) as db,
        exists (select 1 from pg_roles where rolname = ${rolle}) as rolle`;
    if (vorhanden.db || vorhanden.rolle) {
      throw new Error(`${name} oder ${rolle} gibt es schon; nichts angefasst.`);
    }
    await sql.unsafe(`create database "${name}"`);
    await sql.unsafe(`comment on database "${name}" is '${datenbankVermerk(kennung)}'`);
  } finally {
    await sql.end({ timeout: 5 });
  }
  const app = new URL(mitDatenbank(verwalter, name));
  app.username = rolle;
  app.password = wegwerfWert(32);
  return {
    name,
    rolle,
    migration: mitDatenbank(verwalter, name),
    app: app.href,
    loesche: () => loescheDatenbank(root, verwalter, { name, rolle, kennung }),
  };
}

/**
 * Löscht Datenbank und Rolle, aber nur, wenn der Name die Form der Doku-Datenbank hat und der
 * Vermerk an der Datenbank genau zu diesem Lauf passt. Sonst bleibt alles, wie es ist.
 */
export async function loescheDatenbank(root, verwalter, { name, rolle, kennung }) {
  if (!istDokuDatenbank(name) || !istDokuRolle(rolle) || rolle !== rollenName(name)) {
    throw new Error(`Nicht gelöscht: ${name} ist keine Datenbank von pnpm doku:app.`);
  }
  const postgres = postgresTreiber(root);
  const sql = postgres(verwalter, { max: 1, onnotice: () => undefined, connect_timeout: 10 });
  try {
    const [db] = await sql`
      select shobj_description(oid, 'pg_database') as vermerk
      from pg_database where datname = ${name}`;
    if (db !== undefined) {
      if (db.vermerk !== datenbankVermerk(kennung)) {
        throw new Error(`Nicht gelöscht: Der Vermerk an ${name} gehört nicht zu diesem Lauf.`);
      }
      await sql.unsafe(`drop database "${name}" with (force)`);
    }
    await sql.unsafe(`drop role if exists "${rolle}"`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Zählt Datenbanken und Rollen mit dem Vorsatz (für die Prüfung nach dem Aufräumen). */
export async function zaehleDokuReste(root, verwalter) {
  const postgres = postgresTreiber(root);
  const sql = postgres(verwalter, { max: 1, onnotice: () => undefined, connect_timeout: 10 });
  try {
    const [zahl] = await sql`
      select
        (select count(*)::int from pg_database where datname like 'paibot\\_doku\\_%') as datenbanken,
        (select count(*)::int from pg_roles where rolname like 'paibot\\_doku\\_%') as rollen`;
    return zahl;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
