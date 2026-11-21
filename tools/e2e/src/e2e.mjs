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
      ergebnis.konsole.push({ art: m.type(), text: m.text(), url: seite.url() });
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
    // Sofort neu laden, auch wenn der Lauf in der Datenbank noch nicht beendet ist: Die Antwort
    // steht dann genau einmal da, nicht doppelt.
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
  await schritt("Handy: Stopp bricht die Antwort beim Anbieter ab", handySeite, async () => {
    await handySeite.getByRole("button", { name: "Stopp" }).click();
    await handySeite.getByText("Abgebrochen. Der Text bis hierhin bleibt stehen.").waitFor();
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
    await seite
      .getByRole("complementary", { name: "Navigation" })
      .getByRole("button", { name: "Abmelden" })
      .click();
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
    await seite
      .getByRole("complementary", { name: "Navigation" })
      .getByRole("button", { name: "Abmelden" })
      .click();
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
