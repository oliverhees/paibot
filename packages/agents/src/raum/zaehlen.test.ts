/**
 * PaiBot – Aufträge zählen (Tests)
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import {
  type AuftragsEintrag,
  zaehleAuftraegeJeMitglied,
  zaehleBitten,
  zaehleBreite,
} from "./zaehlen";

let n = 0;
const a = (teil: Partial<AuftragsEintrag>): AuftragsEintrag => ({
  id: `a${++n}`,
  elternId: null,
  wurzelId: "w1",
  geberBotId: "b0",
  empfaengerBotId: "b1",
  art: "uebergabe",
  status: "fertig",
  ...teil,
});

describe("Aufträge der Leitung je Mitglied und Wurzel", () => {
  it("zählt Übergaben und Rückgaben; der dritte ist der letzte erlaubte", () => {
    const liste = [a({}), a({ art: "rueckgabe" })];
    const f = zaehleAuftraegeJeMitglied(liste, "w1", "b0", "b1", "rueckgabe");
    expect(f).toEqual({ anzahl: 2, mitNeuem: 3, grenze: 3, ueberschreitet: false });
    const vier = zaehleAuftraegeJeMitglied(
      [...liste, a({ art: "rueckgabe" })],
      "w1",
      "b0",
      "b1",
      "uebergabe",
    );
    expect(vier).toMatchObject({ anzahl: 3, mitNeuem: 4, ueberschreitet: true });
  });

  it("eine neue @Name-Übergabe zählt wie eine Rückgabe (nicht umgehbar)", () => {
    const liste = [a({}), a({}), a({})]; // die Leitung schreibt immer wieder „@Ideen: noch mal“
    expect(zaehleAuftraegeJeMitglied(liste, "w1", "b0", "b1", "uebergabe").ueberschreitet).toBe(
      true,
    );
  });

  it("Bitten und Server-Arten zählen nicht mit", () => {
    const liste = [
      a({ art: "bitte", geberBotId: "b2" }),
      a({ art: "rueckkehr", geberBotId: null }),
      a({ art: "sammeln", geberBotId: null }),
      a({ art: "rueckmeldung", geberBotId: null }),
    ];
    expect(zaehleAuftraegeJeMitglied(liste, "w1", "b0", "b1")).toMatchObject({
      anzahl: 0,
      mitNeuem: 0,
    });
    expect(zaehleAuftraegeJeMitglied(liste, "w1", "b0", "b1", "bitte").mitNeuem).toBe(0);
  });

  it("zählt je Wurzel und je Empfänger getrennt, und nur Aufträge der Leitung", () => {
    const liste = [
      a({}),
      a({ wurzelId: "w2" }),
      a({ empfaengerBotId: "b3" }),
      a({ geberBotId: "b2" }), // ein anderes Mitglied als Geber
    ];
    expect(zaehleAuftraegeJeMitglied(liste, "w1", "b0", "b1").anzahl).toBe(1);
  });

  it("zählt auch abgeschlossene und abgelehnte Aufträge; eigene Grenze gilt", () => {
    const liste = [a({ status: "abgelehnt" }), a({ status: "gescheitert" })];
    const f = zaehleAuftraegeJeMitglied(liste, "w1", "b0", "b1", "uebergabe", 2);
    expect(f).toEqual({ anzahl: 2, mitNeuem: 3, grenze: 2, ueberschreitet: true });
  });

  it("leere Liste und unbekannte Art: wirft nicht", () => {
    expect(zaehleAuftraegeJeMitglied([], "w1", "b0", "b1", "unbekannt")).toEqual({
      anzahl: 0,
      mitNeuem: 0,
      grenze: 3,
      ueberschreitet: false,
    });
  });
});

describe("Bitten je Auftrag", () => {
  it("eine Bitte ist erlaubt, die zweite liegt darüber", () => {
    const eltern = a({ id: "m1", empfaengerBotId: "b2" });
    expect(zaehleBitten([eltern], "m1", "bitte")).toEqual({
      anzahl: 0,
      mitNeuem: 1,
      grenze: 1,
      ueberschreitet: false,
    });
    const bitte = a({ elternId: "m1", art: "bitte", geberBotId: "b2" });
    expect(zaehleBitten([eltern, bitte], "m1", "bitte")).toMatchObject({
      anzahl: 1,
      mitNeuem: 2,
      ueberschreitet: true,
    });
  });

  it("Bitten unter einem anderen Auftrag und andere Arten zählen nicht", () => {
    const liste = [a({ elternId: "m2", art: "bitte" }), a({ elternId: "m1", art: "rueckkehr" })];
    expect(zaehleBitten(liste, "m1", "bitte")).toMatchObject({ anzahl: 0 });
  });
});

describe("Breite: offene Unter-Aufträge", () => {
  const kinder = (stati: string[]) => stati.map((status) => a({ elternId: "e1", status }));

  it("zählt nur offene; Endzustände und fremde Eltern nicht", () => {
    const liste = [
      ...kinder(["gefragt", "arbeitet", "fertig", "gescheitert", "abgebrochen"]),
      a({ elternId: "e2", status: "arbeitet" }),
    ];
    expect(zaehleBreite(liste, "e1")).toEqual({
      anzahl: 2,
      mitNeuem: 2,
      grenze: 6,
      ueberschreitet: false,
    });
  });

  it("sechs sind erlaubt, sieben nicht; die neuen Zeilen zählen mit", () => {
    const sechs = kinder(Array(6).fill("arbeitet"));
    expect(zaehleBreite(sechs, "e1", 0).ueberschreitet).toBe(false);
    expect(zaehleBreite(sechs, "e1", 1)).toMatchObject({ mitNeuem: 7, ueberschreitet: true });
    expect(zaehleBreite([], "e1", 7).ueberschreitet).toBe(true);
    expect(zaehleBreite([], "e1", 6).ueberschreitet).toBe(false);
  });

  it("ein unbekannter Status gilt als offen; unbrauchbare Zahl neuer Zeilen zählt nicht", () => {
    expect(zaehleBreite(kinder(["komisch"]), "e1", Number.NaN).anzahl).toBe(1);
    expect(zaehleBreite([], "e1", -3).mitNeuem).toBe(0);
  });
});
