/**
 * PaiBot – Tastatur-Tests der Bausteine im echten Browser (Chromium über Playwright).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Fokus-Falle, Escape, Pfeiltasten, Rückkehr des Fokus und sichtbarer Fokus lassen sich nur in
// einem echten Browser prüfen. Die Prüfseite (seite.tsx) wird mit dem Vite-Server aus Vitest
// ausgeliefert, Chromium bedient sie über Playwright.
//
// Playwright gehört bewusst nicht zu den Abhängigkeiten des Projekts (wie bei
// scripts/doku-screenshots.mjs). Fehlt es oder sein Chromium, werden diese Tests übersprungen.
// Erzwingen: PAIBOT_BROWSER_TESTS=1 lässt sie dann fehlschlagen statt sie zu überspringen.
// Gezielt starten: `pnpm --filter @paibot/ui test:browser` (unter `pnpm test` reicht Turborepo
// NODE_PATH nicht weiter; ein global installiertes Playwright wird dort nicht gefunden).

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHROMIUM_OPTIONEN, loescheCacheOrdner, neuerCacheOrdner } from "./hilfen.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, "../../..");
const WEB = path.join(REPO, "apps/web");
const GLOBALS = path.join(WEB, "src/app/globals.css");

async function ladePlaywright() {
  try {
    return await import("playwright");
  } catch {
    // global installiert (npm i -g): ESM findet es nicht, CommonJS über NODE_PATH schon
    try {
      return createRequire(import.meta.url)("playwright");
    } catch {
      return null;
    }
  }
}

const playwright = await ladePlaywright();
const chromium = playwright ? (playwright.chromium ?? playwright.default?.chromium) : null;
const bereit = Boolean(chromium && existsSync(chromium.executablePath()));
const erzwungen = process.env.PAIBOT_BROWSER_TESTS === "1";
if (!bereit && !erzwungen) {
  console.log(
    "Tastatur-Tests übersprungen: Playwright mit Chromium nicht gefunden " +
      "(gezielt: pnpm --filter @paibot/ui test:browser).",
  );
}

function freierPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const HTML = `<!doctype html>
<html lang="de" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prüfseite</title>
<link rel="stylesheet" href="/@fs${GLOBALS}">
</head>
<body><div id="wurzel"></div><script type="module" src="/seite.tsx"></script></body>
</html>`;

describe.skipIf(!bereit && !erzwungen)("Tastatur-Bedienung im Browser", { timeout: 30_000 }, () => {
  let server;
  let cacheOrdner;
  let browser;
  let page;
  let basis;

  beforeAll(async () => {
    const { createViteServer } = await import("vitest/node");
    const web = createRequire(path.join(WEB, "package.json"));
    const port = await freierPort();
    cacheOrdner = neuerCacheOrdner();
    server = await createViteServer({
      configFile: false,
      cacheDir: cacheOrdner,
      root: HIER,
      logLevel: "error",
      server: { host: "127.0.0.1", port, strictPort: true, fs: { allow: [REPO] }, hmr: false },
      resolve: {
        // react-dom ist eine Abhängigkeit der Web-App; die Bausteine selbst brauchen es nicht.
        alias: { "react-dom/client": web.resolve("react-dom/client") },
        dedupe: ["react", "react-dom"],
      },
      // Alle Abhängigkeiten vorab bündeln, damit beim ersten Laden nichts nachgeladen wird
      // (sonst entstehen zwei Kopien von React).
      optimizeDeps: {
        entries: ["seite.tsx"],
        include: [
          "react",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
          "react-dom/client",
          "react-markdown",
          "remark-gfm",
        ],
      },
      plugins: [
        {
          name: "pruefseite",
          configureServer(s) {
            s.middlewares.use(async (req, res, next) => {
              if (req.url !== "/" && !req.url?.startsWith("/?")) return next();
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.end(await s.transformIndexHtml(req.url, HTML));
            });
          },
        },
      ],
    });
    await server.listen();
    basis = `http://127.0.0.1:${port}`;
    browser = await chromium.launch(CHROMIUM_OPTIONEN);
    // Einmal laden, damit Vite fertig gebündelt hat, bevor die Tests zählen.
    const fehler = await oeffne();
    if (fehler.length > 0) await oeffne();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
    loescheCacheOrdner(cacheOrdner);
  });

  /** Neue Seite in gegebener Größe, wartet auf React. */
  async function oeffne(pfad = "/", groesse = { width: 1280, height: 900 }) {
    await page?.close();
    page = await browser.newPage({ viewport: groesse, reducedMotion: "reduce" });
    const fehler = [];
    page.on("pageerror", (e) => fehler.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") fehler.push(m.text());
    });
    await page.goto(`${basis}${pfad}`);
    await page.waitForSelector("#wurzel > *", { timeout: 60_000 });
    return fehler;
  }

  /** Kurze Beschreibung des fokussierten Elements. */
  const fokus = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return "body";
      if (el.id && !/^[«:_r]/.test(el.id)) return `#${el.id}`;
      const rolle = el.getAttribute("role") ?? el.tagName.toLowerCase();
      const name = el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
      return `${rolle}:${name}`;
    });

  /** Liegt der Fokus im Element mit diesem Selektor? */
  const fokusIn = (selektor) =>
    page.evaluate(
      (s) => Boolean(document.querySelector(s)?.contains(document.activeElement)),
      selektor,
    );

  async function tabs(anzahl, umschalt = false) {
    const wege = [];
    for (let i = 0; i < anzahl; i++) {
      await page.keyboard.press(umschalt ? "Shift+Tab" : "Tab");
      wege.push(await fokus());
    }
    return wege;
  }

  it("Tab-Reihenfolge folgt dem Aufbau; Reiter sind ein einziger Tab-Halt", async () => {
    const fehler = await oeffne();
    await page.focus("#vorher");
    expect(await tabs(8)).toEqual([
      "#dialog-auf",
      "#blatt-auf",
      "button:Weitere Aktionen",
      "tab:Eins",
      "#schalter",
      "#auswahl",
      "#feld",
      "#nachher",
    ]);
    expect(await tabs(8, true)).toEqual([
      "#feld",
      "#auswahl",
      "#schalter",
      "tab:Eins",
      "button:Weitere Aktionen",
      "#blatt-auf",
      "#dialog-auf",
      "#vorher",
    ]);
    expect(fehler).toEqual([]);
  });

  it("jedes per Tab erreichte Element zeigt den Fokus-Ring in --focus (mind. 2px), Eingabefelder die Akzent-Linie mit Schein", async () => {
    await oeffne();
    await page.focus("#vorher");
    const ohneRing = [];
    for (let i = 0; i < 9; i++) {
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        const stil = getComputedStyle(el);
        const feld = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== "checkbox";
        const probe = document.createElement("span");
        probe.style.color = feld ? "var(--fokus-feld)" : "var(--focus)";
        document.body.append(probe);
        const soll = getComputedStyle(probe).color;
        probe.remove();
        return {
          sichtbar: el.matches(":focus-visible"),
          stil: stil.outlineStyle,
          breite: Number.parseFloat(stil.outlineWidth),
          mindest: feld ? 1 : 2,
          schein: feld ? stil.boxShadow !== "none" : true,
          farbe: stil.outlineColor,
          soll,
        };
      });
      const name = await fokus();
      if (
        !info.sichtbar ||
        info.stil === "none" ||
        info.breite < info.mindest ||
        !info.schein ||
        info.farbe !== info.soll
      ) {
        ohneRing.push(`${name}: ${JSON.stringify(info)}`);
      }
      await page.keyboard.press("Tab");
    }
    expect(ohneRing).toEqual([]);
  });

  it("Dialog: Fokus auf das markierte Feld, Tab bleibt darin, Escape schließt, Fokus kehrt zurück", async () => {
    await oeffne();
    await page.focus("#dialog-auf");
    await page.keyboard.press("Enter");
    await page.waitForSelector("[role=dialog]");
    expect(await page.getAttribute("[role=dialog]", "aria-modal")).toBe("true");
    expect(await fokus()).toBe("#dialog-titel");
    const vor = await tabs(4);
    expect(vor).toEqual(["#dialog-abbrechen", "#dialog-ok", "button:Schließen", "#dialog-titel"]);
    const zurueck = await tabs(2, true);
    expect(zurueck).toEqual(["button:Schließen", "#dialog-ok"]);
    await page.keyboard.press("Escape");
    expect(await page.$("[role=dialog]")).toBeNull();
    expect(await fokus()).toBe("#dialog-auf");
  });

  it("Dialog: Schließen-Knopf und Aktion geben den Fokus ebenfalls zurück", async () => {
    await oeffne();
    await page.focus("#dialog-auf");
    await page.keyboard.press("Enter");
    await page.waitForSelector("[role=dialog]");
    await tabs(2);
    expect(await fokus()).toBe("#dialog-ok");
    await page.keyboard.press("Enter");
    expect(await page.$("[role=dialog]")).toBeNull();
    expect(await fokus()).toBe("#dialog-auf");
  });

  it("Blatt: Fokus-Falle, Escape und Rückkehr des Fokus", async () => {
    await oeffne("/", { width: 390, height: 800 });
    await page.focus("#blatt-auf");
    await page.keyboard.press("Space");
    await page.waitForSelector("[role=dialog]");
    expect(await fokus()).toBe("button:Schließen");
    const wege = await tabs(5);
    expect(wege).toEqual([
      "#blatt-ok",
      "button:Schließen",
      "#blatt-ok",
      "button:Schließen",
      "#blatt-ok",
    ]);
    await page.keyboard.press("Escape");
    expect(await page.$("[role=dialog]")).toBeNull();
    expect(await fokus()).toBe("#blatt-auf");
  });

  it("Menü: Pfeiltasten (gesperrter Eintrag übersprungen), Pos1/Ende, Enter, Escape, Fokus zurück", async () => {
    await oeffne();
    const knopf = "button[aria-haspopup=menu]";
    await page.focus(knopf);
    await page.keyboard.press("ArrowDown");
    await page.waitForSelector("[role=menu]");
    expect(await page.getAttribute(knopf, "aria-expanded")).toBe("true");
    expect(await fokus()).toBe("menuitem:Umbenennen");
    await page.keyboard.press("ArrowDown");
    expect(await fokus()).toBe("menuitem:Löschen");
    await page.keyboard.press("ArrowDown");
    expect(await fokus()).toBe("menuitem:Umbenennen");
    await page.keyboard.press("End");
    expect(await fokus()).toBe("menuitem:Löschen");
    await page.keyboard.press("Home");
    expect(await fokus()).toBe("menuitem:Umbenennen");
    await page.keyboard.press("Escape");
    expect(await page.$("[role=menu]")).toBeNull();
    expect(await fokus()).toBe("button:Weitere Aktionen");
    expect(await page.getAttribute(knopf, "aria-expanded")).toBe("false");

    await page.keyboard.press("ArrowUp");
    expect(await fokus()).toBe("menuitem:Löschen");
    await page.keyboard.press("Enter");
    expect(await page.$("[role=menu]")).toBeNull();
    expect(await page.textContent("#protokoll")).toBe("gewählt: c");
    expect(await fokus()).toBe("button:Weitere Aktionen");

    // Tab schließt das Menü und geht weiter
    await page.keyboard.press("Enter");
    await page.waitForSelector("[role=menu]");
    await page.keyboard.press("Tab");
    expect(await page.$("[role=menu]")).toBeNull();
  });

  it("Reiter: Pfeiltasten wechseln und fokussieren, im Kreis, Pos1/Ende", async () => {
    await oeffne();
    await page.focus("[role=tab][aria-selected=true]");
    await page.keyboard.press("ArrowRight");
    expect(await fokus()).toBe("tab:Zwei");
    expect(await page.getAttribute("[role=tab]:focus", "aria-selected")).toBe("true");
    expect(await page.textContent("[role=tabpanel]")).toBe("Inhalt zwei");
    await page.keyboard.press("End");
    expect(await fokus()).toBe("tab:Drei");
    await page.keyboard.press("ArrowRight");
    expect(await fokus()).toBe("tab:Eins");
    await page.keyboard.press("ArrowLeft");
    expect(await fokus()).toBe("tab:Drei");
    await page.keyboard.press("Home");
    expect(await fokus()).toBe("tab:Eins");
    // Hoch/Runter gehören nicht zu waagrechten Reitern
    await page.keyboard.press("ArrowDown");
    expect(await fokus()).toBe("tab:Eins");
    const panel = await page.getAttribute("[role=tabpanel]", "aria-labelledby");
    expect(panel).toBe(await page.getAttribute("[role=tab][aria-selected=true]", "id"));
  });

  it("Schalter: Leertaste und Enter schalten um", async () => {
    await oeffne();
    await page.focus("#schalter");
    expect(await page.getAttribute("#schalter", "aria-checked")).toBe("false");
    await page.keyboard.press("Space");
    expect(await page.getAttribute("#schalter", "aria-checked")).toBe("true");
    await page.keyboard.press("Enter");
    expect(await page.getAttribute("#schalter", "aria-checked")).toBe("false");
  });

  it("Auswahl: Pfeiltasten ändern den Wert, das Feld hat ein Label", async () => {
    await oeffne();
    await page.focus("#auswahl");
    await page.keyboard.press("ArrowDown");
    expect(await page.inputValue("#auswahl")).toBe("b");
    expect(await page.textContent("label[for=auswahl]")).toBe("Modell");
  });

  it("AppShell am Handy: Menü ist zu nicht erreichbar, offen eine Fokus-Falle, Escape gibt den Fokus zurück", async () => {
    const fehler = await oeffne("/?ansicht=shell", { width: 390, height: 800 });
    const leiste = "aside[aria-label=Navigation]";
    await page.waitForSelector("button[aria-label='Menü öffnen']");
    // Zu: Tab erreicht nichts in der Navigation
    await page.focus("button[aria-label='Menü öffnen']");
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      expect(await fokusIn(leiste)).toBe(false);
    }
    await page.focus("button[aria-label='Menü öffnen']");
    await page.keyboard.press("Enter");
    await page.waitForSelector(`${leiste}[role=dialog][aria-modal=true]`);
    expect(await fokusIn(leiste)).toBe(true);
    const wege = await tabs(14);
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press(i % 2 ? "Tab" : "Shift+Tab");
      expect(await fokusIn(leiste)).toBe(true);
    }
    expect(new Set(wege).size).toBeGreaterThan(4);
    await page.keyboard.press("Escape");
    await page.waitForSelector(`${leiste}:not([role=dialog])`, { state: "attached" });
    expect(await fokus()).toBe("button:Menü öffnen");
    expect(fehler).toEqual([]);
  });

  it("AppShell am Handy: Arbeitsfläche als Blatt mit Fokus-Falle, Escape gibt den Fokus zurück", async () => {
    await oeffne("/?ansicht=shell", { width: 390, height: 800 });
    const knopf = "button[aria-label='Arbeitsfläche zeigen']";
    const flaeche = "aside[aria-label=Arbeitsfläche]";
    await page.waitForSelector(knopf);
    await page.focus(knopf);
    await page.keyboard.press("Enter");
    await page.waitForSelector(`${flaeche}[role=dialog][aria-modal=true]`);
    expect(await fokusIn(flaeche)).toBe(true);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      expect(await fokusIn(flaeche)).toBe(true);
    }
    await page.keyboard.press("Escape");
    expect(await page.$(flaeche)).toBeNull();
    expect(await fokus()).toBe("button:Arbeitsfläche zeigen");
  });

  it("AppShell breit: Menü „Du“ über dem Knopf – Enter öffnet, Pfeiltasten auch über Links, Escape gibt den Fokus zurück", async () => {
    const fehler = await oeffne("/?ansicht=shell", { width: 1200, height: 800 });
    await page.focus("[data-du]");
    expect(await page.getAttribute("[data-du]", "aria-haspopup")).toBe("menu");
    await page.keyboard.press("Enter");
    await page.waitForSelector("[role=menu]");
    expect(await page.getAttribute("[data-du]", "aria-expanded")).toBe("true");
    expect(await fokus()).toBe("menuitem:ZugangPasswort");
    // Das Menü öffnet nach oben und bleibt im Fenster.
    const [menue, knopf] = await Promise.all([
      page.locator("[role=menu]").boundingBox(),
      page.locator("[data-du]").boundingBox(),
    ]);
    expect(menue.y + menue.height).toBeLessThanOrEqual(knopf.y);
    expect(menue.y).toBeGreaterThanOrEqual(0);
    await page.keyboard.press("ArrowDown");
    expect(await fokus()).toBe("menuitem:Dokumentation (öffnet in einem neuen Tab)");
    const link = await page.evaluate(() => {
      const a = document.activeElement;
      return {
        href: a.getAttribute("href"),
        target: a.getAttribute("target"),
        rel: a.getAttribute("rel"),
      };
    });
    expect(link).toEqual({
      href: "https://paibot.de/doku",
      target: "_blank",
      rel: "noopener noreferrer",
    });
    await page.keyboard.press("End");
    expect(await fokus()).toBe("menuitem:Abmelden");
    await page.keyboard.press("Escape");
    expect(await page.$("[role=menu]")).toBeNull();
    expect(await fokus()).toBe("button:Du");
    await page.keyboard.press(" ");
    await page.waitForSelector("[role=menu]");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    expect(await page.textContent("#protokoll")).toBe("du: abmelden");
    expect(fehler).toEqual([]);
  });

  it("AppShell am Handy: Escape im Menü „Du“ schließt nur dieses Menü, das Menü der Seitenleiste bleibt offen", async () => {
    await oeffne("/?ansicht=shell", { width: 390, height: 800 });
    const leiste = "aside[aria-label=Navigation]";
    await page.focus("button[aria-label='Menü öffnen']");
    await page.keyboard.press("Enter");
    await page.waitForSelector(`${leiste}[role=dialog]`);
    await page.focus("[data-du]");
    await page.keyboard.press("Enter");
    await page.waitForSelector("[role=menu]");
    await page.keyboard.press("Escape");
    expect(await page.$("[role=menu]")).toBeNull();
    expect(await page.$(`${leiste}[role=dialog]`)).not.toBeNull();
    expect(await fokus()).toBe("button:Du");
    await page.keyboard.press("Escape");
    await page.waitForSelector(`${leiste}:not([role=dialog])`, { state: "attached" });
  });

  it("AppShell breit: Werkzeuge per Tastatur ein- und ausklappen (aria-expanded)", async () => {
    await oeffne("/?ansicht=shell", { width: 1200, height: 800 });
    const knopf = "button[aria-controls][aria-expanded]:has-text('Werkzeuge')";
    await page.focus(knopf);
    expect(await page.getAttribute(knopf, "aria-expanded")).toBe("true");
    await page.keyboard.press("Enter");
    expect(await page.getAttribute(knopf, "aria-expanded")).toBe("false");
    expect(await page.isVisible("a[href='#belege']")).toBe(false);
    await page.keyboard.press(" ");
    expect(await page.getAttribute(knopf, "aria-expanded")).toBe("true");
    expect(await page.isVisible("a[href='#belege']")).toBe(true);
  });

  it("AppShell breit: Arbeitsfläche ohne Falle, Escape schließt und gibt den Fokus zurück", async () => {
    await oeffne("/?ansicht=shell", { width: 1000, height: 800 });
    const knopf = "button[aria-label='Arbeitsfläche zeigen']";
    const flaeche = "aside[aria-label=Arbeitsfläche]";
    await page.focus(knopf);
    await page.keyboard.press("Enter");
    await page.waitForSelector(flaeche);
    expect(await page.getAttribute(flaeche, "role")).toBeNull();
    expect(await fokusIn(flaeche)).toBe(true);
    await page.keyboard.press("Escape");
    expect(await page.$(flaeche)).toBeNull();
    expect(await fokus()).toBe("button:Arbeitsfläche zeigen");
  });
});
