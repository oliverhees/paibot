/**
 * PaiBot – prüft die Vorschau von Bots und Teams in einem echten Browser (Playwright, Chromium).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

// Prüft die Vorschau `/_komponenten/teams` im Browser. Die Adresse muss `localhost` heißen (unter
// `127.0.0.1` lädt der Entwicklungs-Server die Skripte der Seite nicht). Die Seite gibt es nur mit dem
// Entwicklungs-Server und ohne Datenbank:
//
//   pnpm dev                                      (Entwicklungs-Server, Standard-Port 3000)
//   TEAMS_URL=http://localhost:3000 pnpm teams:browser
//
// Was geprüft wird (jede Zeile ein Fall, am Ende die Zahl der Fehler; Exit 1 bei einem Fehler):
//   - Menü eines Bots mit der Tastatur: Enter öffnet, Pfeil runter wandert, Escape schließt und gibt den
//     Fokus zurück; Pausieren, Team wechseln und Löschen laufen ohne Maus
//   - Löschen fragt nach: Escape und „Abbrechen“ löschen nichts, „Löschen“ entfernt den Bot
//   - Not-Aus sperrt „Team anlegen“ im Entwurf; Anlegen, danach „Rückgängig“
//   - Wortlaut der Anweisungen lässt sich aufklappen
//   - Teams-Übersicht: „Stoppen“ verschiebt den Faden nach „Fertig“
//   - am Handy (390 Pixel): Seitenleiste als Blatt von unten, Rückfrage im Bild, kein waagerechter Balken
//     und nirgends ein sichtbarer Scrollbalken, in jeder Szene, dunkel und hell
//   - hell/dunkel wechselt das Thema
// Nicht geprüft: Inhalte hinter einem Server (es gibt keinen).

import { createRequire } from "node:module";

// biome-ignore lint/suspicious/noUndeclaredEnvVars: nur für dieses Skript, kein Turborepo-Task
const BASIS = (process.env.TEAMS_URL ?? "http://localhost:3000").replace(/\/$/u, "");
const SZENEN = ["seitenleiste", "bot", "team", "entwurf", "uebersicht"];

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

async function oeffne(szene, breite = 1440, hoehe = 900, thema = "dunkel", extra = "") {
  const kontext = await browser.newContext({ viewport: { width: breite, height: hoehe } });
  const seite = await kontext.newPage();
  seite.setDefaultTimeout(5000);
  const antwort = await seite.goto(
    `${BASIS}/_komponenten/teams?szene=${szene}${thema === "hell" ? "&thema=hell" : ""}${extra}`,
  );
  if (antwort?.status() !== 200) {
    console.error(
      `Vorschau nicht erreichbar (${antwort?.status()}): läuft \`pnpm dev\` unter ${BASIS}?`,
    );
    process.exit(1);
  }
  await seite
    .locator('[data-baustein="teams-ansicht"]')
    .waitFor({ state: "attached", timeout: 20000 });
  await seite.waitForLoadState("networkidle").catch(() => {});
  await seite.waitForTimeout(800);
  return { kontext, seite };
}

/** Ein Abschnitt, der abstürzt (Knopf fehlt, Zeit um), ist ein Fehlerfall, kein Abbruch des ganzen Laufs. */
async function abschnitt(titel, fn) {
  try {
    await fn();
  } catch (e) {
    pruefe(`Abschnitt „${titel}“ lief durch`, false, String(e?.message ?? e).split("\n")[0]);
  }
}

const menueKnopf = (seite, name) => seite.getByRole("button", { name: `Menü für ${name}` });
const gruppe = (seite, name) => seite.getByRole("region", { name, exact: true });

// --- Menü mit der Tastatur ------------------------------------------------------------------
await abschnitt("Menü mit der Tastatur", async () => {
  const { kontext, seite } = await oeffne("seitenleiste");
  const knopf = menueKnopf(seite, "Ideen");
  await knopf.focus();
  await seite.keyboard.press("Enter");
  const menue = seite.getByRole("menu");
  pruefe(
    "Enter öffnet das Menü (aria-expanded) mit dem Fokus auf dem ersten Eintrag",
    (await menue.count()) === 1 &&
      (await knopf.getAttribute("aria-expanded")) === "true" &&
      (await seite.evaluate(() => document.activeElement?.textContent?.trim())) === "Pausieren",
  );
  await seite.keyboard.press("ArrowDown");
  pruefe(
    "Pfeil runter wandert zu „Team wechseln“",
    (await seite.evaluate(() => document.activeElement?.textContent?.trim())) === "Team wechseln",
  );
  await seite.keyboard.press("ArrowDown");
  await seite.keyboard.press("ArrowDown");
  pruefe(
    "Pfeil runter springt nach dem letzten Eintrag wieder nach oben",
    (await seite.evaluate(() => document.activeElement?.textContent?.trim())) === "Pausieren",
  );
  await seite.keyboard.press("Escape");
  pruefe(
    "Escape schließt das Menü und gibt den Fokus zurück",
    (await seite.getByRole("menu").count()) === 0 &&
      (await seite.evaluate(() => document.activeElement?.getAttribute("aria-label"))) ===
        "Menü für Ideen",
  );

  // Pausieren
  await seite.keyboard.press("Enter");
  await seite.keyboard.press("Enter");
  pruefe(
    "Enter auf „Pausieren“ pausiert den Bot (Marke „pausiert“ an Ideen)",
    (await gruppe(seite, "Content").getByText("pausiert", { exact: true }).count()) === 1,
  );
  await seite.keyboard.press("Enter");
  pruefe(
    "Im Menü steht danach „Fortsetzen“",
    (await seite.getByRole("menuitem", { name: "Fortsetzen" }).count()) === 1,
  );
  await seite.keyboard.press("Escape");

  // Team wechseln
  await seite.keyboard.press("Enter");
  await seite.keyboard.press("ArrowDown");
  await seite.keyboard.press("Enter");
  const wahl = seite.getByRole("menuitemradio");
  pruefe(
    "„Team wechseln“ zeigt die Teams und „Kein Team“ zur Wahl, das jetzige angehakt",
    (await wahl.count()) === 3 &&
      (await seite.getByRole("menuitemradio", { name: "Content" }).getAttribute("aria-checked")) ===
        "true",
  );
  await seite.getByRole("menuitemradio", { name: "Recherche" }).focus();
  await seite.keyboard.press("Enter");
  pruefe(
    "Auswahl „Recherche“ setzt den Bot in das andere Team",
    (await gruppe(seite, "Recherche").getByText("Ideen", { exact: true }).count()) === 1 &&
      (await gruppe(seite, "Content").getByText("Ideen", { exact: true }).count()) === 0,
  );
  await kontext.close();
});

// --- Löschen mit Rückfrage --------------------------------------------------------------------
async function loeschenOeffnen(seite, name) {
  await menueKnopf(seite, name).focus();
  await seite.keyboard.press("Enter");
  await seite.keyboard.press("End");
  await seite.keyboard.press("Enter");
  await seite.getByRole("alertdialog").waitFor({ state: "visible" });
}
await abschnitt("Löschen mit Rückfrage", async () => {
  const { kontext, seite } = await oeffne("seitenleiste");
  await loeschenOeffnen(seite, "Lektorat");
  const dialog = seite.getByRole("alertdialog");
  pruefe(
    "Löschen fragt nach und sagt, dass die Belege bleiben",
    (await dialog.getByText("Seine Belege bleiben erhalten.").count()) === 1,
  );
  await seite.keyboard.press("Escape");
  pruefe(
    "Escape bricht ab: Rückfrage weg, Bot noch da",
    (await seite.getByRole("alertdialog").count()) === 0 &&
      (await menueKnopf(seite, "Lektorat").count()) === 1,
  );
  await loeschenOeffnen(seite, "Lektorat");
  await dialog.getByRole("button", { name: "Abbrechen" }).click();
  pruefe("„Abbrechen“ löscht nichts", (await menueKnopf(seite, "Lektorat").count()) === 1);
  await loeschenOeffnen(seite, "Lektorat");
  await dialog.getByRole("button", { name: "Löschen", exact: true }).click();
  pruefe(
    "„Löschen“ entfernt den Bot aus der Seitenleiste",
    (await menueKnopf(seite, "Lektorat").count()) === 0 &&
      (await menueKnopf(seite, "Entwurf").count()) === 1,
  );
  await kontext.close();
});

await abschnitt("Löschen der Leitung nennt das Team", async () => {
  const { kontext, seite } = await oeffne("seitenleiste");
  await loeschenOeffnen(seite, "Redaktion");
  pruefe(
    "Bei der Leitung steht dabei, dass das Team eine neue braucht",
    (await seite
      .getByRole("alertdialog")
      .getByText("ist die Leitung von Content", { exact: false })
      .count()) === 1,
  );
  await kontext.close();
});

// --- Bot-Seite --------------------------------------------------------------------------------
await abschnitt("Bot-Seite", async () => {
  const { kontext, seite } = await oeffne("bot", 1440, 900, "dunkel", "&bot=zahlen");
  pruefe(
    "Ein pausierter Bot zeigt den Hinweis „pausiert“",
    (await seite.locator('[data-baustein="pausiert"]').count()) === 1,
  );
  await seite.getByRole("button", { name: "Bot Ideen öffnen" }).click();
  pruefe(
    "Klick auf einen anderen Bot öffnet dessen Steckbrief ohne Hinweis",
    (await seite.getByRole("heading", { level: 1, name: "Ideen" }).count()) === 1 &&
      (await seite.locator('[data-baustein="pausiert"]').count()) === 0,
  );
  await kontext.close();
});

// --- Entwurf: Not-Aus, Anlegen, Rückgängig ------------------------------------------------------
await abschnitt("Entwurf", async () => {
  const { kontext, seite } = await oeffne("entwurf");
  const anlegen = seite.getByRole("button", { name: "Team anlegen" });
  pruefe("Der Entwurf legt nichts von selbst an", (await menueKnopf(seite, "Ideen").count()) === 0);
  await seite.getByRole("button", { name: "Anhalten", exact: true }).click();
  pruefe(
    "Not-Aus sperrt „Team anlegen“ und sagt es",
    (await anlegen.isDisabled()) &&
      (await seite.locator('[data-baustein="entwurf-gesperrt"]').count()) === 1,
  );
  await seite.getByRole("button", { name: "Fortsetzen" }).click();
  pruefe("Ohne Not-Aus ist „Team anlegen“ frei", await anlegen.isEnabled());
  const wortlaut = seite.locator("summary", { hasText: "Anweisung im vollen Wortlaut" }).first();
  await wortlaut.click();
  pruefe("Der Wortlaut klappt auf", await seite.locator("pre").first().isVisible());
  await seite.getByRole("checkbox", { name: /Ideen/ }).uncheck();
  pruefe(
    "Ein Bot lässt sich abwählen (Zusammenfassung zählt mit)",
    (await seite.getByText("Anlegen: 3 Bots und 1 Team.").count()) === 1,
  );
  await anlegen.click();
  pruefe(
    "Anlegen zeigt „angelegt“ und „Rückgängig“, die Bots stehen in der Seitenleiste",
    (await seite.locator('[data-baustein="entwurf-angelegt"]').count()) === 1 &&
      (await menueKnopf(seite, "Redaktion").count()) === 1 &&
      (await menueKnopf(seite, "Ideen").count()) === 0,
  );
  await seite.getByRole("button", { name: "Rückgängig" }).click();
  pruefe(
    "„Rückgängig“ nimmt Team und Bots wieder weg",
    (await menueKnopf(seite, "Redaktion").count()) === 0 &&
      (await seite.locator('[data-baustein="entwurf-zu"]').count()) === 1,
  );
  await kontext.close();
});

// --- Übersicht --------------------------------------------------------------------------------
await abschnitt("Übersicht", async () => {
  const { kontext, seite } = await oeffne("uebersicht");
  const fertig = seite.locator('[data-stand="fertig"]');
  const vorher = await fertig.locator('[data-baustein="uebersicht-faden"]').count();
  await seite.getByRole("button", { name: "Faden stoppen: Artikel über Wiesen" }).click();
  pruefe(
    "„Stoppen“ verschiebt den Faden nach „Fertig“ mit dem Wort „gestoppt“",
    (await fertig.locator('[data-baustein="uebersicht-faden"]').count()) === vorher + 1 &&
      (await fertig.getByText("gestoppt", { exact: false }).count()) === 1,
  );
  pruefe(
    "Gestoppte und fertige Fäden haben kein „Stoppen“ mehr",
    (await fertig.getByRole("button", { name: /Stoppen/ }).count()) === 0,
  );
  await kontext.close();
});

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
  for (const breite of [390, 1440]) {
    for (const szene of SZENEN) {
      const hoehe = breite === 390 ? 844 : 900;
      const { kontext, seite } = await oeffne(szene, breite, hoehe, thema);
      const breiter = await seite.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      const balken = await scrollbalken(seite);
      pruefe(
        `${breite} Pixel, ${thema}, „${szene}“: kein waagerechter Balken und kein sichtbarer Scrollbalken`,
        breiter <= 0 && balken.length === 0,
        `${breiter} Pixel zu breit; ${balken.slice(0, 4).join("; ")}`,
      );
      await kontext.close();
    }
  }
}

await abschnitt("Handy: Blatt von unten", async () => {
  const { kontext, seite } = await oeffne("seitenleiste", 390, 844);
  const knopf = seite.getByRole("button", { name: "Bots und Teams zeigen oder verbergen" });
  pruefe(
    "Handy: in der Szene „Seitenleiste“ startet das Blatt offen",
    (await knopf.getAttribute("aria-expanded")) === "true",
  );
  const notaus = await seite.getByRole("button", { name: "Anhalten", exact: true }).boundingBox();
  pruefe(
    "Handy: im offenen Blatt liegt der Not-Aus im Bild",
    notaus !== null && notaus.y >= 0 && notaus.y + notaus.height <= 844,
    JSON.stringify(notaus),
  );
  await knopf.click();
  await seite.waitForTimeout(600);
  const griff = await knopf.boundingBox();
  pruefe(
    "Handy: zugeklappt bleibt die Griffzeile am unteren Rand sichtbar",
    (await knopf.getAttribute("aria-expanded")) === "false" &&
      griff !== null &&
      griff.y >= 700 &&
      griff.y + griff.height <= 845,
    JSON.stringify(griff),
  );
  await knopf.click();
  await seite.waitForTimeout(600);
  await seite.getByRole("button", { name: "Bot Ideen öffnen" }).click();
  await seite.waitForTimeout(600);
  pruefe(
    "Handy: Auswahl eines Bots schließt das Blatt und zeigt den Steckbrief",
    (await knopf.getAttribute("aria-expanded")) === "false" &&
      (await seite.getByRole("heading", { level: 1, name: "Ideen" }).isVisible()),
  );
  await knopf.click();
  await seite.waitForTimeout(600);
  await loeschenOeffnen(seite, "Lektorat");
  const rahmen = await seite.getByRole("alertdialog").boundingBox();
  pruefe(
    "Handy: die Rückfrage vor dem Löschen liegt ganz im Bild",
    rahmen !== null && rahmen.x >= 0 && rahmen.x + rahmen.width <= 390 && rahmen.y >= 0,
    JSON.stringify(rahmen),
  );
  await kontext.close();
});

// --- hell / dunkel -----------------------------------------------------------------------------
await abschnitt("hell / dunkel", async () => {
  const { kontext, seite } = await oeffne("bot");
  const vor = await seite.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await seite.getByRole("button", { name: "Hell" }).click();
  const nach = await seite.evaluate(() => document.documentElement.getAttribute("data-theme"));
  pruefe("„Hell“ schaltet das Thema um", vor === "dark" && nach === "light", `${vor} -> ${nach}`);
  await kontext.close();
});

await browser.close();
console.log(fehler === 0 ? "\nAlle Fälle ok." : `\n${fehler} Fehler.`);
process.exit(fehler === 0 ? 0 : 1);
