/**
 * PaiBot – Tests für die Liste der API-Routen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { ACTION_TYPES, ACTIONS, UNSTORED_ACTION_TYPES } from "@paibot/shared/aktionen";
import { RATE_LIMITS } from "@paibot/shared/konstanten";
import { CREDENTIAL_SCOPE } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { LIMIT_DEFINITIONEN } from "./rate-limit";
import {
  API_ROUTEN,
  FOLGE_AKTIONEN,
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

  it("jede speicherbare Aktion des Besitzers hat eine Route, Aktionen eines Bots keine", () => {
    const genutzt = new Set<string>(routen.map(([, r]) => ("aktion" in r ? r.aktion : "")));
    const nochNichtSpeicherbar = new Set<string>(UNSTORED_ACTION_TYPES);
    for (const aktion of ACTION_TYPES) {
      if (ACTIONS[aktion].actor === "bot") {
        expect(genutzt.has(aktion), aktion).toBe(false);
        continue;
      }
      if (nochNichtSpeicherbar.has(aktion)) continue;
      expect(genutzt.has(aktion), aktion).toBe(
        !(FOLGE_AKTIONEN as readonly string[]).includes(aktion),
      );
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

  it("der Verbindungstest der Einrichtung verlangt den Code und hat Limits je Adresse", () => {
    const r = API_ROUTEN.einrichtungVerbindungstest;
    const gueltig = { setupCode: "K7QD-9M2F-XW4H", apiKey: "sk-test" };
    expect(r.eingabe.safeParse(gueltig).success).toBe(true);
    expect(r.eingabe.safeParse({ apiKey: "sk-test" }).success).toBe(false);
    expect(
      r.eingabe.safeParse({ ...gueltig, providerId: "anb_06f8k2m9qz3w7x1c4b5n8p0r2t" }).success,
    ).toBe(false);
    expect(r.limits).toEqual(["verbindungstestIp", "einrichtungIp"]);
    expect(r.nurVorEinrichtung).toBe(true);
    expect(API_ROUTEN.einrichtungAbschliessen.nurVorEinrichtung).toBe(true);
  });

  it("jede Route ohne Sitzung, die etwas prüft oder verändert, hat ein Limit je Adresse", () => {
    for (const [name, r] of routen) {
      if (r.zugang !== "vorab" || r.methode === "GET") continue;
      const limits: readonly string[] = "limits" in r ? r.limits : [];
      expect(
        limits.some((l) => l.endsWith("Ip")),
        name,
      ).toBe(true);
      for (const l of limits) expect(Object.keys(LIMIT_DEFINITIONEN), name).toContain(l);
    }
  });

  it("Anmelden: erst je Adresse (15 Minuten, dann Tag), danach die gemeinsame Bremse", () => {
    expect(API_ROUTEN.anmelden.limits).toEqual(["anmeldenIp", "anmeldenIpTag", "anmeldenGesamt"]);
    expect(LIMIT_DEFINITIONEN.anmeldenIpTag.effect).toBe("sperren");
    expect(RATE_LIMITS.anmeldenIp.effect).toBe("sperren");
  });

  it("der gemeldete Nachweis passt zur Aktion der Route", () => {
    for (const [name, r] of routen) {
      if (!("aktion" in r)) continue;
      const nachweis = "nachweis" in r ? r.nachweis : "sitzung";
      if (r.zugang === "besitzer") expect(nachweis, name).toBe("sitzung");
      const scope = CREDENTIAL_SCOPE[nachweis];
      expect(scope === "*" || (scope as readonly string[]).includes(r.aktion), name).toBe(true);
    }
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
