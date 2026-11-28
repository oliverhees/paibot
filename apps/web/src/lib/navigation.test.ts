/**
 * PaiBot – prüft die Navigation: Werkzeuge in der Reihenfolge der Oberfläche, Titel der Kopfzeile
 * für jede Seite der App, aktive Zeile des Bots und die Herkunft der Modelle.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { t } from "@paibot/shared/texte";
import { describe, expect, it } from "vitest";
import { INFO_LINKS } from "./einstellungen/info";
import {
  BOT_ADRESSE,
  botAktiv,
  DU_ADRESSEN,
  duEintraege,
  kopfTitel,
  liegtUnter,
  modelleHerkunft,
  NAVIGATION,
} from "./navigation";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "../app/(app)");

/** Alle Seiten der App-Gruppe als Pfad (`[id]` bleibt als Platzhalter stehen). */
function seiten(ordner = APP, basis = ""): string[] {
  const liste: string[] = [];
  for (const name of readdirSync(ordner)) {
    const voll = path.join(ordner, name);
    if (statSync(voll).isDirectory()) liste.push(...seiten(voll, `${basis}/${name}`));
    else if (name === "page.tsx") liste.push(basis === "" ? "/" : basis);
  }
  return liste.sort();
}

describe("Menü „Du“", () => {
  const eintraege = duEintraege("0.3.0+test", INFO_LINKS);

  it("hat Persönliches, Hilfe mit Dokumentation und Roadmap, Info und zuletzt abgesetzt Abmelden", () => {
    expect(eintraege.map((e) => e.id)).toEqual([
      "zugang",
      "einstellungen",
      "neuigkeiten",
      "doku",
      "roadmap",
      "selbsttest",
      "info",
      "abmelden",
    ]);
    expect(eintraege.at(-1)).toMatchObject({ ziel: "abmelden", gruppe: "" });
    expect(eintraege.map((e) => e.text)).not.toContain(
      expect.stringMatching(/Tarif|Abrechnung|Update/),
    );
  });

  it("öffnet Dokumentation und Roadmap auf paibot.de, nennt den Stand und führt sonst in die App", () => {
    const ziel = (id: string) => eintraege.find((e) => e.id === id)?.ziel;
    expect(ziel("doku")).toEqual({ extern: "https://paibot.de/doku" });
    expect(ziel("roadmap")).toEqual({ extern: "https://paibot.de/bauplan" });
    expect(ziel("zugang")).toEqual({ intern: "/einstellungen" });
    expect(ziel("selbsttest")).toEqual({ intern: "/einstellungen/selbsttest" });
    expect(eintraege.find((e) => e.id === "neuigkeiten")?.hinweis).toContain("0.3.0+test");
    expect(eintraege.find((e) => e.id === "doku")?.text).toBe("Dokumentation");
    expect(eintraege.find((e) => e.id === "roadmap")?.text).toBe("Roadmap");
  });
});

describe("Navigation", () => {
  it("zeigt die Arbeits-Seiten Bots und Teams, Belege, Regeln, Datenschleuse, Modell und Anbieter, Apps in dieser Reihenfolge", () => {
    expect(NAVIGATION.map((e) => e.href)).toEqual([
      "/teams",
      "/belege",
      "/regeln",
      "/datenschleuse",
      "/modelle",
      "/apps",
    ]);
    expect(NAVIGATION.find((e) => e.id === "regeln")?.text).toBe("Regeln");
  });

  it("jeder Eintrag führt zu einer gebauten Seite", () => {
    const vorhanden = seiten();
    for (const e of NAVIGATION) expect(vorhanden, e.href).toContain(e.href);
    // Ziele im Menü „Du“
    for (const href of Object.values(DU_ADRESSEN)) expect(vorhanden, href).toContain(href);
    expect(vorhanden).toContain(BOT_ADRESSE);
  });

  it("die Kopfzeile zeigt auf jeder Seite ihren Titel", () => {
    const erwartet: Record<string, string> = {
      "/": t("seite.chat"),
      "/belege": t("seite.belege"),
      "/belege/[id]": t("seite.belege"),
      "/apps": t("seite.apps"),
      "/bot": t("seite.bot"),
      "/bot/[id]": t("seite.bot"),
      "/datenschleuse": t("seite.datenschleuse"),
      "/einstellungen": t("seite.einstellungen"),
      "/einstellungen/darstellung": t("seite.einstellungen"),
      "/einstellungen/grenzen": t("seite.einstellungen"),
      "/info": t("seite.info"),
      "/modelle": t("seite.modelle"),
      "/regeln": t("seite.regeln"),
      "/teams": t("teams.seite.titel"),
      "/teams/[id]": t("teams.seite.titel"),
      "/einstellungen/selbsttest": t("seite.einstellungen"),
    };
    const ohneEigeneKopfzeile = seiten().filter((s) => !s.startsWith("/chat/"));
    // Kommt eine Seite dazu, muss sie hier mit ihrem Titel stehen.
    expect(ohneEigeneKopfzeile).toEqual(Object.keys(erwartet).sort());
    for (const [pfad, titel] of Object.entries(erwartet)) {
      expect(kopfTitel(pfad.replace("[id]", "blg_beispiel")), pfad).toBe(titel);
    }
  });

  it("die Unterhaltung setzt ihre eigene Kopfzeile", () => {
    const chat = seiten().filter((s) => s.startsWith("/chat/"));
    expect(chat).toEqual(["/chat/[id]"]);
    const text = readFileSync(path.join(APP, "chat/ChatSeite.tsx"), "utf8");
    expect(text).toMatch(/useKopf\(kopf\)/);
  });

  it("ähnliche Pfade gehören nicht dazu", () => {
    expect(liegtUnter("/belegexport", "/belege")).toBe(false);
    expect(liegtUnter("/belege/blg_1", "/belege")).toBe(true);
    expect(kopfTitel("/botschaft")).toBe(t("seite.chat"));
  });

  it("die Zeile des Bots ist auf dem Steckbrief und in seinen Unterhaltungen aktiv", () => {
    expect(botAktiv("/bot", false)).toBe(true);
    expect(botAktiv("/chat/unt_1", true)).toBe(true);
    expect(botAktiv("/", false)).toBe(false);
    expect(botAktiv("/belege", false)).toBe(false);
  });

  it("die Herkunft der Modelle ist die belegbare Angabe zum Anbieter, nie eine angenommene Region", () => {
    expect(modelleHerkunft("über EUrouter")).toBe("über EUrouter");
    expect(modelleHerkunft(undefined)).toBe(t("navigation.modelle.keine"));
    expect(modelleHerkunft(undefined)).not.toBe("EU");
  });

  it("der Rahmen nimmt die Herkunft aus anbieterHerkunft, nie aus der Region", () => {
    const rahmen = readFileSync(path.join(APP, "AppRahmen.tsx"), "utf8");
    expect(rahmen).not.toContain('t("modelle.region.eu")');
    expect(rahmen).toContain("modelleHerkunft(herkunft)");
    const layout = readFileSync(path.join(APP, "layout.tsx"), "utf8");
    expect(layout).toMatch(/modellVon\(db, bot\)\)\?\.herkunft/);
    expect(layout).not.toMatch(/\?\.region/);
  });
});
