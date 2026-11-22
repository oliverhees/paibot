/**
 * PaiBot – Tests der Schritte im Chat im echten Browser (Chromium über Playwright): fremder Text,
 * Kennzeichnungen, Tastatur, Bildschirmleser-Namen, Überlauf, Bewegung, dunkel und hell.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

// Gleiches Muster wie apps.test.mjs: Vite-Server mit der Prüfseite schritte-seite.tsx, Chromium über
// Playwright. Fehlt Playwright, werden die Tests übersprungen; PAIBOT_BROWSER_TESTS=1 erzwingt sie.
// Mit PAIBOT_SCHRITTE_BILDER=<Ordner> werden dazu die Beispiel-Szenen als Bilder abgelegt.

import { existsSync, readFileSync } from "node:fs";
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
const SCHRIFTEN = path.join(REPO, "packages/ui/src/schriften.css");
const SCHRIFT_ORDNER = path.join(WEB, "public/fonts");

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
    "Schritte-Tests übersprungen: Playwright mit Chromium nicht gefunden " +
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
<title>Prüfseite Schritte</title>
<style>
.seite{max-width:760px;margin:0 auto;padding:24px 16px 48px}
.verlauf{display:flex;flex-direction:column;gap:20px}
.phasezeile{display:flex}
.stapel{display:flex;flex-direction:column;gap:12px}
.knopfzeile{display:flex;align-items:center;gap:12px}
.knopf{border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);border-radius:999px;padding:6px 14px;font:var(--text-small);cursor:pointer}
.knopf[aria-pressed="true"]{background:var(--ink);color:var(--bg)}
.hilfe{color:var(--ink-soft);font:var(--text-small)}
.vergleich{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--line-mid);border-radius:16px}
.vergleichKopf{margin:0;font:var(--text-heading)}
</style>
<link rel="stylesheet" href="/@fs${SCHRIFTEN}">
<link rel="stylesheet" href="/@fs${GLOBALS}">
</head>
<body><div id="wurzel"></div><script type="module" src="/schritte-seite.tsx"></script></body>
</html>`;

const HINWEIS = "Antwort von PaiBot, nicht vom Modell";

/** Alle Szenen der Prüfseite. */
const SZENEN = [
  "laeuft",
  "nachschlagen",
  "fertig",
  "nichts",
  "nichts-offen",
  "abgebrochen",
  "abgelehnt",
  "gefahr",
  "lang",
  "aus",
  "an",
  "phasen",
  "vergleich",
];

describe.skipIf(!bereit && !erzwungen)("Schritte im Chat im Browser", { timeout: 120_000 }, () => {
  let server;
  let browser;
  let cacheOrdner;
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
        alias: { "react-dom/client": web.resolve("react-dom/client") },
        dedupe: ["react", "react-dom"],
      },
      optimizeDeps: {
        entries: ["schritte-seite.tsx"],
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
              if (req.url?.startsWith("/fonts/")) {
                // Schriften liegen lokal im Repo (apps/web/public/fonts), nie bei einem fremden Server.
                const datei = path.join(SCHRIFT_ORDNER, path.basename(req.url.split("?")[0]));
                if (!existsSync(datei)) return next();
                res.setHeader("Content-Type", "font/woff2");
                res.end(readFileSync(datei));
                return;
              }
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
    const fehler = await oeffne("fertig");
    if (fehler.length > 0) await oeffne("fertig");
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
    loescheCacheOrdner(cacheOrdner);
  });

  /** Neue Seite mit einer Szene; sammelt Fehler, Dialoge (ein `alert` wäre ausgeführter Code) und Anfragen. */
  async function oeffne(
    szene,
    { breite = 1440, hoehe = 900, thema = "dunkel", reduziert = true } = {},
  ) {
    await page?.close();
    page = await browser.newPage({
      viewport: { width: breite, height: hoehe },
      reducedMotion: reduziert ? "reduce" : "no-preference",
    });
    const fehler = [];
    anfragen = [];
    page.dialogs = [];
    page.on("dialog", async (d) => {
      page.dialogs.push(d.message());
      await d.dismiss();
    });
    page.on("pageerror", (e) => fehler.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") fehler.push(m.text());
    });
    page.on("request", (r) => anfragen.push(r.url()));
    page.on("requestfailed", (r) => fehler.push(`Anfrage gescheitert: ${r.url()}`));
    await page.goto(`${basis}/?szene=${szene}&thema=${thema}`);
    await page.waitForSelector("main", { timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    return fehler;
  }

  const notiz = (text) => page.locator('[role="note"]', { hasText: text });

  /** Nichts ragt über den Rand, und kein Bereich zeigt oder braucht einen Scrollbalken. */
  async function ueberlauf() {
    return page.evaluate(() => {
      const probleme = [];
      const breite = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > breite) {
        probleme.push(`Seite ${document.documentElement.scrollWidth} > ${breite}`);
      }
      for (const el of document.querySelectorAll("main *")) {
        const r = el.getBoundingClientRect();
        // Text nur für Bildschirmleser (1 Pixel, abgeschnitten) zählt nicht.
        if (r.width <= 1 && r.height <= 1) continue;
        if (r.right > breite + 1 || r.left < -1) {
          probleme.push(`${el.tagName}.${String(el.className).slice(0, 30)} ragt hinaus`);
        }
        const stil = getComputedStyle(el);
        if (/(auto|scroll)/.test(stil.overflowX + stil.overflowY)) {
          probleme.push(`${el.tagName} scrollt`);
        }
        // Inhalt, der aus einem Kasten herausläuft (z. B. ein langes Wort ohne Umbruch).
        if (
          stil.overflowX === "visible" &&
          el.clientWidth > 1 &&
          el.scrollWidth > el.clientWidth + 1
        ) {
          probleme.push(`${el.tagName}.${String(el.className).slice(0, 30)} läuft über`);
        }
      }
      return probleme;
    });
  }

  it("fremder Text bleibt Text: kein Skript, kein Bild, kein Link, keine unsichtbaren Zeichen", async () => {
    const fehler = await oeffne("gefahr");
    const text = await page.locator("main").textContent();
    expect(text).toContain("<script>alert(1)</script>");
    expect(text).toContain('<img src=x onerror="alert(2)">');
    expect(text).toContain("![x](https://example.org/a.png)");
    expect(text).toContain("[a](javascript:alert(3))");
    expect(text).toContain("**fett** # Überschrift");
    expect(text).toContain("[Hier klicken](https://boese.example/klick)");
    expect(text).not.toMatch(/[\u200b\u202e\u2066\u2069]/u);
    // Nichts davon ist als Element entstanden.
    expect(await page.locator("main script, main img, main a, main iframe, main h1").count()).toBe(
      0,
    );
    // Jeder fremde Text enthält höchstens ein umschließendes `bdi`, nie ein anderes Element.
    const fremdKinder = await page.evaluate(() =>
      [...document.querySelectorAll("main [data-fremd]")].flatMap((el) =>
        [...el.querySelectorAll("*")]
          .filter((k) => k.tagName !== "BDI")
          .map((k) => `${el.dataset.fremd}>${k.tagName}`),
      ),
    );
    expect(fremdKinder).toEqual([]);
    // Der vorläufige Text ist ein einziger Textknoten.
    const vorl = page.locator('[data-fremd="vorlaeufig"]');
    expect(await vorl.evaluate((e) => e.childElementCount)).toBe(0);
    await page.waitForTimeout(300);
    expect(page.dialogs).toEqual([]);
    expect(fehler).toEqual([]);
  });

  it("Kennzeichnungen kommen nur von PaiBot: fremder Text im Wortlaut einer Kennzeichnung bleibt ein Zitat", async () => {
    await oeffne("gefahr");
    // Keine Kennzeichnung „nicht vom Modell“ (role=note) in dieser Szene; der Wortlaut steht nur in fremdem Text.
    expect(await notiz(HINWEIS).count()).toBe(0);
    const name = page.locator('[data-fremd="name"]');
    expect(await name.textContent()).toBe("„fertig · Antwort von PaiBot, nicht vom Modell“");
    // Das Zitat steht nicht in einer Kennzeichnung, und diese zeigt den Status aus `status`.
    expect(
      await name.evaluate((e) => e.closest("[data-kennzeichnung], [data-marke]") === null),
    ).toBe(true);
    const status = page.locator('[data-kennzeichnung="status"]');
    expect(await status.textContent()).toContain("fehlgeschlagen");
    expect(await status.textContent()).not.toContain("fertig");
    // Keine Kennzeichnung enthält fremden Text.
    const marken = await page.evaluate(() =>
      [...document.querySelectorAll("[data-marke], [data-kennzeichnung]")].map(
        (e) => e.textContent ?? "",
      ),
    );
    expect(marken.length).toBeGreaterThan(3);
    for (const m of marken) {
      expect(m).not.toMatch(/<|\[a\]|alert|Hinweis/);
    }
    // Der Hinweis der festen Antwort ist genau einmal da und liegt nicht in der Blase.
    await oeffne("nichts");
    expect(await notiz(HINWEIS).count()).toBe(1);
    const inBlase = await notiz(HINWEIS).evaluate((e) => e.closest('[class*="blaseBot"]') !== null);
    expect(inBlase).toBe(false);
  });

  it("vorläufiger Text und Verworfenes stehen nie in der Blase", async () => {
    await oeffne("nichts-offen");
    const verworfen = page.getByRole("button", { name: "Verworfen – nicht geprüft" });
    expect(await verworfen.getAttribute("aria-expanded")).toBe("true");
    const text = page.locator('[data-fremd="zwischen"]');
    expect(await text.evaluate((e) => getComputedStyle(e).textDecorationLine)).toContain(
      "line-through",
    );
    expect(await text.evaluate((e) => e.closest('[class*="blaseBot"]') === null)).toBe(true);
    await oeffne("laeuft");
    expect(await page.locator('[class*="blaseBot"]').count()).toBe(0);
    const vorl = page.getByRole("region", { name: "Vorläufiger Text, noch nicht geprüft" });
    expect(await vorl.count()).toBe(1);
    expect(await vorl.textContent()).toContain("Pai schreibt …");
    expect(await vorl.textContent()).toContain("vorläufig, noch nicht geprüft");
  });

  it("Zwischenschritte sind standardmäßig eingeklappt, die Kennzeichnung bleibt sichtbar", async () => {
    await oeffne("nichts");
    const knopf = page.getByRole("button", { name: "Verworfen – nicht geprüft" });
    expect(await knopf.isVisible()).toBe(true);
    expect(await knopf.getAttribute("aria-expanded")).toBe("false");
    expect(await page.locator('[data-fremd="zwischen"]').isVisible()).toBe(false);
    await oeffne("fertig");
    const z = page.getByRole("button", { name: "Zwischenschritt – vorläufig, nicht geprüft" });
    expect(await z.getAttribute("aria-expanded")).toBe("false");
  });

  it("Tastatur: Tab-Reihenfolge, Enter und Leertaste, aria-expanded und aria-controls, sichtbarer Fokus", async () => {
    await oeffne("fertig");
    const zwischen = page.getByRole("button", {
      name: "Zwischenschritt – vorläufig, nicht geprüft",
    });
    const werkzeug = page.getByRole("button", { name: /In der Doku nachschlagen/ });
    const beleg = page.getByRole("button", { name: "Beleg B-0140 öffnen" });
    const fokusName = () =>
      page.evaluate(() => {
        const el = document.activeElement;
        return el?.getAttribute("aria-label") ?? el?.textContent?.trim().slice(0, 60) ?? "";
      });

    await page.keyboard.press("Tab");
    expect(await fokusName()).toContain("Zwischenschritt – vorläufig, nicht geprüft");
    // Fokus-Ring: sichtbarer Umriss von mindestens 2 Pixeln.
    const ring = await zwischen.evaluate((e) => {
      const s = getComputedStyle(e);
      return { stil: s.outlineStyle, breite: Number.parseFloat(s.outlineWidth) };
    });
    expect(ring.stil).not.toBe("none");
    expect(ring.breite).toBeGreaterThanOrEqual(2);

    // Enter klappt auf, Leertaste klappt zu.
    await page.keyboard.press("Enter");
    expect(await zwischen.getAttribute("aria-expanded")).toBe("true");
    const id = await zwischen.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(await page.locator(`[id="${id}"]`).isVisible()).toBe(true);
    await page.keyboard.press("Space");
    expect(await zwischen.getAttribute("aria-expanded")).toBe("false");
    expect(await page.locator(`[id="${id}"]`).isVisible()).toBe(false);

    await page.keyboard.press("Tab");
    expect(await fokusName()).toContain("In der Doku nachschlagen");
    expect(await werkzeug.getAttribute("aria-expanded")).toBe("true");
    const wId = await werkzeug.getAttribute("aria-controls");
    expect(await page.locator(`[id="${wId}"]`).count()).toBe(1);
    await page.keyboard.press("Enter");
    expect(await werkzeug.getAttribute("aria-expanded")).toBe("false");
    await page.keyboard.press("Space");
    expect(await werkzeug.getAttribute("aria-expanded")).toBe("true");

    await page.keyboard.press("Tab");
    expect(await fokusName()).toBe("Beleg B-0140 öffnen");
    expect(await beleg.isVisible()).toBe(true);
  });

  it("der vorläufige Bereich hat einen Namen, ist kein Live-Bereich und nimmt keinen Fokus", async () => {
    await oeffne("laeuft");
    const vorl = page.getByRole("region", { name: "Vorläufiger Text, noch nicht geprüft" });
    expect(await vorl.getAttribute("aria-live")).toBeNull();
    const live = await vorl.evaluate(
      (e) => e.closest("[aria-live]")?.getAttribute("aria-live") ?? "off",
    );
    expect(live).toBe("off");
    expect(await vorl.evaluate((e) => e.getAttribute("role") ?? "region")).toBe("region");
    expect(
      await vorl.evaluate(
        (e) => e.querySelectorAll("a, button, input, textarea, select, [tabindex]").length,
      ),
    ).toBe(0);
    // Status und Phase sind Text, kein Live-Bereich.
    expect(await page.locator("main [aria-live]:not([aria-live=off])").count()).toBe(0);
  });

  it("Status steht immer in Worten und nur aus `status`", async () => {
    await oeffne("abgelehnt");
    const zeilen = page.locator('[data-baustein="werkzeug-zeile"]');
    expect(await zeilen.count()).toBe(3);
    const stati = await page.evaluate(() =>
      [...document.querySelectorAll('[data-kennzeichnung="status"]')].map((e) => ({
        status: e.dataset.status,
        text: e.textContent,
      })),
    );
    expect(stati).toEqual([
      { status: "abgelehnt", text: "Status: abgelehnt" },
      { status: "fehlgeschlagen", text: "Status: fehlgeschlagen" },
      { status: "abgebrochen", text: "Status: abgebrochen" },
    ]);
    await oeffne("nachschlagen");
    expect(await page.locator('[data-kennzeichnung="status"]').textContent()).toBe("Status: läuft");
  });

  it("Antwortzeile nennt Modell und Unter-Anbieter aller Schritte", async () => {
    await oeffne("fertig");
    const zeile = page.getByText("beantwortet von:").first();
    const text = await zeile.textContent();
    expect(text).toContain("tensorix (glm-5.1)");
    expect(text).toContain("melious (glm-5.3, gemeldet: glm-5.3-preview)");
    expect(await page.getByText("1 Werkzeug").count()).toBeGreaterThan(0);
    // Schmal: die Kurzform steht da, die Liste im Titel.
    await oeffne("fertig", { breite: 390 });
    expect(await page.getByText("2 Modelle").first().isVisible()).toBe(true);
  });

  it("Knopf „Schritte“: Werkzeug-Zeilen, Zwischenschritte und Beleg-Zeilen weg, Kennzeichnungen bleiben", async () => {
    await oeffne("aus");
    expect(await page.locator('[data-baustein="werkzeug-zeile"]').count()).toBe(0);
    expect(await page.locator('[data-art="zwischentext"]').count()).toBe(0);
    // Verworfen, vorläufig und der Hinweis stehen weiter da.
    expect(await page.locator('[data-art="verworfen"]').count()).toBe(1);
    expect(await page.locator('[data-baustein="vorlaeufiger-text"]').count()).toBe(1);
    expect(await notiz(HINWEIS).count()).toBe(1);
    await page.locator("#schritte-knopf").click();
    expect(await page.locator('[data-baustein="werkzeug-zeile"]').count()).toBe(2);
    expect(await notiz(HINWEIS).count()).toBe(1);
  });

  it("weniger Bewegung: keine Animation, keine Übergänge; mit Bewegung läuft sie", async () => {
    const ring = () => page.locator('[data-status="laeuft"] span[class*="ring"]');
    const animation = (loc) => loc.evaluate((e) => getComputedStyle(e).animationName);
    await oeffne("nachschlagen");
    expect(await animation(ring())).toBe("none");
    await oeffne("laeuft");
    expect(await animation(page.locator('[data-phase] span[class*="phasePunkt"]'))).toBe("none");
    await oeffne("fertig");
    const pfeil = page.locator('button[aria-expanded] svg[class*="pfeil"]').first();
    expect(await pfeil.evaluate((e) => getComputedStyle(e).transitionProperty)).toBe("none");
    // Gegenprobe der Messung: ohne „weniger Bewegung“ läuft der Ring.
    await oeffne("nachschlagen", { reduziert: false });
    expect(await animation(ring())).not.toBe("none");
  });

  it("alle Szenen: dunkel und hell, Rechner und Handy, ohne Überlauf, Scrollbalken, Fehler und fremde Anfragen", async () => {
    for (const szene of SZENEN) {
      for (const thema of ["dunkel", "hell"]) {
        for (const breite of [1440, 390]) {
          const fehler = await oeffne(szene, { breite, thema });
          await page.waitForTimeout(40);
          expect(await ueberlauf(), `${szene} ${thema} ${breite}`).toEqual([]);
          expect(fehler, `${szene} ${thema} ${breite}`).toEqual([]);
          expect(
            anfragen.filter((u) => !u.startsWith(basis)),
            `${szene} ${thema} ${breite}`,
          ).toEqual([]);
        }
      }
    }
  });

  it("Bilder der Szenen (nur mit PAIBOT_SCHRITTE_BILDER)", async () => {
    const ordner = process.env.PAIBOT_SCHRITTE_BILDER;
    if (!ordner) return;
    const { mkdirSync } = await import("node:fs");
    mkdirSync(ordner, { recursive: true });
    // Alle Szenen dunkel und breit; die wichtigsten zusätzlich hell und am Handy.
    const wichtig = ["laeuft", "fertig", "nichts", "nichts-offen", "abgebrochen", "aus"];
    const planen = [];
    for (const szene of SZENEN) planen.push([szene, "dunkel", 1440]);
    for (const szene of wichtig) {
      planen.push([szene, "hell", 1440], [szene, "dunkel", 390]);
    }
    planen.push(["fertig", "hell", 390], ["nichts", "hell", 390], ["vergleich", "dunkel", 390]);
    for (const [szene, thema, breite] of planen) {
      const browserSeite = await browser.newPage({
        viewport: { width: breite, height: breite > 600 ? 640 : 800 },
        deviceScaleFactor: 2,
        reducedMotion: "reduce",
      });
      await browserSeite.goto(`${basis}/?szene=${szene}&thema=${thema}`);
      await browserSeite.waitForSelector("main", { timeout: 60_000 });
      await browserSeite.evaluate(() => document.fonts.ready);
      await browserSeite.waitForTimeout(250);
      await browserSeite.screenshot({
        path: path.join(ordner, `${szene}-${thema}-${breite}.png`),
        fullPage: true,
      });
      await browserSeite.close();
    }
  });
});
