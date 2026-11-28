/**
 * PaiBot – Ende-zu-Ende-Prüfung: startet den Stack im Produktions-Build (siehe `stack.mjs`) und
 * geht im Browser den ganzen Weg (Einrichtung, Chat, Handy-Format, Datenschleuse, Passwort,
 * Anmelde-Schutz, Belege, Grenzen; Liste in `docs/entwickeln.md`). Dabei gilt „kein Verkehr nach
 * außen“: Browser und Netz-Sperre in Web-App und Worker zählen jeden Versuch; jeder Zähler über 0,
 * jeder Konsolenfehler und jede CSP-Verletzung macht die Prüfung rot.
 *
 * Aufruf (nach `pnpm build`): `node tools/e2e/src/e2e.mjs [--ausgabe <ordner>] [--gegenprobe
 * browser|server]`. Ohne Playwright endet sie mit Exit 0 und der Meldung „übersprungen“.
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
if (playwright === undefined && process.env.PAIBOT_E2E_PFLICHT === "1") {
  // In der CI darf die Prüfung nicht still übersprungen werden.
  console.error("[e2e] Playwright fehlt, PAIBOT_E2E_PFLICHT=1 verlangt die Prüfung.");
  process.exit(1);
}
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
    erwarteteFehler.clear();
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

/**
 * Erwartete Fehler-Antworten: Der Browser meldet jede Antwort ab 400 als Konsolenfehler. In den
 * Schritten mit Absicht (falsches Passwort, Sperre) wird der Pfad mit den erwarteten Status hier
 * eingetragen; nur solche Meldungen zählen nicht als Konsolenfehler.
 */
const erwarteteFehler = new Map();
function erwarte(pfad, ...status) {
  erwarteteFehler.set(pfad, new Set(status));
}
function istErwartet(nachricht) {
  const treffer = /status of (\d{3})/.exec(nachricht.text());
  if (!treffer) return false;
  let pfad;
  try {
    pfad = new URL(nachricht.location().url).pathname;
  } catch {
    return false;
  }
  return erwarteteFehler.get(pfad)?.has(Number(treffer[1])) === true;
}

const DESKTOP = { width: 1440, height: 900 };
const HANDY = { width: 390, height: 844 };

/**
 * Neuer Browser-Kontext (eigenes Gerät: eigene Cookies) mit Sperre für fremde Hosts, Sammeln von
 * Konsolenfehlern und CSP-Verletzungen. `adresse`: Adresse, die die App über `X-Forwarded-For`
 * sieht (die Prüfung startet die Web-App mit `TRUST_PROXY=1`), damit Limits je Adresse getrennt
 * zählen.
 */
async function neuesGeraet(app, { viewport = DESKTOP, adresse } = {}) {
  const kontext = await browser.newContext({
    colorScheme: "dark",
    acceptDownloads: true,
    viewport,
    ...(adresse ? { extraHTTPHeaders: { "x-forwarded-for": adresse } } : {}),
  });
  // Jede Anfrage an einen anderen Host als die App wird abgebrochen und gezählt.
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
  kontext.on("page", (seite) => beobachte(seite));
  return kontext;
}

function beobachte(seite) {
  seite.on("console", (m) => {
    if ((m.type() === "error" || m.type() === "warning") && !istErwartet(m)) {
      // `url`: die Seite, auf der es passierte. `quelle`: die Anfrage, die es auslöste – ohne sie
      // ist „Failed to load resource“ nicht zu gebrauchen (die Seite sagt nicht, was fehlschlug).
      ergebnis.konsole.push({
        art: m.type(),
        text: m.text(),
        url: seite.url(),
        quelle: m.location().url,
      });
    }
  });
  seite.on("pageerror", (e) => ergebnis.konsole.push({ art: "pageerror", text: e.message }));
}

/**
 * Maße eines Elements und seines nächsten Behälters (`selektor`, z. B. ein Blatt) im ruhenden
 * Zustand: wartet, bis alle Animationen im Behälter beendet sind und zwei Messungen im Abstand von
 * 100 ms gleich sind (höchstens 5 s). Danach erst gelten die Maße als Ergebnis.
 */
async function ruhendeBox(ort, selektor) {
  const messen = () =>
    ort.evaluate(async (el, sel) => {
      const behaelter = el.closest(sel);
      await Promise.all(
        (behaelter ?? el)
          .getAnimations({ subtree: true })
          .map((a) => a.finished.catch(() => undefined)),
      );
      const r = (e) => {
        const b = e.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      };
      return { box: r(el), behaelter: behaelter ? r(behaelter) : undefined };
    }, selektor);
  let vorher = await messen();
  for (let i = 0; i < 50; i += 1) {
    await new Promise((fertig) => setTimeout(fertig, 100));
    const jetzt = await messen();
    if (JSON.stringify(jetzt) === JSON.stringify(vorher)) return jetzt;
    vorher = jetzt;
  }
  throw new Error(`Maße kommen nicht zur Ruhe (${JSON.stringify(vorher)}).`);
}

/** Anmelden über die Seite `/anmelden`; liefert den Text der Meldung, falls eine erscheint. */
async function anmeldeVersuch(seite, app, passwort) {
  if (!new URL(seite.url()).pathname.startsWith("/anmelden")) await seite.goto(`${app}/anmelden`);
  const feld = seite.getByLabel("Passwort", { exact: true });
  await feld.fill(passwort);
  const antwort = seite.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/zugang/anmelden" && r.request().method() === "POST",
  );
  await seite.getByRole("button", { name: "Anmelden" }).click();
  const status = (await antwort).status();
  // Nach einem Fehler leert die Seite das Feld; erst danach ist sie für den nächsten Versuch bereit.
  if (status !== 200) {
    await seite.waitForFunction(
      () => document.querySelector('input[name="password"]')?.value === "",
    );
  }
  return status;
}

/**
 * Anmelde-Anfrage direkt aus einer Seite unter `/anmelden` (wie die Oberfläche: Prüfzeichen aus der
 * Seite), mit eigener Adresse. Für viele Versuche aus vielen Adressen, ohne je eine Seite zu laden.
 */
function anmeldeAnfrage(seite, passwort, adresse) {
  return seite.evaluate(
    async ({ passwort, adresse }) => {
      const zeichen = document.querySelector('meta[name="pb-pruefzeichen"]')?.content ?? "";
      const antwort = await fetch("/api/zugang/anmelden", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pb-pruefzeichen": zeichen,
          "x-forwarded-for": adresse,
        },
        body: JSON.stringify({ password: passwort, remember: false }),
      });
      return antwort.status;
    },
    { passwort, adresse },
  );
}

/** Abmelden mit zwei Klicks: Menü „Du“ unten in der Seitenleiste, dann „Abmelden“. */
async function abmeldenUeberDu(seite) {
  await seite
    .getByRole("complementary", { name: "Navigation" })
    .getByRole("button", { name: "Du", exact: true })
    .click();
  await seite.getByRole("menu", { name: "Du" }).getByRole("menuitem", { name: "Abmelden" }).click();
}

/**
 * Anzahl der Belege einer Aktion, über die Schnittstelle gelesen (ohne die Seite zu wechseln).
 * Wichtig: Jeder Aufruf der Seite „Modell und Anbieter“ gleicht die Modell-Liste ab und legt dafür
 * selbst einen Beleg „Anbieter gespeichert“ an. Zähle deshalb nur zwischen zwei Handgriffen auf
 * derselben Seite.
 */
async function belegeZaehlen(seite, app, aktion) {
  const antwort = await seite.request.get(
    `${app}/api/belege?action=${encodeURIComponent(aktion)}&limit=200`,
  );
  if (!antwort.ok()) throw new Error(`Belege lesen: Status ${antwort.status()}.`);
  const koerper = await antwort.json();
  const liste = koerper.daten?.items;
  if (!Array.isArray(liste)) throw new Error("Belege lesen: unerwartete Antwort.");
  return liste.length;
}

/** Öffnet den neuesten Beleg einer Aktion und prüft ihn: Die Prüfung meldet „stimmt“. */
async function neuestenBelegPruefen(seite, app, aktion) {
  await seite.goto(`${app}/belege?aktion=${encodeURIComponent(aktion)}`);
  await seite
    .getByRole("list", { name: "Belege, neueste zuerst" })
    .getByRole("link")
    .first()
    .click();
  await seite.getByRole("heading", { name: /^Beleg B-\d+$/ }).waitFor();
  await seite.getByRole("button", { name: "Beleg prüfen" }).click();
  await seite.getByRole("article").getByText("stimmt", { exact: true }).waitFor();
}

/** Schickt eine Nachricht in einer neuen Unterhaltung und wartet auf die Antwort des Test-Anbieters. */
async function chatten(seite, app, text) {
  await seite.goto(`${app}/`);
  await seite.getByRole("textbox", { name: "Nachricht" }).fill(text);
  await seite.getByRole("button", { name: "Senden" }).click();
  await seite
    .getByRole("log", { name: "Verlauf" })
    .getByText(BEISPIEL_ANTWORT, { exact: true })
    .waitFor({ timeout: 60_000 });
}

const FALSCHER_SCHLUESSEL_STATUS = 502;
const ANWEISUNG = "Antworte immer in genau einem Satz.";

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
  const kontext = await neuesGeraet(app);
  const seite = await kontext.newPage();

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
    // Ein falscher Code fällt schon hier auf und bleibt im ersten Schritt.
    erwarte("/api/einrichtung/code-pruefen", 401);
    await seite.getByLabel("Einrichtungs-Code").fill("ZZZZ-ZZZZ-ZZZZ");
    await seite.getByRole("button", { name: "Weiter" }).click();
    await seite.getByText("Der Einrichtungs-Code stimmt nicht.").waitFor();
    await seite.getByText("Schritt 1 von 7").waitFor();
    await seite.getByLabel("Einrichtungs-Code").fill(stack.einrichtungsCode);
    await seite.getByRole("button", { name: "Weiter" }).click();
    await seite.getByRole("heading", { name: "Passwort festlegen" }).waitFor();
  });
  await schritt("Einrichtung: Passwort", seite, async () => {
    await seite.getByLabel("Passwort", { exact: true }).fill(PASSWORT);
    await seite.getByLabel("Passwort wiederholen").fill(PASSWORT);
    await seite.getByRole("button", { name: "Weiter" }).click();
    await seite.getByRole("heading", { name: "Anbieter wählen" }).waitFor();
  });
  await schritt("Einrichtung: Anbieter wählen", seite, async () => {
    // Die Zählung bleibt fest bei sieben Schritten.
    await seite.getByText("Schritt 3 von 7").waitFor();
    await seite.getByRole("radio", { name: /Eigener oder lokaler Anbieter/ }).check();
    await seite.getByRole("button", { name: "Weiter" }).click();
    await seite.getByRole("heading", { name: "Modell-Anbieter verbinden" }).waitFor();
    await seite.getByText("Schritt 4 von 7").waitFor();
  });
  await schritt("Einrichtung: Anbieter eintragen", seite, async () => {
    await seite.getByLabel("Schlüssel für", { exact: false }).fill(stack.anbieterSchluessel);
    await seite.getByRole("button", { name: "Verbindung testen" }).click();
    await seite.getByText("Verbindung steht").first().waitFor();
    // Nach dem Test gibt es „Später eintragen“ nicht mehr: Es würde den getesteten Schlüssel verwerfen.
    if (await seite.getByRole("button", { name: "Später eintragen" }).count()) {
      throw new Error("„Später eintragen“ steht neben einem erfolgreichen Test.");
    }
    await seite.getByRole("button", { name: "Weiter" }).click();
    await seite.getByRole("heading", { name: "Modell wählen" }).waitFor();
  });
  await schritt("Einrichtung: Modell wählen", seite, async () => {
    await seite.getByRole("radio", { name: /Beispiel-Modell Allrounder/ }).check();
    await seite.getByRole("button", { name: "Weiter" }).click();
    await seite.getByText("Datenschleuse als Standard").first().waitFor();
    await seite.getByRole("button", { name: "Weiter" }).click();
    await seite.getByRole("heading", { name: "Wie soll dein Bot heißen?" }).waitFor();
    // Ein leerer Name wird erklärt, nicht mit einer allgemeinen Meldung abgewiesen.
    const botName = seite.getByLabel("Name deines Bots");
    const vorschlag = await botName.inputValue();
    await botName.fill("");
    await seite.getByRole("button", { name: "Einrichtung abschließen" }).click();
    await seite.getByText("Gib deinem Bot einen Namen.").waitFor();
    await botName.fill(vorschlag);
    await seite.getByRole("button", { name: "Einrichtung abschließen" }).click();
    await seite.getByRole("heading", { name: "Alles bereit" }).waitFor();
  });

  let unterhaltung;
  await schritt("Chat: Nachricht und gestreamte Antwort", seite, async () => {
    await seite.goto(`${app}/`);
    // Eine leere Unterhaltung zeigt den Startbereich (ab Werk „Begrüßung“). Ein Anfang legt seinen
    // Text ins Feld, der Cursor steht dahinter, nichts wird gesendet.
    await seite
      .getByRole("heading", { name: /Ich bin|^Guten|^Hallo/ })
      .first()
      .waitFor();
    await seite.locator('[data-fassung="begruessung"]').waitFor();
    await seite.getByRole("button", { name: /Freundliche Terminabsage/ }).click();
    const feld = seite.getByRole("textbox", { name: "Nachricht" });
    const wert = await feld.inputValue();
    if (!wert.startsWith("Schreib")) throw new Error(`Der Anfang steht nicht im Feld: „${wert}“.`);
    const stelle = await feld.evaluate((el) => ({
      ende: el.selectionStart === el.value.length && el.selectionEnd === el.value.length,
      fokus: document.activeElement === el,
    }));
    if (!stelle.ende || !stelle.fokus) throw new Error("Cursor steht nicht hinter dem Anfang.");
    if ((await seite.locator('[role="log"] [class*="blase"]').count()) !== 0) {
      throw new Error("Ein Anfang darf nichts senden.");
    }
    await feld.fill("Hallo Pai, wie geht es dir?");
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
    // Sofort neu laden, auch wenn der Lauf in der Datenbank noch nicht beendet ist: Die Antwort
    // steht dann genau einmal da, nicht doppelt.
    await seite.reload();
    await seite.getByText(BEISPIEL_ANTWORT, { exact: true }).waitFor();
  });

  await schritt(
    "Darstellung: Fassung des Startbereichs wählen, gemerkt, erstes Bild stimmt",
    seite,
    async () => {
      await seite.goto(`${app}/einstellungen/darstellung`);
      await seite.getByRole("radio", { name: /Stille/ }).check();
      await seite.getByText("Gemerkt für diesen Browser.").waitFor();
      // Der Server zeichnet die gewählte Fassung schon im ersten HTML, ohne Skript und ohne Wechsel.
      const roh = await (await seite.request.get(`${app}/`)).text();
      if (!roh.includes('data-fassung="stille"') || roh.includes('data-fassung="begruessung"')) {
        throw new Error("Das erste HTML zeigt nicht die gewählte Fassung „Stille“.");
      }
      await seite.goto(`${app}/`);
      await seite.getByRole("heading", { name: "Womit fangen wir an?" }).waitFor();
      // „Stille“: die Anfänge erscheinen erst mit Fokus im Feld.
      await seite.getByRole("textbox", { name: "Nachricht" }).focus();
      await seite.getByRole("button", { name: /Terminabsage/ }).waitFor();
      // zurück auf den Standard, damit die übrigen Schritte dieselbe Ansicht sehen
      await seite.goto(`${app}/einstellungen/darstellung`);
      await seite.getByRole("radio", { name: /Begrüßung/ }).check();
      await seite.getByText("Gemerkt für diesen Browser.").waitFor();
      // und zurück zur Unterhaltung, mit der die nächsten Schritte weiterarbeiten
      await seite.goto(`${app}${unterhaltung}`);
      await seite.getByText(BEISPIEL_ANTWORT, { exact: true }).waitFor();
    },
  );

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

  // ---- Werkzeug „In der Doku nachschlagen“ und der Knopf „Schritte“ --------------------------------
  // Der Test-Anbieter wünscht im ersten Schritt das Werkzeug und antwortet im zweiten mit Text.
  const NACHSCHLAGEN_FRAGE = "Wie stelle ich das Tagesbudget ein?";
  const NACHSCHLAGEN_ANTWORT = "Das Tagesbudget stellst du in den Einstellungen ein.";
  const OHNE_FUND_FRAGE = "Wie verbinde ich Telegram?";
  const OHNE_FUND_ANTWORT =
    "In der Doku finde ich dazu nichts; mehr kann ich dir dazu nicht sagen.";
  /** Chat-Anfragen des Test-Anbieters, die diese Nachricht (und nur diese) betreffen. */
  const chatAnfragenMit = async (text) =>
    (await stack.anbieter.anfragen()).filter(
      (a) => a.path.endsWith("/chat/completions") && JSON.stringify(a.body).includes(text),
    );
  const verlaufVon = (seite) => seite.getByRole("log", { name: "Verlauf" });
  async function nachrichtSenden(seite, text) {
    await seite.goto(`${app}/`);
    await seite.getByRole("textbox", { name: "Nachricht" }).fill(text);
    await seite.getByRole("button", { name: "Senden" }).click();
  }
  await schritt(
    "Doku nachschlagen: Werkzeug-Zeile mit Quellen, Antwort, Beleg gültig",
    seite,
    async () => {
      await stack.anbieter.verhalten({
        script: {
          steps: [
            {
              toolCalls: [
                { name: "doku_nachschlagen", arguments: { frage: "Tagesbudget einstellen" } },
              ],
            },
            { text: NACHSCHLAGEN_ANTWORT },
          ],
        },
      });
      await nachrichtSenden(seite, NACHSCHLAGEN_FRAGE);
      const verlauf = verlaufVon(seite);
      await verlauf.getByText(NACHSCHLAGEN_ANTWORT, { exact: true }).waitFor({ timeout: 60_000 });
      const zeile = verlauf.locator('[data-baustein="werkzeug-zeile"]');
      if ((await zeile.count()) !== 1) throw new Error("Es fehlt genau eine Werkzeug-Zeile.");
      const text = ((await zeile.textContent()) ?? "").replace(/\s+/g, " ");
      for (const muss of ["In der Doku nachschlagen", "fertig", "Abschnitt"]) {
        if (!text.includes(muss))
          throw new Error(`Die Werkzeug-Zeile nennt „${muss}“ nicht: ${text}`);
      }
      if (text.includes("nichts gefunden")) throw new Error("Die Zeile sagt „nichts gefunden“.");
      await zeile.getByRole("button").first().click();
      const quellen = zeile
        .getByRole("list", { name: "Quellen aus der Doku" })
        .getByRole("listitem");
      if ((await quellen.count()) < 1) throw new Error("Die Zeile zeigt keine Quellen.");
      if (!(await zeile.getByText("R-010").count())) throw new Error("Die Regel R-010 fehlt.");
      // Die Antwort steht einmal in der Blase, ohne Hinweis „nicht vom Modell“.
      if ((await verlauf.getByText(NACHSCHLAGEN_ANTWORT, { exact: true }).count()) !== 1) {
        throw new Error("Die Antwort steht nicht genau einmal im Verlauf.");
      }
      if (await verlauf.getByText("nicht vom Modell").count()) {
        throw new Error("Eine Antwort des Modells trägt den Hinweis „nicht vom Modell“.");
      }
      // Beim Anbieter: zwei Anfragen, die zweite trägt das Ergebnis des Werkzeugs als Daten.
      const anfragen = await chatAnfragenMit(NACHSCHLAGEN_FRAGE);
      if (anfragen.length !== 2)
        throw new Error(`Der Anbieter bekam ${anfragen.length} Anfragen statt 2.`);
      const nachricht = anfragen[1].body.messages.find((m) => m.role === "tool");
      if (!nachricht || !String(nachricht.content).includes("Tagesbudget")) {
        throw new Error("Die zweite Anfrage trägt kein Ergebnis des Werkzeugs mit dem Abschnitt.");
      }
      // Der Beleg des Aufrufs ist gültig.
      await neuestenBelegPruefen(seite, app, "werkzeug.aufrufen");
    },
  );
  await schritt(
    "Doku nachschlagen: nichts gefunden, danach antwortet das Modell",
    seite,
    async () => {
      await stack.anbieter.verhalten({
        script: {
          steps: [
            { toolCalls: [{ name: "doku_nachschlagen", arguments: { frage: OHNE_FUND_FRAGE } }] },
            { text: OHNE_FUND_ANTWORT },
          ],
        },
      });
      await nachrichtSenden(seite, OHNE_FUND_FRAGE);
      const verlauf = verlaufVon(seite);
      await verlauf.getByText(OHNE_FUND_ANTWORT, { exact: true }).waitFor({ timeout: 60_000 });
      const zeile = verlauf.locator('[data-baustein="werkzeug-zeile"]');
      if ((await zeile.count()) !== 1) throw new Error("Es fehlt genau eine Werkzeug-Zeile.");
      const text = ((await zeile.textContent()) ?? "").replace(/\s+/g, " ");
      if (!text.includes("nichts gefunden"))
        throw new Error(`Die Zeile sagt nicht „nichts gefunden“: ${text}`);
      // Die Antwort ist die des Modells: kein fester Satz von PaiBot, kein Hinweis „nicht vom Modell“.
      if (await verlauf.getByText("nicht vom Modell").count()) {
        throw new Error("Nach „nichts gefunden“ erscheint ein fester Satz von PaiBot.");
      }
      const anfragen = await chatAnfragenMit(OHNE_FUND_FRAGE);
      if (anfragen.length !== 2)
        throw new Error(`Der Anbieter bekam ${anfragen.length} Anfragen statt 2.`);
    },
  );
  await schritt("Knopf „Schritte“: Werkzeug-Zeile aus, an", seite, async () => {
    const knopf = seite.getByRole("button", { name: /Schritte/ });
    const zeile = verlaufVon(seite).locator('[data-baustein="werkzeug-zeile"]');
    if ((await knopf.getAttribute("aria-pressed")) !== "true" || (await zeile.count()) !== 1) {
      throw new Error("Anfangs müssen Knopf „Schritte“ an und die Werkzeug-Zeile da sein.");
    }
    await knopf.click();
    // Der Zustand wechselt erst mit dem nächsten Zeichnen der Seite: darauf warten statt sofort zu lesen.
    const zustand = (wert) =>
      seite.locator(`button[aria-pressed="${wert}"]`, { hasText: /Schritte/ }).first();
    await zustand("false")
      .waitFor({ timeout: 10_000 })
      .catch(() => {
        throw new Error("Der Knopf ist nicht aus.");
      });
    await zeile
      .first()
      .waitFor({ state: "detached", timeout: 10_000 })
      .catch(() => {
        throw new Error("Die Werkzeug-Zeile steht trotz „Schritte“ aus da.");
      });
    // Die Antwort des Modells bleibt.
    await verlaufVon(seite).getByText(OHNE_FUND_ANTWORT, { exact: true }).waitFor();
    await knopf.click();
    await zustand("true").waitFor({ timeout: 10_000 });
    await zeile.first().waitFor({ timeout: 10_000 });
    if ((await knopf.getAttribute("aria-pressed")) !== "true" || (await zeile.count()) !== 1) {
      throw new Error("Mit „Schritte“ an muss die Werkzeug-Zeile wieder da sein.");
    }
    await stack.anbieter.verhalten({ script: null, reply: BEISPIEL_ANTWORT });
  });

  await schritt(
    "Modell und Anbieter: Öffnen und Neuladen schreibt keine Belege",
    seite,
    async () => {
      // Die Seite zeigt die Modell-Liste des Anbieters; das Öffnen darf nichts speichern (kein Beleg
      // „Anbieter gespeichert“). Gezählt wird die Nummer des neuesten Belegs vor und nach dem Öffnen.
      const kopf = () =>
        seite.evaluate(async () => {
          const r = await fetch("/api/belege?limit=1");
          const j = await r.json();
          return j.daten.items[0]?.seq ?? 0;
        });
      const vorher = await kopf();
      await seite.goto(`${app}/modelle`);
      await seite.getByRole("radio").first().waitFor();
      await seite.reload();
      await seite.getByRole("radio").first().waitFor();
      const nachher = await kopf();
      if (nachher !== vorher) {
        throw new Error(
          `Das Öffnen hat ${nachher - vorher} Beleg(e) geschrieben (Nummer ${vorher} → ${nachher}).`,
        );
      }
    },
  );

  // ---- Seiten „Modell und Anbieter“ und „Bot“: ändern, speichern, prüfen, Beleg -------------------
  const NEUER_SCHLUESSEL = `Beispiel-${randomBytes(12).toString("base64url")}`;
  let anbieterPfad;
  const letzteChatAnfrage = async () =>
    (await stack.anbieter.anfragen()).filter((a) => a.path.includes("chat")).at(-1);
  await schritt("Modell und Anbieter: falscher Schlüssel wird abgelehnt", seite, async () => {
    const modelleAnfrage = seite.waitForRequest((r) =>
      /\/api\/anbieter\/[^/]+\/modelle\/lesen$/.test(r.url()),
    );
    await seite.goto(`${app}/modelle`);
    anbieterPfad = new URL((await modelleAnfrage).url()).pathname.replace(/\/modelle\/lesen$/, "");
    // Die Seite liest die Liste nur (ohne zu speichern); erst wenn sie da ist, geht es weiter.
    await seite.getByRole("radio", { name: /Beispiel-Modell Allrounder/ }).waitFor();
    const belegeVorher = await belegeZaehlen(seite, app, "anbieter.speichern");
    const anfragenVorher = (await stack.anbieter.anfragen()).length;
    erwarte(anbieterPfad, FALSCHER_SCHLUESSEL_STATUS);
    await seite.getByRole("button", { name: "Schlüssel ersetzen" }).click();
    await seite
      .getByLabel("Neuer Schlüssel für", { exact: false })
      .fill("falscher-schluessel-0000");
    await seite.getByRole("button", { name: "Schlüssel speichern" }).click();
    await seite.locator('[data-art="fehler"]').first().waitFor();
    if (await seite.getByText("Schlüssel gespeichert.", { exact: false }).count()) {
      throw new Error("Ein falscher Schlüssel wurde als gespeichert gemeldet.");
    }
    // Gegenprobe: Beim Anbieter kommt nur die Prüfung mit dem falschen Schlüssel an (und wird
    // abgelehnt), keine Chat-Anfrage; es entsteht kein Beleg „Anbieter gespeichert“.
    const neu = (await stack.anbieter.anfragen()).slice(anfragenVorher);
    if (neu.length === 0 || neu.some((a) => a.path.includes("chat"))) {
      throw new Error(`Unerwartete Anfragen beim Anbieter: ${neu.map((a) => a.path).join(", ")}.`);
    }
    const belegeNachher = await belegeZaehlen(seite, app, "anbieter.speichern");
    if (belegeNachher !== belegeVorher) {
      throw new Error(
        `Ein abgelehnter Schlüssel hat einen Beleg erzeugt (${belegeVorher} → ${belegeNachher}).`,
      );
    }
  });
  await schritt("Modell und Anbieter: Schlüssel ersetzen, wirkt, mit Beleg", seite, async () => {
    // Der Anbieter wechselt seinen Schlüssel: Der gespeicherte gilt nicht mehr.
    await stack.anbieter.verhalten({ apiKey: NEUER_SCHLUESSEL });
    // Mit dem alten Schlüssel scheitern das Lesen der Liste und der Test (absichtlich).
    erwarte(`${anbieterPfad}/modelle/lesen`, FALSCHER_SCHLUESSEL_STATUS);
    erwarte("/api/anbieter/verbindungstest", FALSCHER_SCHLUESSEL_STATUS);
    await seite.goto(`${app}/modelle`);
    await seite.getByRole("button", { name: "Liste neu laden" }).waitFor();
    await seite.getByRole("button", { name: "Verbindung testen" }).click();
    await seite.getByText("Verbindung fehlgeschlagen").first().waitFor();
    const belegeVorher = await belegeZaehlen(seite, app, "anbieter.speichern");
    await seite.getByRole("button", { name: "Schlüssel ersetzen" }).click();
    await seite.getByLabel("Neuer Schlüssel für", { exact: false }).fill(NEUER_SCHLUESSEL);
    await seite.getByRole("button", { name: "Schlüssel speichern" }).click();
    await seite.getByText("Schlüssel gespeichert.", { exact: false }).waitFor();
    const belegeNachher = await belegeZaehlen(seite, app, "anbieter.speichern");
    if (belegeNachher <= belegeVorher) {
      throw new Error(
        `Kein neuer Beleg „Anbieter gespeichert“ (${belegeVorher} → ${belegeNachher}).`,
      );
    }
    // Nach dem Neuladen: Schlüssel hinterlegt, Verbindung steht, die Seite verrät ihn nicht.
    await seite.reload();
    await seite.getByText("hinterlegt", { exact: false }).first().waitFor();
    if ((await seite.content()).includes(NEUER_SCHLUESSEL)) {
      throw new Error("Der neue Schlüssel steht im HTML der Seite.");
    }
    await seite.getByRole("button", { name: "Verbindung testen" }).click();
    await seite.getByText("Verbindung steht").first().waitFor();
    // Wirkung: Der Anbieter verlangt jetzt den neuen Schlüssel, und der Chat kommt durch.
    await chatten(seite, app, "Geht es mit dem neuen Schlüssel?");
    await neuestenBelegPruefen(seite, app, "anbieter.speichern");
  });
  await schritt("Modell und Anbieter: anderes Modell wählen, wirkt, mit Beleg", seite, async () => {
    const vorher = await letzteChatAnfrage();
    if (vorher?.body?.model !== "beispiel/allrounder") {
      throw new Error(
        `Vor dem Wechsel sollte „beispiel/allrounder“ laufen, war: ${vorher?.body?.model}.`,
      );
    }
    await seite.goto(`${app}/modelle`);
    const uebernehmen = seite.getByRole("button", { name: "Modell übernehmen" });
    await uebernehmen.waitFor();
    // Gegenprobe: Das schon gewählte Modell lässt sich nicht noch einmal „übernehmen“.
    if (!(await uebernehmen.isDisabled())) {
      throw new Error("„Modell übernehmen“ ist beim aktuellen Modell nicht gesperrt.");
    }
    const belegeVorher = await belegeZaehlen(seite, app, "modell.waehlen");
    await seite.getByRole("radio", { name: /Beispiel-Modell Kompakt/ }).check();
    await uebernehmen.click();
    await seite
      .getByText("arbeitet jetzt mit Beispiel-Modell Kompakt.", { exact: false })
      .waitFor();
    const belegeNachher = await belegeZaehlen(seite, app, "modell.waehlen");
    if (belegeNachher <= belegeVorher) {
      throw new Error(`Kein neuer Beleg „Modell gewählt“ (${belegeVorher} → ${belegeNachher}).`);
    }
    // Nach dem Neuladen steht das neue Modell als „aktuell“ da.
    await seite.reload();
    await seite
      .locator("label", { has: seite.getByRole("radio", { name: /Beispiel-Modell Kompakt/ }) })
      .getByText("aktuell", { exact: true })
      .waitFor();
    // Wirkung: Die nächste Anfrage an den Anbieter nennt das neue Modell.
    await chatten(seite, app, "Welches Modell antwortet?");
    const danach = await letzteChatAnfrage();
    if (danach?.body?.model !== "beispiel/kompakt") {
      throw new Error(
        `Nach dem Wechsel sollte „beispiel/kompakt“ laufen, war: ${danach?.body?.model}.`,
      );
    }
    await neuestenBelegPruefen(seite, app, "modell.waehlen");
    // zurück auf das Modell der übrigen Schritte
    await seite.goto(`${app}/modelle`);
    await seite.getByRole("radio", { name: /Beispiel-Modell Allrounder/ }).check();
    await seite.getByRole("button", { name: "Modell übernehmen" }).click();
    await seite
      .getByText("arbeitet jetzt mit Beispiel-Modell Allrounder.", { exact: false })
      .waitFor();
  });
  await schritt("Bot: Name und Anweisung ändern, wirkt, mit Beleg", seite, async () => {
    await seite.goto(`${app}/bot`);
    const name = seite.getByLabel("Name", { exact: true });
    const anweisung = seite.getByRole("textbox", { name: "Anweisung" });
    const urspruenglich = await name.inputValue();
    const belegeVorher = await belegeZaehlen(seite, app, "bot.aendern");
    // Gegenprobe: Ein leerer Name wird erklärt und nicht gespeichert (kein Beleg).
    await name.fill("");
    await seite.getByRole("button", { name: "Speichern" }).click();
    await seite.getByText("Gib deinem Bot einen Namen.").first().waitFor();
    if ((await belegeZaehlen(seite, app, "bot.aendern")) !== belegeVorher) {
      throw new Error("Ein leerer Name hat einen Beleg erzeugt.");
    }
    await name.fill("Pai Prüfstand");
    await anweisung.fill(ANWEISUNG);
    await seite.getByRole("button", { name: "Speichern" }).click();
    await seite
      .getByText("Gespeichert. Pai Prüfstand nutzt die neuen Angaben", { exact: false })
      .waitFor();
    const belegeNachher = await belegeZaehlen(seite, app, "bot.aendern");
    if (belegeNachher <= belegeVorher) {
      throw new Error(`Kein neuer Beleg „Bot geändert“ (${belegeVorher} → ${belegeNachher}).`);
    }
    // Nach dem Neuladen steht der neue Stand da.
    await seite.reload();
    if (
      (await name.inputValue()) !== "Pai Prüfstand" ||
      (await anweisung.inputValue()) !== ANWEISUNG
    ) {
      throw new Error("Name oder Anweisung stehen nach dem Neuladen nicht mehr da.");
    }
    // Wirkung: Die nächste Anfrage an den Anbieter trägt die neue Anweisung.
    await chatten(seite, app, "Und jetzt?");
    if (!JSON.stringify((await letzteChatAnfrage())?.body).includes(ANWEISUNG)) {
      throw new Error("Die neue Anweisung kam nicht beim Anbieter an.");
    }
    await neuestenBelegPruefen(seite, app, "bot.aendern");
    // zurück auf den Stand der übrigen Schritte
    await seite.goto(`${app}/bot`);
    await name.fill(urspruenglich);
    await anweisung.fill("");
    await seite.getByRole("button", { name: "Speichern" }).click();
    await seite.getByText(`Gespeichert. ${urspruenglich} nutzt`, { exact: false }).waitFor();
  });

  // ---- Mehrere Bots und Teams: anlegen, eigene Unterhaltung, pausieren, löschen ---------------
  await schritt(
    "Bots und Teams: zweiter Bot, eigene Unterhaltung, Pause, Löschen mit Rückfrage",
    seite,
    async () => {
      const AUFGABE = "Sammelt Themen und schreibt Stichpunkte.";
      await seite.goto(`${app}/`);
      // Der Weg in die Seite führt über das Menü, nicht über eine getippte Adresse.
      await seite.getByRole("link", { name: "Bots und Teams", exact: true }).first().click();
      await seite.waitForURL(`${app}/teams`);

      // Team anlegen
      const teamsVorher = await belegeZaehlen(seite, app, "team.anlegen");
      await seite.getByLabel("Name des Teams").fill("Content");
      await seite.getByRole("button", { name: "Team anlegen", exact: true }).click();
      await seite.getByRole("link", { name: "Verwalten" }).first().waitFor();
      if ((await belegeZaehlen(seite, app, "team.anlegen")) <= teamsVorher) {
        throw new Error("Team anlegen hat keinen Beleg erzeugt.");
      }

      // Zweiten Bot anlegen
      const botsVorher = await belegeZaehlen(seite, app, "bot.anlegen");
      await seite.getByLabel("Name des Bots").fill("Mila");
      await seite.getByLabel("Aufgabe in einem Satz").fill(AUFGABE);
      await seite.getByRole("button", { name: "Bot anlegen", exact: true }).click();
      const botLink = seite.getByRole("link", { name: "Bot Mila öffnen" });
      await botLink.waitFor();
      if ((await belegeZaehlen(seite, app, "bot.anlegen")) <= botsVorher) {
        throw new Error("Bot anlegen hat keinen Beleg erzeugt.");
      }
      await neuestenBelegPruefen(seite, app, "bot.anlegen");

      // Steckbrief: der Bot aus der Adresse, nicht der Standard-Bot
      await seite.goto(`${app}/teams`);
      await botLink.click();
      await seite.waitForURL(/\/bot\/bot_/u);
      const steckbrief = seite.url();
      const botId = steckbrief.split("/bot/")[1];
      if (!((await seite.locator("main").textContent()) ?? "").includes(AUFGABE)) {
        throw new Error("Der Steckbrief zeigt nicht den Bot aus der Adresse.");
      }

      // Eigene Unterhaltung mit diesem Bot: die Antwort kommt, und sie hängt an seiner Unterhaltung.
      await stack.anbieter.verhalten({ script: null, reply: BEISPIEL_ANTWORT });
      await seite.goto(`${app}/?bot=${botId}`);
      await seite.getByRole("textbox", { name: "Nachricht" }).fill("Hallo Mila.");
      await seite.getByRole("button", { name: "Senden" }).click();
      await seite.getByText(BEISPIEL_ANTWORT, { exact: true }).waitFor({ timeout: 60_000 });
      const milaUnterhaltung = new URL(seite.url()).pathname;
      if (milaUnterhaltung === unterhaltung) {
        throw new Error("Der zweite Bot schreibt in der Unterhaltung des Standard-Bots.");
      }

      // Pausieren: der Hinweis steht da, die Eingabe ist gesperrt, und das Tor lehnt das Senden ab.
      await seite.goto(steckbrief);
      const pausenBelege = await belegeZaehlen(seite, app, "bot.pausieren");
      await seite.getByRole("button", { name: "Pausieren", exact: true }).click();
      await seite.getByRole("button", { name: "Fortsetzen", exact: true }).waitFor();
      if ((await belegeZaehlen(seite, app, "bot.pausieren")) <= pausenBelege) {
        throw new Error("Pausieren hat keinen Beleg erzeugt.");
      }
      await seite.goto(`${app}${milaUnterhaltung}`);
      await seite.locator("[data-baustein='bot-pausiert']").waitFor();
      const feld = seite.getByRole("textbox", { name: "Nachricht" });
      if ((await feld.count()) > 0 && !(await feld.isDisabled())) {
        throw new Error("Die Eingabe ist trotz Pause nicht gesperrt.");
      }
      // Der Browser meldet jede Antwort ab 400 als Konsolenfehler. Hier sind zwei Ablehnungen
      // Absicht: die Gegenprobe unten (409 `bot_pausiert`) und das abgelehnte Löschen von „Mila“
      // (403 `abgelehnt`, fester Satz aus `packages/db/src/repo/bots.ts`).
      erwarte(`/api/unterhaltungen/${milaUnterhaltung.split("/").at(-1)}/nachrichten`, 409);
      erwarte(`/api/bots/${botId}`, 403);
      // Gegenprobe am Server: Auch ohne Oberfläche antwortet ein pausierter Bot nicht. Die Anfrage
      // geht aus der Seite und mit ihrem Prüfzeichen – sonst scheitert sie schon an der Herkunft,
      // und der Fall hielte auch bei einem Bot, der gar nicht pausiert ist. Erwartet wird genau
      // die Ablehnung des Tors, nicht irgendein Fehler.
      const abgelehnt = await seite.evaluate(async (id) => {
        const zeichen = document.querySelector('meta[name="pb-pruefzeichen"]')?.content ?? "";
        const antwort = await fetch(`/api/unterhaltungen/${id}/nachrichten`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-pb-pruefzeichen": zeichen },
          body: JSON.stringify({ text: "Trotzdem?", schleuse: "off" }),
        });
        return { status: antwort.status, code: (await antwort.json())?.fehler?.code };
      }, milaUnterhaltung.split("/").at(-1));
      if (abgelehnt.status !== 409 || abgelehnt.code !== "bot_pausiert") {
        throw new Error(
          `Ein pausierter Bot wurde nicht vom Tor abgelehnt (${abgelehnt.status} ${abgelehnt.code}).`,
        );
      }

      // „Mila“ hat geantwortet und lässt sich deshalb nicht mehr löschen – die Läufe sind die
      // Belegspur des Bots (`packages/db/src/repo/bots.ts`, Fremdschlüssel auf `runs`). Die Seite
      // sagt es mit festem Satz und bleibt stehen.
      await seite.goto(steckbrief);
      await seite.getByRole("button", { name: "Löschen …", exact: true }).click();
      await seite.getByRole("button", { name: "Löschen", exact: true }).click();
      await seite
        .getByText("Dieser Bot hat schon gearbeitet und lässt sich nicht löschen.")
        .waitFor();
      if (!seite.url().startsWith(steckbrief)) {
        throw new Error("Ein Bot mit Läufen wurde gelöscht.");
      }

      // Löschen fragt zurück; die Belege des Bots bleiben, und die Kette prüft weiter. Dafür ein
      // zweiter Bot, der nie geantwortet hat: „Mila“ darf nicht mehr weg (siehe oben).
      await seite.goto(`${app}/teams`);
      await seite.getByLabel("Name des Bots").fill("Tom");
      await seite.getByRole("button", { name: "Bot anlegen", exact: true }).click();
      const tomLink = seite.getByRole("link", { name: "Bot Tom öffnen" });
      await tomLink.waitFor();
      const vorherBelege = await belegeZaehlen(seite, app, "bot.anlegen");
      await tomLink.click();
      await seite.waitForURL(/\/bot\/bot_/u);
      await seite.getByRole("button", { name: "Löschen …", exact: true }).click();
      await seite.getByText("Seine Belege bleiben erhalten.").waitFor();
      await seite.getByRole("button", { name: "Abbrechen", exact: true }).click();
      if (!((await seite.locator("main").textContent()) ?? "").includes("Tom")) {
        throw new Error("„Abbrechen“ hat den Bot gelöscht.");
      }
      await seite.getByRole("button", { name: "Löschen …", exact: true }).click();
      await seite.getByRole("button", { name: "Löschen", exact: true }).click();
      await seite.waitForURL(`${app}/teams`);
      if ((await seite.getByRole("link", { name: "Bot Tom öffnen" }).count()) > 0) {
        throw new Error("Der Bot steht nach dem Löschen noch da.");
      }
      if ((await belegeZaehlen(seite, app, "bot.anlegen")) !== vorherBelege) {
        throw new Error("Die Belege des Bots sind mit ihm verschwunden.");
      }
      await neuestenBelegPruefen(seite, app, "bot.loeschen");
    },
  );

  // ---- Handy-Format: senden, Antwort streamt, Stopp, Beleg als Blatt ---------------------------
  const HANDY_ANTWORT =
    "Gern. Das hier ist eine lange Antwort, die der Test-Anbieter nach zwei Stücken anhält.";
  const handy = await neuesGeraet(app, { viewport: HANDY });
  await handy.addCookies(await kontext.cookies());
  const handySeite = await handy.newPage();
  await schritt("Handy: Nachricht senden, Antwort streamt", handySeite, async () => {
    await stack.anbieter.verhalten({ reply: HANDY_ANTWORT, chunkChars: 8, holdAfterChunks: 2 });
    await handySeite.goto(`${app}/`);
    await handySeite.getByRole("textbox", { name: "Nachricht" }).fill("Erzähl mir etwas Langes.");
    await handySeite.getByRole("button", { name: "Senden" }).click();
    // Die ersten zwei Stücke (16 Zeichen) sind da, der Rest kommt nicht: die Antwort läuft noch.
    await handySeite.getByText(HANDY_ANTWORT.slice(0, 16), { exact: false }).waitFor();
    await handySeite.getByRole("button", { name: "Stopp" }).waitFor();
    if (await handySeite.getByText(HANDY_ANTWORT, { exact: true }).count()) {
      throw new Error("Die ganze Antwort ist schon da, obwohl der Anbieter angehalten hat.");
    }
  });
  await schritt("Handy: Neuladen mitten in der Antwort", handySeite, async () => {
    // Der Lauf geht weiter; die Seite zeigt den vorläufigen Text wieder, nicht als Antwort.
    await handySeite.reload();
    await handySeite.getByText(HANDY_ANTWORT.slice(0, 16), { exact: false }).waitFor();
    await handySeite.getByRole("button", { name: "Stopp" }).waitFor();
    await handySeite.locator('[data-baustein="vorlaeufiger-text"]').waitFor();
  });
  await schritt("Handy: Stopp bricht die Antwort beim Anbieter ab", handySeite, async () => {
    await handySeite.getByRole("button", { name: "Stopp" }).click();
    // Der Text bis zum Stopp ist keine Antwort: Er steht eingeklappt als Zwischenschritt, darunter
    // sagt PaiBot, dass abgebrochen wurde, bevor das Modell geantwortet hat.
    await handySeite.getByText(/Abgebrochen, bevor .* geantwortet hat\./).waitFor();
    await handySeite.getByText("Zwischenschritt – vorläufig, nicht geprüft").waitFor();
    if (
      await handySeite
        .getByText(/^Gern\. Das hier ist/)
        .first()
        .isVisible()
    ) {
      throw new Error("Der Text bis zum Stopp steht ausgeklappt oder als Antwort da.");
    }
    // Gegenprobe beim Anbieter: Die Verbindung zur letzten Chat-Anfrage wurde vom Aufrufer
    // geschlossen, nicht vom Anbieter beendet.
    let letzte;
    for (let i = 0; i < 50; i += 1) {
      const chats = (await stack.anbieter.anfragen()).filter((a) =>
        a.path.endsWith("/chat/completions"),
      );
      letzte = chats.at(-1);
      if (letzte?.closedByClient) break;
      await handySeite.waitForTimeout(200);
    }
    if (!letzte?.closedByClient) throw new Error("Der Anbieter hat keinen Abbruch gesehen.");
    await stack.anbieter.verhalten({ reply: BEISPIEL_ANTWORT, holdAfterChunks: 0 });
  });
  await schritt("Handy: Beleg als Blatt öffnen", handySeite, async () => {
    await handySeite
      .getByRole("button", { name: /^Beleg prüfen: B-\d+/ })
      .last()
      .click();
    await handySeite.getByRole("link", { name: "Als eigene Seite öffnen" }).last().waitFor();
    // Der Beleg des abgebrochenen Laufs steht im Blatt, ganz im Bild.
    await handySeite.getByText("abgebrochen", { exact: true }).last().waitFor();
    // Das Blatt fährt von unten herein (Animation `pb-blatt-hoch`, 30 px). Gemessen wird erst im
    // ruhenden Zustand: Animationen des Blatts beendet und zwei gleiche Messungen hintereinander.
    const linkOrt = handySeite.getByRole("link", { name: "Als eigene Seite öffnen" }).last();
    const blatt = await ruhendeBox(linkOrt, "aside");
    if (!blatt.behaelter || blatt.behaelter.y + blatt.behaelter.height > HANDY.height + 1) {
      throw new Error(`Blatt ragt aus dem Bild (${JSON.stringify(blatt.behaelter)}).`);
    }
    const link = blatt.box;
    if (
      !link ||
      link.x < 0 ||
      link.x + link.width > HANDY.width ||
      link.y + link.height > HANDY.height
    ) {
      throw new Error(`Blatt passt nicht ins Handy-Format (${JSON.stringify(link)}).`);
    }
    const breite = await handySeite.evaluate(() => document.documentElement.scrollWidth);
    if (breite > HANDY.width) throw new Error(`Seite scrollt waagerecht (${breite} px).`);
  });
  await handy.close();

  // ---- Datenschleuse (Beispiel-Umgebung: Attrappe statt echter Datenschleuse) --------------------
  await schritt("Datenschleuse: bereit, Standard einschalten", seite, async () => {
    await stack.schleuse("bereit");
    await seite.goto(`${app}/datenschleuse`);
    await seite.getByText("Die Datenschleuse ist bereit.").first().waitFor();
    const schalter = seite.getByRole("switch", { name: "Neue Unterhaltungen mit Datenschleuse" });
    await schalter.click();
    await seite.getByText("Gespeichert: Neue Unterhaltungen starten mit Datenschleuse.").waitFor();
  });
  let anfragenVorher;
  await schritt("Datenschleuse: Nachricht geht geschützt", seite, async () => {
    anfragenVorher = (await stack.anbieter.anfragen()).length;
    await seite.goto(`${app}/`);
    await seite.getByRole("textbox", { name: "Nachricht" }).fill("Ruf bitte Max Mustermann an.");
    await seite.getByRole("button", { name: "Senden" }).click();
    const verlauf = seite.getByRole("log", { name: "Verlauf" });
    await verlauf.getByText(BEISPIEL_ANTWORT, { exact: true }).waitFor({ timeout: 60_000 });
    await verlauf.getByText("geschützt über die Datenschleuse").first().waitFor();
    if ((await stack.anbieter.anfragen()).length <= anfragenVorher) {
      throw new Error("Die Anfrage kam nicht beim Anbieter an.");
    }
  });
  await schritt("Datenschleuse: Schlüssel passt nicht, mit Ausweg", seite, async () => {
    // Gegenprobe zum Weg: Nimmt die Datenschleuse den Schlüssel nicht an, scheitert die Nachricht,
    // und beim Anbieter kommt nichts an (kein stiller Umweg direkt zum Anbieter).
    stack.attrappeZustand("schluessel_falsch");
    anfragenVorher = (await stack.anbieter.anfragen()).length;
    await seite.getByRole("textbox", { name: "Nachricht" }).fill("Und schreib ihm eine Mail.");
    await seite.getByRole("button", { name: "Senden" }).click();
    const verlauf = seite.getByRole("log", { name: "Verlauf" });
    await verlauf
      .getByText("Die Datenschleuse nimmt den Schlüssel von PaiBot (SCHLEUSE_KEY) nicht an.", {
        exact: false,
      })
      .first()
      .waitFor({ timeout: 60_000 });
    await verlauf.getByText("Prüf SCHLEUSE_KEY in deploy/.env", { exact: false }).first().waitFor();
    if ((await stack.anbieter.anfragen()).length !== anfragenVorher) {
      throw new Error("Trotz abgelehntem Schlüssel ging eine Anfrage an den Anbieter.");
    }
    // Ausweg: der Link führt zur Seite Datenschleuse; dort steht der Befund des Workers.
    await stack.schleuse("schluessel_falsch");
    await verlauf.getByRole("link", { name: "Zur Datenschleuse" }).first().click();
    await seite.waitForURL((u) => u.pathname === "/datenschleuse");
    await seite.getByText("Schlüssel passt nicht", { exact: true }).first().waitFor();
    await seite.getByText("Prüf SCHLEUSE_KEY in deploy/.env", { exact: false }).first().waitFor();
    // Standard wieder aus; die weiteren Schritte gehen direkt an den Anbieter.
    await seite.getByRole("switch", { name: "Neue Unterhaltungen mit Datenschleuse" }).click();
    await seite.getByText("Gespeichert: Neue Unterhaltungen starten ohne Datenschleuse.").waitFor();
  });

  // ---- Unbekannte Adresse in der App: eine Fehlerseite mit genau einem Hauptbereich ---------------
  await schritt("404 im App-Rahmen: ein Hauptbereich", seite, async () => {
    erwarte("/belege/B-0054", 404);
    const antwort = await seite.goto(`${app}/belege/B-0054`);
    if (antwort?.status() !== 404) throw new Error(`Status ${antwort?.status()} statt 404.`);
    await seite.getByRole("heading", { name: "Diese Seite gibt es nicht" }).waitFor();
    const haupt = await seite.locator("main").count();
    if (haupt !== 1) throw new Error(`${haupt} Hauptbereiche (<main>) statt einem.`);
  });

  // ---- Gerät entfernen: die Leiste „Neue Anmeldung“ verschwindet ohne Neuladen -------------------
  const zeitweilig = await neuesGeraet(app, { adresse: "198.51.100.30" });
  const zeitweiligSeite = await zeitweilig.newPage();
  await schritt("Gerät entfernen: Leiste verschwindet ohne Neuladen", seite, async () => {
    const status = await anmeldeVersuch(zeitweiligSeite, app, PASSWORT);
    if (status !== 200) throw new Error(`Anmeldung auf dem weiteren Gerät: ${status}.`);
    // Seine Seite bleibt nicht offen: Nach dem Entfernen würde sie sonst 401 melden.
    await zeitweiligSeite.goto("about:blank");
    await seite.goto(`${app}/einstellungen`);
    const leiste = seite.locator("[aria-label='Hinweis auf neue Anmeldung']");
    await leiste.getByText("Neue Anmeldung von einem neuen Gerät").waitFor();
    await seite.getByText("dieses Gerät").first().waitFor();
    await seite
      .locator("section[aria-labelledby='geraete-titel'] li")
      .filter({ hasNotText: "dieses Gerät" })
      .first()
      .getByRole("button")
      .click();
    await seite.getByRole("alertdialog").getByRole("button", { name: "Entfernen" }).click();
    await seite.getByText(/^Gerät entfernt/).waitFor();
    // Ohne Neuladen: Die Leiste nennt die Anmeldung eines Geräts nicht mehr, das es nicht mehr gibt.
    await leiste.waitFor({ state: "detached", timeout: 10_000 });
  });
  await zeitweilig.close();

  // ---- Passwort ändern meldet alle anderen Geräte ab ---------------------------------------------
  const NEUES_PASSWORT = `Neuer-${randomBytes(9).toString("base64url")}-Satz`;
  const zweites = await neuesGeraet(app, { adresse: "198.51.100.20" });
  const zweiteSeite = await zweites.newPage();
  await schritt("Zweites Gerät meldet sich an", zweiteSeite, async () => {
    const status = await anmeldeVersuch(zweiteSeite, app, PASSWORT);
    if (status !== 200) throw new Error(`Anmeldung auf dem zweiten Gerät: ${status}.`);
    await zweiteSeite.waitForURL((u) => !u.pathname.startsWith("/anmelden"));
  });
  await schritt("Passwort ändern: falsches aktuelles Passwort", seite, async () => {
    // Gegenprobe: Ohne das richtige aktuelle Passwort ändert sich nichts, das zweite Gerät bleibt an.
    erwarte("/api/zugang/passwort", 400, 401, 403);
    await seite.goto(`${app}/einstellungen`);
    await seite.getByLabel("Aktuelles Passwort").fill(`${PASSWORT}-falsch`);
    await seite.getByLabel("Neues Passwort", { exact: true }).fill(NEUES_PASSWORT);
    await seite.getByLabel("Neues Passwort wiederholen").fill(NEUES_PASSWORT);
    const antwort = seite.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/zugang/passwort",
    );
    await seite.getByRole("button", { name: "Passwort ändern" }).click();
    const status = (await antwort).status();
    if (status < 400) throw new Error(`Falsches aktuelles Passwort angenommen (${status}).`);
    await zweiteSeite.goto(`${app}/belege`);
    await zweiteSeite.getByRole("heading", { name: "Belege" }).first().waitFor();
    if (new URL(zweiteSeite.url()).pathname !== "/belege") {
      throw new Error("Zweites Gerät wurde trotz abgelehnter Änderung abgemeldet.");
    }
  });
  await schritt("Passwort ändern: andere Geräte abgemeldet", seite, async () => {
    await seite.goto(`${app}/einstellungen`);
    await seite.getByLabel("Aktuelles Passwort").fill(PASSWORT);
    await seite.getByLabel("Neues Passwort", { exact: true }).fill(NEUES_PASSWORT);
    await seite.getByLabel("Neues Passwort wiederholen").fill(NEUES_PASSWORT);
    await seite.getByRole("button", { name: "Passwort ändern" }).click();
    await seite
      .getByText("Dein Passwort ist geändert. Alle anderen Geräte sind jetzt abgemeldet.")
      .waitFor();
    // Dieses Gerät bleibt angemeldet …
    await seite.goto(`${app}/belege`);
    await seite.getByRole("heading", { name: "Belege" }).first().waitFor();
    if (new URL(seite.url()).pathname !== "/belege")
      throw new Error("Dieses Gerät ist abgemeldet.");
    // … das zweite nicht mehr.
    await zweiteSeite.goto(`${app}/belege`);
    await zweiteSeite.waitForURL((u) => u.pathname.startsWith("/anmelden"));
  });
  await schritt("Zweites Gerät: altes Passwort abgelehnt, neues gilt", zweiteSeite, async () => {
    erwarte("/api/zugang/anmelden", 401);
    const alt = await anmeldeVersuch(zweiteSeite, app, PASSWORT);
    if (alt !== 401) throw new Error(`Altes Passwort: ${alt} statt 401.`);
    await zweiteSeite.getByText("Das Passwort stimmt nicht.").waitFor();
    const neu = await anmeldeVersuch(zweiteSeite, app, NEUES_PASSWORT);
    if (neu !== 200) throw new Error(`Neues Passwort: ${neu} statt 200.`);
    await zweiteSeite.waitForURL((u) => !u.pathname.startsWith("/anmelden"));
  });
  await zweites.close();

  // ---- Anmeldung: Sperre je Adresse, gemeinsame Bremse, bekanntes Gerät --------------------------
  const fremd = await neuesGeraet(app, { adresse: "203.0.113.7" });
  const fremdSeite = await fremd.newPage();
  await schritt("Anmeldung: Fehlversuche bis zur Sperre", fremdSeite, async () => {
    erwarte("/api/zugang/anmelden", 401, 429);
    await fremdSeite.goto(`${app}/anmelden`);
    for (let i = 1; i <= 5; i += 1) {
      const status = await anmeldeVersuch(fremdSeite, app, `falsch-${i}-${PASSWORT}`);
      if (status !== 401) throw new Error(`Fehlversuch ${i}: ${status} statt 401.`);
    }
    await fremdSeite.getByText("Das Passwort stimmt nicht.").waitFor();
    const gesperrt = await anmeldeVersuch(fremdSeite, app, `falsch-6-${PASSWORT}`);
    if (gesperrt !== 429) throw new Error(`Versuch 6: ${gesperrt} statt 429.`);
    await fremdSeite
      .getByText(/^Zu viele Versuche\. Versuch es in \d+ Sekunden noch einmal\.$/)
      .waitFor();
    // Gegenprobe: Auch das richtige Passwort kommt von dieser Adresse jetzt nicht durch.
    const richtig = await anmeldeVersuch(fremdSeite, app, NEUES_PASSWORT);
    if (richtig !== 429) throw new Error(`Richtiges Passwort trotz Sperre: ${richtig}.`);
    if (!new URL(fremdSeite.url()).pathname.startsWith("/anmelden")) {
      throw new Error("Trotz Sperre angemeldet.");
    }
  });
  await schritt("Anmeldung: gemeinsame Bremse für unbekannte Geräte", fremdSeite, async () => {
    erwarte("/api/zugang/anmelden", 401, 429);
    // Viele Fehlversuche aus vielen Adressen: über 20 im Fenster greift die gemeinsame Bremse.
    for (let i = 1; i <= 22; i += 1) {
      const status = await anmeldeAnfrage(fremdSeite, `falsch-${PASSWORT}`, `192.0.2.${i}`);
      if (status !== 401 && status !== 429) throw new Error(`Versuch aus 192.0.2.${i}: ${status}.`);
    }
    // Gegenprobe: Mehrere unbekannte Geräte gleichzeitig, auch mit richtigem Passwort: höchstens
    // eines je Takt der Bremse wird geprüft, die anderen bekommen 429.
    const gleichzeitig = await Promise.all(
      [101, 102, 103, 104, 105].map((n) =>
        anmeldeAnfrage(fremdSeite, NEUES_PASSWORT, `192.0.2.${n}`),
      ),
    );
    ergebnis.bremse = gleichzeitig;
    if (gleichzeitig.filter((s) => s === 429).length < 3) {
      throw new Error(`Bremse greift nicht: ${gleichzeitig.join(", ")}.`);
    }
  });
  await fremd.close();
  await schritt("Anmeldung: bekanntes Gerät kommt durch", seite, async () => {
    await seite.goto(`${app}${unterhaltung}`);
    await abmeldenUeberDu(seite);
    await seite.waitForURL((u) => u.pathname.startsWith("/anmelden"));
    // Direkt davor ein Versuch eines unbekannten Geräts, der den Takt der Bremse belegt.
    erwarte("/api/zugang/anmelden", 401, 429);
    ergebnis.bremseVorBekannt = await anmeldeAnfrage(seite, `falsch-${PASSWORT}`, "192.0.2.200");
    const status = await anmeldeVersuch(seite, app, NEUES_PASSWORT);
    if (status !== 200) throw new Error(`Bekanntes Gerät: ${status} statt 200.`);
    await seite.waitForURL((u) => !u.pathname.startsWith("/anmelden"));
    await seite.getByRole("complementary", { name: "Navigation" }).waitFor();
  });

  // ---- Belege: ganze Kette, Export, eigenständiger Prüfer ----------------------------------------
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
    await abmeldenUeberDu(seite);
    await seite.waitForURL((u) => u.pathname.startsWith("/anmelden"));
    await seite.goto(`${app}/belege`);
    await seite.waitForURL((u) => u.pathname.startsWith("/anmelden"));
  });
  await schritt("Anmelden", seite, async () => {
    const status = await anmeldeVersuch(seite, app, NEUES_PASSWORT);
    if (status !== 200) throw new Error(`Anmelden: ${status} statt 200.`);
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
    await seite.setViewportSize(HANDY);
    await seite.goto(`${app}${unterhaltung}`);
    await seite.getByText(BEISPIEL_ANTWORT, { exact: true }).waitFor();
  });

  // Not-Aus: anhalten → Nachricht abgelehnt → mit Passwort aufheben → Nachricht geht.
  await schritt("Not-Aus: anhalten, Nachricht wird abgelehnt", seite, async () => {
    await seite.setViewportSize(DESKTOP);
    await seite.goto(`${app}/einstellungen/grenzen`);
    await seite.getByRole("textbox", { name: "Tagesbudget (Token)" }).fill("");
    await seite.getByRole("button", { name: "Speichern" }).click();
    await seite.getByText("Gespeichert.").waitFor();
    await seite.goto(`${app}${unterhaltung}`);
    await seite
      .getByRole("complementary", { name: "Navigation" })
      .getByRole("button", { name: "Not-Aus: alle Bots anhalten" })
      .click();
    const frage = seite.getByRole("alertdialog", { name: "Alle Bots anhalten?" });
    await frage.getByRole("button", { name: "Alle Bots anhalten" }).click();
    await frage.waitFor({ state: "detached" });
    await seite.getByRole("status").filter({ hasText: "Alle Bots sind angehalten." }).waitFor();
    if (!(await seite.getByRole("textbox", { name: "Nachricht" }).isDisabled())) {
      throw new Error("Eingabe bleibt bei Not-Aus bedienbar.");
    }
    // Auch am Server vorbei an der Oberfläche: Das Tor lehnt die Nachricht ab.
    const id = unterhaltung.split("/").at(-1);
    erwarte(`/api/unterhaltungen/${id}/nachrichten`, 409);
    const antwort = await seite.evaluate(async (pfad) => {
      const zeichen = document.querySelector('meta[name="pb-pruefzeichen"]')?.content ?? "";
      const r = await fetch(pfad, {
        method: "POST",
        headers: { "content-type": "application/json", "X-Pb-Pruefzeichen": zeichen },
        body: JSON.stringify({ text: "Bist du da?", schleuse: "off" }),
      });
      return { status: r.status, body: await r.json() };
    }, `/api/unterhaltungen/${id}/nachrichten`);
    if (antwort.status !== 409 || antwort.body?.fehler?.code !== "angehalten") {
      throw new Error(`Nachricht bei Not-Aus: ${antwort.status} ${JSON.stringify(antwort.body)}`);
    }
    ergebnis.notAus = { abgelehnt: antwort.status, text: antwort.body.fehler.text };
  });
  await schritt("Not-Aus: mit Passwort aufheben, Nachricht geht", seite, async () => {
    const vorher = await seite.getByText(BEISPIEL_ANTWORT, { exact: true }).count();
    await seite
      .getByRole("status")
      .filter({ hasText: "Alle Bots sind angehalten." })
      .getByRole("button", { name: "Fortsetzen", exact: true })
      .click();
    const frage = seite.getByRole("alertdialog", { name: "Not-Aus aufheben?" });
    await frage.getByLabel("Aktuelles Passwort").fill(NEUES_PASSWORT);
    await frage.getByRole("button", { name: "Fortsetzen", exact: true }).click();
    await frage.waitFor({ state: "detached" });
    await seite
      .getByRole("complementary", { name: "Navigation" })
      .getByRole("button", { name: "Not-Aus: alle Bots anhalten" })
      .waitFor();
    await seite.getByRole("textbox", { name: "Nachricht" }).fill("Und jetzt?");
    await seite.getByRole("button", { name: "Senden" }).click();
    await seite
      .getByText(BEISPIEL_ANTWORT, { exact: true })
      .nth(vorher)
      .waitFor({ timeout: 60_000 });
  });

  // ---- Chat-Ergänzungen: suchen, als Datei sichern, neu erzeugen ---------------------------------
  await schritt("Suchen: Treffer öffnen und zur Stelle springen", seite, async () => {
    await seite.setViewportSize(DESKTOP);
    await seite.goto(`${app}/einstellungen`);
    const navigation = seite.getByRole("complementary", { name: "Navigation" });
    const feld = navigation.getByRole("searchbox", { name: "Unterhaltungen durchsuchen" });
    await feld.fill("x");
    await navigation.getByText("Gib mindestens zwei Zeichen ein.").waitFor();
    await feld.fill("kein-solches-wort-zz");
    await navigation.getByText("Nichts gefunden für „kein-solches-wort-zz“.").waitFor();
    // Teil der Frage aus dem ersten Chat-Schritt, anders geschrieben.
    await feld.fill("WIE GEHT");
    const treffer = navigation.getByRole("region", { name: "Treffer der Suche" });
    await treffer.locator("mark", { hasText: "wie geht" }).first().waitFor();
    // Tastatur: Pfeil nach unten zum ersten Treffer (Titel), noch einmal zur Nachricht, Enter.
    await feld.press("ArrowDown");
    await seite.keyboard.press("ArrowDown");
    await seite.keyboard.press("Enter");
    await seite.waitForURL((u) => u.pathname === unterhaltung);
    const ziel = seite.locator('[id^="nachricht-"][data-ziel="ja"]');
    await ziel.getByText("Hallo Pai, wie geht es dir?").waitFor();
    await feld.fill("");
    // Je Bot eine Liste: Der Schritt prüft nur, dass die Listen nach dem Leeren wieder da sind.
    await navigation
      .getByRole("navigation", { name: /^Unterhaltungen von / })
      .first()
      .waitFor();
  });

  await schritt("Als Datei sichern: Datei lesbar, ohne Kennungen", seite, async () => {
    await seite.goto(`${app}${unterhaltung}`);
    await seite.getByRole("button", { name: "Weitere Aktionen" }).click();
    await seite.getByRole("menuitem", { name: /Als Datei sichern/ }).click();
    const dialog = seite.getByRole("dialog", { name: "Unterhaltung als Datei sichern" });
    await dialog.getByText("Die Datei enthält persönliche Inhalte", { exact: false }).waitFor();
    const download = seite.waitForEvent("download");
    await dialog.getByRole("button", { name: "Datei sichern" }).click();
    const datei = path.join(ausgabe, (await download).suggestedFilename());
    await (await download).saveAs(datei);
    await dialog.getByText(/^Gesichert als paibot-.+\.md\./).waitFor();
    const inhalt = readFileSync(datei, "utf8");
    if (!/^paibot-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.md$/.test(path.basename(datei))) {
      throw new Error(`Dateiname: ${path.basename(datei)}`);
    }
    for (const muss of ["## Du · ", "Hallo Pai, wie geht es dir?", BEISPIEL_ANTWORT]) {
      if (!inhalt.includes(muss)) throw new Error(`In der Datei fehlt: ${muss}`);
    }
    if (/\b(unt|msg|run|blg|mod|anb|bot)_[0-9a-z]{26}\b/.test(inhalt)) {
      throw new Error("Die Datei enthält interne Kennungen.");
    }
    await dialog.getByRole("button", { name: "Schließen" }).first().click();
  });

  await schritt("Neu erzeugen: zweite Fassung, erste bleibt erreichbar", seite, async () => {
    // Die Tagesgrenze hat der Not-Aus-Schritt davor schon aufgehoben.
    const ZWEITE = "Zweite Fassung: Mir geht es gut, danke der Nachfrage.";
    await stack.anbieter.verhalten({ reply: ZWEITE, holdAfterChunks: 0 });
    await seite.goto(`${app}${unterhaltung}`);
    const verlauf = seite.getByRole("log", { name: "Verlauf" });
    const vorher = (await stack.anbieter.anfragen()).length;
    // Nach dem Abgleich der Modell-Liste (Seite „Modell und Anbieter“) gibt es neben dem Knopf
    // auch das Menü „Antwort neu erzeugen“ mit anderem Modell; hier zählt nur der Knopf.
    await verlauf.getByRole("button", { name: "Neu erzeugen", exact: true }).click();
    await verlauf.getByText(ZWEITE, { exact: true }).waitFor({ timeout: 60_000 });
    await verlauf.getByText("Fassung 2 von 2").waitFor();
    if ((await stack.anbieter.anfragen()).length !== vorher + 1) {
      throw new Error("Neu erzeugen schickte nicht genau eine Anfrage an den Anbieter.");
    }
    // Zur ersten Fassung blättern: die alte Antwort steht unverändert da.
    await verlauf.getByRole("button", { name: "Zur vorigen Fassung der Antwort" }).click();
    await verlauf.getByText("Frühere Fassung 1 von 2").waitFor();
    await verlauf.getByText(BEISPIEL_ANTWORT, { exact: true }).last().waitFor();
    // Nach dem Neuladen sind beide Fassungen da, die neueste vorn.
    await seite.reload();
    await verlauf.getByText(ZWEITE, { exact: true }).waitFor();
    await verlauf.getByRole("button", { name: "Zur vorigen Fassung der Antwort" }).click();
    await verlauf.getByText(BEISPIEL_ANTWORT, { exact: true }).last().waitFor();
    await stack.anbieter.verhalten({ reply: BEISPIEL_ANTWORT, holdAfterChunks: 0 });
  });

  // ---- Bedienung: Fokus nach dem Senden, Werkzeuge einklappen -------------------------------------
  await schritt("Chat: nach dem Senden ist das Nachrichtenfeld fokussiert", seite, async () => {
    await seite.goto(`${app}${unterhaltung}`);
    const verlauf = seite.getByRole("log", { name: "Verlauf" });
    const feld = seite.getByRole("textbox", { name: "Nachricht" });
    const imFeld = () =>
      feld.evaluate((el) => el === document.activeElement && !el.disabled).catch(() => false);
    for (const [text, wie] of [
      ["Erste Frage nach dem Fokus", "Enter"],
      ["Zweite Frage nach dem Fokus", "Knopf"],
    ]) {
      const vorher = await verlauf.getByText(BEISPIEL_ANTWORT, { exact: true }).count();
      await feld.fill(text);
      if (wie === "Enter") await feld.press("Enter");
      else await seite.getByRole("button", { name: "Senden" }).click();
      await verlauf.getByText(text, { exact: true }).waitFor();
      await verlauf
        .getByText(BEISPIEL_ANTWORT, { exact: true })
        .nth(vorher)
        .waitFor({ timeout: 60_000 });
      await seite.waitForFunction(
        () => document.activeElement?.getAttribute("aria-label") !== "Stopp",
      );
      if (!(await imFeld()))
        throw new Error(`Nach dem Senden (${wie}) steht der Cursor nicht im Feld.`);
    }
  });
  // Der Ereignis-Strom kann schneller sein als die Antwort auf das Senden: die Antwort wird hier
  // festgehalten, bis die Antwort des Bots schon im Verlauf steht. Die eigene Nachricht steht dann
  // genau einmal da, danach und nach dem Neuladen ebenfalls.
  await schritt(
    "Chat: eigene Nachricht steht genau einmal, auch wenn der Strom vorausläuft",
    seite,
    async () => {
      await seite.goto(`${app}${unterhaltung}`);
      const verlauf = seite.getByRole("log", { name: "Verlauf" });
      const text = "Frage bei vorauslaufendem Strom";
      const vorher = await verlauf.getByText(BEISPIEL_ANTWORT, { exact: true }).count();
      let freigeben;
      const festgehalten = new Promise((weiter) => {
        freigeben = weiter;
      });
      let erledigt = Promise.resolve();
      const halten = (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        erledigt = (async () => {
          const antwort = await route.fetch();
          await festgehalten;
          await route.fulfill({ response: antwort });
        })();
        return erledigt;
      };
      await seite.route(/\/api\/unterhaltungen\/[^/]+\/nachrichten$/, halten);
      try {
        await seite.getByRole("textbox", { name: "Nachricht" }).fill(text);
        await seite.getByRole("textbox", { name: "Nachricht" }).press("Enter");
        await verlauf
          .getByText(BEISPIEL_ANTWORT, { exact: true })
          .nth(vorher)
          .waitFor({ timeout: 60_000 });
        const waehrend = await verlauf.getByText(text, { exact: true }).count();
        if (waehrend !== 1)
          throw new Error(
            `Eigene Nachricht steht ${waehrend}-mal im Verlauf (vor der Antwort auf das Senden).`,
          );
      } finally {
        freigeben();
        await erledigt;
        await seite.unroute(/\/api\/unterhaltungen\/[^/]+\/nachrichten$/, halten);
      }
      await seite.getByRole("button", { name: "Senden" }).waitFor();
      const danach = await verlauf.getByText(text, { exact: true }).count();
      if (danach !== 1)
        throw new Error(`Eigene Nachricht steht ${danach}-mal im Verlauf (nach dem Lauf).`);
      await seite.reload();
      await verlauf.getByText(text, { exact: true }).waitFor();
      const geladen = await verlauf.getByText(text, { exact: true }).count();
      if (geladen !== 1)
        throw new Error(`Eigene Nachricht steht ${geladen}-mal im Verlauf (nach dem Neuladen).`);
    },
  );
  await schritt(
    "Seitenleiste: Werkzeuge einklappen, Zustand bleibt nach Neuladen",
    seite,
    async () => {
      await seite.setViewportSize(DESKTOP);
      const navigation = seite.getByRole("complementary", { name: "Navigation" });
      const knopf = navigation.getByRole("button", { name: /^Werkzeuge/ });
      if ((await knopf.getAttribute("aria-expanded")) !== "true") {
        throw new Error("Werkzeuge sind nicht von Anfang an ausgeklappt.");
      }
      await knopf.click();
      await navigation.getByRole("link", { name: "Belege" }).waitFor({ state: "hidden" });
      await navigation.getByRole("button", { name: "Du", exact: true }).waitFor();
      await seite.reload();
      // Der gemerkte Zustand gilt, sobald die Seite im Browser läuft (nicht schon im Server-HTML).
      // Geprüft wird der Knopf „Werkzeuge“ selbst: Seit die Leiste Teams und Bots aufklappt, ist er
      // nicht mehr der erste Knopf mit `aria-expanded`.
      let eingeklappt = false;
      for (let i = 0; i < 50 && !eingeklappt; i += 1) {
        eingeklappt = (await knopf.getAttribute("aria-expanded")) === "false";
        if (!eingeklappt) await seite.waitForTimeout(200);
      }
      if (!eingeklappt) throw new Error("Eingeklappter Zustand nach dem Neuladen vergessen.");
      await knopf.focus();
      await seite.keyboard.press("Enter");
      await navigation.getByRole("link", { name: "Belege" }).waitFor();
    },
  );

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
// Warnungen zählen nicht, außer dem unnötig vorgeladenen Stylesheet: Es zeigt, dass eine Seite die
// Stile einer anderen mitlädt (so ist es schon einmal aufgefallen).
const VORGELADEN_UNGENUTZT = "preloaded using link preload but not used";
const konsolenFehler = ergebnis.konsole.filter(
  (k) => k.art !== "warning" || k.text.includes(VORGELADEN_UNGENUTZT),
);
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
for (const k of konsolenFehler) {
  const orte = [
    k.quelle ? `Anfrage: ${k.quelle}` : undefined,
    k.url ? `Seite: ${k.url}` : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  log(`Konsole (${k.art}): ${k.text}${orte ? ` [${orte}]` : ""}`);
}
log(`Ergebnis, Logs und Bilder: ${ausgabe}`);
const ok = pruefungen.every(([, v]) => v);
log(ok ? "Ende-zu-Ende-Prüfung bestanden." : "Ende-zu-Ende-Prüfung NICHT bestanden.");
process.exit(ok ? 0 : 1);
