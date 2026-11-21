/**
 * PaiBot – prüft, dass die Compose-Dateien für Image und Coolify dieselbe Aufstellung haben wie die mit Bau.
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
// Dazu deploy/docker-compose.coolify.yml (Coolify erzeugt die Geheimnisse): Sie muss dieselben
// Dienste mit denselben Zeilen haben wie die Bau-Datei; die Reihenfolge der Dienste darf anders
// sein (web steht dort zuerst). Erlaubt sind nur diese Unterschiede:
//   - Passwort des Tabellen-Besitzers: ${SERVICE_HEX_64_PGOWNER} statt ${POSTGRES_PASSWORD…}
//   - Passwort der App-Rolle:          ${SERVICE_HEX_64_PGAPP} statt ${POSTGRES_APP_PASSWORD…}
//   - PAIBOT_SECRET:                   ${SERVICE_REALBASE64_32_PAIBOT} statt ${PAIBOT_SECRET…}
//   - APP_URL:                         ${SERVICE_URL_WEB} statt ${APP_URL…}
//   - beim Dienst web genau eine Zeile „SERVICE_URL_WEB_3000:“ (Domain gehört zu web, Port 3000)
//   - beim Dienst web statt des Blocks „ports:“ der Bau-Datei genau der Block „expose:“ mit
//     „- "3000"“ (der Proxy erreicht web über das Docker-Netz; kein Port auf dem Server)
// Veröffentlicht die Coolify-Datei bei irgendeinem Dienst einen Port („ports:“), ist das ein Fehler.
// Erzeugte Werte stehen ohne Standard (kein „${SERVICE_…:-…}“), andere SERVICE_-Variablen gibt es
// dort nicht.
//
//   node scripts/compose-vergleich.mjs <bau.yml> <image.yml> <coolify.yml>
//                                        mit eigenen Dateien; ohne dritte keine Coolify-Datei
//
// Für alle Compose-Dateien unter deploy/ (bzw. die angegebenen) zusätzlich: keine Schreibweisen,
// die ein YAML-1.1-Parser (z. B. in Coolify) anders liest als Docker Compose (YAML 1.2): Zahlen mit
// führender Null (oktal), 0o…/0x…, Zeit-Zahlen wie 1:30 (Basis 60) und unquotiert yes/no/on/off.
// Solche Werte in Anführungszeichen setzen oder als Dezimalzahl schreiben (mode: 1023 statt 01777).
//
// Exit-Code 0: gleich. Exit-Code 1: Unterschied gefunden (mit Zeile und Hinweis).

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PAIBOT_DIENSTE = ["migrate", "web", "worker"];
const IMAGE_ZEILE = /^ {4}image: ghcr\.io\/oliverhees\/paibot:\$\{PAIBOT_VERSION:\?[^}]+\}$/;
const LOKAL_ZEILE = /^ {4}image: paibot:lokal$/;

const eigeneDateien = process.argv.length > 2;
const [bauPfad, imagePfad] = [
  resolve(process.argv[2] ?? "deploy/docker-compose.yml"),
  resolve(process.argv[3] ?? "deploy/docker-compose.image.yml"),
];
const coolifyArg = eigeneDateien ? process.argv[4] : "deploy/docker-compose.coolify.yml";
const coolifyPfad = coolifyArg === undefined ? undefined : resolve(coolifyArg);

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
// Jeder Dienst mit Log-Grenzen (Größe und Anzahl der Dateien), alle über denselben Block.
const alleDienste = [...new Set(bau.filter((z) => z.dienst !== "").map((z) => z.dienst))];
for (const dienst of alleDienste) {
  if (!bau.some((z) => z.dienst === dienst && z.text === "    logging: *logging")) {
    fehler.push(`${bauPfad}: Dienst ${dienst} braucht „logging: *logging“ (Log-Grenzen).`);
  }
}
const logText = readFileSync(bauPfad, "utf8");
if (
  !/^x-logging: &logging\n {2}driver: json-file\n {2}options:\n {4}max-size: "\d+m"\n {4}max-file: "\d+"$/m.test(
    logText,
  )
) {
  fehler.push(`${bauPfad}: Block „x-logging“ mit driver json-file, max-size und max-file fehlt.`);
}
// APP_URL ist Pflicht: ohne sie bricht schon docker compose mit einer Meldung ab.
if (!bau.some((z) => z.dienst === "web" && /^ {6}APP_URL: \$\{APP_URL:\?[^}]+\}$/.test(z.text))) {
  fehler.push(
    `${bauPfad}: Dienst web braucht „APP_URL: \${APP_URL:?…}“ (Pflichtwert mit Meldung).`,
  );
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

// ── Coolify-Datei ──────────────────────────────────────────────────────────────────────────
// Herkunft der Geheimnisse und der Adresse in eine gemeinsame Form bringen. Bau-Datei: die
// Pflichtwerte aus .env; Coolify-Datei: die Werte, die Coolify erzeugt.
const HERKUNFT_BAU = [
  [/\$\{POSTGRES_APP_PASSWORD:\?[^}]+\}/g, "«APP-PASSWORT»"],
  [/\$\{POSTGRES_PASSWORD(?::\?[^}]+)?\}/g, "«BESITZER-PASSWORT»"],
  [/\$\{PAIBOT_SECRET:\?[^}]+\}/g, "«PAIBOT-SECRET»"],
  [/\$\{APP_URL:\?[^}]+\}/g, "«APP-URL»"],
];
const HERKUNFT_COOLIFY = [
  [/\$\{SERVICE_HEX_64_PGAPP\}/g, "«APP-PASSWORT»"],
  [/\$\{SERVICE_HEX_64_PGOWNER\}/g, "«BESITZER-PASSWORT»"],
  [/\$\{SERVICE_REALBASE64_32_PAIBOT\}/g, "«PAIBOT-SECRET»"],
  [/\$\{SERVICE_URL_WEB\}/g, "«APP-URL»"],
];
const WEB_PORT_ZEILE = "      SERVICE_URL_WEB_3000:";

/** Entfernt bei einem Dienst den Block mit diesem Schlüssel (4 Leerzeichen) samt tiefer eingerückten Zeilen. */
function ohneBlock(liste, dienst, schluessel) {
  const rest = [];
  const entfernt = [];
  let drin = false;
  for (const z of liste) {
    if (z.dienst !== dienst) {
      drin = false;
      rest.push(z);
      continue;
    }
    if (drin && /^ {6,}/.test(z.text)) {
      entfernt.push(z.text);
      continue;
    }
    drin = false;
    if (z.text === `    ${schluessel}:`) {
      drin = true;
      entfernt.push(z.text);
      continue;
    }
    rest.push(z);
  }
  return { rest, entfernt };
}

function herkunft(liste, regeln) {
  return liste.map((z) => {
    let text = z.text;
    for (const [muster, ersatz] of regeln) text = text.replace(muster, ersatz);
    return { ...z, text };
  });
}

/** Teilt in Blöcke: je Dienst seine Zeilen, dazu alle Zeilen außerhalb der Dienste. */
function bloecke(liste) {
  const dienste = new Map();
  const reihenfolge = [];
  const sonst = [];
  for (const z of liste) {
    if (z.dienst === "") {
      sonst.push(z);
      continue;
    }
    if (!dienste.has(z.dienst)) {
      dienste.set(z.dienst, []);
      reihenfolge.push(z.dienst);
    }
    dienste.get(z.dienst).push(z);
  }
  return { dienste, reihenfolge, sonst };
}

function ersterUnterschied(a, b, wo) {
  const laenge = Math.max(a.length, b.length);
  for (let i = 0; i < laenge; i++) {
    if (a[i]?.text === b[i]?.text) continue;
    fehler.push(
      [
        `Erster Unterschied zur Coolify-Datei (${wo}):`,
        `  ${bauPfad}:${a[i]?.nr ?? "Ende"}  ${a[i]?.text ?? "(keine Zeile mehr)"}`,
        `  ${coolifyPfad}:${b[i]?.nr ?? "Ende"}  ${b[i]?.text ?? "(keine Zeile mehr)"}`,
        "  Erlaubt ist nur die Herkunft der Geheimnisse und der Adresse: Änderung in beiden nachziehen.",
      ].join("\n"),
    );
    return;
  }
}

let coolifyZeilen = 0;
if (coolifyPfad !== undefined) {
  const roh = mitDienst(zeilen(coolifyPfad));
  for (const z of roh) {
    if (/\$\{SERVICE_[A-Z0-9_]*[^A-Z0-9_}]/.test(z.text)) {
      fehler.push(
        `${coolifyPfad}:${z.nr}: Erzeugte Werte stehen ohne Standard und ohne Zusatz (nur \${SERVICE_…}).`,
      );
    }
  }
  const portZeilen = roh.filter((z) => z.text === WEB_PORT_ZEILE);
  if (portZeilen.length !== 1 || portZeilen[0].dienst !== "web") {
    fehler.push(
      `${coolifyPfad}: Dienst web braucht genau eine Zeile „SERVICE_URL_WEB_3000:“ (Domain für web, Port 3000).`,
    );
  }
  for (const z of roh) {
    if (z.dienst !== "" && /^ {4}ports:/.test(z.text)) {
      fehler.push(
        `${coolifyPfad}:${z.nr}: Dienst ${z.dienst} veröffentlicht einen Port („ports:“). In der Coolify-Datei ist das nicht erlaubt: Der Proxy erreicht die Dienste über das Docker-Netz, und ein Port auf dem Server verhindert zwei Installationen nebeneinander. Bei web steht stattdessen „expose: - "3000"“.`,
      );
    }
  }
  const ohnePort = roh.filter((z) => !(z.dienst === "web" && z.text === WEB_PORT_ZEILE));
  const coolify = herkunft(ohnePort, HERKUNFT_COOLIFY);
  for (const z of coolify) {
    const rest = /\$\{?SERVICE_[A-Z0-9_]*/.exec(z.text);
    if (rest) {
      fehler.push(`${coolifyPfad}:${z.nr}: ${rest[0]} ist hier nicht vorgesehen.`);
    }
    if (/\$\{(POSTGRES_PASSWORD|POSTGRES_APP_PASSWORD|PAIBOT_SECRET|APP_URL)\b/.test(z.text)) {
      fehler.push(
        `${coolifyPfad}:${z.nr}: Diesen Wert erzeugt Coolify; er kommt hier nicht aus einer eigenen Variable.`,
      );
    }
  }
  let vorlageZeilen = herkunft(mitDienst(zeilen(bauPfad)), HERKUNFT_BAU);
  let coolifyOhnePort = coolify;
  // Einziger erlaubter Unterschied beim Port: web hat in der Bau-Datei „ports:“ und in der
  // Coolify-Datei genau „expose: - "3000"“. Beides wird vor dem Vergleich entfernt.
  const bauPorts = ohneBlock(vorlageZeilen, "web", "ports");
  if (bauPorts.entfernt.length > 0) {
    const coolifyExpose = ohneBlock(coolify, "web", "expose");
    if (coolifyExpose.entfernt.join("|") !== `    expose:|      - "3000"`) {
      fehler.push(
        `${coolifyPfad}: Dienst web braucht statt „ports:“ genau den Block „expose:“ mit „- "3000"“ (kein Port auf dem Server).`,
      );
    } else {
      vorlageZeilen = bauPorts.rest;
      coolifyOhnePort = coolifyExpose.rest;
    }
  }
  const vorlage = bloecke(vorlageZeilen);
  const neu = bloecke(coolifyOhnePort);
  coolifyZeilen = coolifyOhnePort.length;
  if (neu.reihenfolge[0] !== "web") {
    fehler.push(
      `${coolifyPfad}: Der erste Dienst muss web sein (Coolify bietet ihn im Dialog „Add domain“ zuerst an).`,
    );
  }
  const namen = [...new Set([...vorlage.reihenfolge, ...neu.reihenfolge])].sort();
  for (const name of namen) {
    if (!vorlage.dienste.has(name) || !neu.dienste.has(name)) {
      fehler.push(`${coolifyPfad}: Dienst ${name} fehlt in einer der beiden Dateien.`);
      continue;
    }
    ersterUnterschied(vorlage.dienste.get(name), neu.dienste.get(name), `Dienst ${name}`);
  }
  ersterUnterschied(vorlage.sonst, neu.sonst, "außerhalb der Dienste");
}

// ── Schreibweisen, die YAML 1.1 und YAML 1.2 verschieden lesen ─────────────────────────────
const MEHRDEUTIG = [
  [/^[-+]?0[0-9_]+$/, "Zahl mit führender Null (YAML 1.1: oktal, YAML 1.2: dezimal)"],
  [/^[-+]?0[oOxXbB][0-9a-fA-F_]+$/, "Zahl mit 0o/0x/0b (nicht in jeder YAML-Fassung eine Zahl)"],
  [/^[-+]?[0-9][0-9_]*(:[0-5]?[0-9])+(\.[0-9_]*)?$/, "Zahl mit Doppelpunkt (YAML 1.1: Basis 60)"],
  [
    /^(y|Y|yes|Yes|YES|n|N|no|No|NO|on|On|ON|off|Off|OFF)$/,
    "yes/no/on/off (YAML 1.1: Wahrheitswert)",
  ],
];

/** Unquotierte Werte einer Zeile: nach „schlüssel: “, nach „- “ und in [a, b]. */
function werteDerZeile(text) {
  const ohneKommentar = text.replace(/\s+#.*$/, "");
  let rest = ohneKommentar.trim();
  const werte = [];
  while (rest.startsWith("- ")) rest = rest.slice(2).trim();
  if (rest === "-") return werte;
  const schluessel = /^([^"'\s][^:]*?|"[^"]*"|'[^']*'):(\s+(.*))?$/.exec(rest);
  if (schluessel && !/^[0-9]/.test(rest)) {
    if (schluessel[3] === undefined) return werte;
    rest = schluessel[3].trim();
  }
  if (rest.startsWith("[") && rest.endsWith("]")) {
    for (const teil of rest.slice(1, -1).split(",")) werte.push(teil.trim());
  } else {
    werte.push(rest);
  }
  return werte.filter((w) => w !== "" && !/^["'&*|>!]/.test(w));
}

function mehrdeutigeSchreibweisen(pfad) {
  const text = readFileSync(pfad, "utf8").split("\n");
  let blockEinzug = -1;
  text.forEach((zeile, i) => {
    const einzug = zeile.length - zeile.trimStart().length;
    if (blockEinzug >= 0) {
      if (zeile.trim() === "" || einzug > blockEinzug) return;
      blockEinzug = -1;
    }
    const inhalt = zeile.trim();
    if (inhalt === "" || inhalt.startsWith("#")) return;
    // Mehrzeiliger Text (| oder >): die folgenden, tiefer eingerückten Zeilen sind kein YAML-Wert.
    if (/(^|[:\s-])[|>][-+0-9]*(\s+#.*)?$/.test(inhalt)) {
      blockEinzug = einzug;
      return;
    }
    for (const wert of werteDerZeile(zeile)) {
      for (const [muster, grund] of MEHRDEUTIG) {
        if (muster.test(wert)) {
          fehler.push(
            `${pfad}:${i + 1}: „${wert}“ – ${grund}. In Anführungszeichen setzen oder eindeutig schreiben.`,
          );
        }
      }
    }
  });
}

const alleComposeDateien = eigeneDateien
  ? process.argv.slice(2).map((p) => resolve(p))
  : readdirSync(resolve("deploy"))
      .filter((name) => /^docker-compose.*\.ya?ml$/.test(name))
      .sort()
      .map((name) => resolve(join("deploy", name)));
for (const pfad of alleComposeDateien) mehrdeutigeSchreibweisen(pfad);

if (fehler.length > 0) {
  for (const f of fehler) console.error(f);
  process.exit(1);
}
console.log(
  `Compose-Vergleich ok: ${bau.length} Zeilen gleich, Unterschied nur bei image/build von ${PAIBOT_DIENSTE.join(", ")}.`,
);
console.log(
  `Schreibweisen ok: ${alleComposeDateien.length} Compose-Dateien ohne Werte, die YAML 1.1 und 1.2 verschieden lesen.`,
);
if (coolifyPfad !== undefined) {
  console.log(
    `Compose-Vergleich Coolify ok: ${coolifyZeilen} Zeilen gleich, Unterschied nur bei der Herkunft von Passwörtern, PAIBOT_SECRET und APP_URL sowie expose statt ports bei web.`,
  );
}
