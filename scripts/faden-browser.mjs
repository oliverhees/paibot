/**
 * PaiBot – prüft die Bausteine der Fäden in einem echten Browser (Playwright, Chromium).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

// Prüft die Vorschau der Fäden (`/_komponenten/faden`) im Browser. Die Adresse muss `localhost` heißen
// (unter `127.0.0.1` lädt der Entwicklungs-Server die Skripte der Seite nicht, nichts reagiert). Die Seite gibt es nur mit dem
// Entwicklungs-Server und ohne Datenbank:
//
//   pnpm dev                                      (Entwicklungs-Server, Standard-Port 3000)
//   FADEN_URL=http://localhost:3000 pnpm faden:browser
//
// Was geprüft wird (jede Zeile ein Fall, am Ende die Zahl der Fehler; Exit 1 bei einem Fehler):
//   - Kopf auf- und zuklappen mit Klick, Enter und Leertaste (`aria-expanded` wechselt)
//   - große Fäden starten zugeklappt, kleine aufgeklappt (Schwellen, Zahlen: `kopfForm`)
//   - Eingabe: Enter sendet, Umschalt+Enter macht eine neue Zeile, `@` öffnet die Auswahl,
//     Enter setzt den Namen ein, Escape schließt
//   - ein Antwort-Vorschlag füllt nur die Eingabe und sendet nichts
//   - „+10.000 Token“ gibt es nur in der Szene „Grenze erreicht“, „Neu erzeugen“ nie
//   - Reiter der Leiste mit Pfeiltasten; am Handy ein Blatt von unten
//   - am Handy (390 Pixel) kein waagerechter Balken in jeder Szene und nirgends ein sichtbarer
//     Scrollbalken (weder in der Seite noch in einem Bereich)
//   - hell/dunkel wechselt das Thema
// Nicht geprüft: Inhalte hinter einem Server (es gibt keinen), Texte echter Bots.

import { createRequire } from "node:module";

// biome-ignore lint/suspicious/noUndeclaredEnvVars: nur für dieses Skript, kein Turborepo-Task
const BASIS = (process.env.FADEN_URL ?? "http://localhost:3000").replace(/\/$/u, "");
const SZENEN = ["leer", "arbeitet", "wartet", "fertig", "angehalten", "grenze", "gross"];

async function playwright() {
  try {
    return await import("playwright");
  } catch {
    try {
      return createRequire(import.meta.url)("playwright");
    } catch {
      console.error(
        "Playwright fehlt (außerhalb des Projekts installieren: npm install -g playwright && npx playwright install chromium).",
      );
      process.exit(1);
    }
  }
}

let fehler = 0;
function pruefe(name, ok, detail = "") {
  if (ok) console.log(`ok     ${name}`);
  else {
    fehler += 1;
    console.log(`FEHLER ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const pw = await playwright();
const { chromium } = pw.chromium ? pw : pw.default;
// Playwright startet Chromium sonst mit --hide-scrollbars; dann würde der Scrollbalken-Test nie etwas finden.
const browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });

async function oeffne(szene, breite = 1400, hoehe = 900, thema = "dunkel") {
  const kontext = await browser.newContext({ viewport: { width: breite, height: hoehe } });
  const seite = await kontext.newPage();
  const antwort = await seite.goto(
    `${BASIS}/_komponenten/faden?szene=${szene}${thema === "hell" ? "&thema=hell" : ""}`,
  );
  if (antwort?.status() !== 200) {
    console.error(
      `Vorschau nicht erreichbar (${antwort?.status()}): läuft \`pnpm dev\` unter ${BASIS}?`,
    );
    process.exit(1);
  }
  await seite
    .getByRole("combobox")
    .first()
    .waitFor({ state: "attached", timeout: 15000 })
    .catch(() => {});
  await seite.waitForLoadState("networkidle").catch(() => {});
  await seite.waitForTimeout(1500);
  return { kontext, seite };
}

const anzahl = (seite, name) => seite.getByRole("button", { name }).count();

// --- Kopf auf und zu ----------------------------------------------------------------------------
{
  const { kontext, seite } = await oeffne("arbeitet");
  const zu = seite.getByRole("button", { name: "Kopf einklappen" });
  pruefe(
    "Szene „arbeitet“ startet mit aufgeklapptem Kopf",
    (await zu.getAttribute("aria-expanded")) === "true",
  );
  await zu.click();
  await seite.waitForTimeout(600);
  const auf = seite.getByRole("button", { name: /^Kopf ausklappen/ });
  pruefe(
    "Klick klappt den Kopf zu",
    (await auf.count()) === 1 && (await auf.getAttribute("aria-expanded")) === "false",
  );
  await auf.focus();
  await seite.keyboard.press("Enter");
  await seite.waitForTimeout(600);
  pruefe("Enter klappt den Kopf wieder auf", (await anzahl(seite, "Kopf einklappen")) === 1);
  await seite.getByRole("button", { name: "Kopf einklappen" }).focus();
  await seite.keyboard.press("Space");
  await seite.waitForTimeout(600);
  pruefe("Leertaste klappt den Kopf zu", (await anzahl(seite, /^Kopf ausklappen/)) === 1);
  await kontext.close();
}

// --- Schwellen: groß startet zu, klein startet auf -------------------------------------------
{
  const gross = await oeffne("gross");
  pruefe(
    "Großer Faden (9 Ziele, 8 Mitglieder) startet zugeklappt",
    (await anzahl(gross.seite, /^Kopf ausklappen/)) === 1,
  );
  await gross.kontext.close();
  for (const szene of ["arbeitet", "wartet", "fertig"]) {
    const klein = await oeffne(szene);
    const offen = await anzahl(klein.seite, "Kopf einklappen");
    const zu = await anzahl(klein.seite, /^Kopf ausklappen/);
    pruefe(
      `Szene „${szene}“ hat einen Kopf mit Knopf (aufgeklappt oder zugeklappt)`,
      offen + zu === 1,
    );
    await klein.kontext.close();
  }
}

// --- Eingabe ----------------------------------------------------------------------------------
{
  const { kontext, seite } = await oeffne("arbeitet");
  const feld = seite.getByRole("combobox").last();
  await feld.fill("Hallo Team");
  await seite.keyboard.press("Enter");
  await seite.waitForTimeout(300);
  pruefe(
    "Enter sendet: Text erscheint im Gespräch, Feld ist leer",
    (await feld.inputValue()) === "" && (await seite.getByText("Hallo Team").count()) >= 1,
  );
  await feld.fill("erste");
  await seite.keyboard.press("Shift+Enter");
  await seite.keyboard.type("zweite");
  const gesendetErste = await seite
    .locator("[data-eintrag], article, li, p")
    .filter({ hasText: /^erste$/u })
    .count();
  pruefe(
    "Umschalt+Enter macht eine neue Zeile und sendet nicht",
    (await feld.inputValue()) === "erste\nzweite" && gesendetErste === 0,
  );
  await feld.fill("");
  await feld.pressSequentially("@");
  await seite.waitForTimeout(200);
  const liste = seite.getByRole("listbox");
  pruefe(
    "„@“ öffnet die Auswahl der Namen",
    (await liste.count()) === 1 && (await liste.getByRole("option").count()) >= 1,
  );
  const erster = ((await liste.getByRole("option").first().textContent()) ?? "")
    .trim()
    .split("\n")[0];
  await seite.keyboard.press("Enter");
  const wert = await feld.inputValue();
  pruefe(
    "Enter in der Auswahl setzt „@Name “ ein und sendet nicht",
    /^@\S+ $/u.test(wert) && erster.startsWith(wert.slice(1).trim()),
    `Feld: ${JSON.stringify(wert)}, erster Eintrag: ${JSON.stringify(erster)}`,
  );
  await feld.fill("");
  await feld.pressSequentially("@");
  await seite.keyboard.press("Escape");
  pruefe("Escape schließt die Auswahl", (await seite.getByRole("listbox").count()) === 0);
  await kontext.close();
}

// --- Antwort-Vorschlag füllt nur die Eingabe ------------------------------------------------
{
  const { kontext, seite } = await oeffne("wartet");
  const feld = seite.getByRole("combobox").last();
  const vorher = await seite.getByText("Nein", { exact: true }).count();
  await seite.getByRole("button", { name: "Antwort einsetzen: Nein" }).click();
  await seite.waitForTimeout(300);
  const wert = await feld.inputValue();
  const nachher = await seite.getByText("Nein", { exact: true }).count();
  pruefe(
    "Klick auf einen Vorschlag füllt die Eingabe (kein Senden)",
    wert.length > 0 && nachher === vorher,
    `Feld: ${JSON.stringify(wert)}`,
  );
  await kontext.close();
}

// --- Knöpfe, die es nur an einer Stelle geben darf -------------------------------------------
for (const szene of SZENEN) {
  const { kontext, seite } = await oeffne(szene);
  const zuschlag = await anzahl(seite, /\+10\.000 Token/);
  pruefe(
    szene === "grenze"
      ? "„+10.000 Token“ steht in der Grenzen-Karte"
      : `„+10.000 Token“ fehlt in Szene „${szene}“`,
    szene === "grenze" ? zuschlag === 1 : zuschlag === 0,
    `Anzahl ${zuschlag}`,
  );
  const neu =
    (await seite.getByText(/Neu erzeugen/i).count()) + (await anzahl(seite, /Neu erzeugen/i));
  pruefe(`Kein „Neu erzeugen“ in Szene „${szene}“`, neu === 0);
  await kontext.close();
}

// --- Not-Aus -----------------------------------------------------------------------------------
{
  const { kontext, seite } = await oeffne("angehalten");
  const senden = seite.getByRole("button", { name: "Senden" });
  const eingabe = await seite.getByRole("combobox").count();
  pruefe(
    "Angehalten: kein „Faden anhalten“ mehr, dafür „Fortsetzen“",
    (await anzahl(seite, "Faden anhalten")) === 0 && (await anzahl(seite, "Fortsetzen")) >= 1,
  );
  pruefe(
    "Angehalten: Eingabe gesperrt (kein Feld oder kein aktiver Senden-Knopf)",
    eingabe === 0 || (await senden.count()) === 0 || (await senden.isDisabled()),
    `Felder ${eingabe}`,
  );
  await kontext.close();
}

// --- Leiste: Reiter mit Pfeiltasten -----------------------------------------------------------
{
  const { kontext, seite } = await oeffne("gross");
  const reiter = seite.getByRole("tab");
  const n = await reiter.count();
  pruefe("Leiste hat Reiter (Ziele, Team, Lieferungen, Fragen, Belege)", n >= 4, `Anzahl ${n}`);
  if (n >= 2) {
    await reiter.first().focus();
    await seite.keyboard.press("ArrowRight");
    const zweiter = (await reiter.nth(1).getAttribute("aria-selected")) === "true";
    pruefe("Pfeil rechts wählt den nächsten Reiter", zweiter);
    await seite.keyboard.press("End");
    const letzter = (await reiter.nth(n - 1).getAttribute("aria-selected")) === "true";
    pruefe("Ende wählt den letzten Reiter", letzter);
  }
  await kontext.close();
}

// --- Handy ------------------------------------------------------------------------------------
async function scrollbalken(seite) {
  return seite.evaluate(() => {
    const treffer = [];
    const pruefeEl = (el, name) => {
      const stil = getComputedStyle(el);
      const waagrecht =
        el.offsetHeight -
        el.clientHeight -
        parseFloat(stil.borderTopWidth) -
        parseFloat(stil.borderBottomWidth);
      const senkrecht =
        el.offsetWidth -
        el.clientWidth -
        parseFloat(stil.borderLeftWidth) -
        parseFloat(stil.borderRightWidth);
      if (stil.display !== "none" && (Math.round(waagrecht) > 0 || Math.round(senkrecht) > 0)) {
        const rolleScroll = /(auto|scroll)/u.test(`${stil.overflowX} ${stil.overflowY}`);
        if (rolleScroll)
          treffer.push(`${name} (${Math.round(senkrecht)}x${Math.round(waagrecht)})`);
      }
    };
    pruefeEl(document.documentElement, "html");
    for (const el of document.querySelectorAll("*")) {
      pruefeEl(el, `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`);
    }
    return treffer;
  });
}

for (const thema of ["dunkel", "hell"]) {
  for (const szene of SZENEN) {
    const { kontext, seite } = await oeffne(szene, 390, 844, thema);
    const breiter = await seite.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    pruefe(
      `Handy, ${thema}, „${szene}“: kein waagerechter Balken`,
      breiter <= 0,
      `${breiter} Pixel zu breit`,
    );
    const balken = await scrollbalken(seite);
    pruefe(
      `Handy, ${thema}, „${szene}“: kein sichtbarer Scrollbalken`,
      balken.length === 0,
      balken.slice(0, 4).join("; "),
    );
    await kontext.close();
  }
}
{
  const { kontext, seite } = await oeffne("gross", 1400, 900);
  const balken = await scrollbalken(seite);
  pruefe(
    "Breit, „gross“: kein sichtbarer Scrollbalken",
    balken.length === 0,
    balken.slice(0, 4).join("; "),
  );
  await kontext.close();
}
{
  const { kontext, seite } = await oeffne("gross", 390, 844);
  const knopf = seite.getByRole("button", { name: "Faden-Leiste" });
  const gefunden = (await knopf.count()) === 1;
  pruefe("Handy: Knopf „Faden-Leiste“ vorhanden", gefunden);
  if (gefunden) {
    pruefe(
      "Handy: großer Faden startet mit offenem Blatt",
      (await knopf.getAttribute("aria-expanded")) === "true",
    );
    const halt = await seite.getByRole("button", { name: "Faden anhalten" }).last().boundingBox();
    pruefe(
      "Handy: im offenen Blatt liegen die Knöpfe ganz im Bild, am unteren Rand",
      halt !== null && halt.y + halt.height <= 844 && halt.y + halt.height >= 800,
      JSON.stringify(halt),
    );
    await knopf.click();
    await seite.waitForTimeout(600);
    const griff = await seite
      .getByRole("button", { name: /Faden-Leiste zeigen oder verbergen/ })
      .boundingBox();
    pruefe(
      "Handy: zugeklappt bleibt die Griffzeile am unteren Rand sichtbar",
      griff !== null && griff.y >= 700 && griff.y + griff.height <= 845,
      JSON.stringify(griff),
    );
    pruefe(
      "Handy: Knopf zeigt zugeklappt an (aria-expanded=false)",
      (await knopf.getAttribute("aria-expanded")) === "false",
    );
  }
  await kontext.close();
}

// --- hell / dunkel -----------------------------------------------------------------------------
{
  const { kontext, seite } = await oeffne("arbeitet");
  const vor = await seite.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await seite.getByRole("button", { name: "Hell" }).click();
  const nach = await seite.evaluate(() => document.documentElement.getAttribute("data-theme"));
  pruefe("„Hell“ schaltet das Thema um", vor === "dark" && nach === "light", `${vor} -> ${nach}`);
  await kontext.close();
}

await browser.close();
console.log(fehler === 0 ? "\nAlle Fälle ok." : `\n${fehler} Fehler.`);
process.exit(fehler === 0 ? 0 : 1);
