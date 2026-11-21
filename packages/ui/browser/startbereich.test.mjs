/**
 * PaiBot – Browser-Tests des Startbereichs: Bedienung, Maße bei 1440, 1024 und 390 Pixel.
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
    "Startbereich-Browser-Tests übersprungen: Playwright mit Chromium nicht gefunden " +
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
<body><div id="wurzel"></div><script type="module" src="/startbereich-seite.tsx"></script></body>
</html>`;

describe.skipIf(!bereit && !erzwungen)("Startbereich im Browser", { timeout: 30_000 }, () => {
  let server;
  let cacheOrdner;
  let browser;
  let page;
  let basis;
  let anfragen = [];

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
        entries: ["startbereich-seite.tsx"],
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

  /** Neue Seite; `reduziert` schaltet „weniger Bewegung“ ein oder aus. */
  async function oeffne(abfrage = "", groesse = { width: 1440, height: 900 }, reduziert = true) {
    await page?.close();
    page = await browser.newPage({
      viewport: groesse,
      reducedMotion: reduziert ? "reduce" : "no-preference",
    });
    const fehler = [];
    anfragen = [];
    page.on("pageerror", (e) => fehler.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") fehler.push(m.text());
    });
    page.on("request", (r) => anfragen.push(r.url()));
    await page.goto(`${basis}/?${abfrage}`);
    await page.waitForSelector("#wurzel [data-fassung], #wurzel [data-notaus]", {
      timeout: 60_000,
    });
    await page.waitForLoadState("networkidle");
    anfragen = [];
    return fehler;
  }

  const fokus = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return "body";
      if (el.tagName === "TEXTAREA") return "textarea";
      return el.textContent?.trim() || el.getAttribute("aria-label") || el.tagName;
    });

  const ereignisse = () => page.evaluate(() => window.__ereignisse);

  const FASSUNGEN = ["begruessung", "startbrett", "stille"];
  const GROESSEN = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ];

  /** Nichts ragt über den Rand: weder die Seite noch ein Element im Startbereich noch der Verlauf. */
  async function ueberlauf() {
    return page.evaluate(() => {
      const breite = document.documentElement.clientWidth;
      const probleme = [];
      if (document.documentElement.scrollWidth > breite) {
        probleme.push(`Seite ${document.documentElement.scrollWidth} > ${breite}`);
      }
      const verlauf = document.querySelector("[role=log]");
      if (verlauf && verlauf.scrollWidth > verlauf.clientWidth) {
        probleme.push(`Verlauf ${verlauf.scrollWidth} > ${verlauf.clientWidth}`);
      }
      const wurzeln = [...document.querySelectorAll("[data-fassung], [data-notaus]")];
      const sitz =
        document.querySelector("[data-offen]") ?? document.querySelector("[class*=sitz]");
      if (sitz) wurzeln.push(sitz);
      for (const w of wurzeln) {
        for (const el of [w, ...w.querySelectorAll("*")]) {
          const stil = getComputedStyle(el);
          if (stil.display === "none" || stil.visibility === "hidden") continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          if (r.left < -0.5 || r.right > breite + 0.5) {
            probleme.push(
              `${el.tagName}.${String(el.className).slice(0, 30)} ${Math.round(r.left)}..${Math.round(r.right)}`,
            );
          }
          // Text darf nicht aus seinem Kasten laufen
          if (
            el.children.length === 0 &&
            el.scrollWidth > el.clientWidth + 1 &&
            stil.overflow === "visible"
          ) {
            probleme.push(`Text läuft über: ${el.textContent?.slice(0, 30)}`);
          }
        }
      }
      return probleme;
    });
  }

  for (const fassung of FASSUNGEN) {
    for (const g of GROESSEN) {
      for (const thema of ["dunkel", "hell"]) {
        it(`${fassung} ${g.width} px ${thema}: nichts läuft über`, async () => {
          const fehler = await oeffne(`fassung=${fassung}&thema=${thema}`, g);
          expect(await ueberlauf()).toEqual([]);
          expect(fehler).toEqual([]);
        });
      }
    }

    it(`${fassung}: bei 390 px läuft auch ein sehr langer Modellname und Not-Aus nicht über`, async () => {
      const lang = "Ein-sehr-langer-Modellname-ohne-Leerzeichen-der-nicht-in-die-Zeile-passt-2026";
      await oeffne(`fassung=${fassung}&modell=${lang}`, GROESSEN[2]);
      expect(await ueberlauf()).toEqual([]);
      await oeffne(`fassung=${fassung}&notaus=1`, GROESSEN[2]);
      expect(await ueberlauf()).toEqual([]);
    });
  }

  it("dieselben Bilder auch mit allen Angaben fehlend bei 390 px ohne Überlauf", async () => {
    for (const fassung of FASSUNGEN) {
      await oeffne(`fassung=${fassung}&ohne=1`, GROESSEN[2]);
      expect(await ueberlauf(), fassung).toEqual([]);
    }
  });

  const ANFAENGE = {
    begruessung: [
      [
        "Freundliche Terminabsage",
        "Schreib mir eine freundliche Absage für einen Termin am Donnerstag.",
      ],
      ["Text kürzer und klarer", "Mach diesen Text kürzer und klarer: "],
      ["Meine Woche planen", "Hilf mir, meine Woche zu planen. Das steht an: "],
      [
        "Aufgaben sortieren",
        "Sortier diese Aufgaben nach Wichtigkeit und sag mir, womit ich anfange: ",
      ],
      ["Einfach erklärt bekommen", "Erklär mir in einfachen Worten, was das bedeutet: "],
      ["Für und Wider abwägen", "Was spricht dafür und was dagegen? Es geht um: "],
    ],
  };

  it("Begrüßung: Wahl eines Anfangs ruft den Rückruf mit genau dem Text und füllt das Feld", async () => {
    for (const [label, text] of ANFAENGE.begruessung) {
      await oeffne("fassung=begruessung");
      await page.click(`[data-fassung] button:has-text("${label}")`);
      expect(await ereignisse(), label).toEqual([`anfang:${text}`]);
      expect(await page.inputValue("textarea"), label).toBe(text);
      expect(await fokus()).toBe("textarea");
    }
  });

  it("Startbrett: jede Karte ruft den Rückruf mit genau ihrem Text; „Zuletzt“ öffnet die Unterhaltung", async () => {
    await oeffne("fassung=startbrett");
    const erwartet = [
      [
        "Schreib mir eine freundliche Absage für einen Termin am Donnerstag.",
        "Schreib mir eine freundliche Absage für einen Termin am Donnerstag.",
      ],
      ["Mach diesen Text kürzer und klarer", "Mach diesen Text kürzer und klarer: "],
      ["Formulier diese Mail höflicher", "Formulier diese Mail höflicher, aber bestimmt: "],
      ["Hilf mir, meine Woche zu planen", "Hilf mir, meine Woche zu planen. Das steht an: "],
      ["Sortier diese Aufgaben nach Wichtigkeit", "Sortier diese Aufgaben nach Wichtigkeit: "],
      ["Erklär mir in einfachen Worten", "Erklär mir in einfachen Worten, was das bedeutet: "],
      ["Was spricht dafür, was dagegen", "Was spricht dafür und was dagegen? Es geht um: "],
    ];
    for (const [anfang, text] of erwartet) {
      await oeffne("fassung=startbrett");
      await page.click(`[data-fassung] button:has-text("${anfang}")`);
      expect(await ereignisse(), anfang).toEqual([`anfang:${text}`]);
    }
    await oeffne("fassung=startbrett");
    await page.click('[data-karte=zuletzt] button:has-text("Wochenplan sortieren")');
    expect(await ereignisse()).toEqual(["unterhaltung:u2"]);
  });

  it("Stille: ein Anfang aus der Liste ruft den Rückruf und schließt die Liste", async () => {
    const erwartet = [
      ["Terminabsage", "Schreib mir eine freundliche Absage für einen Termin am Donnerstag."],
      ["Text kürzen", "Mach diesen Text kürzer und klarer: "],
      ["meine Woche", "Hilf mir, meine Woche zu planen. Das steht an: "],
      ["einfach erklärt", "Erklär mir in einfachen Worten, was das bedeutet: "],
    ];
    for (const [anfang, text] of erwartet) {
      await oeffne("fassung=stille&offen=1");
      await page.click(`[data-anfaenge] button:has-text("${anfang}")`, { timeout: 5000 });
      expect(await ereignisse(), anfang).toEqual([`anfang:${text}`]);
      expect(await page.inputValue("textarea")).toBe(text);
      expect(await page.isVisible("[data-anfaenge]")).toBe(false);
    }
  });

  it("Begrüßung: Tab-Reihenfolge = Reihenfolge der Spalten, Umschalt+Tab zurück", async () => {
    await oeffne("fassung=begruessung");
    await page.focus('[data-fassung] button:has-text("Freundliche Terminabsage")');
    const vor = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      vor.push(await fokus());
    }
    expect(vor).toEqual([
      "Text kürzer und klarer",
      "Meine Woche planen",
      "Aufgaben sortieren",
      "Einfach erklärt bekommen",
      "Für und Wider abwägen",
    ]);
    await page.keyboard.press("Tab");
    expect(await fokus()).not.toBe("Für und Wider abwägen");
    const zurueck = [];
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press("Shift+Tab");
      zurueck.push(await fokus());
    }
    expect(zurueck).toEqual(["Für und Wider abwägen", "Einfach erklärt bekommen"]);
  });

  it("Startbrett: Tab geht Karte für Karte, dann „Zuletzt“", async () => {
    await oeffne("fassung=startbrett");
    await page.focus("[data-karte=schreiben] button");
    const wege = [];
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press("Tab");
      wege.push(await fokus());
    }
    expect(wege.slice(0, 6)).toEqual([
      "Mach diesen Text kürzer und klarer …",
      "Formulier diese Mail höflicher …",
      "Hilf mir, meine Woche zu planen …",
      "Sortier diese Aufgaben nach Wichtigkeit …",
      "Erklär mir in einfachen Worten …",
      "Was spricht dafür, was dagegen …",
    ]);
    expect(wege[6]).toContain("Antwort an Max Mustermann");
    expect(wege[7]).toContain("Wochenplan sortieren");
    expect(wege[8]).toContain("Ideen für den Newsletter");
  });

  it("Enter und Leertaste wählen einen Anfang, in jeder Fassung", async () => {
    for (const [fassung, knopf, taste] of [
      ["begruessung", 'button:has-text("Meine Woche planen")', "Enter"],
      ["begruessung", 'button:has-text("Aufgaben sortieren")', "Space"],
      ["startbrett", 'button:has-text("Erklär mir in einfachen Worten")', "Enter"],
      ["startbrett", 'button:has-text("Formulier diese Mail höflicher")', "Space"],
    ]) {
      await oeffne(`fassung=${fassung}`);
      await page.focus(`[data-fassung] ${knopf}`);
      await page.keyboard.press(taste);
      const e = await ereignisse();
      expect(e, `${fassung} ${taste}`).toHaveLength(1);
      expect(e[0].startsWith("anfang:")).toBe(true);
    }
    for (const taste of ["Enter", "Space"]) {
      await oeffne("fassung=stille&offen=1");
      await page.keyboard.press("Shift+Tab"); // letzter Anfang
      expect(await fokus()).toContain("einfach erklärt");
      await page.keyboard.press(taste);
      expect(await ereignisse(), taste).toEqual([
        "anfang:Erklär mir in einfachen Worten, was das bedeutet: ",
      ]);
    }
  });

  it("jeder Anfang zeigt beim Tab-Fokus einen Ring in der Akzentfarbe (2 px)", async () => {
    for (const fassung of FASSUNGEN) {
      for (const thema of ["dunkel", "hell"]) {
        await oeffne(`fassung=${fassung}&thema=${thema}&offen=${fassung === "stille" ? 1 : 0}`);
        if (fassung !== "stille") await page.focus("[data-fassung] button");
        else await page.keyboard.press("Shift+Tab");
        const info = await page.evaluate(() => {
          const el = document.activeElement;
          const stil = getComputedStyle(el);
          const probe = document.createElement("span");
          probe.style.color = "var(--fokus-feld)";
          document.body.append(probe);
          const soll = getComputedStyle(probe).color;
          probe.remove();
          return {
            tag: el.tagName,
            sichtbar: el.matches(":focus-visible"),
            stil: stil.outlineStyle,
            breite: Number.parseFloat(stil.outlineWidth),
            farbe: stil.outlineColor,
            soll,
          };
        });
        const wo = `${fassung} ${thema}`;
        expect(info.tag, wo).toBe("BUTTON");
        expect(info.sichtbar, wo).toBe(true);
        expect(info.stil, wo).toBe("solid");
        expect(info.breite, wo).toBeGreaterThanOrEqual(2);
        expect(info.farbe, wo).toBe(info.soll);
      }
    }
  });

  it("Stille: Anfänge erscheinen erst mit Fokus im Feld; Esc schließt und der Fokus bleibt im Feld", async () => {
    await oeffne("fassung=stille");
    expect(await page.locator("[data-anfaenge]").count()).toBe(1); // vorhanden, nur verborgen
    expect(await page.isVisible("[data-anfaenge]")).toBe(false);
    expect(await page.isVisible("text=Klick ins Feld, dann zeig ich dir ein paar Anfänge.")).toBe(
      true,
    );
    await page.focus("textarea");
    expect(await page.isVisible("[data-anfaenge]")).toBe(true);
    expect(await page.isVisible("text=Klick ins Feld")).toBe(false);
    await page.keyboard.press("Escape");
    expect(await page.isVisible("[data-anfaenge]")).toBe(false);
    expect(await page.isVisible("text=Klick ins Feld")).toBe(true);
    expect(await fokus()).toBe("textarea");
  });

  it("Stille: Esc aus einem Anfang heraus schließt die Liste und springt ins Feld", async () => {
    await oeffne("fassung=stille&offen=1");
    await page.keyboard.press("Shift+Tab");
    expect(await fokus()).toContain("einfach erklärt");
    await page.keyboard.press("Escape");
    expect(await page.isVisible("[data-anfaenge]")).toBe(false);
    expect(await fokus()).toBe("textarea");
  });

  it("Stille: Tippen schließt die Liste, leeres Feld öffnet sie wieder; Verlassen schließt sie", async () => {
    await oeffne("fassung=stille&offen=1");
    await page.keyboard.type("Hallo");
    expect(await page.isVisible("[data-anfaenge]")).toBe(false);
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    expect(await page.isVisible("[data-anfaenge]")).toBe(true);
    await page.focus("a[href='#neu']");
    expect(await page.isVisible("[data-anfaenge]")).toBe(false);
  });

  it("Stille: Umschalt+Tab vom Feld erreicht die Anfänge, Tab geht zurück ins Feld", async () => {
    await oeffne("fassung=stille&offen=1");
    const rueck = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Shift+Tab");
      rueck.push(await fokus());
    }
    expect(rueck).toEqual([
      "Verstehen einfach erklärt",
      "Planen meine Woche",
      "Schreiben Text kürzen",
      "Schreiben Terminabsage",
    ]);
    expect(await page.isVisible("[data-anfaenge]")).toBe(true);
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
    expect(await fokus()).toBe("textarea");
  });

  it("Stille: Sprechblase und Anfänge enden nie weiter rechts als das Eingabefeld", async () => {
    for (const g of GROESSEN) {
      for (const offen of [0, 1]) {
        await oeffne(`fassung=stille&offen=${offen}`, g);
        const rechts = await page.evaluate(() => {
          const feld = document.querySelector("textarea").closest("form, [class*=eingabe]");
          const grenze = feld.getBoundingClientRect().right;
          const ziel = [...document.querySelectorAll("[data-anfaenge] li, [class*=tipp]")].filter(
            (el) => el.getClientRects().length > 0,
          );
          return {
            grenze,
            mehr: ziel
              .map((el) => el.getBoundingClientRect().right)
              .filter((r) => r > grenze + 0.5),
          };
        });
        expect(rechts.mehr, `${g.width} offen=${offen}`).toEqual([]);
      }
    }
  });

  it("Esc tut ohne offene Liste nichts (kein Fokussprung)", async () => {
    await oeffne("fassung=stille&offen=1");
    await page.keyboard.type("x");
    await page.focus("a[href='#neu']");
    await page.keyboard.press("Escape");
    expect(await fokus()).not.toBe("textarea");
  });

  for (const fassung of FASSUNGEN) {
    it(`${fassung}: bei Not-Aus nur der Hinweis, nichts zum Anklicken, Feld gesperrt`, async () => {
      const fehler = await oeffne(`fassung=${fassung}&notaus=1`);
      expect(await page.isVisible("text=Alle Bots sind angehalten.")).toBe(true);
      expect(await page.locator("[data-notaus] button").count()).toBe(0);
      expect(await page.locator("[data-fassung]").count()).toBe(0);
      expect(await page.isDisabled("textarea")).toBe(true);
      expect(await page.locator("[data-anfaenge]").count()).toBe(0);
      expect(await page.isVisible("text=Klick ins Feld")).toBe(false);
      expect(fehler).toEqual([]);
    });
  }

  it("macht keine Netz-Anfrage, auch nicht beim Bedienen", async () => {
    for (const fassung of FASSUNGEN) {
      await oeffne(`fassung=${fassung}&offen=${fassung === "stille" ? 1 : 0}`);
      if (fassung === "stille") await page.click("[data-anfaenge] button >> nth=1");
      else await page.click("[data-fassung] button >> nth=1");
      await page.waitForTimeout(300);
      expect(anfragen, fassung).toEqual([]);
    }
  });

  it("zeigt keinen gestrichelten Kasten", async () => {
    for (const fassung of FASSUNGEN) {
      await oeffne(`fassung=${fassung}&offen=${fassung === "stille" ? 1 : 0}`);
      const gestrichelt = await page.evaluate(() =>
        [...document.querySelectorAll("[data-fassung], [data-fassung] *, [class*=sitz] *")]
          .filter((el) =>
            /dashed|dotted/.test(
              getComputedStyle(el).borderStyle + getComputedStyle(el).outlineStyle,
            ),
          )
          .map((el) => el.className),
      );
      expect(gestrichelt, fassung).toEqual([]);
    }
  });

  it("weniger Bewegung: keine Übergänge und keine Animation; sonst gibt es sie", async () => {
    const lies = () =>
      page.evaluate(() => {
        const knopf = document.querySelector("[data-fassung] button");
        const stil = getComputedStyle(knopf);
        const symbol = knopf.querySelector("svg");
        return {
          knopf: stil.transitionDuration,
          symbol: symbol ? getComputedStyle(symbol).transitionDuration : "0s",
          animation: [...document.querySelectorAll("[data-fassung] *")].some(
            (el) => getComputedStyle(el).animationName !== "none",
          ),
        };
      });
    for (const fassung of ["begruessung", "startbrett"]) {
      await oeffne(`fassung=${fassung}`, GROESSEN[0], true);
      const ruhig = await lies();
      expect(ruhig.knopf, fassung).toBe("0s");
      expect(ruhig.symbol, fassung).toBe("0s");
      expect(ruhig.animation, fassung).toBe(false);
      await oeffne(`fassung=${fassung}`, GROESSEN[0], false);
      const normal = await lies();
      expect(normal.knopf, fassung).not.toBe("0s");
    }
    // Im Ruhezustand bewegt sich der Pfeil beim Überfahren nicht
    await oeffne("fassung=begruessung", GROESSEN[0], true);
    await page.hover('[data-fassung] button:has-text("Meine Woche planen")');
    const versatz = await page.evaluate(
      () => getComputedStyle(document.querySelector("[data-fassung] button:hover svg")).transform,
    );
    expect(versatz).toBe("none");
  });

  /** Kontrast (WCAG) aller Texte im Startbereich gegen ihren tatsächlichen Hintergrund. */
  async function kontraste() {
    return page.evaluate(() => {
      const kanaele = (farbe) => {
        const m = farbe.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const [r, g, b, a = 1] = m[1]
          .split(/[ ,/]+/)
          .filter(Boolean)
          .map(Number);
        return { r, g, b, a };
      };
      const hell = ({ r, g, b }) => {
        const f = (v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const mische = (oben, unten) => ({
        r: oben.r * oben.a + unten.r * (1 - oben.a),
        g: oben.g * oben.a + unten.g * (1 - oben.a),
        b: oben.b * oben.a + unten.b * (1 - oben.a),
        a: 1,
      });
      const grund = (el) => {
        const ketten = [];
        for (let e = el; e; e = e.parentElement) {
          const c = kanaele(getComputedStyle(e).backgroundColor);
          if (c && c.a > 0) ketten.push(c);
          if (c && c.a === 1) break;
        }
        let aktuell = { r: 14, g: 14, b: 16, a: 1 };
        const wurzel = kanaele(getComputedStyle(document.body).backgroundColor);
        if (wurzel && wurzel.a > 0) aktuell = wurzel;
        for (const c of ketten.reverse()) aktuell = mische(c, aktuell);
        return aktuell;
      };
      const ergebnisse = [];
      for (const w of document.querySelectorAll("[data-fassung], [data-notaus], [class*=sitz]")) {
        for (const el of w.querySelectorAll("*")) {
          const eigener = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (!eigener) continue;
          const stil = getComputedStyle(el);
          if (stil.visibility === "hidden" || el.closest("[hidden]")) continue;
          const vorn = kanaele(stil.color);
          const hinten = grund(el);
          const l1 = hell(mische(vorn, hinten));
          const l2 = hell(hinten);
          const verhaeltnis = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          ergebnisse.push({
            text: el.textContent.trim().slice(0, 28),
            verhaeltnis: Math.round(verhaeltnis * 100) / 100,
            gross: Number.parseFloat(stil.fontSize) >= 24,
          });
        }
      }
      return ergebnisse;
    });
  }

  it("Kontrast der Texte: mindestens 4,5 zu 1 (WCAG AA), dunkel und hell, in jeder Fassung", async () => {
    for (const fassung of FASSUNGEN) {
      for (const thema of ["dunkel", "hell"]) {
        await oeffne(`fassung=${fassung}&thema=${thema}&offen=${fassung === "stille" ? 1 : 0}`);
        const alle = await kontraste();
        expect(alle.length, `${fassung} ${thema}`).toBeGreaterThan(3);
        const zuSchwach = alle.filter((e) => e.verhaeltnis < 4.5);
        expect(zuSchwach, `${fassung} ${thema}`).toEqual([]);
      }
    }
  });

  it("hell und dunkel nutzen die Farb-Werte des Projekts (kein fester Farbwert)", async () => {
    for (const fassung of FASSUNGEN) {
      await oeffne(`fassung=${fassung}&thema=dunkel`);
      const dunkel = await page.evaluate(
        () => getComputedStyle(document.querySelector("[data-fassung] h1")).color,
      );
      await oeffne(`fassung=${fassung}&thema=hell`);
      const hell = await page.evaluate(
        () => getComputedStyle(document.querySelector("[data-fassung] h1")).color,
      );
      expect(dunkel, fassung).toBe("rgb(237, 237, 237)");
      expect(hell, fassung).toBe("rgb(24, 24, 27)");
    }
  });
});
