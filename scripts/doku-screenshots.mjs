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
// Aufnahmen der App (Standard): Die App muss laufen, Adresse aus PAIBOT_URL
// (Standard http://127.0.0.1:3000).
//
// Aufnahmen von Entwicklungs-Seiten (`"modus": "entwicklung"`, z. B. /_komponenten/app): Diese
// Seiten gibt es nur mit dem Entwicklungs-Server (`next dev`). Ist PAIBOT_DEV_URL gesetzt, wird
// dort ein laufender Entwicklungs-Server erwartet. Sonst startet das Skript selbst einen auf einem
// freien Port (ohne DATABASE_URL, also ohne Daten) und beendet ihn am Ende wieder.
//
// Die Bilder landen in docs/assets/screenshots/<name>.png.
//
// Felder je Aufnahme in docs/screenshots.json:
//   name        Dateiname ohne Endung (Pflicht)
//   pfad        URL-Pfad in der App, z. B. "/" (Pflicht)
//   modus       "app" (Standard) oder "entwicklung" (Seite nur mit `next dev`)
//   breite      Breite in Pixeln (Standard 1280)
//   hoehe       Höhe in Pixeln (Standard 800)
//   skalierung  Pixeldichte (Standard 2, also doppelte Auflösung)
//   warteAuf    CSS-Selector, auf den vor der Aufnahme gewartet wird (optional)
//   vorher      Schritte vor der Aufnahme, der Reihe nach (optional), z. B.
//               [{ "klick": "button[aria-label='Arbeitsfläche zeigen']" },
//                { "warteAuf": "[data-flaeche-offen]" }]
//   ausschnitt  CSS-Selector; dann wird nur dieses Element aufgenommen (optional)
//   thema       "dunkel" (Standard) oder "hell"
//   beschreibung  Notiz für Menschen, wird nicht ausgewertet (optional)
//
// Damit ein zweiter Lauf dieselben Bilder liefert, gilt für jede Aufnahme: feste Uhrzeit
// (UHRZEIT unten), Animationen und Übergänge aus, Textcursor aus, Schriften geladen, App fertig
// gestartet. Die Entwicklungs-Anzeigen des Frameworks werden ausgeblendet.
//
// Playwright gehört bewusst nicht zu den Abhängigkeiten des Projekts, damit `pnpm install`
// für alle schlank bleibt. Es wird erst hier geladen und nur gebraucht, wer Screenshots aufnimmt.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "apps", "web");
const CONFIG = path.join(ROOT, "docs", "screenshots.json");
const OUT_DIR = path.join(ROOT, "docs", "assets", "screenshots");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const MODI = new Set(["app", "entwicklung"]);

/** Feste Uhrzeit für alle Aufnahmen, damit angezeigte Zeiten sich nicht ändern. */
const UHRZEIT = "2026-11-20T14:32:00+01:00";

/** Stil nur für die Aufnahme: ruhige Seite, keine Anzeigen des Entwicklungs-Servers. */
const AUFNAHME_STIL = `
  nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
const allowForeign = args.includes("--erlaube-fremde-url");
const only = args.filter((arg) => !arg.startsWith("--"));

function checkUrl(name, value) {
  const url = value.replace(/\/+$/, "");
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    fail(`${name} ist keine gültige Adresse: ${url}`);
  }
  if (!LOCAL_HOSTS.has(host) && !allowForeign) {
    fail(
      `Abbruch: ${name} zeigt auf „${host}“, nicht auf den eigenen Rechner.\n` +
        "Screenshots zeigen nur Beispiel-Daten und werden deshalb nur von einer lokalen App gemacht,\n" +
        "damit keine echten Daten fotografiert werden. Bewusst anders? Dann --erlaube-fremde-url setzen.",
    );
  }
  return url;
}

// biome-ignore lint/suspicious/noUndeclaredEnvVars: nur für dieses Skript, kein Turborepo-Task
const appUrl = checkUrl("PAIBOT_URL", process.env.PAIBOT_URL ?? "http://127.0.0.1:3000");
// biome-ignore lint/suspicious/noUndeclaredEnvVars: nur für dieses Skript, kein Turborepo-Task
const givenDevUrl = process.env.PAIBOT_DEV_URL;
const devUrlFromEnv = givenDevUrl ? checkUrl("PAIBOT_DEV_URL", givenDevUrl) : undefined;

function checkSteps(where, steps) {
  if (steps === undefined) return [];
  if (!Array.isArray(steps)) fail(`${where}: „vorher“ ist eine Liste von Schritten.`);
  return steps.map((step, index) => {
    const keys = step && typeof step === "object" ? Object.keys(step) : [];
    const ok =
      keys.length === 1 &&
      (keys[0] === "klick" || keys[0] === "warteAuf") &&
      typeof step[keys[0]] === "string" &&
      step[keys[0]].length > 0;
    if (!ok) {
      fail(
        `${where}: Schritt ${index + 1} in „vorher“ ist ungültig. Erlaubt ist genau eines von ` +
          '{ "klick": "<CSS-Selector>" } oder { "warteAuf": "<CSS-Selector>" }.',
      );
    }
    return step;
  });
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
    const named = `${where} („${entry.name}“)`;
    if (typeof entry.pfad !== "string" || !entry.pfad.startsWith("/")) {
      fail(`${named}: „pfad“ muss mit / beginnen.`);
    }
    if (entry.thema !== undefined && entry.thema !== "dunkel" && entry.thema !== "hell") {
      fail(`${named}: „thema“ ist „dunkel“ oder „hell“.`);
    }
    if (entry.modus !== undefined && !MODI.has(entry.modus)) {
      fail(`${named}: „modus“ ist „app“ oder „entwicklung“.`);
    }
    if (
      entry.skalierung !== undefined &&
      (typeof entry.skalierung !== "number" || entry.skalierung < 1 || entry.skalierung > 3)
    ) {
      fail(`${named}: „skalierung“ ist eine Zahl von 1 bis 3.`);
    }
    return {
      breite: 1280,
      hoehe: 800,
      skalierung: 2,
      modus: "app",
      thema: "dunkel",
      ...entry,
      vorher: checkSteps(named, entry.vorher),
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

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Wartet, bis unter `url` eine Seite mit Status 200 kommt (der erste Aufruf übersetzt sie). */
async function waitForPage(url, child, timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (child && child.exitCode !== null) {
      throw new Error(`Der Entwicklungs-Server hat sich beendet (Code ${child.exitCode}).`);
    }
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status === 200) return;
      if (response.status === 404) {
        throw new Error(
          `${url} antwortet mit 404. Diese Seite gibt es nur mit dem Entwicklungs-Server (next dev).`,
        );
      }
    } catch (error) {
      if (error.message.includes("404")) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} war nach ${timeoutMs / 1000} Sekunden nicht erreichbar.`);
}

/** Startet `next dev` für apps/web auf einem freien Port, ohne Datenbank. */
async function startDevServer(firstPath) {
  const port = await freePort();
  const nextBin = createRequire(path.join(WEB, "package.json")).resolve("next/dist/bin/next");
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
  delete env.NODE_ENV;
  delete env.DATABASE_URL;
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "--port", String(port), "-H", "127.0.0.1"],
    {
      cwd: WEB,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  const collect = (chunk) => {
    log = (log + chunk.toString()).slice(-4000);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const url = `http://127.0.0.1:${port}`;
  console.log(`…    Entwicklungs-Server wird gestartet (${url})`);
  try {
    await waitForPage(`${url}${firstPath}`, child);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`${error.message}\nLetzte Ausgabe des Servers:\n${log}`);
  }
  return {
    url,
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5000).unref();
      }),
  };
}

/** Wartet, bis die Seite benutzbar ist: geladen, React fertig, Schriften und Bilder da. */
async function waitUntilSettled(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(
    () => {
      const el = document.body?.firstElementChild;
      return Boolean(el && Object.keys(el).some((key) => key.startsWith("__react")));
    },
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) =>
        img.complete ? null : new Promise((resolve) => img.addEventListener("load", resolve)),
      ),
    );
  });
}

async function shoot(browser, entry, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: entry.breite, height: entry.hoehe },
    deviceScaleFactor: entry.skalierung,
    colorScheme: entry.thema === "hell" ? "light" : "dark",
    reducedMotion: "reduce",
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
  });
  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.clock.setFixedTime(new Date(UHRZEIT));
    const response = await page.goto(`${baseUrl}${entry.pfad}`, { waitUntil: "load" });
    if (!response?.ok()) {
      throw new Error(`Die App antwortet mit Status ${response ? response.status() : "keiner"}.`);
    }
    await page.addStyleTag({ content: AUFNAHME_STIL });
    await waitUntilSettled(page);
    if (entry.warteAuf) await page.waitForSelector(entry.warteAuf, { timeout: 10_000 });
    for (const step of entry.vorher) {
      if (step.klick) await page.locator(step.klick).click({ timeout: 10_000 });
      else await page.waitForSelector(step.warteAuf, { timeout: 10_000 });
    }
    // Maus aus dem Bild, damit kein Hover-Zustand mit aufgenommen wird.
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
    if (pageErrors.length > 0) {
      throw new Error(`Fehler in der Seite: ${pageErrors.join(" | ")}`);
    }
    const file = path.join(OUT_DIR, `${entry.name}.png`);
    const options = { path: file, animations: "disabled", caret: "hide" };
    if (entry.ausschnitt) await page.locator(entry.ausschnitt).screenshot(options);
    else await page.screenshot(options);
    console.log(`ok   ${path.relative(ROOT, file)}`);
  } finally {
    await context.close();
  }
}

const entries = loadConfig();
const selected = only.length > 0 ? entries.filter((entry) => only.includes(entry.name)) : entries;
const unknown = only.filter((name) => !entries.some((entry) => entry.name === name));
if (unknown.length > 0) fail(`Unbekannte Aufnahme: ${unknown.join(", ")}`);

const playwright = await loadPlaywright();
const { chromium } = playwright.chromium ? playwright : playwright.default;

mkdirSync(OUT_DIR, { recursive: true });
let dev;
let failed = 0;
const browser = await chromium.launch();
try {
  const devEntries = selected.filter((entry) => entry.modus === "entwicklung");
  let devUrl = devUrlFromEnv;
  if (devEntries.length > 0) {
    try {
      if (devUrl) {
        await waitForPage(`${devUrl}${devEntries[0].pfad}`, null, 30_000);
      } else {
        dev = await startDevServer(devEntries[0].pfad);
        devUrl = dev.url;
      }
    } catch (error) {
      console.error(`FEHLER Entwicklungs-Server: ${error.message}`);
      failed += devEntries.length;
    }
  }
  for (const entry of selected) {
    const isDev = entry.modus === "entwicklung";
    if (isDev && !devUrl) continue;
    try {
      await shoot(browser, entry, isDev ? devUrl : appUrl);
    } catch (error) {
      failed += 1;
      console.error(`FEHLER ${entry.name}: ${error.message}`);
    }
  }
} finally {
  await browser.close();
  await dev?.stop();
}
if (failed > 0) {
  fail(
    `${failed} Aufnahme(n) fehlgeschlagen. Läuft die App unter ${appUrl}` +
      " (für Entwicklungs-Seiten: Entwicklungs-Server erreichbar)?",
  );
}
