/**
 * PaiBot – Kein Kreis im Auftragsbaum (Tests)
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { type AuftragsKnoten, ermittleKreisFakten } from "./kreis";

const k = (id: string, elternId: string | null, botId: string): AuftragsKnoten => ({
  id,
  elternId,
  botId,
});
// Wurzel (Pai) -> Ideen -> Entwurf
const KETTE = [k("a1", null, "pai"), k("a2", "a1", "ideen"), k("a3", "a2", "entwurf")];

describe("Kreis-Fakten im Auftragsbaum", () => {
  it("neuer Bot: kein Kreis, Tiefe des Neuen ist Tiefe des Gebers plus eins", () => {
    expect(ermittleKreisFakten(KETTE, "a3", "lektorat")).toEqual({
      auftragBekannt: true,
      baumLesbar: true,
      empfaengerIstGeber: false,
      empfaengerIstVorfahre: false,
      kreisErkannt: false,
      tiefeDesNeuen: 3,
    });
    expect(ermittleKreisFakten(KETTE, "a1", "ideen").tiefeDesNeuen).toBe(1);
  });

  it("an sich selbst: Kreis erkannt", () => {
    const f = ermittleKreisFakten(KETTE, "a3", "entwurf");
    expect(f.empfaengerIstGeber).toBe(true);
    expect(f.kreisErkannt).toBe(true);
  });

  it("zurück an einen Vorfahren (A → B → A): Kreis erkannt", () => {
    for (const [von, an] of [
      ["a3", "ideen"],
      ["a3", "pai"],
      ["a2", "pai"],
    ] as const) {
      const f = ermittleKreisFakten(KETTE, von, an);
      expect(f.empfaengerIstVorfahre).toBe(true);
      expect(f.empfaengerIstGeber).toBe(false);
      expect(f.kreisErkannt).toBe(true);
    }
  });

  it("ein Bot in einem anderen Zweig ist kein Vorfahre", () => {
    const baum = [...KETTE, k("a4", "a1", "lektorat")];
    expect(ermittleKreisFakten(baum, "a4", "entwurf")).toMatchObject({
      kreisErkannt: false,
      tiefeDesNeuen: 2,
    });
  });

  it("unbekannter Auftrag und leerer Baum: nichts bekannt, nichts geworfen", () => {
    for (const baum of [KETTE, []]) {
      expect(ermittleKreisFakten(baum, "zz", "x")).toEqual({
        auftragBekannt: false,
        baumLesbar: false,
        empfaengerIstGeber: false,
        empfaengerIstVorfahre: false,
        kreisErkannt: false,
        tiefeDesNeuen: null,
      });
    }
  });

  it("kaputte Bäume sind als nicht lesbar gemeldet und werden nicht endlos gelesen", () => {
    const schleife = [k("s1", "s2", "a"), k("s2", "s1", "b")];
    expect(ermittleKreisFakten(schleife, "s1", "neu")).toMatchObject({
      baumLesbar: false,
      tiefeDesNeuen: null,
    });
    const verwaist = [k("v1", "weg", "a")];
    expect(ermittleKreisFakten(verwaist, "v1", "neu").baumLesbar).toBe(false);
    const doppelt = [k("d1", null, "a"), k("d1", null, "b")];
    expect(ermittleKreisFakten(doppelt, "d1", "neu").baumLesbar).toBe(false);
    const lang = Array.from({ length: 5_000 }, (_, i) =>
      k(`n${i}`, i === 0 ? null : `n${i - 1}`, `bot${i}`),
    );
    expect(ermittleKreisFakten(lang, "n4999", "frisch").baumLesbar).toBe(false);
  });

  it("in einem kaputten Baum bleibt „Geber ist Empfänger“ trotzdem sichtbar", () => {
    const schleife = [k("s1", "s2", "a"), k("s2", "s1", "b")];
    expect(ermittleKreisFakten(schleife, "s1", "a")).toMatchObject({
      baumLesbar: false,
      kreisErkannt: true,
    });
  });

  it("Bot-Kennungen werden genau verglichen, nicht ähnlich", () => {
    expect(ermittleKreisFakten(KETTE, "a3", "Ideen").kreisErkannt).toBe(false);
  });

  it("ein Skript „gib immer weiter“ im Team aus drei Bots findet nach zwei Übergaben keinen freien Bot", () => {
    const bots = ["pai", "ideen", "entwurf"];
    const baum: AuftragsKnoten[] = [k("w", null, "pai")];
    let aktuell = "w";
    let schritte = 0;
    for (let i = 0; i < 50; i++) {
      const ziel = bots.find((b) => !ermittleKreisFakten(baum, aktuell, b).kreisErkannt);
      if (!ziel) break;
      const neu = `n${i}`;
      baum.push(k(neu, aktuell, ziel));
      aktuell = neu;
      schritte += 1;
    }
    expect(schritte).toBe(2); // pai → ideen → entwurf, dann ist niemand mehr übrig
    expect(baum).toHaveLength(3);
  });
});
