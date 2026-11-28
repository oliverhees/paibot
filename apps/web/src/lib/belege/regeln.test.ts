/**
 * PaiBot – Tests der Regeln-Liste: neue Grenzen sichtbar mit Titel und Erklärung, Grenzen und
 * Vorbedingungen nur für Werkzeuge ausgeblendet.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import { LIMITS_BY_ID_4, PRECONDITIONS_4 } from "@paibot/shared/tor-fassung-4";
import { LIMITS_BY_ID_5, PRECONDITIONS_5 } from "@paibot/shared/tor-fassung-5";
import { describe, expect, it } from "vitest";
import {
  grenzenEintraege,
  NOCH_NICHT_BEDIENBAR,
  NUR_WERKZEUG_GRENZEN,
  vorbedingungenEintraege,
} from "./regeln";

describe("Regeln-Liste und die Tor-Fassungen 4 und 5", () => {
  // Gegenprobe: eine Nummer der Entwürfe aus `NOCH_NICHT_BEDIENBAR` nehmen → die Seite zeigt eine
  // Nummer ohne Text (dieser Test wird rot).
  it("zeigt die Nummern für Bots und Teams, aber keine der Entwürfe, Fäden und Aufträge", () => {
    expect([...NOCH_NICHT_BEDIENBAR].sort()).toEqual(
      [
        "G-32",
        "G-34",
        "V-27",
        "V-28",
        "V-29",
        "V-30",
        "V-31",
        "V-43",
        ...Object.keys(LIMITS_BY_ID_5),
        ...Object.keys(PRECONDITIONS_5),
      ].sort(),
    );
    const grenzen = grenzenEintraege().map((g) => g.nr);
    const vorbedingungen = vorbedingungenEintraege().map((v) => v.nr);
    // Jede verborgene Nummer gehört zur Fassung 4 oder 5 und ist weder Grenze noch Vorbedingung
    // der Seite.
    const spaeter = [
      ...Object.keys(LIMITS_BY_ID_4),
      ...Object.keys(PRECONDITIONS_4),
      ...Object.keys(LIMITS_BY_ID_5),
      ...Object.keys(PRECONDITIONS_5),
    ];
    for (const id of NOCH_NICHT_BEDIENBAR) {
      expect(spaeter, id).toContain(id);
      expect([...grenzen, ...vorbedingungen], id).not.toContain(id);
    }
    // Bedienbar geworden, deshalb sichtbar:
    for (const id of ["G-15", "G-33"]) expect(grenzen, id).toContain(id);
    for (const id of ["V-25", "V-37", "V-42", "V-44"]) expect(vorbedingungen, id).toContain(id);
    // Jede sichtbare Nummer hat Titel und Erklärung, nie einen Textschlüssel als Text.
    for (const zeile of [...grenzenEintraege(), ...vorbedingungenEintraege()]) {
      expect(zeile.titel, zeile.nr).not.toContain("regel.");
      expect(zeile.titel.length, zeile.nr).toBeGreaterThan(3);
      expect(zeile.erklaerung, zeile.nr).not.toContain("regeln.");
      expect(zeile.erklaerung.length, zeile.nr).toBeGreaterThan(10);
    }
    // Die bisherigen Nummern bleiben sichtbar.
    expect(grenzen).toContain("G-01");
    expect(vorbedingungen).toContain("V-01");
  });
});

describe("Regeln-Liste", () => {
  it("zeigt G-16 und G-18 mit Titel und Erklärung", () => {
    const grenzen = grenzenEintraege();
    for (const id of ["G-16", "G-18"] as const) {
      const zeile = grenzen.find((g) => g.nr === id);
      expect(zeile?.titel, id).toBe(t(`regel.${id}`));
      expect(zeile?.erklaerung, id).toBe(t(`regeln.grenze.${id}`));
    }
  });

  it("blendet G-17, die Grenzen für Apps und die Vorbedingungen V-12 bis V-14, V-19, V-38 aus (nur für Werkzeuge und Apps)", () => {
    expect(NUR_WERKZEUG_GRENZEN).toEqual(["G-17", "G-06", "G-07", "G-08", "G-40"]);
    const grenzen = grenzenEintraege().map((g) => g.nr);
    for (const id of NUR_WERKZEUG_GRENZEN) expect(grenzen).not.toContain(id);
    const vorbedingungen = vorbedingungenEintraege().map((v) => v.nr);
    for (const id of ["V-12", "V-13", "V-14", "V-19", "V-38"])
      expect(vorbedingungen).not.toContain(id);
  });
});
