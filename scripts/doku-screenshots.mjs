/**
 * PaiBot – nimmt die Screenshots der Doku aus der laufenden App auf.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-18
 */

// Nimmt die Screenshots der Doku aus der laufenden App auf.
//
//   pnpm doku:screenshots                      alle Aufnahmen aus docs/screenshots.json
//   pnpm doku:screenshots startseite           nur die genannten Aufnahmen (nach `name`)
//   pnpm doku:screenshots --erlaube-fremde-url  auch eine URL außerhalb von localhost erlauben
//
// Die App muss laufen, Adresse aus PAIBOT_URL (Standard http://127.0.0.1:3000).
// Die Bilder landen in docs/assets/screenshots/<name>.png (2-fach Auflösung).
//
// Felder je Aufnahme in docs/screenshots.json:
//   name        Dateiname ohne Endung (Pflicht)
//   pfad        URL-Pfad in der App, z. B. "/" (Pflicht)
//   breite      Breite in Pixeln (Standard 1280)
//   hoehe       Höhe in Pixeln (Standard 800)
//   warteAuf    CSS-Selector, auf den vor der Aufnahme gewartet wird (optional)
//   ausschnitt  CSS-Selector; dann wird nur dieses Element aufgenommen (optional)
//   thema       "dunkel" oder "hell" (optional; heute gibt es nur das dunkle Design)
//   beschreibung  Notiz für Menschen, wird nicht ausgewertet (optional)
//
// Playwright gehört bewusst nicht zu den Abhängigkeiten des Projekts, damit `pnpm install`
// für alle schlank bleibt. Es wird erst hier geladen und nur gebraucht, wer Screenshots aufnimmt.
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = path.join(ROOT, "docs", "screenshots.json");
const OUT_DIR = path.join(ROOT, "docs", "assets", "screenshots");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
const allowForeign = args.includes("--erlaube-fremde-url");
const only = args.filter((arg) => !arg.startsWith("--"));

// biome-ignore lint/suspicious/noUndeclaredEnvVars: nur für dieses Skript, kein Turborepo-Task
const baseUrl = (process.env.PAIBOT_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

let host;
try {
  host = new URL(baseUrl).hostname;
} catch {
  fail(`PAIBOT_URL ist keine gültige Adresse: ${baseUrl}`);
}
if (!LOCAL_HOSTS.has(host) && !allowForeign) {
  fail(
    `Abbruch: PAIBOT_URL zeigt auf „${host}“, nicht auf den eigenen Rechner.\n` +
      "Screenshots zeigen nur Beispiel-Daten und werden deshalb nur von einer lokalen App gemacht,\n" +
      "damit keine echten Daten fotografiert werden. Bewusst anders? Dann --erlaube-fremde-url setzen.",
  );
}

function loadConfig() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(CONFIG, "utf8"));
  } catch (error) {
    fail(`Die Liste ${path.relative(ROOT, CONFIG)} lässt sich nicht lesen: ${error.message}`);
  }
  if (!Array.isArray(raw.aufnahmen) || raw.aufnahmen.length === 0) {
    fail(`In ${path.relative(ROOT, CONFIG)} fehlt die Liste „aufnahmen“.`);
  }
  const names = new Set();
  return raw.aufnahmen.map((entry, index) => {
    const where = `Aufnahme ${index + 1}`;
    if (typeof entry.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(entry.name)) {
      fail(
        `${where}: „name“ fehlt oder ist ungültig (erlaubt: Kleinbuchstaben, Ziffern, Bindestrich).`,
      );
    }
    if (names.has(entry.name)) fail(`${where}: Name „${entry.name}“ kommt doppelt vor.`);
    names.add(entry.name);
    if (typeof entry.pfad !== "string" || !entry.pfad.startsWith("/")) {
      fail(`${where} („${entry.name}“): „pfad“ muss mit / beginnen.`);
    }
    if (entry.thema !== undefined && entry.thema !== "dunkel" && entry.thema !== "hell") {
      fail(`${where} („${entry.name}“): „thema“ ist „dunkel“ oder „hell“.`);
    }
    return {
      breite: 1280,
      hoehe: 800,
      ...entry,
    };
  });
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    // global installiert (npm i -g): ESM findet es nicht, CommonJS über NODE_PATH schon
    try {
      return createRequire(import.meta.url)("playwright");
    } catch {
      fail(
        "Für Screenshots wird Playwright gebraucht, es ist nicht im Projekt enthalten.\n" +
          "Installieren (einmalig, außerhalb des Projekts):\n" +
          "  npm install -g playwright && npx playwright install chromium\n" +
          "Danach `pnpm doku:screenshots` erneut ausführen.",
      );
    }
  }
}

const entries = loadConfig();
const selected = only.length > 0 ? entries.filter((entry) => only.includes(entry.name)) : entries;
const unknown = only.filter((name) => !entries.some((entry) => entry.name === name));
if (unknown.length > 0) fail(`Unbekannte Aufnahme: ${unknown.join(", ")}`);

const playwright = await loadPlaywright();
const { chromium } = playwright.chromium ? playwright : playwright.default;

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
let failed = 0;
try {
  for (const entry of selected) {
    const context = await browser.newContext({
      viewport: { width: entry.breite, height: entry.hoehe },
      deviceScaleFactor: 2,
      colorScheme: entry.thema === "hell" ? "light" : "dark",
      locale: "de-DE",
    });
    try {
      const page = await context.newPage();
      const response = await page.goto(`${baseUrl}${entry.pfad}`, { waitUntil: "networkidle" });
      if (!response?.ok()) {
        throw new Error(`Die App antwortet mit Status ${response ? response.status() : "keiner"}.`);
      }
      if (entry.warteAuf) await page.waitForSelector(entry.warteAuf, { timeout: 10_000 });
      const file = path.join(OUT_DIR, `${entry.name}.png`);
      if (entry.ausschnitt) await page.locator(entry.ausschnitt).screenshot({ path: file });
      else await page.screenshot({ path: file });
      console.log(`ok   ${path.relative(ROOT, file)}`);
    } catch (error) {
      failed += 1;
      console.error(`FEHLER ${entry.name}: ${error.message}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (failed > 0) fail(`${failed} Aufnahme(n) fehlgeschlagen. Läuft die App unter ${baseUrl}?`);
