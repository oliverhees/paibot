/**
 * PaiBot – Tests der Netz-Sperre: Ein Node-Prozess mit der Sperre erreicht nur erlaubte Ziele;
 * jeder andere Verbindungsaufbau (TCP, HTTP, HTTPS, fetch, UDP) und jede Namensauflösung wird
 * abgebrochen und protokolliert, bevor etwas den Prozess verlässt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SPERRE = fileURLToPath(new URL("./netz-sperre.cjs", import.meta.url));
const ordner = mkdtempSync(path.join(os.tmpdir(), "paibot-netz-sperre-"));
let server;
let port;

beforeAll(async () => {
  server = createServer((s) => s.end("hallo"));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  rmSync(ordner, { recursive: true, force: true });
});

/** Führt `code` in einem Node-Prozess mit der Sperre aus; liefert Ausgabe und Log-Zeilen. */
async function mitSperre(code, { erlaubt = [], namen = [] } = {}) {
  const log = path.join(ordner, `${Math.random().toString(36).slice(2)}.jsonl`);
  const kind = spawn(process.execPath, ["--input-type=module", "-e", code], {
    env: {
      PATH: process.env.PATH,
      NODE_OPTIONS: `--require ${SPERRE}`,
      PAIBOT_E2E_NETZ_LOG: log,
      PAIBOT_E2E_NETZ_ROLLE: "test",
      PAIBOT_E2E_NETZ_ERLAUBT: erlaubt.join(","),
      PAIBOT_E2E_NETZ_NAMEN: namen.join(","),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let aus = "";
  kind.stdout.on("data", (d) => {
    aus += d;
  });
  kind.stderr.on("data", () => undefined);
  const exit = await new Promise((r) => kind.once("exit", r));
  const zeilen = readFileSync(log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((z) => JSON.parse(z));
  return {
    exit,
    aus: aus.trim(),
    verstoesse: zeilen.filter((z) => z.art !== "start" && z.art !== "name-lokal"),
    zeilen,
  };
}

describe("Netz-Sperre", () => {
  it("meldet sich beim Start und lässt erlaubte Ziele durch", async () => {
    const r = await mitSperre(
      `import net from "node:net";
       const s = net.connect(${port}, "127.0.0.1");
       s.on("data", (d) => { console.log(String(d)); s.end(); });`,
      { erlaubt: [`127.0.0.1:${port}`] },
    );
    expect(r.aus).toBe("hallo");
    expect(r.verstoesse).toEqual([]);
    expect(r.zeilen[0]).toMatchObject({ art: "start", rolle: "test" });
  });

  it("bricht TCP zu einem nicht erlaubten Ziel ab, auch auf Loopback", async () => {
    const r = await mitSperre(
      `import net from "node:net";
       const s = net.connect(${port}, "127.0.0.1");
       s.on("data", () => console.log("durch"));
       s.on("error", (e) => console.log("abgebrochen", /Netz-Sperre/.test(e.message)));`,
    );
    expect(r.aus).toBe("abgebrochen true");
    expect(r.verstoesse).toMatchObject([{ art: "tcp", ziel: `127.0.0.1:${port}` }]);
  });

  it("fetch, http und https nach außen: abgebrochen und gemeldet, ohne Verbindung", async () => {
    const r = await mitSperre(
      `import http from "node:http"; import https from "node:https";
       await fetch("http://192.0.2.10/").catch(() => console.log("fetch weg"));
       await new Promise((ok) => http.get("http://192.0.2.11:8080/").on("error", () => { console.log("http weg"); ok(); }));
       await new Promise((ok) => https.get("https://192.0.2.12/").on("error", () => { console.log("https weg"); ok(); }));`,
    );
    expect(r.aus.split("\n")).toEqual(["fetch weg", "http weg", "https weg"]);
    expect(r.verstoesse.map((v) => v.ziel)).toEqual([
      "192.0.2.10:80",
      "192.0.2.11:8080",
      "192.0.2.12:443",
    ]);
  });

  it("Namensauflösung: gemeldet und ohne Anfrage beantwortet; lokale Namen ohne Verstoß", async () => {
    const r = await mitSperre(
      `import dns from "node:dns";
       await dns.promises.lookup("example.org").catch((e) => console.log(e.code));
       await new Promise((ok) => dns.lookup("example.net", (e) => { console.log(e.code); ok(); }));
       await new dns.promises.Resolver().resolve4("example.com").catch((e) => console.log(e.code));
       await dns.promises.lookup("postgres").catch((e) => console.log("lokal", e.code));
       await dns.promises.lookup("127.0.0.1").then(() => console.log("ip ok"));`,
      { namen: ["postgres"], erlaubt: ["127.0.0.1:5432"] },
    );
    expect(r.aus.split("\n")).toEqual([
      "ENOTFOUND",
      "ENOTFOUND",
      "ENOTFOUND",
      "lokal ENOTFOUND",
      "ip ok",
    ]);
    expect(r.verstoesse.map((v) => `${v.art} ${v.ziel}`)).toEqual([
      "dns.promises.lookup example.org",
      "dns.lookup example.net",
      "dns.promises.resolve4 example.com",
    ]);
    expect(r.zeilen.some((z) => z.art === "name-lokal")).toBe(true);
  });

  it("UDP: jedes Senden gemeldet", async () => {
    const r = await mitSperre(
      `import dgram from "node:dgram";
       const s = dgram.createSocket("udp4");
       s.send("x", 53, "192.0.2.53", (e) => { console.log(e ? "weg" : "durch"); s.close(); });`,
    );
    expect(r.aus).toBe("weg");
    expect(r.verstoesse).toMatchObject([{ art: "udp", ziel: "192.0.2.53:53" }]);
  });
});
