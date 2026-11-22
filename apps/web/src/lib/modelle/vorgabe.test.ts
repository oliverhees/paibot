/**
 * PaiBot – Tests: Vorgaben einer Routing-Regel in Worten. „EU“ nur bei genau `data_residency:
 * "EU"`; Datum und Herkunft stehen immer dabei; ältere Angaben bleiben mit Datum sichtbar; das
 * Ausweichen wird ehrlich genannt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { RulePolicy } from "@paibot/shared/grundtypen";
import { describe, expect, it } from "vitest";
import {
  antwortKurz,
  antwortZusatz,
  ausweichSatz,
  euMarke,
  euSatz,
  istEuBelegt,
  residenzSatz,
  tagText,
  VORGABE_ALT_TAGE,
  vorgabeAus,
} from "./vorgabe";

const GEPRUEFT = new Date("2026-11-21T10:00:00.000Z");
const vorgabe = (policy: RulePolicy, jetzt = GEPRUEFT) =>
  vorgabeAus(policy, GEPRUEFT, jetzt, "Europe/Berlin");

describe("Kennzeichnung nur mit Beleg", () => {
  it("genau data_residency EU trägt die Marke, mit Herkunft und Datum", () => {
    const v = vorgabe({ data_residency: "EU" });
    expect(istEuBelegt(v)).toBe(true);
    expect(euMarke(v)).toBe("EU laut Regel");
    expect(euSatz(v, "EUrouter")).toBe(
      "EU laut Regel in deinem EUrouter-Konto, geprüft am 21.11.2026.",
    );
    expect(antwortKurz(v)[0]).toBe("EU laut Regel in deinem Konto, geprüft am 21.11.2026");
  });

  it("alles andere trägt keine: anderer Wert, andere Schreibweise, fehlendes Feld, keine Vorgaben", () => {
    for (const policy of [
      { data_residency: "US" },
      { data_residency: "eu" },
      { data_residency: "EU-West" },
      { data_residency: "EEA" },
      {},
      { eu_owned: true, data_collection: "deny" },
    ] as RulePolicy[]) {
      const v = vorgabe(policy);
      expect(istEuBelegt(v), JSON.stringify(policy)).toBe(false);
      expect(euMarke(v)).toBeUndefined();
      expect(euSatz(v, "EUrouter")).toBeUndefined();
      expect(antwortKurz(v).join(" ")).not.toContain("EU");
    }
    expect(istEuBelegt(undefined)).toBe(false);
    expect(euMarke(undefined)).toBeUndefined();
    expect(antwortZusatz(undefined, "EUrouter")).toEqual([]);
  });

  it("eu_owned allein ist keine Kennzeichnung", () => {
    expect(istEuBelegt(vorgabe({ eu_owned: true }))).toBe(false);
  });

  it("was die Regel stattdessen sagt, steht ehrlich da", () => {
    expect(residenzSatz(vorgabe({ data_residency: "US" }))).toContain("„US“");
    expect(residenzSatz(vorgabe({}))).toContain("nennt keine Datenresidenz");
    expect(residenzSatz(vorgabe({ data_residency: "EU" }))).toBeUndefined();
    expect(residenzSatz(undefined)).toBeUndefined();
  });

  it("keine Rechtsaussage", () => {
    const alle = [
      euSatz(vorgabe({ data_residency: "EU" }), "EUrouter"),
      ...antwortKurz(vorgabe({ data_residency: "EU", models: ["a"] })),
    ].join(" ");
    expect(alle.toLowerCase()).not.toMatch(/dsgvo|konform|garantiert|zertifiziert/);
  });
});

describe("Alter der Angabe", () => {
  const tage = (n: number) => new Date(GEPRUEFT.getTime() + n * 24 * 60 * 60 * 1000);

  it("bis zur Grenze gilt sie als frisch, danach als länger nicht geprüft; die Marke bleibt mit Datum", () => {
    expect(vorgabe({ data_residency: "EU" }, tage(VORGABE_ALT_TAGE)).veraltet).toBe(false);
    const alt = vorgabe({ data_residency: "EU" }, tage(VORGABE_ALT_TAGE + 1));
    expect(alt.veraltet).toBe(true);
    expect(istEuBelegt(alt)).toBe(true);
    expect(euSatz(alt, "EUrouter")).toContain("zuletzt geprüft am 21.11.2026");
    expect(antwortKurz(alt)[0]).toContain("zuletzt geprüft am 21.11.2026");
  });

  it("das Datum folgt der Zeitzone des Besitzers", () => {
    const spaet = new Date("2026-11-21T23:30:00.000Z");
    expect(tagText(spaet, "Europe/Berlin")).toBe("22.11.2026");
    expect(tagText(spaet, "UTC")).toBe("21.11.2026");
    expect(tagText(spaet, "Keine/Zone")).toBe("21.11.2026");
  });
});

describe("Ausweichen", () => {
  it("mit Ausweich-Modellen: nennt sie; nur mit erlaubtem Ausweichen: sagt es ohne Modelle", () => {
    expect(ausweichSatz(vorgabe({ models: ["glm-5.1", "glm-5"] }))).toBe(
      "Kann auf glm-5.1, glm-5 ausweichen.",
    );
    expect(antwortKurz(vorgabe({ models: ["glm-5.1"] }))).toEqual(["kann auf glm-5.1 ausweichen"]);
    expect(ausweichSatz(vorgabe({ allow_fallbacks: true }))).toContain("Kann ausweichen");
    expect(antwortKurz(vorgabe({ allow_fallbacks: true }))).toEqual([
      "kann ausweichen (Regel erlaubt es)",
    ]);
  });

  it("Gegenprobe: ohne Modelle und ohne erlaubtes Ausweichen kein Hinweis", () => {
    expect(ausweichSatz(vorgabe({ allow_fallbacks: false }))).toBeUndefined();
    expect(ausweichSatz(vorgabe({}))).toBeUndefined();
    expect(ausweichSatz(undefined)).toBeUndefined();
    expect(antwortKurz(vorgabe({ allow_fallbacks: false }))).toEqual([]);
  });

  it("der Hinweis hängt nicht an der Kennzeichnung", () => {
    expect(antwortKurz(vorgabe({ data_residency: "US", models: ["x"] }))).toEqual([
      "kann auf x ausweichen",
    ]);
  });
});
