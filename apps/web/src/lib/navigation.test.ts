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
import {
  BOT_ADRESSE,
  botAktiv,
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

describe("Navigation", () => {
  it("zeigt Belege, Regeln und Datenschleuse in dieser Reihenfolge, danach die Einstellungen", () => {
    expect(NAVIGATION.map((e) => e.href)).toEqual([
      "/belege",
      "/regeln",
      "/datenschleuse",
      "/modelle",
      "/einstellungen",
      "/info",
    ]);
    expect(NAVIGATION.find((e) => e.id === "regeln")?.text).toBe("Regeln");
  });

  it("jeder Eintrag führt zu einer gebauten Seite", () => {
    const vorhanden = seiten();
    for (const e of NAVIGATION) expect(vorhanden, e.href).toContain(e.href);
    expect(vorhanden).toContain(BOT_ADRESSE);
  });

  it("die Kopfzeile zeigt auf jeder Seite ihren Titel", () => {
    const erwartet: Record<string, string> = {
      "/": t("seite.chat"),
      "/belege": t("seite.belege"),
      "/belege/[id]": t("seite.belege"),
      "/bot": t("seite.bot"),
      "/datenschleuse": t("seite.datenschleuse"),
      "/einstellungen": t("seite.einstellungen"),
      "/einstellungen/grenzen": t("seite.einstellungen"),
      "/info": t("seite.info"),
      "/modelle": t("seite.modelle"),
      "/regeln": t("seite.regeln"),
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

  it("die Herkunft der Modelle folgt der Region des Anbieters", () => {
    expect(modelleHerkunft("eu")).toBe("EU");
    expect(modelleHerkunft("local")).toBe("lokal");
    expect(modelleHerkunft("non_eu")).toBe("außerhalb der EU");
    expect(modelleHerkunft(undefined)).toBe(t("navigation.modelle.keine"));
    expect(modelleHerkunft(undefined)).not.toBe("EU");
  });

  it("der Rahmen nimmt die Herkunft aus der Region, nie fest „EU“", () => {
    const rahmen = readFileSync(path.join(APP, "AppRahmen.tsx"), "utf8");
    expect(rahmen).not.toContain('t("modelle.region.eu")');
    expect(rahmen).toContain("modelleHerkunft(region)");
    const layout = readFileSync(path.join(APP, "layout.tsx"), "utf8");
    expect(layout).toMatch(/modellVon\(db, bot\)\)\?\.region/);
  });
});
