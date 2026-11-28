/**
 * PaiBot – prüft die Seiten „Bots und Teams“, Steckbrief und Team verwalten in einem echten
 * Browser (Playwright, Chromium), gegen eine laufende App mit Datenbank.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

// Prüft die echten Seiten (nicht die Vorschau `/_komponenten/teams`, dafür `pnpm teams:browser`):
//
//   pnpm doku:app -- pnpm bots:browser
//
// Was geprüft wird (jede Zeile ein Fall, am Ende die Zahl der Fehler; Exit 1 bei einem Fehler):
//   - „Bots und Teams“ steht im Menü der Seitenleiste und führt auf `/teams`
//   - ein Team und ein zweiter Bot lassen sich über die Formulare anlegen; die Seite zeigt sie
//   - der Bot taucht in der Seitenleiste auf und nach dem Zuordnen unter seinem Team
//   - der Steckbrief zeigt den Bot aus der Adresse, nicht den Standard-Bot
//   - Pausieren setzt den Hinweis; im Chat des Bots ist die Eingabe gesperrt; Fortsetzen hebt es auf
//   - die Seitenleiste behält eine Unterhaltung nach dem Senden und dem Umbenennen, unter ihrem
//     Bot und ohne Neuladen
//   - Löschen fragt zurück: Abbrechen löscht nichts, Löschen führt zurück auf `/teams`
//   - „Team verwalten“: der Hinweis ohne Tagesbudget steht am Schalter „Zusammenarbeit“
//   - ein gescheitertes Speichern (leerer Name) zeigt den Fehler und nie „Gespeichert.“
//   - eine Leitung aus dem Team lässt sich speichern (dass der Server eine Leitung ablehnt, die
//     nicht zum Team gehört, prüft `apps/web/src/lib/teams/verwaltung.test.ts`; die Seite bietet
//     in der Auswahl nur Mitglieder an, dieser Fall ist über den Browser nicht erreichbar)
//   - der Haupt-Assistent hat keinen Knopf zum Löschen
//   - am Handy (390 Pixel) gibt es auf allen drei Seiten keinen waagerechten Balken
//   - keine Seite antwortet mit einem Fehler-Status (Aufrufe von /api/ ausgenommen)
//   - keine Fehler aus dem Skript der Seite, keine Meldung der Content-Security-Policy

import { createRequire } from "node:module";
import { laufDatei, leseLauf } from "./doku/lauf.mjs";
import { geraetAlsKeks, stelleHer } from "./doku-beispieldaten.mjs";

const LAUF = laufDatei();
if (leseLauf(LAUF) === undefined) {
  console.error(
    "Keine Lauf-Datei gefunden. Erst `pnpm doku:app` starten (oder `pnpm doku:app -- pnpm bots:browser`).",
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

let fehler = 0;
function pruefe(name, ok, detail = "") {
  if (ok) console.log(`ok     ${name}`);
  else {
    fehler += 1;
    console.log(`FEHLER ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const ergebnis = await stelleHer("mit-beispieldaten", LAUF);
for (const m of ergebnis.meldungen) console.log(`       ${m}`);
const lauf = ergebnis.lauf;

const TEAM = "Content";
const BOT = "Mila";
const AUFGABE = "Sammelt Themen und schreibt Stichpunkte.";

/** Kennung des Standard-Bots, wie `GET /api/bots` sie nennt (`standardBotId`). */
async function standardBotId(seite, basis) {
  const antwort = await seite.request.get(`${basis}/api/bots`);
  if (!antwort.ok()) throw new Error(`GET /api/bots antwortet ${antwort.status()}`);
  const daten = await antwort.json();
  const id = daten?.daten?.standardBotId;
  if (typeof id !== "string") throw new Error("GET /api/bots nennt keinen Standard-Bot");
  return id;
}

/** Breiten der Seite: Gibt es einen waagerechten Balken? */
async function breiten(seite) {
  return await seite.evaluate(() => ({
    fenster: window.innerWidth,
    dokument: document.documentElement.scrollWidth,
    haupt: Array.from(document.querySelectorAll("main, [role='main'], main *")).reduce(
      (m, e) => Math.max(m, e.getBoundingClientRect().right),
      0,
    ),
  }));
}

const pw = await playwright();
const { chromium } = pw.chromium ? pw : pw.default;
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    viewport: { width: 1440, height: 900 },
  });
  const geraet = geraetAlsKeks(lauf);
  if (geraet) await context.addCookies([geraet]);
  const seite = await context.newPage();
  const skriptFehler = [];
  const cspMeldungen = [];
  // Eine Seite dieser App darf nie mit einem Fehler-Status antworten. Abgelehnte Aufrufe der
  // Schnittstelle (`/api/...`) gehören dagegen zum Spiel und bleiben hier draußen.
  const seitenFehler = [];
  seite.on("pageerror", (e) => skriptFehler.push(String(e)));
  seite.on("response", (a) => {
    const pfad = new URL(a.url()).pathname;
    if (a.status() >= 400 && !pfad.startsWith("/api/")) {
      seitenFehler.push(`${a.status()} ${a.request().method()} ${pfad}`);
    }
  });
  seite.on("console", (m) => {
    if (/Content Security Policy|Refused to/iu.test(m.text())) cspMeldungen.push(m.text());
  });

  await seite.goto(`${lauf.url}/anmelden`, { waitUntil: "load" });
  await seite.getByLabel("Passwort", { exact: true }).fill(lauf.passwort);
  await seite.getByRole("button", { name: "Anmelden", exact: true }).click();
  await seite.waitForURL(`${lauf.url}/`, { timeout: 15_000 });

  // 1. Der Weg in die Seite führt über das Menü, nicht über eine getippte Adresse.
  const menueLink = seite.getByRole("link", { name: "Bots und Teams", exact: true }).first();
  pruefe("Seitenleiste: „Bots und Teams“ steht im Menü", (await menueLink.count()) === 1);
  await menueLink.click();
  await seite.waitForURL(`${lauf.url}/teams`, { timeout: 15_000 });
  await seite.waitForSelector("main");
  pruefe(
    "frische Installation: noch kein Team",
    ((await seite.locator("main").textContent()) ?? "").includes("Noch kein Team"),
  );

  // 2. Team und zweiter Bot über die Formulare.
  await seite.getByLabel("Name des Teams").fill(TEAM);
  await seite.getByRole("button", { name: "Team anlegen", exact: true }).click();
  await seite.getByText(TEAM, { exact: false }).first().waitFor({ timeout: 15_000 });
  pruefe(
    "Team anlegen: das Team steht in der Liste",
    (await seite.locator("main").getByRole("link", { name: "Verwalten" }).count()) === 1,
  );

  await seite.getByLabel("Name des Bots").fill(BOT);
  await seite.getByLabel("Aufgabe in einem Satz").fill(AUFGABE);
  await seite.getByRole("button", { name: "Bot anlegen", exact: true }).click();
  const botLink = seite.getByRole("link", { name: `Bot ${BOT} öffnen` });
  await botLink.waitFor({ timeout: 15_000 });
  pruefe("Bot anlegen: der zweite Bot steht unter „Bots“", (await botLink.count()) === 1);
  pruefe(
    "Seitenleiste: der zweite Bot taucht auf",
    ((await seite.locator("nav, aside").first().textContent()) ?? "").includes(BOT),
  );

  // 3. Steckbrief: der Bot aus der Adresse, nicht der Standard-Bot.
  await botLink.click();
  await seite.waitForURL(/\/bot\/bot_/u, { timeout: 15_000 });
  const steckbriefAdresse = seite.url();
  await seite.waitForSelector("main");
  const steckbrief = (await seite.locator("main").textContent()) ?? "";
  pruefe("Steckbrief: zeigt den Bot aus der Adresse", steckbrief.includes(AUFGABE));
  pruefe(
    "Steckbrief: Knöpfe für Pause und Löschen sind da",
    (await seite.getByRole("button", { name: "Pausieren", exact: true }).count()) === 1 &&
      (await seite.getByRole("button", { name: "Löschen …", exact: true }).count()) === 1,
  );

  // 4. Team zuordnen.
  await seite.getByLabel(`Team von ${BOT} wählen`).selectOption({ label: TEAM });
  await seite.getByText(TEAM, { exact: false }).first().waitFor({ timeout: 15_000 });
  await seite.waitForTimeout(500);
  pruefe(
    "Team zuordnen: der Bot steht in der Seitenleiste unter seinem Team",
    ((await seite.locator("nav, aside").first().textContent()) ?? "").includes(TEAM),
  );

  // 5. Pausieren: Hinweis im Steckbrief, Eingabe im Chat gesperrt.
  await seite.getByRole("button", { name: "Pausieren", exact: true }).click();
  await seite.getByRole("button", { name: "Fortsetzen", exact: true }).waitFor({ timeout: 15_000 });
  pruefe(
    "Pausieren: der Steckbrief nennt die Pause",
    ((await seite.locator("main").textContent()) ?? "").includes("pausiert"),
  );
  const botId = steckbriefAdresse.split("/bot/")[1];
  await seite.goto(`${lauf.url}/?bot=${botId}`, { waitUntil: "load" });
  await seite.waitForSelector("main");
  await seite.waitForTimeout(500);
  const hinweis = seite.locator("[data-baustein='bot-pausiert']");
  pruefe("Chat: der Hinweis auf die Pause steht über der Eingabe", (await hinweis.count()) === 1);
  const eingabe = seite.locator("main textarea").first();
  pruefe(
    "Chat: die Eingabe ist gesperrt, solange der Bot pausiert",
    (await eingabe.count()) === 0 || (await eingabe.isDisabled()),
  );

  await seite.goto(steckbriefAdresse, { waitUntil: "load" });
  await seite.getByRole("button", { name: "Fortsetzen", exact: true }).click();
  await seite.getByRole("button", { name: "Pausieren", exact: true }).waitFor({ timeout: 15_000 });
  pruefe("Fortsetzen: der Knopf heißt wieder „Pausieren“", true);

  // 6. Team verwalten: Hinweis ohne Tagesbudget, Leitung muss Mitglied sein.
  await seite.goto(`${lauf.url}/teams`, { waitUntil: "load" });
  await seite.getByRole("link", { name: "Verwalten" }).first().click();
  await seite.waitForURL(/\/teams\/tea_/u, { timeout: 15_000 });
  await seite.waitForSelector("main");
  const teamAdresse = seite.url();
  pruefe(
    "Team verwalten: der Hinweis ohne Tagesbudget steht am Schalter „Zusammenarbeit“",
    (await seite.locator("[data-baustein='zusammenarbeit-hinweis']").count()) === 1,
  );
  pruefe(
    "Team verwalten: der Hinweis steht innerhalb von „Zusammenarbeit“",
    (await seite.locator("fieldset:has([data-baustein='zusammenarbeit-hinweis'])").count()) === 1,
  );
  pruefe(
    "Team verwalten: „Team löschen …“ ist da",
    (await seite.getByRole("button", { name: "Team löschen …", exact: true }).count()) === 1,
  );

  // Gescheitertes Speichern ist kein Erfolg: ein leerer Name wird abgelehnt, und dann steht die
  // Fehlermeldung da – nicht „Gespeichert.“. Gegenprobe: in `packages/ui/src/teams/Verwaltung.tsx`
  // das `try`/`catch` um `onSpeichern` entfernen (oder in `TeamSeite.tsx` den Fehler wieder mit
  // `.catch(() => undefined)` schlucken) → dieser Fall wird rot.
  const nameFeld = seite.getByLabel("Name", { exact: true });
  await nameFeld.fill("");
  await seite.getByRole("button", { name: "Speichern", exact: true }).click();
  await seite.locator("[data-baustein='team-fehler']").waitFor({ timeout: 15_000 });
  await seite.waitForTimeout(300);
  pruefe(
    "Speichern gescheitert: Fehler sichtbar und kein „Gespeichert.“",
    (await seite.getByText("Gespeichert.").count()) === 0,
  );
  pruefe(
    "Speichern gescheitert: der Name in der Datenbank bleibt, wie er war",
    ((await seite.locator("main h1").textContent()) ?? "") === TEAM,
  );

  // Leitung setzen: der Bot ist Mitglied, das geht – und jetzt kommt die Bestätigung.
  await nameFeld.fill(TEAM);
  await seite.getByLabel("Leitung", { exact: true }).selectOption({ label: BOT });
  await seite.getByRole("button", { name: "Speichern", exact: true }).click();
  await seite.getByText("Gespeichert.").waitFor({ timeout: 15_000 });
  pruefe("Leitung setzen: ein Mitglied lässt sich als Leitung speichern", true);
  pruefe(
    "Speichern gelungen: die Fehlermeldung ist weg",
    (await seite.locator("[data-baustein='team-fehler']").count()) === 0,
  );

  // 7. Der Haupt-Assistent hat keinen Knopf zum Löschen (seine Seite in der Leiste ist `/bot`;
  // den Steckbrief gibt es trotzdem, und auch dort löscht ihn niemand).
  const hauptId = await standardBotId(seite, lauf.url);
  await seite.goto(`${lauf.url}/bot/${hauptId}`, { waitUntil: "load" });
  await seite.waitForSelector("main");
  pruefe(
    "Haupt-Assistent: kein Knopf „Löschen …“, sondern der Satz, dass er bleibt",
    (await seite.getByRole("button", { name: "Löschen …", exact: true }).count()) === 0 &&
      ((await seite.locator("main").textContent()) ?? "").includes("Er bleibt"),
  );

  // 8. Löschen fragt zurück.
  await seite.goto(steckbriefAdresse, { waitUntil: "load" });
  await seite.getByRole("button", { name: "Löschen …", exact: true }).click();
  await seite.getByText("Seine Belege bleiben erhalten.").waitFor({ timeout: 15_000 });
  await seite.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await seite.waitForTimeout(300);
  pruefe(
    "Löschen: „Abbrechen“ löscht nichts",
    seite.url() === steckbriefAdresse &&
      ((await seite.locator("main").textContent()) ?? "").includes(AUFGABE),
  );

  // 9. Handy: kein waagerechter Balken auf allen drei Seiten.
  await seite.setViewportSize({ width: 390, height: 844 });
  for (const [name, adresse] of [
    ["Bots und Teams", `${lauf.url}/teams`],
    ["Steckbrief", steckbriefAdresse],
    ["Team verwalten", teamAdresse],
  ]) {
    await seite.goto(adresse, { waitUntil: "load" });
    await seite.waitForSelector("main");
    await seite.waitForTimeout(400);
    const b = await breiten(seite);
    pruefe(
      `Handy: kein waagerechter Balken auf „${name}“`,
      b.dokument <= b.fenster && b.haupt <= b.fenster + 1,
      JSON.stringify(b),
    );
  }

  // 10. Löschen führt zurück auf „Bots und Teams“, und der Bot ist weg.
  await seite.setViewportSize({ width: 1440, height: 900 });
  await seite.goto(steckbriefAdresse, { waitUntil: "load" });
  await seite.getByRole("button", { name: "Löschen …", exact: true }).click();
  await seite.getByRole("button", { name: "Löschen", exact: true }).click();
  await seite.waitForURL(`${lauf.url}/teams`, { timeout: 15_000 });
  await seite.waitForSelector("main");
  await seite.waitForTimeout(500);
  pruefe(
    "Löschen: zurück auf „Bots und Teams“, der Bot ist weg",
    !((await seite.locator("main").textContent()) ?? "").includes(AUFGABE),
  );
  pruefe(
    "Löschen: das Team bleibt, jetzt ohne Leitung",
    ((await seite.locator("main").textContent()) ?? "").includes(TEAM),
  );

  // 11. Die Seitenleiste behält die Unterhaltung – nach dem Senden und nach dem Umbenennen, ohne
  // Neuladen und unter ihrem Bot. Gegenprobe zum Befund „Unterhaltung verschwindet nach dem Senden
  // oder Umbenennen aus der Seitenleiste“: in `apps/web/src/app/(app)/chat/ChatSeite.tsx` an einem
  // der drei Aufrufe von `unterhaltungMerken` die `botId` auf `undefined` setzen (weglassen
  // verbietet der Typecheck, siehe `UnterhaltungUpdate`) → diese zwei Fälle werden rot.
  // Hier mit dem Haupt-Assistenten, weil der zweite Bot oben gelöscht wurde; die Zuordnung läuft
  // für jeden Bot über dieselbe Stelle. Dass sie pro Bot stimmt, prüft
  // `apps/web/src/lib/chat/seitenleiste.test.ts`.
  const paiNav = () => seite.locator('nav[aria-label="Unterhaltungen von Pai"]');
  await seite.goto(`${lauf.url}/`, { waitUntil: "load" });
  const feld = seite.locator("main textarea").first();
  await feld.waitFor({ timeout: 15_000 });
  await feld.fill("Was steht heute an?");
  await seite.getByRole("button", { name: "Senden", exact: true }).click();
  await seite.waitForURL(/\/chat\//u, { timeout: 30_000 });
  await seite.waitForTimeout(1500);
  // Die offene Unterhaltung ist die Seite, auf der wir stehen: Ihre Zeile trägt `aria-current`
  // – und zwar in der Liste von Pai, nicht irgendwo sonst.
  pruefe(
    "Seitenleiste: die neue Unterhaltung steht unter ihrem Bot, ohne Neuladen",
    (await paiNav().locator('a[aria-current="page"]').count()) === 1,
    `Zeilen in der Liste von Pai: ${await paiNav().getByRole("link").count()}`,
  );

  const NEUER_TITEL = "Themen für Montag";
  await seite.getByRole("button", { name: "Weitere Aktionen", exact: true }).first().click();
  await seite.getByRole("menuitem", { name: "Umbenennen", exact: true }).click();
  await seite.getByLabel("Titel", { exact: true }).fill(NEUER_TITEL);
  await seite.getByRole("button", { name: "Speichern", exact: true }).click();
  await seite.waitForTimeout(1000);
  pruefe(
    "Seitenleiste: nach dem Umbenennen steht sie weiter unter ihrem Bot, ohne Neuladen",
    (await paiNav().getByRole("link", { name: NEUER_TITEL, exact: true }).count()) === 1,
  );

  pruefe("Seite: keine Fehler aus dem Skript", skriptFehler.length === 0, skriptFehler.join(" | "));
  pruefe(
    "Seite: keine Antwort einer Seite mit Fehler-Status",
    seitenFehler.length === 0,
    seitenFehler.join(" | "),
  );
  pruefe(
    "Seite: keine Meldung der Content-Security-Policy",
    cspMeldungen.length === 0,
    cspMeldungen.join(" | "),
  );
} finally {
  await browser.close();
}

console.log(fehler === 0 ? "Alle Fälle ok." : `${fehler} Fall/Fälle fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
