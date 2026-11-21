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
import { type AuftragsKnoten, pruefeKeinKreis } from "./kreis";

const k = (id: string, elternId: string | null, botId: string): AuftragsKnoten => ({
  id,
  elternId,
  botId,
});
// Wurzel (Pai) -> Ideen -> Entwurf
const KETTE = [k("a1", null, "pai"), k("a2", "a1", "ideen"), k("a3", "a2", "entwurf")];

describe("Kein Kreis im Auftragsbaum", () => {
  it("Weitergabe an einen neuen Bot ist erlaubt und liegt eine Ebene tiefer", () => {
    expect(pruefeKeinKreis(KETTE, "a3", "lektorat")).toEqual({ ok: true, tiefe: 3 });
    expect(pruefeKeinKreis(KETTE, "a1", "ideen")).toEqual({ ok: true, tiefe: 1 });
  });

  it("an sich selbst: abgelehnt", () => {
    expect(pruefeKeinKreis(KETTE, "a3", "entwurf")).toEqual({ ok: false, grund: "selbst" });
  });

  it("zurück an einen Vorfahren (A → B → A): abgelehnt", () => {
    expect(pruefeKeinKreis(KETTE, "a3", "ideen")).toEqual({ ok: false, grund: "vorfahre" });
    expect(pruefeKeinKreis(KETTE, "a3", "pai")).toEqual({ ok: false, grund: "vorfahre" });
    expect(pruefeKeinKreis(KETTE, "a2", "pai")).toEqual({ ok: false, grund: "vorfahre" });
  });

  it("ein Bot in einem anderen Zweig ist kein Vorfahre", () => {
    const baum = [...KETTE, k("a4", "a1", "lektorat")];
    expect(pruefeKeinKreis(baum, "a4", "entwurf")).toEqual({ ok: true, tiefe: 2 });
  });

  it("unbekannter Auftrag und leerer Baum: abgelehnt", () => {
    expect(pruefeKeinKreis(KETTE, "zz", "x")).toEqual({ ok: false, grund: "auftrag_unbekannt" });
    expect(pruefeKeinKreis([], "a1", "x")).toEqual({ ok: false, grund: "auftrag_unbekannt" });
  });

  it("kaputte Bäume werden abgelehnt, nicht durchgewunken und nicht endlos gelesen", () => {
    const schleife = [k("s1", "s2", "a"), k("s2", "s1", "b")];
    expect(pruefeKeinKreis(schleife, "s1", "neu")).toEqual({ ok: false, grund: "baum_defekt" });
    const verwaist = [k("v1", "weg", "a")];
    expect(pruefeKeinKreis(verwaist, "v1", "neu")).toEqual({ ok: false, grund: "baum_defekt" });
    const doppelt = [k("d1", null, "a"), k("d1", null, "b")];
    expect(pruefeKeinKreis(doppelt, "d1", "neu")).toEqual({ ok: false, grund: "baum_defekt" });
    const lang = Array.from({ length: 5_000 }, (_, i) =>
      k(`n${i}`, i === 0 ? null : `n${i - 1}`, `bot${i}`),
    );
    expect(pruefeKeinKreis(lang, "n4999", "frisch")).toEqual({ ok: false, grund: "baum_defekt" });
  });

  it("Bot-Kennungen werden genau verglichen, nicht ähnlich", () => {
    expect(pruefeKeinKreis(KETTE, "a3", "Ideen").ok).toBe(true);
  });

  it("ein Skript „gib immer weiter“ im Team aus drei Bots endet nach drei Läufen", () => {
    const bots = ["pai", "ideen", "entwurf"];
    const baum: AuftragsKnoten[] = [k("w", null, "pai")];
    let aktuell = "w";
    let schritte = 0;
    for (let i = 0; i < 50; i++) {
      // das Skript versucht der Reihe nach alle Bots des Teams
      const ziel = bots.find((b) => pruefeKeinKreis(baum, aktuell, b).ok);
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
