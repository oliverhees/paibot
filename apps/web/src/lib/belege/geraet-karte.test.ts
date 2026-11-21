/**
 * PaiBot – Tests: Die Beleg-Karte nennt das Gerät, von dem eine Aktion des Besitzers kam, als
 * grobe Angabe mit Kennung; ohne Fakt keine Zeile; ein Gerät, das nicht mehr im Verzeichnis
 * steht, sagt das ehrlich.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { newId } from "@paibot/shared/ids";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { belegKarte, geraetImBeleg } from "./karte";
import { type BelegUmfeld, belegMitUmfeld } from "./lesen";
import { eingerichtet, ketteAus } from "./testing";

vi.setConfig({ testTimeout: 60_000 });

const GERAET = newId("device");

let umfeld: BelegUmfeld;

beforeAll(async () => {
  const { u } = await eingerichtet(1);
  const kette = await ketteAus(u);
  const entscheidung = kette.find(
    (e) => e.body.type === "decision" && e.body.action.type === "zugang.anmelden",
  );
  umfeld = await belegMitUmfeld(u.db, String(entscheidung?.id));
});

function mitGeraet(): BelegUmfeld {
  const beleg = structuredClone(umfeld.beleg);
  if (beleg.body.type !== "decision") throw new Error("Entscheidung erwartet");
  (beleg.body.facts as Record<string, unknown>).device = GERAET;
  return { ...umfeld, beleg };
}

function zeileGeraet(karte: ReturnType<typeof belegKarte>) {
  return karte.zeilen.find((z) => z.titel === "Gerät");
}

describe("Gerät in der Beleg-Karte", () => {
  it("nennt die grobe Angabe und die Kennung, direkt nach „Von“", () => {
    const karte = belegKarte(mitGeraet(), {
      zeitzone: "Europe/Berlin",
      geraete: { [GERAET]: "Safari auf iPhone" },
    });
    expect(zeileGeraet(karte)?.zeilen).toEqual([
      [{ text: "Safari auf iPhone" }, { text: GERAET, mono: true, leise: true }],
    ]);
    const titel = karte.zeilen.map((z) => z.titel);
    expect(titel.indexOf("Gerät")).toBe(titel.indexOf("Von") + 1);
  });

  it("Gerät nicht mehr im Verzeichnis: sagt es, Kennung bleibt sichtbar", () => {
    const karte = belegKarte(mitGeraet(), { zeitzone: "Europe/Berlin" });
    expect(JSON.stringify(zeileGeraet(karte))).toContain("nicht mehr im Verzeichnis");
    expect(JSON.stringify(zeileGeraet(karte))).toContain(GERAET);
  });

  it("ältere Belege ohne Gerät: keine Zeile", () => {
    expect(geraetImBeleg(umfeld.beleg)).toBeUndefined();
    expect(zeileGeraet(belegKarte(umfeld, { zeitzone: "Europe/Berlin" }))).toBeUndefined();
  });

  it("nur Entscheidungen tragen das Gerät; ein Fakt in falscher Form zählt nicht", () => {
    expect(geraetImBeleg({ body: { type: "result", facts: { device: GERAET } } })).toBeUndefined();
    expect(geraetImBeleg({ body: { type: "decision", facts: { device: 7 } } })).toBeUndefined();
    expect(geraetImBeleg(mitGeraet().beleg)).toBe(GERAET);
  });
});
