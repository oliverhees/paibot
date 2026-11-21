/**
 * PaiBot – prüft, dass die Compose-Datei mit fertigem Image dieselbe Aufstellung hat wie die mit Bau.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Vergleicht deploy/docker-compose.yml (Bau aus dem Quellcode) mit deploy/docker-compose.image.yml
// (fertiges Image). Erlaubt ist nur ein Unterschied: Bei migrate, web und worker steht statt
// `image: paibot:lokal` plus `build:` genau eine Zeile `image: ghcr.io/oliverhees/paibot:${PAIBOT_VERSION:?…}`.
// Alles andere (Dienste, Netze, Rechte, Speicher-Grenzen, Healthchecks, Profile, Volumes) muss Zeile
// für Zeile gleich sein. Reine Kommentarzeilen und Leerzeilen zählen nicht.
//
//   node scripts/compose-vergleich.mjs
//   node scripts/compose-vergleich.mjs <bau.yml> <image.yml>    andere Dateien vergleichen
//
// Exit-Code 0: gleich. Exit-Code 1: Unterschied gefunden (mit Zeile und Hinweis).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAIBOT_DIENSTE = ["migrate", "web", "worker"];
const IMAGE_ZEILE = /^ {4}image: ghcr\.io\/oliverhees\/paibot:\$\{PAIBOT_VERSION:\?[^}]+\}$/;
const LOKAL_ZEILE = /^ {4}image: paibot:lokal$/;

const [bauPfad, imagePfad] = [
  resolve(process.argv[2] ?? "deploy/docker-compose.yml"),
  resolve(process.argv[3] ?? "deploy/docker-compose.image.yml"),
];

const fehler = [];

/** Zeilen mit Nummer, ohne Leer- und reine Kommentarzeilen. */
function zeilen(pfad) {
  return readFileSync(pfad, "utf8")
    .split("\n")
    .map((text, i) => ({ text: text.replace(/\s+$/, ""), nr: i + 1 }))
    .filter(({ text }) => text.trim() !== "" && !text.trim().startsWith("#"));
}

/** Name des Dienstes, in dem eine Zeile steht (zwei Leerzeichen eingerückt unter services:). */
function mitDienst(liste) {
  let bereich = "";
  let dienst = "";
  return liste.map((z) => {
    const oben = /^([a-z_-]+):/.exec(z.text);
    if (oben) {
      bereich = oben[1];
      dienst = "";
    } else if (bereich === "services") {
      const name = /^ {2}([a-z0-9_-]+):$/.exec(z.text);
      if (name) dienst = name[1];
    }
    return { ...z, dienst: bereich === "services" ? dienst : "" };
  });
}

/** Bau-Datei: bei den PaiBot-Diensten `image: paibot:lokal` und den Block `build:` entfernen. */
function ohneBau(liste) {
  const rest = [];
  const gefunden = new Map();
  let imBau = false;
  for (const z of liste) {
    const paibot = PAIBOT_DIENSTE.includes(z.dienst);
    if (imBau && /^ {6,}/.test(z.text)) continue;
    imBau = false;
    if (paibot && LOKAL_ZEILE.test(z.text)) {
      gefunden.set(z.dienst, (gefunden.get(z.dienst) ?? 0) + 1);
      continue;
    }
    if (paibot && z.text === "    build:") {
      imBau = true;
      gefunden.set(z.dienst, (gefunden.get(z.dienst) ?? 0) + 1);
      continue;
    }
    rest.push(z);
  }
  for (const dienst of PAIBOT_DIENSTE) {
    if (gefunden.get(dienst) !== 2) {
      fehler.push(
        `${bauPfad}: Dienst ${dienst} hat nicht genau „image: paibot:lokal“ und „build:“.`,
      );
    }
  }
  return rest;
}

/** Image-Datei: bei den PaiBot-Diensten die Image-Zeile prüfen und entfernen. */
function ohneImage(liste) {
  const rest = [];
  const gefunden = new Map();
  for (const z of liste) {
    if (!PAIBOT_DIENSTE.includes(z.dienst)) {
      rest.push(z);
      continue;
    }
    if (z.text === "    build:") {
      fehler.push(`${imagePfad}:${z.nr}: Dienst ${z.dienst} darf keinen Bau-Eintrag haben.`);
      continue;
    }
    if (/^ {4}image:/.test(z.text)) {
      if (!IMAGE_ZEILE.test(z.text)) {
        fehler.push(
          `${imagePfad}:${z.nr}: Dienst ${z.dienst}: Image muss ghcr.io/oliverhees/paibot:\${PAIBOT_VERSION:?…} sein (Pflichtwert, ohne Standard).`,
        );
      }
      gefunden.set(z.dienst, (gefunden.get(z.dienst) ?? 0) + 1);
      continue;
    }
    rest.push(z);
  }
  for (const dienst of PAIBOT_DIENSTE) {
    if (gefunden.get(dienst) !== 1) {
      fehler.push(`${imagePfad}: Dienst ${dienst} hat nicht genau eine Image-Zeile.`);
    }
  }
  return rest;
}

const bau = ohneBau(mitDienst(zeilen(bauPfad)));
const image = ohneImage(mitDienst(zeilen(imagePfad)));

if (/latest/i.test(readFileSync(imagePfad, "utf8").replace(/^\s*#.*$/gm, ""))) {
  fehler.push(`${imagePfad}: „latest“ ist nicht erlaubt; die Version kommt aus PAIBOT_VERSION.`);
}

// Feste Betriebswerte der Dienste von PaiBot (gelten durch den Vergleich auch für das Image).
for (const dienst of PAIBOT_DIENSTE) {
  const eigene = bau.filter((z) => z.dienst === dienst).map((z) => z.text.trim());
  if (!eigene.includes("pids_limit: 256")) {
    fehler.push(`${bauPfad}: Dienst ${dienst} braucht „pids_limit: 256“.`);
  }
}
const PROXY_ZEILE = ["TRUST_PROXY: $", "{TRUST_PROXY:-1}"].join("");
if (!bau.some((z) => z.dienst === "web" && z.text.trim() === PROXY_ZEILE)) {
  fehler.push(
    `${bauPfad}: Dienst web braucht „TRUST_PROXY: \${TRUST_PROXY:-1}“ (Standard: hinter dem Proxy).`,
  );
}

const laenge = Math.max(bau.length, image.length);
for (let i = 0; i < laenge; i++) {
  const a = bau[i];
  const b = image[i];
  if (a?.text === b?.text) continue;
  fehler.push(
    [
      "Erster Unterschied in der Aufstellung:",
      `  ${bauPfad}:${a?.nr ?? "Ende"}  ${a?.text ?? "(keine Zeile mehr)"}`,
      `  ${imagePfad}:${b?.nr ?? "Ende"}  ${b?.text ?? "(keine Zeile mehr)"}`,
      "  Beide Dateien müssen bis auf image/build gleich sein: Änderung in beiden nachziehen.",
    ].join("\n"),
  );
  break;
}

if (fehler.length > 0) {
  for (const f of fehler) console.error(f);
  process.exit(1);
}
console.log(
  `Compose-Vergleich ok: ${bau.length} Zeilen gleich, Unterschied nur bei image/build von ${PAIBOT_DIENSTE.join(", ")}.`,
);
