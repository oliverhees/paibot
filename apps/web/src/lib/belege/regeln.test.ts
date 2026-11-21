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
import { describe, expect, it } from "vitest";
import { grenzenEintraege, NUR_WERKZEUG_GRENZEN, vorbedingungenEintraege } from "./regeln";

describe("Regeln-Liste", () => {
  it("zeigt G-16 und G-18 mit Titel und Erklärung", () => {
    const grenzen = grenzenEintraege();
    for (const id of ["G-16", "G-18"] as const) {
      const zeile = grenzen.find((g) => g.nr === id);
      expect(zeile?.titel, id).toBe(t(`regel.${id}`));
      expect(zeile?.erklaerung, id).toBe(t(`regeln.grenze.${id}`));
    }
  });

  it("blendet G-17 und die Vorbedingungen V-12 bis V-14 aus (nur für Werkzeuge)", () => {
    expect(NUR_WERKZEUG_GRENZEN).toEqual(["G-17"]);
    expect(grenzenEintraege().map((g) => g.nr)).not.toContain("G-17");
    const vorbedingungen = vorbedingungenEintraege().map((v) => v.nr);
    for (const id of ["V-12", "V-13", "V-14"]) expect(vorbedingungen).not.toContain(id);
  });
});
