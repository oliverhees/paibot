/**
 * PaiBot – Tests: Team-Vorlagen im Ordner `vorlagen/teams/` sind gültige Entwürfe; die Vorlage
 * „Content-Team“ hat die erwarteten Bots und keine Rechte.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ENTWURF_GRENZEN, leseEntwurf, pruefeEntwurfText, WIE_PAI } from "./format";

const ORDNER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../..",
  "vorlagen/teams",
);
const DATEIEN = readdirSync(ORDNER).filter((name) => name.endsWith(".json"));

function lies(name: string): string {
  return readFileSync(path.join(ORDNER, name), "utf8");
}

describe("Vorlagen-Ordner", () => {
  it("enthält mindestens eine Vorlage", () => {
    expect(DATEIEN).toContain("content-team.json");
  });

  it.each(DATEIEN)("%s ist ein gültiger Entwurf", async (name) => {
    const ergebnis = await pruefeEntwurfText(lies(name));
    expect(ergebnis.ok).toBe(true);
    if (ergebnis.ok) expect(ergebnis.hinweise).toEqual([]);
  });

  it.each(DATEIEN)("%s liegt unverändert in der vereinheitlichten Form vor", (name) => {
    const gelesen = leseEntwurf(JSON.parse(lies(name)));
    if (!gelesen.ok) throw new Error("ungültig");
    expect(JSON.parse(lies(name))).toEqual(JSON.parse(JSON.stringify(gelesen.entwurf)));
  });

  it.each(DATEIEN)("%s bleibt unter der Größengrenze für Text", (name) => {
    expect(Buffer.byteLength(lies(name), "utf8")).toBeLessThan(ENTWURF_GRENZEN.textBytesMax);
  });
});

describe("Vorlage Content-Team", () => {
  const roh = JSON.parse(lies("content-team.json"));
  const gelesen = leseEntwurf(roh);
  if (!gelesen.ok) throw new Error("Vorlage ungültig");
  const vorlage = gelesen.entwurf;

  it("hat das Team Content mit Pai als Ansprechpartner", () => {
    expect(vorlage.titel).toBe("Content-Team");
    expect(vorlage.team).toEqual({ name: "Content", ansprechpartner: { art: "pai" } });
  });

  it("hat die drei Bots Ideen, Entwurf, Lektorat in dieser Reihenfolge, alle wie Pai", () => {
    expect(vorlage.bots.map((bot) => bot.name)).toEqual(["Ideen", "Entwurf", "Lektorat"]);
    for (const bot of vorlage.bots) {
      expect(bot.modell).toBe(WIE_PAI);
      expect(bot.anweisung.length).toBeGreaterThan(300);
      expect(bot.aufgabe.length).toBeGreaterThan(0);
    }
  });

  it("jeder Bot hat eine eigene Farbe und Form", () => {
    expect(new Set(vorlage.bots.map((bot) => bot.farbe)).size).toBe(3);
    expect(new Set(vorlage.bots.map((bot) => bot.form)).size).toBe(3);
  });

  it("gibt keine Rechte: keine Felder für Rechte, jede Anweisung sagt es ausdrücklich", () => {
    expect(Object.keys(roh).sort()).toEqual(["beschreibung", "bots", "format", "team", "titel"]);
    for (const bot of vorlage.bots) {
      expect(bot.anweisung).toContain("gibt dir keine zusätzlichen Rechte");
    }
  });

  it("enthält nur Text für eine Person: keine Hinweise auf weitere Menschen", () => {
    const alles = JSON.stringify(vorlage).toLowerCase();
    for (const wort of ["mitarbeiter", "kollege", "kolleg", "kunde ", "einladen", "rolle"]) {
      expect(alles).not.toContain(wort);
    }
  });
});
