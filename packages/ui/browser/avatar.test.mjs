/**
 * PaiBot – Browser-Tests des lebendigen Avatars (Chromium über Playwright).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Prüft, was nur ein echter Browser zeigt: Lage des Gesichts im Umriss, Standbild bei „weniger
// Bewegung“, Zeitgeber und Lauscher beim Entfernen und im Hintergrund. Wie bei der Tastatur-Prüfung
// gehört Playwright nicht zu den Abhängigkeiten; fehlt es, werden die Tests übersprungen.
// Gezielt starten: `pnpm --filter @paibot/ui test:browser`.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, "../../..");
const WEB = path.join(REPO, "apps/web");
const GLOBALS = path.join(WEB, "src/app/globals.css");

async function ladePlaywright() {
  try {
    return await import("playwright");
  } catch {
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
    "Avatar-Browser-Tests übersprungen: Playwright mit Chromium nicht gefunden " +
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

const html = (thema) => `<!doctype html>
<html lang="de" data-theme="${thema}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prüfseite Avatar</title>
<link rel="stylesheet" href="/@fs${GLOBALS}">
</head>
<body><div id="wurzel"></div><script type="module" src="/avatar-seite.tsx"></script></body>
</html>`;

/** Zählt Zeitgeber, Einzelbild-Aufrufe und Lauscher, noch bevor die Seite läuft. */
const ZAEHLER = () => {
  const z = { setTimeout: 0, setInterval: 0, raf: 0, aktiv: new Set(), lauscher: new Map() };
  window.__z = z;
  const st = window.setTimeout.bind(window);
  const ct = window.clearTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => {
    z.setTimeout++;
    const id = st(() => {
      z.aktiv.delete(id);
      fn(...a);
    }, ms);
    z.aktiv.add(id);
    return id;
  };
  window.clearTimeout = (id) => {
    z.aktiv.delete(id);
    ct(id);
  };
  const si = window.setInterval.bind(window);
  window.setInterval = (...a) => {
    z.setInterval++;
    return si(...a);
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => {
    z.raf++;
    return raf(fn);
  };
  const ziele = () => [
    [window, "window"],
    [document, "document"],
    [document.documentElement, "html"],
  ];
  const name = (ziel) =>
    ziele().find(([t]) => t === ziel)?.[1] ?? (ziel instanceof MediaQueryList ? "mq" : null);
  const add = EventTarget.prototype.addEventListener;
  const rem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, o) {
    const n = name(this);
    if (n && fn) {
      const k = `${n}:${type}`;
      if (!z.lauscher.has(k)) z.lauscher.set(k, new Set());
      z.lauscher.get(k).add(fn);
    }
    return add.call(this, type, fn, o);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, o) {
    const n = name(this);
    if (n && fn) z.lauscher.get(`${n}:${type}`)?.delete(fn);
    return rem.call(this, type, fn, o);
  };
  window.__lauscher = (k) => z.lauscher.get(k)?.size ?? 0;
};

/** Läuft im Browser: prüft, ob das Gesicht (sichtbare Teile samt Strichbreite) im Umriss bleibt. */
const GESICHT_IM_UMRISS = ({ selektor, blicke }) => {
  const probleme = [];
  const PUNKTE = 28;
  for (const zelle of document.querySelectorAll(selektor)) {
    const svg = zelle.querySelector("svg");
    const leib = svg.querySelector('[data-teil="leib"]');
    const gesicht = svg.querySelector('[data-teil="gesicht"]');
    for (const blick of blicke) {
      if (blick) {
        svg.style.setProperty("--bx", blick[0]);
        svg.style.setProperty("--by", blick[1]);
      }
      const nachLeib = leib.getScreenCTM().inverse();
      const innen = (p) => {
        const q = new DOMPoint(p.x, p.y);
        return leib.isPointInFill(q) || leib.isPointInStroke(q);
      };
      for (const el of gesicht.querySelectorAll("circle, ellipse, path, rect")) {
        // sichtbar? (Deckkraft aller Eltern, display)
        let sichtbar = 1;
        for (let n = el; n && n !== svg; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.display === "none") sichtbar = 0;
          sichtbar *= Number(cs.opacity);
        }
        if (sichtbar < 0.05) continue;
        const cs = getComputedStyle(el);
        const strich = cs.stroke !== "none" ? Number.parseFloat(cs.strokeWidth) / 2 : 0;
        const ctm = el.getScreenCTM();
        const nachBody = nachLeib.multiply(ctm);
        const massstab = Math.sqrt(Math.abs(nachBody.a * nachBody.d - nachBody.b * nachBody.c));
        const rand = strich * massstab;
        const laenge = el.getTotalLength();
        for (let i = 0; i < PUNKTE; i++) {
          const lp = el.getPointAtLength((laenge * i) / PUNKTE);
          const p = new DOMPoint(lp.x, lp.y).matrixTransform(nachBody);
          const test = [p];
          if (rand > 0) {
            for (let a = 0; a < 8; a++) {
              test.push({
                x: p.x + rand * Math.cos((a * Math.PI) / 4),
                y: p.y + rand * Math.sin((a * Math.PI) / 4),
              });
            }
          }
          if (!test.every(innen)) {
            probleme.push(
              `${zelle.dataset.zelle} blick=${blick ?? "-"} ${el.tagName}.${el.getAttribute("class") ?? ""} punkt ${i}`,
            );
            break;
          }
        }
      }
    }
  }
  return probleme;
};

const ZUSTAENDE = [
  "ruhig",
  "hoert_zu",
  "denkt",
  "schreibt",
  "wartet",
  "fertig",
  "fehler",
  "angehalten",
];
const FORMEN = ["blatt", "bogen", "kiesel", "raute", "dee", "wabe", "bluete"];
const AUSDRUECKE = ["nicken", "kopfschuetteln", "anpacken", "einverstanden", "zwinkern", "staunen"];

describe.skipIf(!bereit && !erzwungen)("Lebendiger Avatar im Browser", { timeout: 60_000 }, () => {
  let server;
  let browser;
  let basis;

  beforeAll(async () => {
    const { createViteServer } = await import("vitest/node");
    const web = createRequire(path.join(WEB, "package.json"));
    const port = await freierPort();
    const thema = "dark";
    server = await createViteServer({
      configFile: false,
      root: HIER,
      logLevel: "error",
      server: { host: "127.0.0.1", port, strictPort: true, fs: { allow: [REPO] }, hmr: false },
      resolve: {
        alias: { "react-dom/client": web.resolve("react-dom/client") },
        dedupe: ["react", "react-dom"],
      },
      optimizeDeps: {
        entries: ["avatar-seite.tsx"],
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
              const t = new URL(req.url, "http://x").searchParams.get("thema") ?? thema;
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.end(await s.transformIndexHtml(req.url, html(t)));
            });
          },
        },
      ],
    });
    await server.listen();
    basis = `http://127.0.0.1:${port}`;
    browser = await chromium.launch();
    const warm = await browser.newPage();
    await warm.goto(basis);
    await warm.waitForSelector("#wurzel > *", { timeout: 90_000 });
    await warm.close();
  }, 180_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  /** Neue Seite; `weniger` schaltet „weniger Bewegung“ ein. */
  async function oeffne(abfrage = "", { weniger = false, thema } = {}) {
    const kontext = await browser.newContext({
      viewport: { width: 1280, height: 1000 },
      reducedMotion: weniger ? "reduce" : "no-preference",
      deviceScaleFactor: 1,
    });
    const page = await kontext.newPage();
    const fehler = [];
    page.on("pageerror", (e) => fehler.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") fehler.push(m.text());
    });
    await page.addInitScript(ZAEHLER);
    const q = new URLSearchParams(abfrage);
    if (thema) q.set("thema", thema);
    await page.goto(`${basis}/?${q}`);
    await page.waitForSelector("#wurzel > *", { timeout: 60_000 });
    await page.waitForTimeout(150);
    return { page, kontext, fehler };
  }

  const bild = (page, el) => page.locator(el).first().screenshot({ animations: "allow" });

  it("zeigt alle Formen in allen Zuständen ohne Fehler im Browser", async () => {
    const { page, kontext, fehler } = await oeffne("", { weniger: true });
    for (const f of FORMEN) {
      for (const z of ZUSTAENDE) {
        expect(
          await page.locator(`[data-raster="formen"] [data-zelle="${f}-${z}"] svg`).count(),
          `${f} ${z}`,
        ).toBe(1);
      }
    }
    expect(fehler).toEqual([]);
    await kontext.close();
  });

  it("hält das Gesicht in allen Formen und Zuständen im Umriss, auch bei größtem Blick", async () => {
    const { page, kontext } = await oeffne("", { weniger: true });
    const blicke = [null, [2, 1.6], [-2, 1.6], [2, -1.6], [-2, -1.6]];
    const probleme = await page.evaluate(GESICHT_IM_UMRISS, {
      selektor: '[data-raster="formen"] [data-zelle]',
      blicke,
    });
    expect(probleme).toEqual([]);
    const gross = await page.evaluate(GESICHT_IM_UMRISS, {
      selektor: '[data-raster="groessen"] [data-zelle]',
      blicke,
    });
    expect(gross).toEqual([]);
    await kontext.close();
  });

  for (const zustand of ZUSTAENDE) {
    it(`hält das Gesicht auch mit jedem Ausdruck im Umriss (${zustand})`, async () => {
      const { page, kontext } = await oeffne(`ansicht=ausdruecke&zustand=${zustand}`);
      await page.waitForFunction(() => Object.keys(window.__avatare ?? {}).length === 7);
      const probleme = [];
      for (const a of AUSDRUECKE) {
        await page.evaluate((name) => {
          for (const r of Object.values(window.__avatare)) r?.ausdruck(name);
        }, a);
        await page.waitForTimeout(80);
        const ausdruecke = await page.evaluate(
          () => [...document.querySelectorAll("[data-ausdruck]")].length,
        );
        expect(ausdruecke, `${zustand} ${a} sichtbar gesetzt`).toBe(7);
        const p = await page.evaluate(GESICHT_IM_UMRISS, {
          selektor: "[data-zelle]",
          blicke: [null, [2, 1.6], [-2, -1.6]],
        });
        probleme.push(...p.map((x) => `${a}: ${x}`));
      }
      expect(probleme).toEqual([]);
      await kontext.close();
    });
  }

  it("lässt bei „weniger Bewegung“ nichts laufen: keine Zeitgeber, kein Einzelbild-Takt, zwei gleiche Bilder", async () => {
    const { page, kontext } = await oeffne("", { weniger: true });
    for (const z of ZUSTAENDE) {
      await page.click(`[data-zustand-knopf="${z}"]`);
      await page.waitForTimeout(100);
      await page.mouse.move(100, 100);
      const vorher = await page.evaluate(() => ({
        t: window.__z.setTimeout,
        i: window.__z.setInterval,
        r: window.__z.raf,
      }));
      const a = await bild(page, "[data-vorschau] section:first-child");
      await page.mouse.move(600, 300);
      await page.mouse.move(300, 500);
      await page.waitForTimeout(2000);
      const b = await bild(page, "[data-vorschau] section:first-child");
      const nachher = await page.evaluate(() => ({
        t: window.__z.setTimeout,
        i: window.__z.setInterval,
        r: window.__z.raf,
        offen: window.__z.aktiv.size,
        zeiger: window.__lauscher("window:pointermove"),
      }));
      expect(a.equals(b), `Bild im Abstand von 2 s gleich (${z})`).toBe(true);
      expect(nachher.t - vorher.t, `Zeitgeber (${z})`).toBe(0);
      expect(nachher.i - vorher.i).toBe(0);
      expect(nachher.r - vorher.r, `Einzelbilder (${z})`).toBe(0);
      expect(nachher.offen, `offene Zeitgeber (${z})`).toBe(0);
      expect(nachher.zeiger, `Zeiger-Lauscher (${z})`).toBe(0);
    }
    // Ausdrücke ändern bei „weniger Bewegung“ ebenfalls nichts.
    const a = await bild(page, "[data-vorschau] section:first-child");
    await page.click('[data-ausdruck-knopf="staunen"]');
    await page.waitForTimeout(300);
    const b = await bild(page, "[data-vorschau] section:first-child");
    expect(a.equals(b)).toBe(true);
    await kontext.close();
  });

  it("bewegt sich ohne „weniger Bewegung“ dagegen sichtbar (Gegenprobe zum Standbild-Test)", async () => {
    const { page, kontext } = await oeffne("");
    const a = await bild(page, "[data-vorschau] section:first-child");
    await page.click('[data-ausdruck-knopf="staunen"]');
    await page.waitForTimeout(250);
    const b = await bild(page, "[data-vorschau] section:first-child");
    expect(a.equals(b)).toBe(false);
    const zaehler = await page.evaluate(() => window.__z.setTimeout);
    expect(zaehler).toBeGreaterThan(0);
    await kontext.close();
  });

  it("unterscheidet alle acht Zustände als Standbild, auch bei 48 und 24 Pixeln", async () => {
    const { page, kontext } = await oeffne("", { weniger: true });
    for (const px of ["px128", "px48", "px24"]) {
      const bilder = [];
      for (const z of ZUSTAENDE) bilder.push(await bild(page, `[data-zelle="${px}-${z}"]`));
      for (let i = 0; i < bilder.length; i++) {
        for (let j = i + 1; j < bilder.length; j++) {
          expect(bilder[i].equals(bilder[j]), `${px}: ${ZUSTAENDE[i]} gleich ${ZUSTAENDE[j]}`).toBe(
            false,
          );
        }
      }
    }
    await kontext.close();
  });

  it("vereinfacht die Mimik bei 24 Pixeln (keine Brauen, kein Glanz) und zeigt sie bei 48", async () => {
    const { page, kontext } = await oeffne("", { weniger: true });
    const sichtbar = (zelle) =>
      page.evaluate((s) => {
        const braue = document.querySelector(`[data-zelle="${s}"] svg path[class*="braue"]`);
        return getComputedStyle(braue).display;
      }, zelle);
    expect(await sichtbar("px24-wartet")).toBe("none");
    expect(await sichtbar("px48-wartet")).not.toBe("none");
    await kontext.close();
  });

  it("bewegt den Mund nur im Zustand „schreibt“ und nur pro Text-Stück", async () => {
    const { page, kontext } = await oeffne("");
    await page.evaluate(() => {
      const el = () => document.querySelector("[data-vorschau] section:first-child svg");
      window.__proben = [];
      const nimm = () => {
        const svg = el();
        const huelle = svg.parentElement;
        const sprech = svg.querySelector('[data-mund="sprech"]');
        const innen = sprech.firstElementChild;
        window.__proben.push({
          t: performance.now(),
          z: huelle.dataset.zustand,
          deckkraft: Number(getComputedStyle(sprech).opacity),
          mund: getComputedStyle(innen).transform,
        });
      };
      window.__probe = setInterval(nimm, 30);
    });
    await page.click("[data-lauf]");
    await page.waitForFunction(
      () =>
        document.querySelector("[data-vorschau] section:first-child [data-zustand]")?.dataset
          .zustand === "fertig",
      null,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(600);
    const proben = await page.evaluate(() => {
      clearInterval(window.__probe);
      return window.__proben;
    });
    const nach = new Map();
    let letzter = null;
    let seit = 0;
    for (const p of proben) {
      if (p.z !== letzter) {
        letzter = p.z;
        seit = p.t;
      }
      if (p.t - seit < 400) continue; // Übergänge (0,2 s) ausklingen lassen
      if (!nach.has(p.z)) nach.set(p.z, { deckkraft: new Set(), mund: new Set() });
      nach.get(p.z).deckkraft.add(p.deckkraft);
      nach.get(p.z).mund.add(p.mund);
    }
    expect([...nach.keys()]).toEqual(
      expect.arrayContaining(["ruhig", "hoert_zu", "denkt", "schreibt", "fertig"]),
    );
    for (const [z, w] of nach) {
      if (z === "schreibt") {
        expect(w.deckkraft.size, "Mund sichtbar").toBe(1);
        expect([...w.deckkraft][0]).toBe(1);
        expect(w.mund.size, "Mund bewegt sich pro Stück").toBeGreaterThan(2);
      } else {
        expect([...w.deckkraft], `Mund unsichtbar (${z})`).toEqual([0]);
        expect(w.mund.size, `Mund steht (${z})`).toBe(1);
      }
    }
    await kontext.close();
  });

  it("räumt beim Entfernen alle Zeitgeber und Lauscher auf", async () => {
    const { page, kontext } = await oeffne("ansicht=entfernen&folgt=1");
    await page.waitForTimeout(300);
    const da = await page.evaluate(() => ({
      zeitgeber: window.__z.aktiv.size,
      zeiger: window.__lauscher("window:pointermove"),
      sicht: window.__lauscher("document:visibilitychange"),
      mq: window.__lauscher("mq:change"),
    }));
    expect(da.zeitgeber).toBeGreaterThan(0);
    expect(da.zeiger).toBe(1);
    expect(da.sicht).toBe(1);
    expect(da.mq).toBeGreaterThan(0);
    await page.click("#weg");
    await page.waitForTimeout(300);
    const weg = await page.evaluate(() => ({
      zeitgeber: window.__z.aktiv.size,
      zeiger: window.__lauscher("window:pointermove"),
      verlassen: window.__lauscher("html:pointerleave"),
      sicht: window.__lauscher("document:visibilitychange"),
      mq: window.__lauscher("mq:change"),
    }));
    expect(weg).toEqual({ zeitgeber: 0, zeiger: 0, verlassen: 0, sicht: 0, mq: 0 });
    await kontext.close();
  });

  it("hängt ohne `folgtZeiger` keinen Zeiger-Lauscher an", async () => {
    const { page, kontext } = await oeffne("ansicht=entfernen");
    await page.waitForTimeout(300);
    await page.mouse.move(200, 200);
    const z = await page.evaluate(() => ({
      zeiger: window.__lauscher("window:pointermove"),
      verlassen: window.__lauscher("html:pointerleave"),
      raf: window.__z.raf,
    }));
    expect(z).toEqual({ zeiger: 0, verlassen: 0, raf: 0 });
    await kontext.close();
  });

  it("folgt dem Zeiger nur, wenn es eingeschaltet ist", async () => {
    const lies = (page) =>
      page.evaluate(() => document.querySelector("svg").style.getPropertyValue("--bx"));
    {
      const { page, kontext } = await oeffne("ansicht=entfernen&folgt=1");
      await page.mouse.move(900, 60);
      await page.waitForTimeout(150);
      expect(Number(await lies(page))).toBeGreaterThan(0.3);
      await kontext.close();
    }
    {
      const { page, kontext } = await oeffne("ansicht=entfernen");
      await page.mouse.move(900, 60);
      await page.waitForTimeout(150);
      expect(Number(await lies(page))).toBeLessThan(0.3);
      await kontext.close();
    }
  });

  it("pausiert im Hintergrund-Tab: keine Zeitgeber, kein Atmen", async () => {
    const { page, kontext } = await oeffne("ansicht=entfernen");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.querySelector("[data-atem]") !== null)).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(100);
    const weg = await page.evaluate(() => ({
      zeitgeber: window.__z.aktiv.size,
      atem: document.querySelector("[data-atem]") !== null,
    }));
    expect(weg).toEqual({ zeitgeber: 0, atem: false });
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__z.aktiv.size)).toBeGreaterThan(0);
    await kontext.close();
  });

  it("verwendet im Hintergrund und sonst nie eine Dauerschleife über Einzelbilder", async () => {
    const { page, kontext } = await oeffne("ansicht=entfernen");
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => window.__z.raf)).toBe(0);
    await kontext.close();
  });
});
