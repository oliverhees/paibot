/**
 * PaiBot – stellt den Stack für die Ende-zu-Ende-Prüfung bereit: eigener Postgres (Passwort-
 * Anmeldung, eigener Port), Test-Anbieter, Migrations-Schritt, danach Web-App (Produktions-Build)
 * und Worker nur mit der App-Rolle und mit der Netz-Sperre (`netz-sperre.cjs`). Räumt am Ende alles
 * wieder ab.
 *
 * Wiederverwendet: Datenbank und Wegwerf-Werte aus `scripts/doku/datenbank.mjs` und
 * `scripts/doku/lauf.mjs`. `scripts/doku/app.mjs` startet schon beim Import und gibt den Prozessen
 * eine feste Umgebung; die Start-Schritte stehen deshalb hier noch einmal, mit Sperre.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { legeDatenbankAn, starteEigenenServer } from "../../../scripts/doku/datenbank.mjs";
import { wegwerfWert } from "../../../scripts/doku/lauf.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const WEB = path.join(ROOT, "apps", "web");
const STANDALONE = path.join(WEB, ".next", "standalone");
const WORKER = path.join(ROOT, "apps", "worker", "dist", "worker.mjs");
const ANBIETER = path.join(ROOT, "tools", "fake-provider", "dist", "fake-provider.mjs");
const MIGRATIONEN = path.join(ROOT, "packages", "db", "drizzle");
/**
 * Dienstnamen aus Docker Compose: Die Anbieter-Schicht löst sie auf, um deren Adressen zu sperren
 * (außerhalb von Docker unbekannt). Die Sperre beantwortet sie lokal (siehe `netz-sperre.cjs`).
 */
const DIENSTNAMEN = ["postgres", "datenschleuse", "web", "worker"];
export const SPERRE = fileURLToPath(new URL("./netz-sperre.cjs", import.meta.url));

/** Beispiel-Modelle und -Antwort des Test-Anbieters (erfundene Namen). */
export const BEISPIEL_MODELLE = [
  { id: "beispiel/allrounder", name: "Beispiel-Modell Allrounder", contextLength: 128000 },
  { id: "beispiel/kompakt", name: "Beispiel-Modell Kompakt", contextLength: 32000 },
];
export const BEISPIEL_ANTWORT =
  "Gern. Hier ist eine Antwort aus dem Test-Anbieter, Stück für Stück gestreamt.";

/** Fehlt etwas aus `pnpm build`? Liefert die Liste der fehlenden Teile. */
export function fehlenderBuild() {
  return [
    [path.join(STANDALONE, "apps", "web", "server.js"), "Web-App"],
    [WORKER, "Worker"],
    [ANBIETER, "Test-Anbieter"],
  ]
    .filter(([datei]) => !existsSync(datei))
    .map(([datei, was]) => `${was} (${path.relative(ROOT, datei)})`);
}

export function freierPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Umgebung nur mit dem Nötigsten: nichts aus der eigenen Umgebung (keine Proxys, keine Schlüssel). */
function grundUmgebung(extra) {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: os.tmpdir(),
    TMPDIR: os.tmpdir(),
    LANG: "C.UTF-8",
    TZ: "Europe/Berlin",
    NEXT_TELEMETRY_DISABLED: "1",
    ...extra,
  };
}

/**
 * Startet den Stack. `ausgabe`: Ordner für Logs (`web.log`, `worker.log`, …) und das Netz-Log.
 * Liefert Adressen, Einrichtungs-Code, Schlüssel des Test-Anbieters und `stop()`. `zusatzWeb`:
 * weitere Datei, die die Web-App nach der Sperre lädt (nur für die Gegenprobe).
 */
export async function starteStack({ ausgabe, log = () => undefined, zusatzWeb }) {
  mkdirSync(ausgabe, { recursive: true });
  const kinder = [];
  const aufgaben = [];
  let stopp = false;
  const abbruch = [];

  function starte(name, programm, argumente, { env, cwd, logDatei }) {
    const kind = spawn(programm, argumente, {
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    kinder.push(kind);
    const datei = createWriteStream(logDatei);
    let text = "";
    const lauscher = [];
    const sammle = (chunk) => {
      datei.write(chunk);
      text = (text + chunk.toString()).slice(-50_000);
      for (const l of lauscher) l();
    };
    kind.stdout.on("data", sammle);
    kind.stderr.on("data", sammle);
    const ende = new Promise((resolve) =>
      kind.once("exit", (code, signal) => {
        datei.end();
        for (const l of lauscher) l();
        if (!stopp)
          for (const a of abbruch) a(new Error(`${name} hat sich beendet (${signal ?? code}).`));
        resolve(code ?? 1);
      }),
    );
    const warteAuf = (muster, sekunden = 120) =>
      new Promise((resolve, reject) => {
        const zeit = setTimeout(
          () =>
            reject(new Error(`${name}: nach ${sekunden} s nicht bereit.\n${text.slice(-3000)}`)),
          sekunden * 1000,
        );
        const pruefe = () => {
          const treffer = muster.exec(text);
          if (treffer) {
            clearTimeout(zeit);
            resolve(treffer);
          } else if (kind.exitCode !== null) {
            clearTimeout(zeit);
            reject(new Error(`${name} hat sich beendet:\n${text.slice(-3000)}`));
          }
        };
        lauscher.push(pruefe);
        pruefe();
      });
    return { kind, ende, warteAuf, ausgabe: () => text };
  }

  async function stop() {
    stopp = true;
    for (const kind of [...kinder].reverse()) {
      if (kind.exitCode !== null || kind.signalCode !== null) continue;
      const ende = new Promise((resolve) => kind.once("exit", resolve));
      try {
        process.kill(-kind.pid, "SIGTERM");
      } catch {
        continue;
      }
      const zeit = setTimeout(() => {
        try {
          process.kill(-kind.pid, "SIGKILL");
        } catch {
          // schon beendet
        }
      }, 10_000);
      await ende;
      clearTimeout(zeit);
    }
    for (const aufgabe of [...aufgaben].reverse()) {
      try {
        await aufgabe();
      } catch (error) {
        log(`Aufräumen: ${error.message}`);
      }
    }
  }

  try {
    const ordner = path.join(ausgabe, "lauf");
    rmSync(ordner, { recursive: true, force: true });
    mkdirSync(ordner, { recursive: true });
    aufgaben.push(() => rmSync(ordner, { recursive: true, force: true }));
    const netzLog = path.join(ausgabe, "netz.jsonl");
    rmSync(netzLog, { force: true });

    // 1. Postgres: eigener Server, Passwort-Anmeldung, eigener Port
    const pgPort = await freierPort();
    log(`Postgres auf 127.0.0.1:${pgPort} …`);
    const server = starteEigenenServer({ port: pgPort });
    aufgaben.push(() => server.stop());
    const db = await legeDatenbankAn(ROOT, server.adresse, randomBytes(8).toString("hex"));

    // 2. Test-Anbieter
    const anbieterPort = await freierPort();
    const anbieterSchluessel = wegwerfWert(24);
    const anbieter = starte("Test-Anbieter", process.execPath, [ANBIETER], {
      cwd: ordner,
      env: grundUmgebung({
        FAKE_PROVIDER_PORT: String(anbieterPort),
        FAKE_PROVIDER_HOST: "127.0.0.1",
        FAKE_PROVIDER_API_KEY: anbieterSchluessel,
      }),
      logDatei: path.join(ausgabe, "anbieter.log"),
    });
    const [, anbieterUrl] = await anbieter.warteAuf(
      /Test-Anbieter bereit: (http:\/\/127\.0\.0\.1:\d+)\/v1/,
      30,
    );
    const steuerung = await fetch(`${anbieterUrl}/_steuerung/verhalten`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        models: BEISPIEL_MODELLE,
        reply: BEISPIEL_ANTWORT,
        chunkChars: 8,
        chunkDelayMs: 80,
      }),
    });
    if (!steuerung.ok) throw new Error(`Test-Anbieter: Steuerung antwortet ${steuerung.status}.`);

    // 3. Web-App aus dem Produktions-Build (wie im Image)
    const app = path.join(ordner, "app");
    cpSync(STANDALONE, app, { recursive: true, verbatimSymlinks: true });
    cpSync(path.join(WEB, ".next", "static"), path.join(app, "apps", "web", ".next", "static"), {
      recursive: true,
    });
    if (existsSync(path.join(WEB, "public"))) {
      cpSync(path.join(WEB, "public"), path.join(app, "apps", "web", "public"), {
        recursive: true,
      });
    }
    const migrationen = path.join(app, "packages", "db", "drizzle");
    cpSync(MIGRATIONEN, migrationen, { recursive: true });
    const webPort = await freierPort();
    const url = `http://127.0.0.1:${webPort}`;
    const pg = `127.0.0.1:${pgPort}`;
    const sperre = (rolle, erlaubt, zusatz) => ({
      NODE_OPTIONS: [SPERRE, ...(zusatz ? [zusatz] : [])].map((d) => `--require ${d}`).join(" "),
      PAIBOT_E2E_NETZ_LOG: netzLog,
      PAIBOT_E2E_NETZ_ROLLE: rolle,
      PAIBOT_E2E_NETZ_ERLAUBT: erlaubt.join(","),
      PAIBOT_E2E_NETZ_NAMEN: DIENSTNAMEN.join(","),
    });
    const gemeinsam = {
      NODE_ENV: "production",
      PAIBOT_SECRET: randomBytes(32).toString("base64"),
      DATABASE_URL: db.app,
      MIGRATIONS_DIR: migrationen,
    };

    log("Migrations-Schritt (Tabellen-Besitzer, ohne PAIBOT_SECRET) …");
    const migrate = starte(
      "Migrations-Schritt",
      process.execPath,
      [path.join(app, "apps", "web", "server.js")],
      {
        cwd: app,
        env: grundUmgebung({
          NODE_ENV: "production",
          PAIBOT_ROLE: "migrate",
          DATABASE_URL: db.app,
          DATABASE_MIGRATION_URL: db.migration,
          MIGRATIONS_DIR: migrationen,
          PORT: String(await freierPort()),
          HOSTNAME: "127.0.0.1",
          ...sperre("migrate", [pg]),
        }),
        logDatei: path.join(ausgabe, "migrate.log"),
      },
    );
    const migrateCode = await migrate.ende;
    if (migrateCode !== 0) {
      throw new Error(
        `Migrations-Schritt endete mit ${migrateCode}:\n${migrate.ausgabe().slice(-3000)}`,
      );
    }

    log("Web-App (Produktions-Build, nur App-Rolle, mit Netz-Sperre) …");
    const web = starte("Web-App", process.execPath, [path.join(app, "apps", "web", "server.js")], {
      cwd: app,
      env: grundUmgebung({
        ...gemeinsam,
        PORT: String(webPort),
        HOSTNAME: "127.0.0.1",
        APP_URL: url,
        TRUST_PROXY: "1",
        PAIBOT_EINRICHTUNG_ANBIETER_URL: `${anbieterUrl}/v1`,
        ...sperre("web", [pg, `127.0.0.1:${anbieterPort}`, `127.0.0.1:${webPort}`], zusatzWeb),
      }),
      logDatei: path.join(ausgabe, "web.log"),
    });
    const [, einrichtungsCode] = await web.warteAuf(
      /Einrichtungs-Code: ([0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})/,
    );

    log("Worker (nur App-Rolle, mit Netz-Sperre) …");
    const worker = starte("Worker", process.execPath, [WORKER], {
      cwd: app,
      env: grundUmgebung({
        ...gemeinsam,
        PAIBOT_WORKER_HEALTH_FILE: path.join(ordner, "worker.herzschlag"),
        ...sperre("worker", [pg, `127.0.0.1:${anbieterPort}`]),
      }),
      logDatei: path.join(ausgabe, "worker.log"),
    });
    await worker.warteAuf(/Bereit: nimmt Läufe an/);

    return {
      url,
      anbieterUrl,
      anbieterSchluessel,
      einrichtungsCode,
      netzLog,
      /** Wird abgelehnt, sobald Web-App, Worker oder Test-Anbieter unerwartet enden. */
      absturz: new Promise((_, reject) => abbruch.push(reject)),
      ausgabeVon: { web: web.ausgabe, worker: worker.ausgabe },
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
