/**
 * PaiBot – Tests: Beleg-Felder und Ergebnis des Nachschlagens aus der gespeicherten Hülle; eine
 * gekürzte Hülle mit beschnittenem Doku-Stand zählt nicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { JsonValue } from "@paibot/shared/motor";
import { describe, expect, it } from "vitest";
import { dataEnvelope, truncateContent } from "../run/huelle";
import { belegFelder, dokuAusHuelle } from "./beleg-felder";
import { DOKU_TOOL_KEY } from "./doku/werkzeug";

const STAND = "0.3.0-dev+afa35b66bc2b";

/** Hülle, wie `aufruf.ts` sie aus einem Ergebnis mit Platz für `platz` Zeichen baut. */
function huelleMitPlatz(platz: number) {
  const inhalt: JsonValue = { status: "nichts_gefunden", stand: STAND };
  const cut = truncateContent(inhalt, platz);
  return cut === undefined ? undefined : dataEnvelope(DOKU_TOOL_KEY, cut.inhalt, cut.gekuerzt);
}

describe("Ergebnis des Nachschlagens aus der gespeicherten Hülle", () => {
  it("eine volle Hülle zählt mit Stand und Zahl der Fundstellen", () => {
    const huelle = huelleMitPlatz(500);
    expect(huelle).toBeDefined();
    expect(dokuAusHuelle(DOKU_TOOL_KEY, huelle as never)).toEqual({ stand: STAND, gefunden: 0 });
    expect(belegFelder(DOKU_TOOL_KEY, huelle as never)).toEqual({ docStand: STAND, found: 0 });
  });

  // Gegenprobe: in `dokuAusHuelle` die Prüfung `STAND_MUSTER` bei gekürzter Hülle entfernen →
  // bei knappem Platz zählt ein beschnittener Stand („0.3.0-“, „0“, „“).
  it("bei jedem Platz von 0 bis 80 Zeichen: gekürzt zählt nur mit vollständigem Stand", () => {
    let gekuerztGesehen = 0;
    for (let platz = 0; platz <= 80; platz += 1) {
      const huelle = huelleMitPlatz(platz);
      if (huelle === undefined) continue;
      const doku = dokuAusHuelle(DOKU_TOOL_KEY, huelle);
      if (huelle.status === "ok" && huelle.gekuerzt === true) {
        gekuerztGesehen += 1;
        expect(doku === undefined || doku.stand === STAND, `Platz ${platz}`).toBe(true);
        expect(belegFelder(DOKU_TOOL_KEY, huelle), `Platz ${platz}`).toEqual(
          doku === undefined ? {} : { docStand: STAND, found: 0 },
        );
      } else {
        expect(doku, `Platz ${platz}`).toEqual({ stand: STAND, gefunden: 0 });
      }
    }
    expect(gekuerztGesehen).toBeGreaterThan(10);
  });

  it("ein beschnittener Stand in einer gekürzten Hülle zählt nicht, mit vollständigem Stand schon", () => {
    const beschnitten = dataEnvelope(
      DOKU_TOOL_KEY,
      { status: "nichts_gefunden", stand: "0.3.0-" },
      true,
    );
    expect(dokuAusHuelle(DOKU_TOOL_KEY, beschnitten)).toBeUndefined();
    const vollstaendig = dataEnvelope(
      DOKU_TOOL_KEY,
      { status: "nichts_gefunden", stand: STAND },
      true,
    );
    expect(dokuAusHuelle(DOKU_TOOL_KEY, vollstaendig)).toEqual({ stand: STAND, gefunden: 0 });
  });
});
