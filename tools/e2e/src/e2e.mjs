/**
 * PaiBot – Ende-zu-Ende-Prüfung: startet den Stack im Produktions-Build (siehe `stack.mjs`) und
 * geht im Browser den ganzen Weg: Einrichtung mit Code, Anbieter, Modell, Chat mit gestreamter
 * Antwort, Beleg öffnen und prüfen, ganze Kette prüfen, Export, `pnpm belege:pruefen` auf dem
 * Export, Abmelden und Anmelden, Grenze setzen, Ablehnung durch das Tor. Dabei gilt „kein Verkehr
 * nach außen“: Im Browser wird jede Anfrage an einen anderen Host als die App abgebrochen und
 * gezählt, in Web-App und Worker protokolliert die Netz-Sperre jeden Verbindungsversuch nach
 * außen. Jeder Zähler über 0, jeder Konsolenfehler und jede CSP-Verletzung macht die Prüfung rot.
 *
 * Aufruf (nach `pnpm build`): `node tools/e2e/src/e2e.mjs [--ausgabe <ordner>] [--gegenprobe
 * browser|server]`. Ohne Playwright endet sie mit Exit 0 und einer klaren Meldung „übersprungen“.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BEISPIEL_ANTWORT, fehlenderBuild, ROOT, starteStack } from "./stack.mjs";

const UEBERSPRUNGEN = 0;
const args = process.argv.slice(2);
function wert(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const gegenprobe = wert("--gegenprobe");
if (gegenprobe !== undefined && !["browser", "server"].includes(gegenprobe)) {
  console.error("--gegenprobe kennt nur „browser“ oder „server“.");
  process.exit(2);
}
const ausgabe = path.resolve(
  wert("--ausgabe") ?? process.env.PAIBOT_E2E_AUSGABE ?? path.join(os.tmpdir(), "paibot-e2e"),
);
const bilder = path.join(ausgabe, "bilder");
mkdirSync(bilder, { recursive: true });
const log = (text) => console.log(`[e2e] ${text}`);

async function ladePlaywright() {
  try {
    return await import("playwright");
  } catch {
    // global installiert (npm i -g): ESM findet es nicht, CommonJS über NODE_PATH schon
    try {
      return createRequire(import.meta.url)("playwright");
    } catch {
      return undefined;
    }
  }
}

const playwright = await ladePlaywright();
if (playwright === undefined) {
  log(
    "ÜBERSPRUNGEN: Playwright fehlt (nicht im Projekt enthalten). Einmalig außerhalb des Projekts: " +
      "npm install -g playwright && npx playwright install chromium",
  );
  process.exit(UEBERSPRUNGEN);
}
const fehlt = fehlenderBuild();
if (fehlt.length > 0) {
  console.error(`[e2e] Nicht gebaut: ${fehlt.join(", ")}. Erst \`pnpm build\`.`);
  process.exit(1);
}
const { chromium } = playwright.chromium ? playwright : playwright.default;

// ---------------------------------------------------------------------------------------------

const ergebnis = { schritte: [], fremdImBrowser: [], konsole: [], netz: [], gegenprobe };
const PASSWORT = `Beispiel-${randomBytes(9).toString("base64url")}-Satz`;

let stack;
let browser;
let beendet = false;

async function aufraeumen() {
  if (beendet) return;
  beendet = true;
  try {
    await browser?.close();
  } catch {
    // schon zu
  }
  await stack?.stop();
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void aufraeumen().then(() => process.exit(130));
  });
}

async function schritt(name, seite, fn) {
  const start = Date.now();
  try {
    await fn();
    ergebnis.schritte.push({ name, ok: true, ms: Date.now() - start });
    log(`ok    ${name}`);
  } catch (error) {
    ergebnis.schritte.push({ name, ok: false, ms: Date.now() - start, fehler: error.message });
    log(`FEHLER ${name}: ${error.message.split("\n")[0]}`);
    throw error;
  } finally {
    const nummer = String(ergebnis.schritte.length).padStart(2, "0");
    await seite
      .screenshot({ path: path.join(bilder, `${nummer}-${name.replace(/[^a-z0-9]+/gi, "-")}.png`) })
      .catch(() => undefined);
  }
}

function netzVerstoesse(datei) {
  if (!existsSync(datei)) return { starts: [], verstoesse: [], lokal: [] };
  const zeilen = readFileSync(datei, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((z) => JSON.parse(z));
  return {
    starts: zeilen.filter((z) => z.art === "start"),
    lokal: zeilen.filter((z) => z.art === "name-lokal"),
    verstoesse: zeilen.filter((z) => z.art !== "start" && z.art !== "name-lokal"),
  };
}

async function main() {
  log(`Ausgabe: ${ausgabe}`);
  stack = await starteStack({
    ausgabe,
    log,
    ...(gegenprobe === "server"
      ? { zusatzWeb: fileURLToPath(new URL("./gegenprobe-fremdaufruf.cjs", import.meta.url)) }
      : {}),
  });
  const app = new URL(stack.url).origin;
  log(`Stack bereit: ${app}`);

  browser = await chromium.launch();
  const kontext = await browser.newContext({
    colorScheme: "dark",
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
  });
  // (a) Browser: jede Anfrage an einen anderen Host als die App wird abgebrochen und gezählt.
  await kontext.route("**/*", (route) => {
    const url = route.request().url();
    let herkunft;
    try {
      herkunft = new URL(url).origin;
    } catch {
      herkunft = url;
    }
    if (herkunft === app) return route.continue();
    ergebnis.fremdImBrowser.push(url);
    return route.abort("blockedbyclient");
  });
  kontext.on("websocket", (ws) => {
    if (new URL(ws.url()).origin.replace(/^ws/, "http") !== app) {
      ergebnis.fremdImBrowser.push(ws.url());
    }
  });
  // CSP-Verletzungen als Konsolenfehler sichtbar machen (zusätzlich zur Meldung des Browsers).
  await kontext.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      console.error(`CSP-Verletzung: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  const seite = await kontext.newPage();
  seite.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      ergebnis.konsole.push({ art: m.type(), text: m.text(), url: seite.url() });
    }
  });
  seite.on("pageerror", (e) => ergebnis.konsole.push({ art: "pageerror", text: e.message }));

  if (gegenprobe === "browser") {
    // Zwei Wege: eine Navigation (die CSP greift nicht, die Sperre im Browser schon) und ein
    // `fetch` aus der Seite (die CSP blockt ihn, das zählt als Konsolenfehler).
    const probe = await kontext.newPage();
    await probe.goto("https://example.org/").catch(() => undefined);
    await probe.close();
    await seite.goto(`${app}/einrichtung`);
    await seite.evaluate(() => fetch("https://example.org/").catch(() => undefined));
  }

  await schritt("Einrichtung: Code", seite, async () => {
    await seite.goto(`${app}/einrichtung`);
    await seite.getByLabel("Einrichtungs-Code").fill(stack.einrichtungsCode);
    await seite.getByRole("button", { name: "Weiter" }).click();
    await seite.getByRole("heading", { name: "Passwort festlegen" }).waitFor();
  });
  await schritt("Einrichtung: Passwort", seite, async () => {
    await seite.getByLabel("Passwort", { exact: true }).fill(PASSWORT);
    await seite.getByLabel("Passwort wiederholen").fill(PASSWORT);
    await seite.getByRole("button", { name: "Weiter" }).click();
    await seite.getByRole("heading", { name: "Modell-Anbieter verbinden" }).waitFor();
  });
  await schritt("Einrichtung: Anbieter eintragen", seite, async () => {
    await seite.getByLabel("Schlüssel für", { exact: false }).fill(stack.anbieterSchluessel);
    await seite.getByRole("button", { name: "Verbindung testen" }).click();
    await seite.getByText("Verbindung steht").waitFor();
    await seite.getByRole("button", { name: "Weiter" }).click();
    await seite.getByRole("heading", { name: "Modell wählen" }).waitFor();
  });
  await schritt("Einrichtung: Modell wählen", seite, async () => {
    await seite.getByRole("radio", { name: /Beispiel-Modell Allrounder/ }).check();
    await seite.getByRole("button", { name: "Weiter" }).click();
    await seite.getByText("Datenschleuse als Standard").first().waitFor();
    await seite.getByRole("button", { name: "Weiter" }).click();
    await seite.getByRole("heading", { name: "Wie soll dein Bot heißen?" }).waitFor();
    await seite.getByRole("button", { name: "Einrichtung abschließen" }).click();
    await seite.getByRole("heading", { name: "Alles bereit" }).waitFor();
  });

  let unterhaltung;
  await schritt("Chat: Nachricht und gestreamte Antwort", seite, async () => {
    await seite.goto(`${app}/`);
    await seite.getByRole("textbox", { name: "Nachricht" }).fill("Hallo Pai, wie geht es dir?");
    // Jede neue Länge des Antwort-Textes merken: mehrere Zwischenstände = gestreamt.
    await seite.evaluate(() => {
      window.__laengen = [];
      new MutationObserver(() => {
        const verlauf = document.querySelector('[role="log"]');
        const text = verlauf?.textContent ?? "";
        const i = text.indexOf("Gern.");
        if (i >= 0) {
          const laenge = text.length - i;
          if (window.__laengen.at(-1) !== laenge) window.__laengen.push(laenge);
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await seite.getByRole("button", { name: "Senden" }).click();
    await seite.getByText(BEISPIEL_ANTWORT, { exact: true }).waitFor({ timeout: 60_000 });
    const laengen = await seite.evaluate(() => window.__laengen);
    if (laengen.length < 3) {
      throw new Error(`Antwort kam nicht in Teilen (Zwischenstände: ${laengen.join(", ")}).`);
    }
    unterhaltung = new URL(seite.url()).pathname;
    ergebnis.zwischenstaende = laengen.length;
  });
  await schritt("Chat: Verlauf nach Neuladen", seite, async () => {
    await seite.reload();
    await seite.getByText(BEISPIEL_ANTWORT, { exact: true }).waitFor();
  });

  await schritt("Beleg öffnen und prüfen", seite, async () => {
    await seite
      .getByRole("button", { name: /^Beleg prüfen: B-\d+/ })
      .first()
      .click();
    const flaeche = seite.getByRole("complementary", { name: "Arbeitsfläche" });
    await flaeche.getByText("Modell angefragt").first().waitFor();
    await flaeche.getByRole("link", { name: "Als eigene Seite öffnen" }).first().click();
    await seite.getByRole("heading", { name: /^Beleg B-\d+$/ }).waitFor();
    await seite.getByRole("button", { name: "Beleg prüfen" }).click();
    await seite.getByRole("article").getByText("stimmt", { exact: true }).waitFor();
  });

  await schritt("Ganze Kette prüfen", seite, async () => {
    await seite.goto(`${app}/belege`);
    await seite.getByRole("button", { name: "Ganze Kette prüfen" }).click();
    await seite
      .getByRole("status")
      .getByText(/^Vertrauenswürdig: \d+ Belege geprüft/)
      .waitFor();
  });

  let exportDatei;
  await schritt("Export", seite, async () => {
    const download = seite.waitForEvent("download");
    await seite
      .getByRole("region", { name: "Belege exportieren" })
      .getByRole("button", { name: "Belege exportieren" })
      .click();
    exportDatei = path.join(ausgabe, (await download).suggestedFilename());
    await (await download).saveAs(exportDatei);
    if (!readFileSync(exportDatei, "utf8").includes('"format"')) {
      throw new Error("Export ohne Kopfzeile.");
    }
  });

  await schritt("pnpm belege:pruefen auf dem Export", seite, async () => {
    const lauf = spawnSync("pnpm", ["--silent", "belege:pruefen", exportDatei], {
      cwd: ROOT,
      encoding: "utf8",
      env: { PATH: process.env.PATH, HOME: process.env.HOME ?? os.homedir() },
    });
    writeFileSync(path.join(ausgabe, "belege-pruefen.log"), `${lauf.stdout}\n${lauf.stderr}`);
    ergebnis.belegePruefen = { exit: lauf.status, ausgabe: lauf.stdout.trim().split("\n") };
    if (lauf.status !== 0) throw new Error(`belege:pruefen endete mit ${lauf.status}.`);
  });

  await schritt("Abmelden", seite, async () => {
    await seite.goto(`${app}${unterhaltung}`);
    await seite
      .getByRole("complementary", { name: "Navigation" })
      .getByRole("button", { name: "Abmelden" })
      .click();
    await seite.waitForURL((u) => u.pathname.startsWith("/anmelden"));
    await seite.goto(`${app}/belege`);
    await seite.waitForURL((u) => u.pathname.startsWith("/anmelden"));
  });
  await schritt("Anmelden", seite, async () => {
    await seite.getByLabel("Passwort", { exact: true }).fill(PASSWORT);
    await seite.getByRole("button", { name: "Anmelden" }).click();
    await seite.waitForURL((u) => !u.pathname.startsWith("/anmelden"));
    await seite.getByRole("complementary", { name: "Navigation" }).waitFor();
  });

  await schritt("Einstellungen: Tagesbudget als Grenze setzen", seite, async () => {
    await seite.goto(`${app}/einstellungen/grenzen`);
    await seite.getByRole("textbox", { name: "Tagesbudget (Token)" }).fill("1");
    await seite.getByRole("button", { name: "Speichern" }).click();
    await seite.getByText("Gespeichert.").waitFor();
    await seite.getByText("Die Tagesgrenze ist erreicht.", { exact: false }).waitFor();
  });
  await schritt("Ablehnung durch das Tor wird gezeigt", seite, async () => {
    await seite.goto(`${app}/`);
    await seite.getByRole("textbox", { name: "Nachricht" }).fill("Noch eine Frage");
    await seite.getByRole("button", { name: "Senden" }).click();
    const verlauf = seite.getByRole("log", { name: "Verlauf" });
    await verlauf.getByText("Vom Tor abgelehnt").waitFor({ timeout: 60_000 });
    await verlauf.getByText(/G-04 „Tagesbudget“/).waitFor();
    await verlauf.getByRole("button", { name: /^Beleg prüfen: B-\d+/ }).waitFor();
  });

  // Mobil: Kernansicht im Handy-Format, angemeldet.
  await schritt("Mobil: Chat im Handy-Format", seite, async () => {
    await seite.setViewportSize({ width: 390, height: 844 });
    await seite.goto(`${app}${unterhaltung}`);
    await seite.getByText(BEISPIEL_ANTWORT, { exact: true }).waitFor();
  });

  // Kurz warten, damit späte Anfragen (z. B. Ereignis-Strom) noch gezählt werden.
  await seite.waitForTimeout(1500);
}

let fehler;
try {
  await main();
} catch (error) {
  fehler = error;
}
await aufraeumen();

const netz = netzVerstoesse(path.join(ausgabe, "netz.jsonl"));
ergebnis.netz = netz.verstoesse;
ergebnis.netzLokaleNamen = [...new Set(netz.lokal.map((z) => z.ziel))];
ergebnis.gesperrteProzesse = [...new Set(netz.starts.map((z) => z.rolle))].sort();
const konsolenFehler = ergebnis.konsole.filter((k) => k.art !== "warning");
const pruefungen = [
  ["alle Schritte", fehler === undefined],
  [
    "Sperre in migrate, web und worker geladen",
    ["migrate", "web", "worker"].every((r) => ergebnis.gesperrteProzesse.includes(r)),
  ],
  ["kein Verkehr nach außen (Server)", netz.verstoesse.length === 0],
  ["kein Verkehr nach außen (Browser)", ergebnis.fremdImBrowser.length === 0],
  ["keine Konsolenfehler, keine CSP-Verletzung", konsolenFehler.length === 0],
];
ergebnis.pruefungen = Object.fromEntries(pruefungen);
writeFileSync(path.join(ausgabe, "ergebnis.json"), `${JSON.stringify(ergebnis, null, 2)}\n`);

log("─".repeat(60));
for (const [name, ok] of pruefungen) log(`${ok ? "ok    " : "FEHLER"} ${name}`);
if (fehler) log(`Abbruch: ${fehler.message.split("\n").slice(0, 3).join(" ")}`);
for (const v of netz.verstoesse) log(`Netz (${v.rolle}): ${v.art} → ${v.ziel}`);
for (const u of ergebnis.fremdImBrowser) log(`Browser: ${u}`);
for (const k of konsolenFehler) log(`Konsole (${k.art}): ${k.text}`);
log(`Ergebnis, Logs und Bilder: ${ausgabe}`);
const ok = pruefungen.every(([, v]) => v);
log(ok ? "Ende-zu-Ende-Prüfung bestanden." : "Ende-zu-Ende-Prüfung NICHT bestanden.");
process.exit(ok ? 0 : 1);
