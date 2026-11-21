/**
 * PaiBot – Browser-Tests der Fäden: Kopf auf und zu, Schwellen, Leiste, Umschalter, Vorschläge, Handy.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Wie beim Startbereich: Die Prüfseite (faden-seite.tsx) wird mit dem Vite-Server aus Vitest
// ausgeliefert, Chromium bedient sie über Playwright. Fehlt Playwright oder sein Chromium, werden
// diese Tests übersprungen; PAIBOT_BROWSER_TESTS=1 lässt sie dann fehlschlagen.
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
    "Faden-Browser-Tests übersprungen: Playwright mit Chromium nicht gefunden " +
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
<body><div id="wurzel"></div><script type="module" src="/faden-seite.tsx"></script></body>
</html>`;

const DESKTOP = { width: 1440, height: 900 };
const HANDY = { width: 390, height: 844 };

describe.skipIf(!bereit && !erzwungen)("Fäden im Browser", { timeout: 60_000 }, () => {
  let server;
  let browser;
  let kontext;
  let page;
  let basis;
  let anfragen = [];

  beforeAll(async () => {
    const { createViteServer } = await import("vitest/node");
    const web = createRequire(path.join(WEB, "package.json"));
    const port = await freierPort();
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
        entries: ["faden-seite.tsx"],
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
    browser = await chromium.launch();
    // Einmal laden, damit Vite fertig gebündelt hat, bevor die Tests zählen.
    const fehler = await oeffne("szene=arbeitet");
    if (fehler.length > 0) await oeffne("szene=arbeitet");
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  /** Neue Seite in frischem Kontext (leerer Speicher); `reduziert` schaltet „weniger Bewegung“. */
  async function oeffne(abfrage = "", groesse = DESKTOP, reduziert = true) {
    await page?.close();
    await kontext?.close();
    kontext = await browser.newContext({
      viewport: groesse,
      reducedMotion: reduziert ? "reduce" : "no-preference",
    });
    page = await kontext.newPage();
    return laden(abfrage);
  }

  /** Dieselbe Seite neu laden (der Speicher des Browsers bleibt). */
  async function laden(abfrage) {
    const fehler = [];
    anfragen = [];
    page.removeAllListeners("pageerror");
    page.removeAllListeners("console");
    page.removeAllListeners("request");
    page.on("pageerror", (e) => fehler.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") fehler.push(m.text());
    });
    page.on("request", (r) => anfragen.push(r.url()));
    await page.addInitScript(() => {
      window.__alarm = 0;
      window.alert = () => {
        window.__alarm += 1;
      };
    });
    await page.goto(`${basis}/?${abfrage}`);
    await page.waitForSelector('#wurzel [data-baustein="ansicht"]', { timeout: 60_000 });
    await page.waitForLoadState("networkidle");
    return fehler;
  }

  /** Hilfen statt der Prüfungen von @playwright/test (nicht Teil der Abhängigkeiten). */
  const sichtbar = (loc) => loc.first().waitFor({ state: "visible", timeout: 10_000 });
  const weg = (loc) => loc.first().waitFor({ state: "hidden", timeout: 10_000 });
  const anzahl = (loc, n) => expect.poll(() => loc.count(), { timeout: 8000 }).toBe(n);
  const enthaelt = (loc, text) =>
    expect.poll(() => loc.first().innerText(), { timeout: 8000 }).toContain(text);
  const fokussiert = (loc) =>
    expect
      .poll(() => loc.first().evaluate((e) => document.activeElement === e), { timeout: 5000 })
      .toBe(true);

  const ereignisse = () => page.evaluate(() => window.__ereignisse);
  const kopf = () => page.locator('[data-baustein="kopf"]');
  const leiste = () => page.locator('[data-baustein="leiste"]');
  const beitraege = () => page.locator('[data-baustein="beitrag"]');

  /** Nichts ragt über den Rand und kein Bereich zeigt einen Scrollbalken. */
  async function ueberlauf() {
    return page.evaluate(() => {
      const probleme = [];
      const breite = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > breite) {
        probleme.push(`Seite ${document.documentElement.scrollWidth} > ${breite}`);
      }
      const verlauf = document.querySelector('[data-baustein="verlauf"]');
      if (verlauf) {
        if (verlauf.scrollWidth > verlauf.clientWidth) {
          probleme.push(`Verlauf ${verlauf.scrollWidth} > ${verlauf.clientWidth}`);
        }
        if (verlauf.offsetWidth - verlauf.clientWidth > 0)
          probleme.push("Verlauf mit Scrollbalken");
      }
      for (const el of document.querySelectorAll("#wurzel *")) {
        const stil = getComputedStyle(el);
        if (stil.display === "none" || stil.visibility === "hidden") continue;
        if (!/(auto|scroll)/.test(stil.overflowY + stil.overflowX)) continue;
        if (el.offsetWidth - el.clientWidth > 1 || el.offsetHeight - el.clientHeight > 1) {
          if (stil.scrollbarWidth !== "none")
            probleme.push(`Scrollbalken sichtbar: ${el.className}`);
        }
      }
      const haupt = document.querySelector('[data-baustein="haupt"]');
      if (haupt) {
        const r0 = haupt.getBoundingClientRect();
        for (const el of haupt.querySelectorAll("*")) {
          const stil = getComputedStyle(el);
          if (stil.display === "none" || stil.visibility === "hidden") continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          // Aufruf-Leiste darf seitlich scrollen (overflow-x), nichts anderes darf überstehen.
          if (el.closest("ul[aria-label]")) continue;
          // Von einem Vorfahren mit abgeschnittenem Überstand (Auslassungspunkte) verdeckt: nicht sichtbar.
          let verdeckt = false;
          for (let a = el.parentElement; a && a !== haupt; a = a.parentElement) {
            const sa = getComputedStyle(a);
            if (sa.overflowX === "hidden" || sa.overflowX === "clip") {
              const ra = a.getBoundingClientRect();
              if (r.left >= ra.right - 1 || r.right > ra.right + 1.5) {
                verdeckt = true;
                break;
              }
            }
          }
          if (verdeckt) continue;
          if (r.right > r0.right + 1.5 || r.left < r0.left - 1.5) {
            probleme.push(
              `${el.tagName}.${String(el.className).slice(0, 30)} ${Math.round(r.left)}..${Math.round(r.right)}`,
            );
            if (probleme.length > 8) break;
          }
        }
      }
      return probleme;
    });
  }

  const SZENEN = ["leer", "arbeitet", "wartet", "fertig", "angehalten", "grenze", "gross"];

  describe("jede Szene, dunkel und hell, 1440 und 390", () => {
    for (const szene of SZENEN) {
      for (const thema of ["dunkel", "hell"]) {
        for (const [name, groesse] of [
          ["1440", DESKTOP],
          ["390", HANDY],
        ]) {
          it(`${szene} · ${thema} · ${name}: lädt ohne Fehler, ohne Überlauf, ohne Scrollbalken`, async () => {
            const fehler = await oeffne(`szene=${szene}&thema=${thema}`, groesse);
            expect(fehler).toEqual([]);
            expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(
              thema === "hell" ? "light" : "dark",
            );
            expect(await ueberlauf()).toEqual([]);
          });
        }
      }
    }
  });

  describe("sehr lange Namen und Texte", () => {
    for (const [name, groesse] of [
      ["1440", DESKTOP],
      ["390", HANDY],
    ]) {
      it(`gross · ${name}: nichts ragt über den Rand`, async () => {
        const fehler = await oeffne("szene=gross&lang=1", groesse);
        expect(fehler).toEqual([]);
        expect(await ueberlauf()).toEqual([]);
      });
      it(`arbeitet · ${name}: nichts ragt über den Rand`, async () => {
        const fehler = await oeffne("szene=arbeitet&lang=1", groesse);
        expect(fehler).toEqual([]);
        expect(await ueberlauf()).toEqual([]);
      });
    }
  });

  describe("Kopf auf und zu", () => {
    it("Griff schließt, schmale Zeile öffnet, Zustand wird gemerkt", async () => {
      await oeffne("szene=arbeitet");
      await sichtbar(kopf().getByText("Fertig, wenn", { exact: true }));
      const griff = page.getByRole("button", { name: "Kopf einklappen" });
      expect(await griff.getAttribute("aria-expanded")).toBe("true");
      await griff.click();
      const eng = page.getByRole("button", { name: /^Kopf ausklappen/ });
      expect(await eng.getAttribute("aria-expanded")).toBe("false");
      // Gegenprobe: zugeklappt ist der volle Kopf weg
      await anzahl(page.getByText("Fertig, wenn", { exact: true }), 0);
      await anzahl(page.getByRole("button", { name: "Stab nehmen" }), 0);
      // gemerkt: neu laden, bleibt zu
      await laden("szene=arbeitet");
      await sichtbar(page.getByRole("button", { name: /^Kopf ausklappen/ }));
      await page.getByRole("button", { name: /^Kopf ausklappen/ }).click();
      await sichtbar(page.getByRole("button", { name: "Kopf einklappen" }));
      await laden("szene=arbeitet");
      await sichtbar(page.getByRole("button", { name: "Kopf einklappen" }));
    });

    it("mit Tastatur: Enter schließt, Leertaste öffnet, der Fokus wandert mit", async () => {
      await oeffne("szene=arbeitet");
      await page.getByRole("button", { name: "Kopf einklappen" }).focus();
      await page.keyboard.press("Enter");
      const eng = page.getByRole("button", { name: /^Kopf ausklappen/ });
      await sichtbar(eng);
      await fokussiert(eng);
      await page.keyboard.press("Space");
      const griff = page.getByRole("button", { name: "Kopf einklappen" });
      await sichtbar(griff);
      await fokussiert(griff);
      await page.keyboard.press("Enter");
      await fokussiert(page.getByRole("button", { name: /^Kopf ausklappen/ }));
    });

    for (const szene of ["gross", "wartet", "fertig"]) {
      it(`${szene}: lässt sich gleich auf- und zuklappen`, async () => {
        await oeffne(`szene=${szene}`);
        const zu = () => page.getByRole("button", { name: /^Kopf ausklappen/ });
        const offen = () => page.getByRole("button", { name: "Kopf einklappen" });
        const start = (await zu().count()) > 0 ? "zu" : "offen";
        for (let i = 0; i < 2; i++) {
          if ((await zu().count()) > 0) await zu().click();
          else await offen().click();
        }
        expect(start === "zu" ? (await zu().count()) > 0 : (await offen().count()) > 0).toBe(true);
        await ueberlauf();
      });
    }

    it("ein zugeklappter Kopf zeigt Titel, Stand der Ziele, Etappe, wer dran ist und das Budget", async () => {
      await oeffne("szene=gross");
      const eng = page.getByRole("button", { name: /^Kopf ausklappen/ });
      const text = await eng.innerText();
      expect(text).toContain("Frühjahrs-Programm");
      expect(text).toContain("4 von 9");
      expect(text).toContain("Feinschliff");
      expect(text).toContain("Ida dran");
      expect(text).toContain("46 %");
    });
  });

  describe("Schwellen", () => {
    const faelle = [
      ["4 Ziele, 5 Beteiligte", "ziele=4&beteiligte=5", false],
      ["5 Ziele, 5 Beteiligte", "ziele=5&beteiligte=5", true],
      ["4 Ziele, 6 Beteiligte", "ziele=4&beteiligte=6", true],
      ["5 Ziele, 6 Beteiligte", "ziele=5&beteiligte=6", true],
    ];
    for (const [name, abfrage, gross] of faelle) {
      it(`${name}: Kopf ${gross ? "schmal und Leiste offen" : "offen und Leiste zu"}`, async () => {
        await oeffne(`szene=gross&${abfrage}`);
        expect((await page.getByRole("button", { name: /^Kopf ausklappen/ }).count()) > 0).toBe(
          gross,
        );
        expect(await leiste().getAttribute("data-offen")).toBe(gross ? "true" : "false");
        if (gross) await sichtbar(leiste());
        else await weg(leiste());
      });
    }

    it("der kleine Faden hat keine Leiste von selbst", async () => {
      await oeffne("szene=arbeitet");
      await anzahl(leiste(), 0);
      await sichtbar(page.getByRole("button", { name: "Kopf einklappen" }));
    });
  });

  describe("Faden-Leiste", () => {
    it("öffnet und schließt über den Knopf in der Kopfzeile, Zustand bleibt", async () => {
      await oeffne("szene=gross");
      const knopf = page.getByRole("button", { name: "Faden-Leiste", exact: true });
      expect(await knopf.getAttribute("aria-expanded")).toBe("true");
      await knopf.click();
      expect(await knopf.getAttribute("aria-expanded")).toBe("false");
      await weg(leiste());
      await laden("szene=gross");
      await weg(leiste());
      await page.getByRole("button", { name: "Faden-Leiste", exact: true }).click();
      await sichtbar(leiste());
    });

    it("hat die Reiter Ziele, Team, Lieferungen, Fragen, Belege; Pfeiltasten wechseln", async () => {
      await oeffne("szene=gross");
      const reiter = page.getByRole("tab");
      expect(await reiter.allInnerTexts()).toEqual([
        "Ziele",
        "Team",
        "Lieferungen\n6",
        "Fragen\n3",
        "Belege",
      ]);
      await page.getByRole("tab", { name: "Ziele" }).focus();
      await page.keyboard.press("ArrowRight");
      expect(await page.getByRole("tab", { name: "Team" }).getAttribute("aria-selected")).toBe(
        "true",
      );
      await sichtbar(page.getByText("Wartet auf dich", { exact: true }));
      await page.keyboard.press("End");
      expect(await page.getByRole("tab", { name: "Belege" }).getAttribute("aria-selected")).toBe(
        "true",
      );
      await sichtbar(page.getByText("7 von 34 Belegen"));
      await page.getByRole("tab", { name: /^Fragen/ }).click();
      await sichtbar(leiste().getByText("Sollen die Termine auch in den Newsletter?"));
      await page.getByRole("tab", { name: /^Lieferungen/ }).click();
      await sichtbar(leiste().getByText("Szenenliste"));
    });

    it("Stab nehmen und Faden anhalten rufen nur zurück, entscheiden nichts", async () => {
      await oeffne("szene=gross");
      await leiste().getByRole("button", { name: "Stab nehmen" }).click();
      await leiste().getByRole("button", { name: "Faden anhalten" }).click();
      expect(await ereignisse()).toEqual(["stab", "anhalten"]);
    });
  });

  describe("Handy: Faden-Leiste als Blatt von unten", () => {
    it("steht mit Griffzeile unten; Griff schließt und öffnet; zu ist der Inhalt nicht erreichbar", async () => {
      await oeffne("szene=gross", HANDY);
      const griff = page.getByRole("button", { name: "Faden-Leiste zeigen oder verbergen" });
      await sichtbar(griff);
      expect(await griff.getAttribute("aria-expanded")).toBe("true");
      const offenOben = await leiste().evaluate((e) => e.getBoundingClientRect().top);
      expect(offenOben).toBeLessThan(HANDY.height * 0.5);
      await griff.click();
      expect(await griff.getAttribute("aria-expanded")).toBe("false");
      await page.waitForTimeout(100);
      const zuOben = await leiste().evaluate((e) => e.getBoundingClientRect().top);
      // nur die Griffzeile (56 Pixel) bleibt sichtbar
      expect(zuOben).toBeGreaterThan(HANDY.height - 70);
      expect(zuOben).toBeLessThan(HANDY.height - 40);
      // Gegenprobe: zu → Inhalt ist nicht per Tab erreichbar (inert)
      expect(
        await page
          .locator('[data-baustein="leiste"] [role="tablist"]')
          .evaluate((e) => Boolean(e.closest("[inert]"))),
      ).toBe(true);
      await griff.click();
      expect(
        await page
          .locator('[data-baustein="leiste"] [role="tablist"]')
          .evaluate((e) => Boolean(e.closest("[inert]"))),
      ).toBe(false);
    });

    it("die Eingabe bleibt über dem geschlossenen Blatt erreichbar", async () => {
      await oeffne("szene=gross", HANDY);
      await page.getByRole("button", { name: "Faden-Leiste zeigen oder verbergen" }).click();
      await page.waitForTimeout(100);
      const eingabe = await page
        .getByRole("combobox")
        .evaluate((e) => e.getBoundingClientRect().bottom);
      const blatt = await leiste().evaluate((e) => e.getBoundingClientRect().top);
      expect(eingabe).toBeLessThanOrEqual(blatt + 1);
    });
  });

  describe("Umschalter", () => {
    it("‚Nur an mich‘ zeigt nur die Fragen, ‚Nur Ergebnisse‘ blendet Einzelheiten aus", async () => {
      await oeffne("szene=gross");
      await sichtbar(page.getByText("Schick mir drei Standbilder"));
      const alle = await beitraege().count();
      await page.getByRole("button", { name: /^Nur an mich/ }).click();
      expect(
        await page.getByRole("button", { name: /^Nur an mich/ }).getAttribute("aria-pressed"),
      ).toBe("true");
      expect(await beitraege().count()).toBe(1);
      await enthaelt(beitraege().first(), "Eine Frage an dich");
      await anzahl(page.getByText("Schick mir drei Standbilder"), 0);
      await anzahl(page.locator('[data-baustein="gruppe"]'), 0);
      await page.getByRole("button", { name: "Nur Ergebnisse" }).click();
      await anzahl(page.getByText("Schick mir drei Standbilder"), 0);
      await sichtbar(page.getByText("Etappe 1 ist abgenommen"));
      await page.getByRole("button", { name: "Alles", exact: true }).click();
      expect(await beitraege().count()).toBe(alle);
      await sichtbar(page.getByText("Schick mir drei Standbilder"));
    });
  });

  describe("Gruppen mit Ergebnis-Zeile", () => {
    it("eingeklappt zeigt sie Zahl, Namen und Ergebnis; Klick klappt auf und wieder zu", async () => {
      await oeffne("szene=gross");
      const gruppe = page.locator('[data-baustein="gruppe"]').nth(1);
      await enthaelt(gruppe, "9 Beiträge von Sam, Eli und Noa");
      await enthaelt(gruppe, "Ergebnis: Termine als Text, Fotoauswahl für die Webseite");
      const knopf = gruppe.getByRole("button").first();
      expect(await knopf.getAttribute("aria-expanded")).toBe("false");
      await anzahl(gruppe.getByText("Die Termine stehen als Text bereit."), 0);
      await knopf.click();
      expect(await knopf.getAttribute("aria-expanded")).toBe("true");
      await sichtbar(gruppe.getByText("Die Termine stehen als Text bereit."));
      await knopf.click();
      await anzahl(gruppe.getByText("Die Termine stehen als Text bereit."), 0);
    });
  });

  describe("Fragen und Antwort-Vorschläge", () => {
    it("ein Vorschlag setzt nur Text ins Feld und sendet nichts", async () => {
      await oeffne("szene=wartet");
      const vorher = await beitraege().count();
      await page.getByRole("button", { name: "Antwort einsetzen: Leise Musik" }).click();
      // fester Text des Servers, nicht der Wortlaut des Bots
      expect(await page.getByRole("combobox").inputValue()).toBe("Möglichkeit 1");
      expect((await ereignisse()).filter((e) => e.startsWith("senden:"))).toEqual([]);
      expect(await beitraege().count()).toBe(vorher);
      expect(await page.getByRole("combobox").evaluate((e) => document.activeElement === e)).toBe(
        true,
      );
      // Gegenprobe: erst die eigene Eingabe sendet
      await page.keyboard.press("Enter");
      expect((await ereignisse()).filter((e) => e.startsWith("senden:"))).toEqual([
        "senden:Möglichkeit 1",
      ]);
    });

    it("‚Selbst antworten‘ setzt den Fokus ins Feld und sendet nichts", async () => {
      await oeffne("szene=wartet");
      await page.getByRole("button", { name: "Selbst antworten" }).first().click();
      expect(await page.getByRole("combobox").evaluate((e) => document.activeElement === e)).toBe(
        true,
      );
      expect((await ereignisse()).filter((e) => e.startsWith("senden:"))).toEqual([]);
    });

    it("die Fragen stehen gesammelt im Kopf, in der Seitenleiste und in der Leiste", async () => {
      await oeffne("szene=wartet");
      await sichtbar(page.getByText("2 Fragen an dich · der Faden wartet auf dich"));
      await sichtbar(page.getByText("3 Fragen", { exact: false }).first());
      await oeffne("szene=gross");
      await page.getByRole("tab", { name: /^Fragen/ }).click();
      expect(
        await leiste()
          .getByRole("button", { name: /^Antwort einsetzen/ })
          .count(),
      ).toBe(6);
    });
  });

  describe("Grenze erreicht", () => {
    it("der Knopf für mehr Token ruft zurück, die anderen Wahlen ebenso, nichts geschieht von selbst", async () => {
      await oeffne("szene=grenze");
      await sichtbar(page.getByText("gilt für diesen Auftrag, Tagesbudget bleibt"));
      await sichtbar(page.getByText("Zuschlag 1 von 5"));
      expect(await ereignisse()).toEqual([]);
      await page.getByRole("button", { name: /\+10\.000 Token für diesen Auftrag/ }).click();
      await page.getByRole("button", { name: /Ich schaue selbst drüber/ }).click();
      expect(await ereignisse()).toEqual(["zuschlag", "wahl:selbst"]);
    });

    it("der Knopf steht nur dort", async () => {
      for (const szene of ["arbeitet", "wartet", "gross", "angehalten", "fertig"]) {
        await oeffne(`szene=${szene}`);
        await anzahl(page.getByText("+10.000"), 0);
      }
    });
  });

  describe("Angehalten", () => {
    it("zeigt das Band, sperrt die Eingabe und bietet Fortsetzen", async () => {
      await oeffne("szene=angehalten");
      await sichtbar(page.getByText("Alle Bots sind angehalten.").first());
      await anzahl(page.getByRole("combobox"), 0);
      await sichtbar(page.getByText("Alle angehalten"));
      await page.getByRole("button", { name: "Fortsetzen" }).first().click();
      expect((await ereignisse()).includes("fortsetzen")).toBe(true);
    });
  });

  describe("Bot-Text bleibt Text", () => {
    it("Skript, Bild und Richtungszeichen in Beiträgen und Fragen werden weder ausgeführt noch geladen", async () => {
      for (const szene of ["arbeitet", "wartet", "gross"]) {
        await oeffne(`szene=${szene}&gefahr=1`);
        expect(
          await page.locator("#wurzel script, #wurzel img, #wurzel iframe, #wurzel a").count(),
        ).toBe(0);
        expect(await page.evaluate(() => window.__alarm)).toBe(0);
        expect(anfragen.filter((u) => u.includes("beispiel.invalid"))).toEqual([]);
        // der Wortlaut steht als Text da
        await sichtbar(page.getByText("<script>alert(1)</script>", { exact: false }).first());
        const roh = await page.locator("#wurzel").innerText();
        expect(roh).not.toContain(String.fromCharCode(0x202e));
        // Kennzeichen sichtbar
        await sichtbar(page.getByText("aus fremden Inhalten").first());
      }
    });
  });

  describe("@-Auswahl in der Eingabe", () => {
    it("@ öffnet die Liste, Pfeiltasten und Enter setzen den Namen, Escape schließt", async () => {
      await oeffne("szene=arbeitet");
      const feld = page.getByRole("combobox");
      await feld.click();
      await page.keyboard.type("@");
      await sichtbar(page.getByRole("listbox"));
      expect(await page.getByRole("option").count()).toBe(6);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      expect(await feld.inputValue()).toBe("@Ben ");
      expect((await ereignisse()).filter((e) => e.startsWith("senden:"))).toEqual([]);
      await page.keyboard.type("@");
      await sichtbar(page.getByRole("listbox"));
      await page.keyboard.press("Escape");
      await anzahl(page.getByRole("listbox"), 0);
      // Aufrufen-Leiste setzt ebenfalls nur Text
      await page.getByRole("button", { name: "Ida" }).last().click();
      expect(await feld.inputValue()).toContain("@Ida ");
    });
  });

  describe("Beleg-Zeichen", () => {
    it("öffnet ein Fenster, Escape schließt und der Fokus kehrt zurück", async () => {
      await oeffne("szene=arbeitet");
      const zeichen = page.getByRole("button", { name: /^Beleg \d+ ansehen/ }).first();
      await zeichen.click();
      expect(await zeichen.getAttribute("aria-expanded")).toBe("true");
      await sichtbar(page.getByRole("dialog"));
      await page.keyboard.press("Escape");
      await anzahl(page.getByRole("dialog"), 0);
      await fokussiert(zeichen);
    });
  });

  describe("Erkannte Zeile mit Zettel", () => {
    it("der Zettel ist erst zu und wird mit dem Knopf aufgeklappt", async () => {
      await oeffne("szene=arbeitet");
      await sichtbar(page.getByText("Übergabe an Juri erkannt"));
      await anzahl(page.locator('[data-baustein="zettel"]'), 0);
      const knopf = page.locator('[data-baustein="erkannte-zeile"] button').first();
      expect(await knopf.getAttribute("aria-expanded")).toBe("false");
      await knopf.click();
      await anzahl(page.locator('[data-baustein="zettel"]'), 1);
      await sichtbar(page.getByText("40.000 Token · Tiefe 2 · 30 Minuten"));
      expect(await knopf.getAttribute("aria-expanded")).toBe("true");
    });
  });

  describe("Bedienbarkeit", () => {
    it("Knöpfe zeigen per Tastatur einen sichtbaren Fokus", async () => {
      await oeffne("szene=arbeitet");
      await page.getByRole("button", { name: "Kopf einklappen" }).focus();
      await page.keyboard.press("Tab");
      const stil = await page.evaluate(() => {
        const s = getComputedStyle(document.activeElement);
        return { stil: s.outlineStyle, breite: s.outlineWidth };
      });
      expect(stil.stil).not.toBe("none");
      expect(Number.parseFloat(stil.breite)).toBeGreaterThanOrEqual(2);
    });

    it("jedes Symbol-Element hat einen Namen: kein Knopf ohne Text oder Namen", async () => {
      for (const szene of ["arbeitet", "gross", "grenze"]) {
        await oeffne(`szene=${szene}`);
        const ohne = await page.evaluate(() =>
          [...document.querySelectorAll("#wurzel button")]
            .filter((b) => !b.closest("[inert]") && getComputedStyle(b).display !== "none")
            .filter((b) => !(b.getAttribute("aria-label") || b.textContent?.trim()))
            .map((b) => b.className),
        );
        expect(ohne).toEqual([]);
      }
    });

    it("‚weniger Bewegung‘ schaltet das Gleiten des Blatts ab", async () => {
      await oeffne("szene=gross", HANDY, true);
      expect(await leiste().evaluate((e) => getComputedStyle(e).transitionDuration)).toBe("0s");
      await page.getByRole("button", { name: "Faden-Leiste zeigen oder verbergen" }).click();
      expect(await leiste().evaluate((e) => getComputedStyle(e).transitionDuration)).toBe("0s");
      await oeffne("szene=gross", HANDY, false);
      expect(await leiste().evaluate((e) => getComputedStyle(e).transitionDuration)).not.toBe("0s");
    });
  });

  describe("Seitenleiste", () => {
    it("ab mehr als sechs Mitgliedern steht ‚+4 ruhig‘, davor alle", async () => {
      await oeffne("szene=gross");
      await sichtbar(page.getByText("+4 ruhig").first());
      await page
        .getByRole("button", { name: "Ruhige Mitglieder zeigen oder verbergen" })
        .first()
        .click();
      await sichtbar(page.getByText("Lou", { exact: false }).first());
      await oeffne("szene=arbeitet");
      await anzahl(page.getByText(/^\+\d+ ruhig$/), 0);
      await sichtbar(
        page.locator('[data-baustein="seitenleiste"]').getByText("Lou", { exact: true }),
      );
    });

    it("am Handy ist sie ein Menü: zu, öffnet mit dem Knopf", async () => {
      await oeffne("szene=arbeitet", HANDY);
      await weg(page.locator('[data-baustein="seitenleiste"]'));
      const knopf = page.getByRole("button", { name: "Menü öffnen" });
      expect(await knopf.getAttribute("aria-expanded")).toBe("false");
      await knopf.click();
      await page.waitForTimeout(350);
      await sichtbar(page.locator('[data-baustein="seitenleiste"]'));
    });
  });

  describe("Leer", () => {
    it("ohne Team: Hinweis und Knopf ‚Team anlegen‘, keine Eingabe", async () => {
      await oeffne("szene=leer");
      await sichtbar(page.getByRole("heading", { name: "Noch kein Team" }));
      await sichtbar(page.getByRole("button", { name: "Team anlegen" }).first());
      await anzahl(page.getByRole("combobox"), 0);
    });
  });
});
