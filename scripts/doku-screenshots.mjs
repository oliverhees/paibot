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
//   pnpm doku:app -- pnpm doku:screenshots      App bereitstellen, alle Aufnahmen, abräumen
//   pnpm doku:screenshots                       alle Aufnahmen aus docs/screenshots.json
//   pnpm doku:screenshots anmelden 404-seite    nur die genannten Aufnahmen (nach `name`)
//   pnpm doku:screenshots --erlaube-fremde-url  auch eine URL außerhalb von localhost erlauben
//
// Aufnahmen der App (Standard): Läuft `pnpm doku:app`, kommen Adresse, Einrichtungs-Code,
// Wegwerf-Passwort und Zustand der App aus dessen Lauf-Datei (scripts/doku/lauf.mjs). Sonst muss die
// App unter PAIBOT_URL laufen (Standard http://127.0.0.1:3000); Aufnahmen mit `zustand` oder
// `anmeldung` gehen dann nicht.
//
// Aufnahmen von Entwicklungs-Seiten (`"modus": "entwicklung"`, z. B. /_komponenten/app): Diese
// Seiten gibt es nur mit dem Entwicklungs-Server (`next dev`). Ist PAIBOT_DEV_URL gesetzt, wird
// dort ein laufender Entwicklungs-Server erwartet. Sonst startet das Skript selbst einen auf einem
// freien Port (ohne DATABASE_URL, also ohne Daten) und beendet ihn am Ende wieder.
//
// Die Bilder landen in docs/assets/screenshots/<name>.png.
//
// Felder je Aufnahme in docs/screenshots.json (Prüfung in scripts/doku/liste.mjs):
//   name        Dateiname ohne Endung (Pflicht)
//   pfad        URL-Pfad in der App, z. B. "/" (Pflicht)
//   modus       "app" (Standard) oder "entwicklung" (Seite nur mit `next dev`)
//   zustand     "frisch" (nicht eingerichtet), "eingerichtet" oder "mit-beispieldaten" (optional).
//               Das Skript ordnet die Aufnahmen so, dass jeder Zustand nur einmal hergestellt wird,
//               und stellt ihn über die echten Wege der App her (scripts/doku-beispieldaten.mjs).
//   anmeldung   true: vor der Aufnahme angemeldet (eine Sitzung je Lauf, über die Seite „Anmelden“)
//   danach      "eingerichtet": die Schritte dieser frischen Aufnahme schließen die Einrichtung ab
//   status      erwarteter HTTP-Status der Seite (Standard 200, z. B. 404 für die Fehlerseite)
//   breite      Breite in Pixeln (Standard 1280)
//   hoehe       Höhe in Pixeln (Standard 800)
//   skalierung  Pixeldichte (Standard 2, also doppelte Auflösung)
//   warteAuf    CSS-Selector, auf den vor der Aufnahme gewartet wird (optional)
//   vorher      Schritte vor der Aufnahme, der Reihe nach (optional):
//                 { "klick": "<CSS>" }  oder  { "klick": { "rolle": "button", "name": "Weiter" } }
//                 { "tippe": "<Beschriftung des Felds>", "text": "…" }  (Ziel auch als Objekt)
//                 { "taste": "Enter" }   { "warteAuf": "<CSS>" }   { "warteAufText": "…" }
//                 { "gehe": "/pfad" }    { "ablauf": "<Name aus „ablaeufe“>" }
//                 { "zeige": "<CSS>" }  (in den sichtbaren Bereich scrollen)
//                 { "anbieter": { "reply": "…", "chunkDelayMs": 200 } }  (Test-Anbieter, nur diese Aufnahme)
//                   Mit "script": { "steps": [ … ] } bekommt der Test-Anbieter einen festen Ablauf, z. B. einen
//                   Werkzeug-Wunsch und danach die Antwort (Form wie `FakeScript` in tools/fake-provider).
//               Ziel-Objekt: genau eines von css, beschriftung, rolle (mit name), text; dazu
//               "genau": false für Teil-Treffer. Sonderwerte für „text“: $einrichtungs-code,
//               $passwort, $anbieter-schluessel (nie echte Werte in die Liste schreiben).
//   ausschnitt  CSS-Selector; dann wird nur dieses Element aufgenommen (optional)
//   datenschleuse  "aus" (Standard bei „zustand“), "bereit", "schluessel_falsch", "nicht_erreichbar":
//               Zustand der Beispiel-Datenschleuse; `pnpm doku:app` startet den Worker dafür neu
//   verdecke    Liste von Selectoren (CSS oder Playwright, z. B. dd:has-text("blg_")), deren
//               Stellen im Bild mit der Farbe ihrer Umgebung gefüllt werden (Uhrzeit der Datenbank,
//               Kennungen, Prüfsummen)
//   zeigeFertig true: Das Bild soll den kurzen Moment „fertig“ des Avatars zeigen; er bleibt dafür
//               stehen. Sonst wartet das Skript, bis er vorbei ist, damit ein zweiter Lauf dasselbe
//               Bild liefert.
//   thema       "dunkel" (Standard) oder "hell"
//   beschreibung  Notiz für Menschen, wird nicht ausgewertet (optional)
// Oben in der Datei: "ablaeufe": { "<name>": [Schritte] } für wiederkehrende Folgen.
//
// Ruhige, wiederholbare Aufnahmen ohne Eingriff in die Seite: feste Uhrzeit im Browser (UHRZEIT
// unten), `prefers-reduced-motion: reduce`, Animationen und Textcursor beim Bild angehalten
// (Playwright), Schriften und Bilder geladen, Ruhe im Netz, Maus in der Ecke. Es wird KEIN Stil
// in die Seite eingefügt, die Content-Security-Policy der App bleibt unberührt und wirksam.
//
// Jede Aufnahme bricht ab bei: Fehler in der Seite, Meldung der Content-Security-Policy, Fehler
// oder Warnung in der Konsole, Anfrage an einen fremden Host, seitlichem Scrollen, nicht
// geladener Schrift „Inter“, unerwartetem Status.
//
// Playwright gehört bewusst nicht zu den Abhängigkeiten des Projekts, damit `pnpm install`
// für alle schlank bleibt. Es wird erst hier geladen und nur gebraucht, wer Screenshots aufnimmt.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANBIETER_STANDARD,
  aendereLauf,
  laufDatei,
  leseLauf,
  prozessLebt,
  setzeSonderwert,
} from "./doku/lauf.mjs";
import { ListenFehler, ordneAufnahmen, pruefeListe } from "./doku/liste.mjs";
import { lesePng, schreibePng, verdecke as verdeckeFlaechen } from "./doku/png.mjs";
import {
  geraetAlsKeks,
  geraetAusKeksen,
  istEingerichtet,
  stelleHer,
  steuereAnbieter,
} from "./doku-beispieldaten.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "apps", "web");
const CONFIG = path.join(ROOT, "docs", "screenshots.json");
const OUT_DIR = path.join(ROOT, "docs", "assets", "screenshots");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Feste Uhrzeit für alle Aufnahmen, damit angezeigte Zeiten sich nicht ändern. */
const UHRZEIT = "2026-11-20T14:32:00+01:00";

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

// Lauf von `pnpm doku:app` (falls vorhanden und lebendig)
const LAUF = laufDatei();
let lauf;
try {
  lauf = leseLauf(LAUF);
} catch (error) {
  fail(`Die Lauf-Datei ${LAUF} lässt sich nicht lesen: ${error.message}`);
}
if (lauf && !prozessLebt(lauf.pid)) lauf = undefined;

const appUrl = checkUrl(
  "PAIBOT_URL",
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: nur für dieses Skript, kein Turborepo-Task
  lauf?.url ?? process.env.PAIBOT_URL ?? "http://127.0.0.1:3000",
);
// biome-ignore lint/suspicious/noUndeclaredEnvVars: nur für dieses Skript, kein Turborepo-Task
const givenDevUrl = process.env.PAIBOT_DEV_URL;
const devUrlFromEnv = givenDevUrl ? checkUrl("PAIBOT_DEV_URL", givenDevUrl) : undefined;

function loadConfig() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(CONFIG, "utf8"));
  } catch (error) {
    fail(`Die Liste ${path.relative(ROOT, CONFIG)} lässt sich nicht lesen: ${error.message}`);
  }
  try {
    return pruefeListe(raw);
  } catch (error) {
    if (error instanceof ListenFehler) fail(`${path.relative(ROOT, CONFIG)}: ${error.message}`);
    throw error;
  }
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
  delete env.DATABASE_MIGRATION_URL;
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

/** Playwright-Locator zu einem geprüften Ziel. */
function locate(page, ziel) {
  const treffer = finde(page, ziel);
  return ziel.nr === undefined ? treffer : treffer.nth(ziel.nr);
}

function finde(page, ziel) {
  const exact = ziel.genau !== false;
  if (ziel.css) return page.locator(ziel.css);
  if (ziel.beschriftung) return page.getByLabel(ziel.beschriftung, { exact });
  if (ziel.rolle) {
    return page.getByRole(ziel.rolle, ziel.name ? { name: ziel.name, exact } : {});
  }
  return page.getByText(ziel.text, { exact });
}

async function runStep(page, step, baseUrl) {
  const timeout = 15_000;
  if (step.klick) await locate(page, step.klick).click({ timeout });
  else if (step.tippe) {
    await locate(page, step.tippe).fill(setzeSonderwert(step.text, lauf), { timeout });
  } else if (step.taste) await page.keyboard.press(step.taste);
  else if (step.warteAuf) await page.waitForSelector(step.warteAuf, { timeout });
  else if (step.warteAufText) {
    await page.getByText(step.warteAufText).first().waitFor({ state: "visible", timeout });
  } else if (step.zeige) {
    await locate(page, step.zeige).first().scrollIntoViewIfNeeded({ timeout });
  } else if (step.anbieter) {
    await steuereAnbieter(lauf, step.anbieter);
  } else if (step.gehe) {
    await page.goto(`${baseUrl}${step.gehe}`, { waitUntil: "load" });
    await waitUntilSettled(page);
  }
}

/**
 * Meldet sich einmal je Lauf über die Seite „Anmelden“ an und merkt sich die Sitzung. Alle
 * Anmeldungen des Laufs sind dasselbe Beispiel-Gerät: Ist eines gemerkt (Lauf-Datei), bringt der
 * Browser dessen Cookie mit; sonst wird das Gerät dieser Anmeldung gemerkt, und das Anlegen der
 * Beispiel-Daten meldet sich damit an. Ohne das sähe der Browser oben die Leiste „Neue Anmeldung“,
 * die nur in ihren eigenen Bildern erscheinen soll.
 */
let sitzung;
async function anmeldung(browser) {
  if (sitzung) return sitzung;
  const context = await browser.newContext({ locale: "de-DE", timezoneId: "Europe/Berlin" });
  try {
    if (lauf) lauf = leseLauf(LAUF) ?? lauf;
    const geraet = geraetAlsKeks(lauf);
    if (geraet) await context.addCookies([geraet]);
    const page = await context.newPage();
    await page.goto(`${appUrl}/anmelden`, { waitUntil: "load" });
    await waitUntilSettled(page);
    await page.getByLabel("Passwort", { exact: true }).fill(setzeSonderwert("$passwort", lauf));
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await page.waitForURL(`${appUrl}/`, { timeout: 15_000 });
    sitzung = await context.storageState();
    const gemerkt = geraetAusKeksen(sitzung.cookies);
    if (lauf && !lauf.beispielGeraet && gemerkt) {
      // Mit der Browser-Kennung merken: Das Cookie gilt nur in derselben Art Browser.
      const kennung = await page.evaluate(() => navigator.userAgent);
      lauf = aendereLauf({ beispielGeraet: { ...gemerkt, kennung } }, LAUF);
    }
    return sitzung;
  } finally {
    await context.close();
  }
}

/** Wächter einer Aufnahme: alles, was die Aufnahme ungültig macht. */
function watch(context, page, baseUrl) {
  const problems = [];
  const host = new URL(baseUrl).host;
  page.on("pageerror", (error) => problems.push(`Fehler in der Seite: ${error.message}`));
  // Antworten der App mit Fehlerstatus merken, damit ein Fehlschlag ihre Ursache nennen kann.
  page.on("response", (antwort) => {
    if (antwort.url().includes("/api/") && antwort.status() >= 400) {
      problems.antworten ??= [];
      problems.antworten.push(
        `${antwort.status()} ${antwort.request().method()} ${antwort.url().replace(baseUrl, "")}`,
      );
    }
  });
  page.on("console", (message) => {
    const type = message.type();
    if (type !== "error" && type !== "warning") return;
    // Antworten mit 4xx/5xx meldet Chromium so; gewollte Fehler (z. B. falsches Passwort)
    // gehören zur Aufnahme. Unerwartete Status der Seite selbst prüft `status`.
    if (message.text().startsWith("Failed to load resource")) return;
    problems.push(`Konsole (${type}): ${message.text()}`);
  });
  context.route(
    (url) => url.protocol.startsWith("http") && url.host !== host,
    (route) => {
      problems.push(`Anfrage an einen fremden Host: ${route.request().url()}`);
      return route.abort("blockedbyclient");
    },
  );
  return problems;
}

async function shoot(browser, entry, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: entry.breite, height: entry.hoehe },
    deviceScaleFactor: entry.skalierung,
    colorScheme: entry.thema === "hell" ? "light" : "dark",
    reducedMotion: "reduce",
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    ...(entry.anmeldung ? { storageState: await anmeldung(browser) } : {}),
  });
  // „Anker kopieren“ und ähnliche Knöpfe schreiben in die Zwischenablage
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
  let page;
  let problems;
  try {
    page = await context.newPage();
    problems = watch(context, page, baseUrl);
    // Meldungen der Content-Security-Policy kommen als Ereignis in der Seite; das Skript dafür
    // läuft über das Werkzeug des Browsers, nicht als Teil der Seite.
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        console.error(
          `Content-Security-Policy verletzt: ${event.violatedDirective} (${event.blockedURI || "inline"})`,
        );
      });
    });
    await page.clock.setFixedTime(new Date(UHRZEIT));
    if (entry.zeigeFertig === true) {
      // Der Moment „fertig“ dauert in der App 1800 ms. Für dieses Bild bleibt er stehen, sonst hängt
      // es vom Zufall ab, ob der Zeitgeber vor der Aufnahme abläuft. Das ändert nur die Wartezeit
      // dieses einen Zeitgebers im Browser dieser Aufnahme, nicht die Seite.
      await page.addInitScript(() => {
        const echt = window.setTimeout.bind(window);
        window.setTimeout = (fn, ms, ...rest) => echt(fn, ms === 1800 ? 600_000 : ms, ...rest);
      });
    }
    const response = await page.goto(`${baseUrl}${entry.pfad}`, { waitUntil: "load" });
    const status = response ? response.status() : 0;
    if (status !== entry.status) {
      throw new Error(
        `Die App antwortet mit Status ${status || "keiner"}, erwartet ${entry.status}.`,
      );
    }
    if (entry.modus === "app" && entry.zustand && !entry.danach) {
      // Weiterleitung statt der Seite heißt: falscher Zustand der App
      // (eine Abfrage wie ?aktion=… gehört zum Pfad, zählt hier aber nicht mit)
      const ziel = new URL(page.url()).pathname;
      const erwartet = new URL(entry.pfad, baseUrl).pathname;
      if (ziel !== erwartet) throw new Error(`Weitergeleitet nach ${ziel} statt ${erwartet}.`);
    }
    await waitUntilSettled(page);
    if (entry.warteAuf) await page.waitForSelector(entry.warteAuf, { timeout: 15_000 });
    for (const step of entry.vorher) await runStep(page, step, baseUrl);
    await page.waitForLoadState("networkidle");
    // Maus in die Ecke, damit kein Hover-Zustand mit aufgenommen wird.
    await page.mouse.move(0, 0);
    const checks = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        breit: document.documentElement.scrollWidth > window.innerWidth,
        inter: [...document.fonts].some(
          (font) => font.family.replace(/["']/g, "") === "Inter" && font.status === "loaded",
        ),
      };
    });
    if (checks.breit) problems.push("Die Seite scrollt seitlich (breiter als das Fenster).");
    if (!checks.inter) problems.push("Die Schrift „Inter“ ist nicht geladen.");
    if (problems.length > 0) throw new Error(problems.join(" | "));
    const file = path.join(OUT_DIR, `${entry.name}.png`);
    const options = { animations: "disabled", caret: "hide" };
    // Stellen mit echter Uhrzeit der Datenbank oder Zufall (Kennungen, Prüfsummen, Signaturen)
    // werden im fertigen Bild mit der Farbe ihrer Umgebung gefüllt (scripts/doku/png.mjs), damit
    // ein zweiter Lauf dasselbe Bild liefert. Die Seite selbst bleibt unberührt.
    const aufnehmen = async () => {
      const ursprung = entry.ausschnitt
        ? await page.locator(entry.ausschnitt).boundingBox()
        : { x: 0, y: 0 };
      const flaechen = [];
      for (const css of entry.verdecke) {
        for (const stelle of await page.locator(css).all()) {
          if (!(await stelle.isVisible())) continue;
          const box = await stelle.boundingBox();
          if (box) {
            flaechen.push({
              x: (box.x - ursprung.x) * entry.skalierung,
              y: (box.y - ursprung.y) * entry.skalierung,
              breite: box.width * entry.skalierung,
              hoehe: box.height * entry.skalierung,
            });
          }
        }
      }
      const roh = entry.ausschnitt
        ? await page.locator(entry.ausschnitt).screenshot(options)
        : await page.screenshot(options);
      return flaechen.length > 0 ? schreibePng(verdeckeFlaechen(lesePng(roh), flaechen)) : roh;
    };
    // Erst wenn zwei Aufnahmen kurz nacheinander gleich sind, steht die Seite still (späte Daten,
    // Übergänge). Sonst nach fünf Versuchen mit Fehler abbrechen.
    // Der Avatar zeigt nach einer fertigen Antwort knapp zwei Sekunden „fertig“. Das Bild entsteht
    // erst danach, außer die Aufnahme will genau diesen Moment.
    if (entry.zeigeFertig !== true) {
      await page
        .locator('[data-zustand="fertig"]')
        .first()
        .waitFor({ state: "detached", timeout: 10_000 })
        .catch(() => undefined);
    }
    let bild = await aufnehmen();
    for (let versuch = 1; ; versuch += 1) {
      await page.waitForTimeout(250);
      const naechstes = await aufnehmen();
      if (naechstes.equals(bild)) break;
      if (versuch >= 5)
        throw new Error("Die Seite kommt nicht zur Ruhe (Bild ändert sich weiter).");
      bild = naechstes;
    }
    if (problems.length > 0) throw new Error(problems.join(" | "));
    writeFileSync(file, bild);
    console.log(`ok   ${path.relative(ROOT, file)}`);
  } catch (error) {
    // Bild des Fehlers zum Nachsehen, außerhalb der Doku
    const datei = path.join(os.tmpdir(), "paibot-doku-fehler", `${entry.name}.png`);
    try {
      mkdirSync(path.dirname(datei), { recursive: true });
      await page?.screenshot({ path: datei });
      error.message += `\n     Bild des Zustands: ${datei}`;
      if (problems?.antworten?.length) {
        error.message += `\n     Fehlerantworten der App: ${problems.antworten.slice(-5).join("; ")}`;
      }
      // Auch der Text der Seite, denn der Rest hinter dem Bildrand ist im Bild nicht zu sehen.
      const text = await page?.locator("main").textContent({ timeout: 2000 });
      if (text)
        error.message += `\n     Text der Seite (Ende): ${text.slice(-700).replace(/\s+/g, " ")}`;
    } catch {
      // kein Bild möglich
    }
    throw error;
  } finally {
    await context.close();
  }
}

/**
 * Beispiel-Umgebung vor jeder Aufnahme mit Zustand: Test-Anbieter im Grund-Verhalten (ein Schritt
 * „anbieter“ ändert es nur für diese Aufnahme) und Datenschleuse im verlangten Zustand (Feld
 * „datenschleuse“, Standard „aus“; `pnpm doku:app` startet den Worker dafür neu).
 */
async function ensureBeispielUmgebung(entry) {
  if (!lauf) return;
  await steuereAnbieter(lauf, ANBIETER_STANDARD);
  if (lauf.schleuse === entry.datenschleuse) return;
  if (!lauf.steuerung)
    throw new Error("Die Lauf-Datei kennt keine Steuerung (pnpm doku:app neu starten).");
  if (entry.datenschleuse !== "aus" || lauf.schleuse !== undefined) {
    console.log(`…    Datenschleuse der Beispiel-Umgebung: ${entry.datenschleuse}`);
  }
  const antwort = await fetch(`${lauf.steuerung.url}/datenschleuse`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${lauf.steuerung.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ zustand: entry.datenschleuse }),
  });
  if (!antwort.ok) {
    throw new Error(`Steuerung der Beispiel-Umgebung antwortet ${antwort.status}.`);
  }
  lauf = aendereLauf({ schleuse: entry.datenschleuse }, LAUF);
}

/** Bringt die App vor einer Aufnahme in den verlangten Zustand (nur vorwärts möglich). */
async function ensureState(entry) {
  if (entry.modus !== "app" || entry.zustand === undefined) return;
  await ensureBeispielUmgebung(entry);
  if (!lauf) {
    throw new Error(
      "Diese Aufnahme braucht einen Zustand der App. Starte die App mit `pnpm doku:app` " +
        "(oder in einem Befehl: `pnpm doku:app -- pnpm doku:screenshots`).",
    );
  }
  const eingerichtet = await istEingerichtet(appUrl);
  if (eingerichtet && lauf.zustand === "frisch")
    lauf = aendereLauf({ zustand: "eingerichtet" }, LAUF);
  if (entry.zustand === "frisch") {
    if (eingerichtet) {
      throw new Error(
        "Die App ist schon eingerichtet; „frisch“ geht nur mit einer neuen App (pnpm doku:app neu starten).",
      );
    }
    return;
  }
  const reihenfolge = ["frisch", "eingerichtet", "mit-beispieldaten"];
  if (reihenfolge.indexOf(lauf.zustand) < reihenfolge.indexOf(entry.zustand)) {
    console.log(`…    Zustand „${entry.zustand}“ wird hergestellt`);
    const ergebnis = await stelleHer(entry.zustand, LAUF);
    for (const meldung of ergebnis.meldungen) console.log(`     ${meldung}`);
    lauf = ergebnis.lauf;
  }
}

const entries = loadConfig();
const unknown = only.filter((name) => !entries.some((entry) => entry.name === name));
if (unknown.length > 0) fail(`Unbekannte Aufnahme: ${unknown.join(", ")}`);
const selected = ordneAufnahmen(
  only.length > 0 ? entries.filter((entry) => only.includes(entry.name)) : entries,
);

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
      await ensureState(entry);
      await shoot(browser, entry, isDev ? devUrl : appUrl);
      if (entry.danach) {
        if (!(await istEingerichtet(appUrl))) {
          throw new Error("Nach den Schritten ist die App nicht eingerichtet (Feld „danach“).");
        }
        lauf = aendereLauf({ zustand: entry.danach }, LAUF);
      }
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
