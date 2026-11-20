/**
 * PaiBot – Tests für die Liste der API-Routen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { ACTION_TYPES } from "@paibot/shared/aktionen";
import { describe, expect, it } from "vitest";
import {
  API_ROUTEN,
  ROUTEN_OHNE_AKTION,
  type RoutenName,
  routenOrdner,
  routenPfad,
} from "./routen";

const routen = Object.entries(API_ROUTEN) as [RoutenName, (typeof API_ROUTEN)[RoutenName]][];

describe("API-Routen", () => {
  it("jede Kombination aus Methode und Pfad gibt es nur einmal", () => {
    const keys = routen.map(([, r]) => `${r.methode} ${r.pfad}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("alle Pfade liegen unter /api und sind deutsch und klein geschrieben", () => {
    for (const [, r] of routen) expect(r.pfad).toMatch(/^\/api(\/([a-z-]+|:[a-zA-Z]+))+$/);
  });

  it("jede verändernde Route hat eine Aktion des Tors, GET verändert nie", () => {
    const ohne = new Set<string>(ROUTEN_OHNE_AKTION);
    for (const [name, r] of routen) {
      if (r.methode === "GET") expect(r.veraendernd).toBe(false);
      if (!r.veraendernd || ohne.has(name)) continue;
      expect("aktion" in r && ACTION_TYPES.includes(r.aktion), name).toBe(true);
    }
  });

  it("Passwort ändern und Unterhaltung umbenennen gehen durch das Tor", () => {
    expect(ROUTEN_OHNE_AKTION).toEqual([]);
    expect(API_ROUTEN.passwortAendern.aktion).toBe("zugang.passwort_aendern");
    expect(API_ROUTEN.unterhaltungUmbenennen.aktion).toBe("unterhaltung.umbenennen");
  });

  it("jede Aktion außer der Anfrage ans Modell hat eine Route", () => {
    const genutzt = new Set(routen.map(([, r]) => ("aktion" in r ? r.aktion : undefined)));
    for (const aktion of ACTION_TYPES) {
      if (aktion === "modell.anfragen") continue;
      expect(genutzt.has(aktion), aktion).toBe(true);
    }
  });

  it("ohne Sitzung erreichbar sind nur Health, Einrichtung und Anmelden", () => {
    const offen = routen.filter(([, r]) => r.zugang !== "besitzer").map(([name]) => name);
    expect(offen.sort()).toEqual(
      [
        "anmelden",
        "einrichtungAbschliessen",
        "einrichtungStatus",
        "einrichtungVerbindungstest",
        "health",
      ].sort(),
    );
  });

  it("Einrichtung in einem Aufruf, Verbindungstest als eigener Aufruf", () => {
    expect(API_ROUTEN.einrichtungAbschliessen.methode).toBe("POST");
    expect(API_ROUTEN.einrichtungVerbindungstest.pfad).toBe("/api/einrichtung/verbindungstest");
  });

  it("setzt Parameter ein und kennt den Ordner unter src/app", () => {
    expect(
      routenPfad("laufAbbrechen", {
        id: "unt_06f8k2m9qz3w7x1c4b5n8p0r2t",
        laufId: "lau_06f8k2m9qz3w7x1c4b5n8p0r2t",
      }),
    ).toBe(
      "/api/unterhaltungen/unt_06f8k2m9qz3w7x1c4b5n8p0r2t/laeufe/lau_06f8k2m9qz3w7x1c4b5n8p0r2t/abbrechen",
    );
    expect(routenOrdner("nachrichtSenden")).toBe("api/unterhaltungen/[id]/nachrichten");
    expect(routenOrdner("health")).toBe("api/health");
  });
});
