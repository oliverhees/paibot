/**
 * PaiBot – Netz-Probe für den Docker-Stack ohne Weg nach draußen: versucht TCP-Verbindungen zu
 * den angegebenen Zielen und meldet je Ziel „erreichbar“ oder „nicht erreichbar“.
 *
 * Aufruf im Container (liest das Skript von stdin, deshalb CommonJS):
 *   docker compose exec -T web node - --draussen 1.1.1.1:443 example.org:443 --drinnen postgres:5432
 * `--draussen`: Ziele, die NICHT erreichbar sein dürfen. `--drinnen`: Ziele, die erreichbar sein
 * müssen (Gegenprobe: die Probe selbst funktioniert); `--info`: nur melden. Exit 0, wenn alles
 * stimmt, sonst 1.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use strict";

const net = require("node:net");

const ZEIT_MS = 5000;

function versuche(ziel) {
  const i = ziel.lastIndexOf(":");
  const host = ziel.slice(0, i).replace(/^\[|\]$/g, "");
  const port = Number(ziel.slice(i + 1));
  return new Promise((fertig) => {
    const socket = net.connect({ host, port });
    const ende = (erreichbar, grund) => {
      socket.destroy();
      fertig({ ziel, erreichbar, grund });
    };
    socket.setTimeout(ZEIT_MS, () => ende(false, "Zeit abgelaufen"));
    socket.once("connect", () => ende(true, "verbunden"));
    socket.once("error", (error) => ende(false, error.code || error.message));
  });
}

async function main() {
  const draussen = [];
  const drinnen = [];
  const info = [];
  let liste = draussen;
  for (const arg of process.argv.slice(2)) {
    if (arg === "--draussen") liste = draussen;
    else if (arg === "--drinnen") liste = drinnen;
    else if (arg === "--info") liste = info;
    else if (arg !== "-") liste.push(arg);
  }
  if (draussen.length === 0 && drinnen.length === 0) {
    console.error("[netz-probe] keine Ziele angegeben.");
    process.exit(2);
  }
  for (const e of await Promise.all(info.map(versuche))) {
    console.log(
      `[netz-probe] info   ${e.ziel}: ${e.erreichbar ? "erreichbar" : "nicht erreichbar"} (${e.grund})`,
    );
  }
  let ok = true;
  for (const [ziele, sollErreichbar] of [
    [draussen, false],
    [drinnen, true],
  ]) {
    const ergebnisse = await Promise.all(ziele.map(versuche));
    for (const e of ergebnisse) {
      const passt = e.erreichbar === sollErreichbar;
      if (!passt) ok = false;
      console.log(
        `[netz-probe] ${passt ? "ok    " : "FEHLER"} ${e.ziel}: ${e.erreichbar ? "erreichbar" : "nicht erreichbar"} (${e.grund}; erwartet: ${sollErreichbar ? "erreichbar" : "nicht erreichbar"})`,
      );
    }
  }
  process.exit(ok ? 0 : 1);
}

main();
