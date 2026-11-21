/**
 * PaiBot – Netz-Sperre für die Ende-zu-Ende-Prüfung: beobachtet in Web-App und Worker jeden
 * ausgehenden Verbindungsaufbau und jede Namensauflösung und bricht alles außer den erlaubten
 * Zielen ab.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/*
 * Geladen per `NODE_OPTIONS=--require`. Beobachtet TCP und TLS (jeder Weg über `net`, also auch
 * http, https und fetch), UDP und die Namensauflösung im Node-Prozess. Erlaubt sind nur die Ziele
 * aus `PAIBOT_E2E_NETZ_ERLAUBT` (Liste `host:port`, getrennt durch Komma, z. B. Postgres und
 * Test-Anbieter). Alles andere wird abgebrochen und als eine JSON-Zeile in `PAIBOT_E2E_NETZ_LOG`
 * geschrieben; die Prüfung wird damit rot.
 *
 * Namen aus `PAIBOT_E2E_NETZ_NAMEN` (z. B. die Dienstnamen aus Docker Compose, die die Anbieter-
 * Schicht zur Sicherheit auflöst) beantwortet die Sperre selbst mit „unbekannt“, ohne dass eine
 * Anfrage den Prozess verlässt; sie zählen nicht als Verstoß, stehen aber im Log (`name-lokal`).
 *
 * Was diese Methode NICHT sieht: Verbindungen aus nativen Erweiterungen oder über interne
 * Bindungen von Node am Modul `net` vorbei, Kind-Prozesse ohne `NODE_OPTIONS` (oder mit eigener
 * Umgebung), Programme außerhalb von Node (z. B. Postgres selbst), lokale Unix-Sockets (werden
 * zugelassen, sie verlassen den Rechner nicht) und alles, was vor dem Laden dieser Datei geschieht.
 */

"use strict";

const fs = require("node:fs");
const net = require("node:net");
const dgram = require("node:dgram");
const dns = require("node:dns");

const LOG = process.env.PAIBOT_E2E_NETZ_LOG;
const ROLLE = process.env.PAIBOT_E2E_NETZ_ROLLE || process.argv.slice(1, 2).join(" ");

/** Erlaubte Ziele als Menge `host:port`; `localhost` gilt wie 127.0.0.1 und ::1. */
const ERLAUBT = new Set(
  (process.env.PAIBOT_E2E_NETZ_ERLAUBT || "")
    .split(",")
    .map((z) => z.trim())
    .filter(Boolean),
);
const LOKALE_NAMEN = new Set(
  (process.env.PAIBOT_E2E_NETZ_NAMEN || "")
    .split(",")
    .map((z) => z.trim().toLowerCase())
    .filter(Boolean),
);
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function normalHost(host) {
  const h = String(host || "localhost")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
  return LOOPBACK.has(h) ? "127.0.0.1" : h;
}

function zielErlaubt(host, port) {
  return ERLAUBT.has(`${normalHost(host)}:${Number(port)}`);
}

/** Namen, die aufgelöst werden dürfen: Loopback und die Hosts der erlaubten Ziele. */
function nameErlaubt(name) {
  const h = normalHost(name);
  if (net.isIP(h) !== 0 && [...ERLAUBT].some((z) => z.startsWith(`${h}:`))) return true;
  return h === "127.0.0.1";
}

function schreibe(eintrag) {
  const zeile = `${JSON.stringify({ zeit: new Date().toISOString(), pid: process.pid, rolle: ROLLE, ...eintrag })}\n`;
  if (LOG) {
    try {
      fs.appendFileSync(LOG, zeile);
    } catch {
      // Log nicht schreibbar: unten trotzdem auf stderr
    }
  }
  if (eintrag.art !== "start" && eintrag.art !== "name-lokal")
    process.stderr.write(`[netz-sperre] verboten: ${zeile}`);
}

function stapel() {
  return (new Error().stack || "")
    .split("\n")
    .slice(3, 9)
    .map((z) => z.trim());
}

/** Fehler „Name unbekannt“, für Namen aus `PAIBOT_E2E_NETZ_NAMEN` ohne Verstoß. */
function lokalUnbekannt(art, name) {
  if (!LOKALE_NAMEN.has(String(name).toLowerCase())) return undefined;
  schreibe({ art: "name-lokal", ziel: `${art} ${name}` });
  const fehler = new Error(`getaddrinfo ENOTFOUND ${name}`);
  fehler.code = "ENOTFOUND";
  fehler.hostname = name;
  return fehler;
}

function verboten(art, ziel) {
  schreibe({ art, ziel, stapel: stapel() });
  return new Error(`Netz-Sperre: ${art} nach ${ziel} ist in dieser Prüfung nicht erlaubt.`);
}

// --- TCP und TLS: jeder Weg (net.connect, http, https, tls, fetch) endet in Socket#connect ----
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function pruefeConnect(...args) {
  let optionen = args[0];
  if (Array.isArray(optionen)) optionen = optionen[0];
  let host;
  let port;
  if (optionen !== null && typeof optionen === "object") {
    // Unix-Socket nur bei gesetztem Pfad (http setzt `path: null` bei TCP).
    if (typeof optionen.path === "string" && optionen.path !== "") return connect.apply(this, args);
    host = optionen.host;
    port = optionen.port;
  } else if (typeof optionen === "string" && Number.isNaN(Number(optionen))) {
    return connect.apply(this, args); // Unix-Socket als Pfad
  } else {
    port = optionen;
    host = typeof args[1] === "string" ? args[1] : undefined;
  }
  if (zielErlaubt(host, port)) return connect.apply(this, args);
  const fehler = verboten("tcp", `${normalHost(host)}:${port}`);
  process.nextTick(() => this.destroy(fehler));
  return this;
};

// --- UDP: in dieser Prüfung nie erlaubt ---------------------------------------------------------
for (const name of ["send", "connect"]) {
  dgram.Socket.prototype[name] = function pruefeUdp(...args) {
    const port = name === "connect" ? args[0] : args.find((a) => typeof a === "number");
    const host = args.find((a, i) => i > 0 && typeof a === "string");
    const fehler = verboten("udp", `${normalHost(host)}:${port}`);
    const rueckruf = args.find((a) => typeof a === "function");
    if (rueckruf) process.nextTick(() => rueckruf(fehler));
  };
}

// --- Namensauflösung -----------------------------------------------------------------------------
function umhuelleRueckruf(ziel, name) {
  const original = ziel[name];
  if (typeof original !== "function") return;
  ziel[name] = function pruefeName(hostname, ...rest) {
    if (nameErlaubt(hostname)) return original.call(this, hostname, ...rest);
    const fehler =
      lokalUnbekannt(`dns.${name}`, hostname) ?? verboten(`dns.${name}`, String(hostname));
    fehler.code = "ENOTFOUND";
    const rueckruf = rest.find((a) => typeof a === "function");
    if (rueckruf) process.nextTick(() => rueckruf(fehler));
    return undefined;
  };
}
function umhuelleVersprechen(ziel, name) {
  const original = ziel[name];
  if (typeof original !== "function") return;
  ziel[name] = function pruefeName(hostname, ...rest) {
    if (nameErlaubt(hostname)) return original.call(this, hostname, ...rest);
    const fehler =
      lokalUnbekannt(`dns.promises.${name}`, hostname) ??
      verboten(`dns.promises.${name}`, String(hostname));
    fehler.code = "ENOTFOUND";
    return Promise.reject(fehler);
  };
}
const AUFLOESEN = [
  "lookup",
  "lookupService",
  "resolve",
  "resolve4",
  "resolve6",
  "resolveAny",
  "resolveCname",
  "resolveMx",
  "resolveNs",
  "resolveTxt",
  "resolveSrv",
  "resolveNaptr",
  "resolvePtr",
  "resolveSoa",
  "resolveCaa",
  "reverse",
];
for (const name of AUFLOESEN) {
  umhuelleRueckruf(dns, name);
  umhuelleRueckruf(dns.Resolver.prototype, name);
  umhuelleVersprechen(dns.promises, name);
  umhuelleVersprechen(dns.promises.Resolver.prototype, name);
}

schreibe({ art: "start", ziel: [...ERLAUBT].join(",") });
