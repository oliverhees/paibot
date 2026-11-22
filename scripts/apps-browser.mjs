/**
 * PaiBot – prüft die Seite „Apps“ in einem echten Browser (Playwright, Chromium).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

// Prüft die Seite „Apps“ im Browser:
//
//   pnpm doku:app -- pnpm apps:browser
//
// Was geprüft wird (jede Zeile ein Fall, am Ende die Zahl der Fehler; Exit 1 bei einem Fehler):
//   - Texte einer feindlichen App (Bild, Link, Markdown, Skript) erscheinen nur als Text; der
//     Browser fragt die Bild-Adresse nie an, es entsteht kein Bild, kein Link, kein Skript läuft
//   - der Token steht nach dem Absenden nirgends mehr (Feld leer, nicht im DOM, nicht in der
//     Fehlermeldung), ging aber in der Anfrage mit
//   - ein eingefügter Befehl (`npx …`) ergibt den Hinweis und keine Anfrage
//   - der Zugriff-Schalter ruft die Route auf und zeigt einen 429 mit Ausweg
//   - Einstufen schickt den Abdruck der gezeigten Fassung
//   - auf dem Handy (390 Pixel) gibt es keinen waagerechten Balken, auch mit aufgeklappter App
// Die Antworten einzelner Routen werden für die Fälle „429“ und „Token“ im Browser ersetzt
// (page.route), damit sich Fehlerwege ohne echten MCP-Server prüfen lassen.

import { createRequire } from "node:module";
import { laufDatei, leseLauf } from "./doku/lauf.mjs";
import { geraetAlsKeks, stelleHer } from "./doku-beispieldaten.mjs";

const LAUF = laufDatei();
let lauf = leseLauf(LAUF);
if (lauf === undefined) {
  console.error(
    "Keine Lauf-Datei gefunden. Erst `pnpm doku:app` starten (oder `pnpm doku:app -- pnpm apps:browser`).",
  );
  process.exit(1);
}

async function playwright() {
  try {
    return await import("playwright");
  } catch {
    return createRequire(import.meta.url)("playwright");
  }
}

const TOKEN = "tok-Geheim-0123456789abcdef";
const BILD_HOST = "bild.beispiel.example";
let fehler = 0;
function pruefe(name, ok, detail = "") {
  if (ok) console.log(`ok     ${name}`);
  else {
    fehler += 1;
    console.log(`FEHLER ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const ergebnis = await stelleHer("mit-apps", LAUF);
for (const m of ergebnis.meldungen) console.log(`       ${m}`);
lauf = ergebnis.lauf;
const steuerung = await fetch(`${lauf.steuerung.url}/feindliche-app`, {
  method: "POST",
  headers: { authorization: `Bearer ${lauf.steuerung.token}` },
});
if (!steuerung.ok) {
  console.error(`Feindliche Beispiel-App: Steuerung antwortet ${steuerung.status}.`);
  process.exit(1);
}

const pw = await playwright();
const { chromium } = pw.chromium ? pw : pw.default;
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    viewport: { width: 1280, height: 900 },
  });
  const geraet = geraetAlsKeks(lauf);
  if (geraet) await context.addCookies([geraet]);
  const seite = await context.newPage();
  const angefragt = [];
  const meldungenAusSkript = [];
  seite.on("request", (anfrage) =>
    angefragt.push({ url: anfrage.url(), methode: anfrage.method(), koerper: anfrage.postData() }),
  );
  seite.on("pageerror", (e) => meldungenAusSkript.push(String(e)));

  await seite.goto(`${lauf.url}/anmelden`, { waitUntil: "load" });
  await seite.getByLabel("Passwort", { exact: true }).fill(lauf.passwort);
  await seite.getByRole("button", { name: "Anmelden", exact: true }).click();
  await seite.waitForURL(`${lauf.url}/`, { timeout: 15_000 });

  // 1. Feindliche App: nur Text
  await seite.goto(`${lauf.url}/apps`, { waitUntil: "load" });
  await seite.waitForSelector("main, [role='main']");
  const feindlich = seite.getByRole("button", { name: /^Werkzeuge ansehen: / }).last();
  await feindlich.click();
  await seite.waitForSelector("article");
  await seite.waitForTimeout(500);
  const app = seite.locator("li").filter({ hasText: "boese" }).first();
  pruefe(
    "feindliche App: kein Bild-Element in der Seite",
    (await seite.locator("main img").count()) === 0,
  );
  pruefe(
    "feindliche App: kein Link auf die Adresse aus der App",
    (await seite.locator(`a[href*="${BILD_HOST}"]`).count()) === 0,
  );
  pruefe(
    "feindliche App: der Browser fragt die Bild-Adresse nie an",
    !angefragt.some((a) => a.url.includes(BILD_HOST)),
    angefragt
      .filter((a) => a.url.includes(BILD_HOST))
      .map((a) => a.url)
      .join(", "),
  );
  pruefe(
    "feindliche App: Skript aus der App läuft nicht",
    (await seite.evaluate(() => window.__boese)) === undefined,
  );
  const inhalt = (await seite.locator("main").textContent()) ?? "";
  pruefe(
    "feindliche App: der Text steht als Text da (mit spitzen Klammern)",
    inhalt.includes("<img src="),
  );
  pruefe(
    "feindliche App: Markdown wird nicht gesetzt (kein <strong> aus der App)",
    (await seite.locator("main strong:text-is('fett')").count()) === 0,
  );
  void app;

  // 2. Einstufen schickt den Abdruck der gezeigten Fassung
  await seite.goto(`${lauf.url}/apps`, { waitUntil: "load" });
  await seite.getByRole("button", { name: "Werkzeuge ansehen: Notizen" }).click();
  const karte = seite.locator("article[aria-label='notizen__suche']");
  await karte.waitFor();
  const fassung = await karte.getAttribute("data-fassung");
  await karte.locator("[data-ausloeser]").click();
  await karte.getByRole("radio", { name: "Liest nur", exact: false }).click();
  const vor = angefragt.length;
  await karte.getByRole("button", { name: "Bestätigen" }).click();
  const angeboten = await seite
    .waitForSelector("article[aria-label='notizen__suche'][data-angeboten='ja']", { timeout: 8000 })
    .then(
      () => true,
      () => false,
    );
  pruefe("Einstufen: die Route nimmt es an, das Werkzeug wird danach angeboten", angeboten);
  const put = angefragt
    .slice(vor)
    .find((a) => a.methode === "PUT" && a.url.includes("/werkzeuge/"));
  const body = put?.koerper ? JSON.parse(put.koerper) : {};
  pruefe(
    "Einstufen: der Abdruck der gezeigten Fassung geht mit, die Klasse stimmt",
    body.gesehenerAbdruck === fassung && body.klasse === "lesen",
    JSON.stringify(body),
  );

  // 3. Zugriff: Route wird gerufen; 429 mit Ausweg
  const zugriffAnfragen = [];
  seite.on("request", (a) => {
    if (a.method() === "PUT" && a.url().includes("/zugriff/")) zugriffAnfragen.push(a.postData());
  });
  await seite.route("**/api/apps/*/zugriff/*", (route) =>
    route.fulfill({
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "5" },
      body: JSON.stringify({
        ok: false,
        fehler: {
          code: "limit_erreicht",
          text: "Die App wird gerade abgeglichen oder geändert.",
          ausweg: "Warte einen Moment und setze den Zugriff dann noch einmal.",
        },
      }),
    }),
  );
  await seite.getByRole("radio", { name: "darf lesen", exact: false }).first().click();
  await seite
    .getByText("Die App wird gerade abgeglichen oder geändert.")
    .waitFor({ timeout: 5000 });
  const text429 = (await seite.locator("main").textContent()) ?? "";
  pruefe(
    "Zugriff: die Route wurde mit „lesen“ gerufen",
    zugriffAnfragen.some((b) => b?.includes('"lesen"')),
  );
  pruefe(
    "Zugriff: 429 zeigt den festen Satz, den Ausweg und die Wartezeit",
    text429.includes("Warte einen Moment und setze den Zugriff dann noch einmal.") &&
      text429.includes("Versuche es in 5 Sekunden noch einmal."),
  );
  await seite.unroute("**/api/apps/*/zugriff/*");

  // 3b. Fehler stehen auch bei zugeklappter App da (Trennen, Erneut testen)
  await seite.goto(`${lauf.url}/apps`, { waitUntil: "load" });
  await seite.route("**/api/apps/*", (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    return route.fulfill({
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "5" },
      body: JSON.stringify({
        ok: false,
        fehler: {
          code: "limit_erreicht",
          text: "Die App wird gerade abgeglichen oder geändert.",
          ausweg: "Warte einen Moment und trenne sie dann noch einmal.",
        },
      }),
    });
  });
  await seite.getByRole("button", { name: "Trennen: Notizen" }).click();
  await seite
    .getByRole("alertdialog")
    .getByRole("button", { name: "Trennen", exact: true })
    .click();
  const trennenSichtbar = await seite
    .getByText("Warte einen Moment und trenne sie dann noch einmal.", { exact: false })
    .waitFor({ timeout: 5000 })
    .then(
      () => true,
      () => false,
    );
  pruefe(
    "Trennen: der Fehler (429) steht auch bei zugeklappter App da, mit Ausweg",
    trennenSichtbar,
  );
  await seite.unroute("**/api/apps/*");
  await seite.route("**/api/apps/*/werkzeuge", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "5" },
      body: JSON.stringify({
        ok: false,
        fehler: {
          code: "limit_erreicht",
          text: "Es sind zu viele Abrufe in kurzer Zeit.",
          ausweg: "Warte kurz und teste dann noch einmal.",
        },
      }),
    });
  });
  await seite.getByRole("button", { name: "Erneut testen: Notizen" }).click();
  const testenSichtbar = await seite
    .getByText("Warte kurz und teste dann noch einmal.", { exact: false })
    .waitFor({ timeout: 5000 })
    .then(
      () => true,
      () => false,
    );
  pruefe(
    "Erneut testen: der Fehler steht auch bei zugeklappter App da, mit Ausweg",
    testenSichtbar,
  );
  await seite.unroute("**/api/apps/*/werkzeuge");

  // 4. Token: nach dem Absenden nirgends mehr
  await seite.goto(`${lauf.url}/apps`, { waitUntil: "load" });
  await seite.getByRole("button", { name: "App verbinden" }).click();
  await seite.getByLabel("Adresse des Servers").fill("https://neu.beispiel.example/mcp");
  await seite.getByLabel("Token", { exact: false }).fill(TOKEN);
  await seite.route("**/api/apps", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({
      status: 502,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: false,
        fehler: {
          code: "app_nicht_erreichbar",
          text: "Die App ist nicht erreichbar.",
          ausweg: "Prüfe die Adresse.",
        },
      }),
    });
  });
  const vorToken = angefragt.length;
  await seite.getByRole("button", { name: "Verbinden", exact: true }).click();
  await seite.locator("[data-fehler='nicht_erreichbar']").waitFor({ timeout: 5000 });
  const gesendet = angefragt
    .slice(vorToken)
    .find((a) => a.methode === "POST" && a.url.endsWith("/api/apps"));
  pruefe("Token: ging in der Anfrage mit", gesendet?.koerper?.includes(TOKEN) === true);
  const feldWert = await seite.getByLabel("Token", { exact: false }).inputValue();
  pruefe("Token: das Feld ist nach dem Absenden leer", feldWert === "");
  const html = await seite.content();
  pruefe(
    "Token: steht nirgends in der Seite (auch nicht in der Fehlermeldung)",
    !html.includes(TOKEN),
  );
  await seite.unroute("**/api/apps");

  // 5. Befehl: Hinweis, keine Anfrage
  await seite.getByLabel("Adresse des Servers").fill("npx beispiel-server --port 3000");
  const vorBefehl = angefragt.length;
  await seite.getByRole("button", { name: "Verbinden", exact: true }).click();
  await seite.getByText("Lokale Befehle startet PaiBot nicht").waitFor({ timeout: 5000 });
  pruefe(
    "Befehl: Hinweis „Lokale Befehle startet PaiBot nicht“ und keine Anfrage an die Route",
    !angefragt.slice(vorBefehl).some((a) => a.methode === "POST" && a.url.endsWith("/api/apps")),
  );

  // 6. Handy: kein waagerechter Balken
  await seite.setViewportSize({ width: 390, height: 844 });
  await seite.goto(`${lauf.url}/apps`, { waitUntil: "load" });
  await seite.getByRole("button", { name: "Werkzeuge ansehen: Notizen" }).click();
  await seite.waitForSelector("article");
  await seite.waitForTimeout(300);
  const breiten = await seite.evaluate(() => ({
    fenster: window.innerWidth,
    dokument: document.documentElement.scrollWidth,
    haupt: Array.from(document.querySelectorAll("main, [role='main'], main *")).reduce(
      (m, e) => Math.max(m, e.getBoundingClientRect().right),
      0,
    ),
  }));
  pruefe(
    "Handy: kein waagerechter Balken, auch mit aufgeklappter App",
    breiten.dokument <= breiten.fenster && breiten.haupt <= breiten.fenster + 1,
    JSON.stringify(breiten),
  );
  pruefe(
    "Seite: keine Fehler aus dem Skript der Seite",
    meldungenAusSkript.length === 0,
    meldungenAusSkript.join(" | "),
  );
} finally {
  await browser.close();
}
console.log(fehler === 0 ? "Alle Fälle ok." : `${fehler} Fall/Fälle fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
