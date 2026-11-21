/**
 * PaiBot – stellt die App für die Doku-Bilder bereit: Wegwerf-Datenbank, Test-Anbieter, Web-App und
 * Worker im Produktions-Build; räumt am Ende alles wieder ab.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// pnpm doku:app                               App starten und laufen lassen, bis Strg+C
// pnpm doku:app -- pnpm doku:screenshots      App starten, Befehl ausführen, danach abräumen
//
// Voraussetzung: `pnpm build` (Web-App, Worker und Test-Anbieter sind gebaut).
//
// Was passiert:
//   1. Wegwerf-Datenbank (siehe scripts/doku/datenbank.mjs): eigener Postgres aus dem System oder
//      eine eigene Datenbank auf PAIBOT_DOKU_DATABASE_URL.
//   2. Test-Anbieter (tools/fake-provider) nur an 127.0.0.1, Port PAIBOT_DOKU_ANBIETER_PORT
//      (Standard 18080, fest, weil die Adresse in der Einrichtung als Name des Anbieters erscheint).
//      Beispiel-Modelle mit erfundenen Namen, Schlüssel ist ein Wegwerf-Wert.
//   3. Migrations-Schritt wie der Einmal-Dienst `migrate` (PAIBOT_ROLE=migrate, mit dem Zugang des
//      Tabellen-Besitzers): Migrationen, App-Rolle anlegen, Rechte prüfen, Ende mit Exit 0.
//      Danach Web-App (Next.js standalone, NODE_ENV=production, strenge Content-Security-Policy)
//      und Worker nur mit der App-Rolle, mit zufällig erzeugten Wegwerf-Geheimnissen und ohne Werte
//      aus der eigenen Umgebung.
//   4. Einrichtungs-Code aus dem Log der Web-App lesen und mit Adresse, Wegwerf-Passwort und
//      Schlüssel in die Lauf-Datei schreiben (scripts/doku/lauf.mjs), nur für den eigenen Benutzer.
//   5. Am Ende (Strg+C, Ende des Befehls, Fehler): alle Prozesse beenden, Datenbank löschen,
//      temporäre Ordner und Lauf-Datei löschen.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, createWriteStream, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { legeDatenbankAn, loescheDatenbank, starteEigenenServer } from "./datenbank.mjs";
import {
  laufDatei,
  leseLauf,
  loescheLauf,
  prozessLebt,
  schreibeLauf,
  wegwerfWert,
} from "./lauf.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WEB = path.join(ROOT, "apps", "web");
const STANDALONE = path.join(WEB, ".next", "standalone");
const WORKER = path.join(ROOT, "apps", "worker", "dist", "worker.mjs");
const ANBIETER = path.join(ROOT, "tools", "fake-provider", "dist", "fake-provider.mjs");
const MIGRATIONEN = path.join(ROOT, "packages", "db", "drizzle");

/** Beispiel-Modelle des Test-Anbieters: erfundene Namen, die so in den Bildern stehen. */
export const BEISPIEL_MODELLE = [
  { id: "beispiel/allrounder", name: "Beispiel-Modell Allrounder", contextLength: 128000 },
  { id: "beispiel/kompakt", name: "Beispiel-Modell Kompakt", contextLength: 32000 },
];
export const BEISPIEL_ANTWORT = "Gern. Hier ist mein Vorschlag – mit Beispiel-Daten.";

const args = process.argv.slice(2);
const trenner = args.indexOf("--");
const befehl = trenner >= 0 ? args.slice(trenner + 1) : [];
const optionen = trenner >= 0 ? args.slice(0, trenner) : args;
if (optionen.length > 0) {
  console.error(`Unbekannte Angabe: ${optionen.join(" ")}`);
  console.error("Aufruf: pnpm doku:app [-- <befehl> …]");
  process.exit(2);
}

// biome-ignore lint/suspicious/noUndeclaredEnvVars: nur für dieses Skript, kein Turborepo-Task
const DB_VERWALTER = process.env.PAIBOT_DOKU_DATABASE_URL;
// biome-ignore lint/suspicious/noUndeclaredEnvVars: nur für dieses Skript, kein Turborepo-Task
const ANBIETER_PORT = Number(process.env.PAIBOT_DOKU_ANBIETER_PORT ?? 18080);

const log = (text) => console.log(`[doku:app] ${text}`);

function freierPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function portFrei(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

// ---------------------------------------------------------------------------------------------
// Aufräumen: läuft genau einmal, bei jedem Ende.

const kinder = [];
const aufgaben = [];
let aufgeraeumt;

function beendeGruppe(kind, signal) {
  try {
    process.kill(-kind.pid, signal);
  } catch {
    // schon beendet
  }
}

async function beendeKind(kind) {
  if (kind.exitCode !== null || kind.signalCode !== null) {
    beendeGruppe(kind, "SIGKILL");
    return;
  }
  const ende = new Promise((resolve) => kind.once("exit", resolve));
  beendeGruppe(kind, "SIGTERM");
  const zeit = setTimeout(() => beendeGruppe(kind, "SIGKILL"), 10_000);
  await ende;
  clearTimeout(zeit);
  beendeGruppe(kind, "SIGKILL");
}

function aufraeumen() {
  aufgeraeumt ??= (async () => {
    for (const kind of [...kinder].reverse()) await beendeKind(kind);
    for (const aufgabe of [...aufgaben].reverse()) {
      try {
        await aufgabe();
      } catch (error) {
        console.error(`[doku:app] Aufräumen: ${error.message}`);
      }
    }
  })();
  return aufgeraeumt;
}

let beendet = false;
async function beende(code) {
  if (beendet) return;
  beendet = true;
  await aufraeumen();
  log("Aufgeräumt: Prozesse beendet, Datenbank und temporäre Ordner gelöscht.");
  process.exit(code);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    log(`${signal} empfangen, räume auf …`);
    void beende(130);
  });
}
process.on("uncaughtException", (error) => {
  console.error(`[doku:app] Fehler: ${error.message}`);
  void beende(1);
});

// ---------------------------------------------------------------------------------------------
// Prozesse

/** Startet einen Prozess als eigene Gruppe (so lässt er sich samt Unterprozessen beenden). */
function starte(name, programm, argumente, { env, cwd, logDatei }) {
  const kind = spawn(programm, argumente, {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  kinder.push(kind);
  const datei = createWriteStream(logDatei);
  let ausgabe = "";
  const lauscher = [];
  const sammle = (chunk) => {
    const text = chunk.toString();
    datei.write(text);
    ausgabe = (ausgabe + text).slice(-20_000);
    for (const l of lauscher) l();
  };
  kind.stdout.on("data", sammle);
  kind.stderr.on("data", sammle);
  kind.once("exit", (code, signal) => {
    datei.end();
    for (const l of lauscher) l();
    if (!beendet) {
      console.error(`[doku:app] ${name} hat sich beendet (${signal ?? code}). Letzte Ausgabe:`);
      console.error(ausgabe.slice(-3000));
      void beende(1);
    }
  });
  /** Wartet, bis `muster` in der Ausgabe steht; liefert den Treffer. */
  const warteAuf = (muster, sekunden = 120) =>
    new Promise((resolve, reject) => {
      const zeit = setTimeout(() => {
        reject(
          new Error(
            `${name}: nach ${sekunden} s nicht bereit. Letzte Ausgabe:\n${ausgabe.slice(-3000)}`,
          ),
        );
      }, sekunden * 1000);
      const pruefe = () => {
        const treffer = muster.exec(ausgabe);
        if (treffer) {
          clearTimeout(zeit);
          resolve(treffer);
        } else if (kind.exitCode !== null) {
          clearTimeout(zeit);
          reject(new Error(`${name} hat sich beendet:\n${ausgabe.slice(-3000)}`));
        }
      };
      lauscher.push(pruefe);
      pruefe();
    });
  return { kind, warteAuf };
}

/**
 * Führt einen Prozess bis zu seinem Ende aus (eigene Gruppe, Ausgabe in `logDatei`). Exit 0 ist
 * Erfolg; sonst Fehler mit der letzten Ausgabe.
 */
function fuehreAus(name, programm, argumente, { env, cwd, logDatei, sekunden = 180 }) {
  const kind = spawn(programm, argumente, {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  kinder.push(kind);
  const datei = createWriteStream(logDatei);
  let ausgabe = "";
  const sammle = (chunk) => {
    const text = chunk.toString();
    datei.write(text);
    ausgabe = (ausgabe + text).slice(-20_000);
  };
  kind.stdout.on("data", sammle);
  kind.stderr.on("data", sammle);
  return new Promise((resolve, reject) => {
    const zeit = setTimeout(() => {
      beendeGruppe(kind, "SIGKILL");
      reject(
        new Error(
          `${name}: nach ${sekunden} s nicht fertig. Letzte Ausgabe:\n${ausgabe.slice(-3000)}`,
        ),
      );
    }, sekunden * 1000);
    kind.once("exit", (code, signal) => {
      clearTimeout(zeit);
      datei.end();
      kinder.splice(kinder.indexOf(kind), 1);
      if (code === 0) resolve(ausgabe);
      else
        reject(
          new Error(
            `${name} endete mit ${signal ?? code}. Letzte Ausgabe:\n${ausgabe.slice(-3000)}`,
          ),
        );
    });
  });
}

/** Umgebung nur mit dem Nötigsten, damit nichts aus der eigenen Umgebung (z. B. echte Adressen) mitläuft. */
function grundUmgebung(extra) {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: process.env.HOME ?? os.tmpdir(),
    TMPDIR: os.tmpdir(),
    LANG: "C.UTF-8",
    TZ: "Europe/Berlin",
    NEXT_TELEMETRY_DISABLED: "1",
    ...extra,
  };
}

async function warteAufAntwort(url, sekunden = 60) {
  const ende = Date.now() + sekunden * 1000;
  while (Date.now() < ende) {
    try {
      const antwort = await fetch(url, { redirect: "manual" });
      if (antwort.status === 200) return;
    } catch {
      // noch nicht erreichbar
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`${url} war nach ${sekunden} s nicht erreichbar.`);
}

// ---------------------------------------------------------------------------------------------
// Alter Lauf: läuft er noch, abbrechen; sonst seine Reste wegräumen.

async function alterLauf(datei) {
  let alt;
  try {
    alt = leseLauf(datei);
  } catch {
    alt = undefined;
  }
  if (alt === undefined) return;
  if (prozessLebt(alt.pid)) {
    throw new Error(
      `pnpm doku:app läuft schon (Prozess ${alt.pid}). Erst dort mit Strg+C beenden.`,
    );
  }
  log("Reste eines abgebrochenen Laufs gefunden, räume sie weg.");
  for (const pid of alt.prozesse ?? []) {
    try {
      const zeile = readFileSync(`/proc/${pid}/cmdline`, "utf8");
      if (alt.ordner && zeile.includes(alt.ordner)) process.kill(-pid, "SIGKILL");
    } catch {
      // nicht mehr da
    }
  }
  if (alt.pgOrdner) {
    try {
      const pid = Number(
        readFileSync(path.join(alt.pgOrdner, "daten", "postmaster.pid"), "utf8").split("\n")[0],
      );
      if (prozessLebt(pid)) process.kill(pid, "SIGINT");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch {
      // kein Server mehr
    }
    rmSync(alt.pgOrdner, { recursive: true, force: true });
  }
  if (alt.datenbank && DB_VERWALTER) {
    await loescheDatenbank(ROOT, DB_VERWALTER, alt.datenbank);
  }
  if (alt.ordner) rmSync(alt.ordner, { recursive: true, force: true });
  loescheLauf(datei);
}

// ---------------------------------------------------------------------------------------------

async function main() {
  for (const [datei, was] of [
    [path.join(STANDALONE, "apps", "web", "server.js"), "Web-App"],
    [WORKER, "Worker"],
    [ANBIETER, "Test-Anbieter"],
  ]) {
    if (!existsSync(datei))
      throw new Error(
        `${was} ist nicht gebaut (${path.relative(ROOT, datei)} fehlt). Erst \`pnpm build\`.`,
      );
  }

  const datei = laufDatei();
  await alterLauf(datei);
  const kennung = randomBytes(8).toString("hex");
  const ordner = mkdtempSync(path.join(os.tmpdir(), "paibot-doku-app-"));
  aufgaben.push(() => rmSync(ordner, { recursive: true, force: true }));
  aufgaben.push(() => loescheLauf(datei));

  // 1. Datenbank
  let verwalter = DB_VERWALTER;
  let pgOrdner;
  if (verwalter) {
    log("Wegwerf-Datenbank auf dem Server aus PAIBOT_DOKU_DATABASE_URL …");
  } else {
    log("Eigener Postgres-Server wird gestartet …");
    const server = starteEigenenServer({ port: await freierPort() });
    aufgaben.push(() => server.stop());
    verwalter = server.adresse;
    pgOrdner = server.ordner;
  }
  const db = await legeDatenbankAn(ROOT, verwalter, kennung);
  aufgaben.push(() => db.loesche());
  log(`Datenbank ${db.name} angelegt.`);

  // 2. Test-Anbieter
  const anbieterPort = ANBIETER_PORT;
  if (!(await portFrei(anbieterPort))) {
    throw new Error(
      `Port ${anbieterPort} für den Test-Anbieter ist belegt. Anderen Port mit PAIBOT_DOKU_ANBIETER_PORT setzen ` +
        "(dann ändert sich der Name des Anbieters in den Bildern).",
    );
  }
  const anbieterSchluessel = wegwerfWert(24);
  const anbieter = starte("Test-Anbieter", process.execPath, [ANBIETER], {
    cwd: ordner,
    env: grundUmgebung({
      FAKE_PROVIDER_PORT: String(anbieterPort),
      FAKE_PROVIDER_HOST: "127.0.0.1",
      FAKE_PROVIDER_API_KEY: anbieterSchluessel,
    }),
    logDatei: path.join(ordner, "anbieter.log"),
  });
  const [, anbieterUrl] = await anbieter.warteAuf(
    /Test-Anbieter bereit: (http:\/\/127\.0\.0\.1:\d+)\/v1/,
    30,
  );
  const steuerung = await fetch(`${anbieterUrl}/_steuerung/verhalten`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ models: BEISPIEL_MODELLE, reply: BEISPIEL_ANTWORT, chunkChars: 400 }),
  });
  if (!steuerung.ok) throw new Error(`Test-Anbieter: Steuerung antwortet ${steuerung.status}.`);

  // 3. Web-App aus dem Produktions-Build (wie im Image: standalone plus statische Dateien)
  const lauf = path.join(ordner, "app");
  cpSync(STANDALONE, lauf, { recursive: true, verbatimSymlinks: true });
  cpSync(path.join(WEB, ".next", "static"), path.join(lauf, "apps", "web", ".next", "static"), {
    recursive: true,
  });
  if (existsSync(path.join(WEB, "public"))) {
    cpSync(path.join(WEB, "public"), path.join(lauf, "apps", "web", "public"), { recursive: true });
  }
  cpSync(MIGRATIONEN, path.join(lauf, "packages", "db", "drizzle"), { recursive: true });
  const webPort = await freierPort();
  const url = `http://127.0.0.1:${webPort}`;
  const geheimnis = randomBytes(32).toString("base64");
  const gemeinsam = {
    NODE_ENV: "production",
    PAIBOT_SECRET: geheimnis,
    DATABASE_URL: db.app,
    MIGRATIONS_DIR: path.join(lauf, "packages", "db", "drizzle"),
  };
  // Wie der Einmal-Dienst `migrate`: einziger Prozess mit dem Zugang des Tabellen-Besitzers, ohne
  // PAIBOT_SECRET. Web-App und Worker bekommen danach nur die App-Rolle.
  log("Migrations-Schritt (wie der Dienst migrate) …");
  await fuehreAus(
    "Migrations-Schritt",
    process.execPath,
    [path.join(lauf, "apps", "web", "server.js")],
    {
      cwd: lauf,
      env: grundUmgebung({
        NODE_ENV: "production",
        PAIBOT_ROLE: "migrate",
        DATABASE_URL: db.app,
        DATABASE_MIGRATION_URL: db.migration,
        MIGRATIONS_DIR: gemeinsam.MIGRATIONS_DIR,
        PORT: String(await freierPort()),
        HOSTNAME: "127.0.0.1",
      }),
      logDatei: path.join(ordner, "migrate.log"),
    },
  );
  log("Web-App (Produktions-Build, nur App-Rolle) wird gestartet …");
  const web = starte("Web-App", process.execPath, [path.join(lauf, "apps", "web", "server.js")], {
    cwd: lauf,
    env: grundUmgebung({
      ...gemeinsam,
      PORT: String(webPort),
      HOSTNAME: "127.0.0.1",
      APP_URL: url,
      TRUST_PROXY: "1",
      PAIBOT_EINRICHTUNG_ANBIETER_URL: `${anbieterUrl}/v1`,
    }),
    logDatei: path.join(ordner, "web.log"),
  });
  const [, einrichtungsCode] = await web.warteAuf(
    /Einrichtungs-Code: ([0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})/,
  );
  await warteAufAntwort(`${url}/api/health`);

  // 4. Worker
  log("Worker wird gestartet …");
  const worker = starte("Worker", process.execPath, [WORKER], {
    cwd: lauf,
    env: grundUmgebung({
      ...gemeinsam,
      PAIBOT_WORKER_HEALTH_FILE: path.join(ordner, "worker.herzschlag"),
    }),
    logDatei: path.join(ordner, "worker.log"),
  });
  await worker.warteAuf(/Bereit: nimmt Läufe an/);

  // 5. Lauf-Datei
  schreibeLauf(
    {
      version: 1,
      pid: process.pid,
      prozesse: kinder.map((k) => k.pid),
      ordner,
      pgOrdner,
      datenbank: { name: db.name, rolle: db.rolle, kennung },
      url,
      anbieterUrl,
      einrichtungsCode,
      passwort: wegwerfWert(20),
      anbieterSchluessel,
      modell: BEISPIEL_MODELLE[0].id,
      zustand: "frisch",
    },
    datei,
  );
  log(`Bereit: ${url} (frisch, noch nicht eingerichtet).`);
  log(`Code, Wegwerf-Passwort und Zustand stehen in ${datei} (nur für dich lesbar).`);

  if (befehl.length === 0) {
    log("Jetzt in einem zweiten Terminal: pnpm doku:screenshots   ·   Beenden mit Strg+C.");
    await new Promise(() => undefined);
  }
  log(`Führe aus: ${befehl.join(" ")}`);
  const kind = spawn(befehl[0], befehl.slice(1), {
    cwd: process.cwd(),
    stdio: "inherit",
    detached: true,
    env: { ...process.env, PAIBOT_URL: url, PAIBOT_DOKU_LAUF: datei },
  });
  kinder.push(kind);
  const code = await new Promise((resolve) =>
    kind.once("exit", (c, s) => resolve(s ? 1 : (c ?? 1))),
  );
  // Gilt nicht als Absturz der App
  kinder.splice(kinder.indexOf(kind), 1);
  await beende(code);
}

main().catch((error) => {
  console.error(`[doku:app] Fehler: ${error.message}`);
  void beende(1);
});
