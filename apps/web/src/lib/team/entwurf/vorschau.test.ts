/**
 * PaiBot – Tests der Vorschau-Logik: abgewählte Bots fehlen, geänderte Anweisungen stehen im neuen
 * Wortlaut, alles andere bleibt, und der Abdruck gehört zu genau dem Inhalt, der angelegt wird.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { describe, expect, it } from "vitest";
import { entwurfAbdruck, pruefeEntwurf, type TeamEntwurf } from "./format";
import { geprueftMitAbdruck, inhaltMitAuswahl } from "./vorschau";

/** Der geprüfte Beispiel-Entwurf: drei Bots, die Leitung ist der erste. */
async function beispiel(): Promise<TeamEntwurf> {
  const ergebnis = await pruefeEntwurf({
    format: "pb-teamentwurf/v2",
    titel: "Beispiel-Team",
    team: {
      name: "Beispiel",
      leitung: { name: "Eins" },
      zusammenarbeit: "leitung_fuehrt",
      abnahme: "leitung",
    },
    bots: [
      { name: "Eins", aufgabe: "Leitet", anweisung: "Wortlaut eins.", antwortLaenge: 900 },
      { name: "Zwei", aufgabe: "Schreibt", anweisung: "Wortlaut zwei." },
      { name: "Drei", aufgabe: "Prüft", anweisung: "Wortlaut drei." },
    ],
  });
  if (!ergebnis.ok) throw new Error(`Beispiel ungültig: ${JSON.stringify(ergebnis.fehler)}`);
  return ergebnis.entwurf;
}

const alle = (e: TeamEntwurf) => e.bots.map((b) => ({ name: b.name, anweisung: b.anweisung }));

describe("inhaltMitAuswahl", () => {
  it("lässt alles stehen, wenn niemand etwas ändert", async () => {
    const e = await beispiel();
    expect(inhaltMitAuswahl(e, alle(e))).toEqual(e);
  });

  it("ein abgewählter Bot fehlt; die übrigen bleiben Feld für Feld gleich", async () => {
    const e = await beispiel();
    const inhalt = inhaltMitAuswahl(
      e,
      alle(e).filter((b) => b.name !== "Zwei"),
    );
    expect(inhalt.bots.map((b) => b.name)).toEqual(["Eins", "Drei"]);
    // Die Ausgabegrenze zeigt die Vorschau nicht – sie darf trotzdem nicht verloren gehen.
    expect(inhalt.bots[0]?.antwortLaenge).toBe(900);
    expect(inhalt.team).toEqual(e.team);
    expect(inhalt.titel).toBe(e.titel);
  });

  it("ein geänderter Wortlaut steht drin, und nur bei diesem Bot", async () => {
    const e = await beispiel();
    const inhalt = inhaltMitAuswahl(
      e,
      alle(e).map((b) => (b.name === "Zwei" ? { ...b, anweisung: "Neuer Wortlaut." } : b)),
    );
    expect(inhalt.bots.map((b) => b.anweisung)).toEqual([
      "Wortlaut eins.",
      "Neuer Wortlaut.",
      "Wortlaut drei.",
    ]);
  });

  it("die Reihenfolge ist die des Entwurfs, nicht die der Auswahl", async () => {
    const e = await beispiel();
    const gedreht = [...alle(e)].reverse();
    expect(inhaltMitAuswahl(e, gedreht).bots.map((b) => b.name)).toEqual(["Eins", "Zwei", "Drei"]);
    // Gegenprobe zum Abdruck: Eine gedrehte Auswahl allein darf ihn nicht bewegen.
    expect(await entwurfAbdruck(inhaltMitAuswahl(e, gedreht))).toBe(await entwurfAbdruck(e));
  });

  it("ein Bot, den der Entwurf nicht hat, kommt nicht hinein", async () => {
    const e = await beispiel();
    const inhalt = inhaltMitAuswahl(e, [
      ...alle(e),
      { name: "Vier", anweisung: "Von außen untergeschoben." },
    ]);
    expect(inhalt.bots.map((b) => b.name)).toEqual(["Eins", "Zwei", "Drei"]);
  });
});

describe("geprueftMitAbdruck", () => {
  it("gibt den geprüften Inhalt und den Abdruck genau dieses Inhalts", async () => {
    const e = await beispiel();
    const ergebnis = await geprueftMitAbdruck(e);
    expect(ergebnis.ok).toBe(true);
    if (!ergebnis.ok) return;
    expect(ergebnis.abdruck).toBe(await entwurfAbdruck(ergebnis.inhalt));
  });

  it("eine Änderung bewegt den Abdruck", async () => {
    const e = await beispiel();
    const vorher = await geprueftMitAbdruck(e);
    const nachher = await geprueftMitAbdruck(
      inhaltMitAuswahl(
        e,
        alle(e).map((b) => (b.name === "Zwei" ? { ...b, anweisung: "Anders." } : b)),
      ),
    );
    expect(vorher.ok && nachher.ok && vorher.abdruck === nachher.abdruck).toBe(false);
  });

  it("ein leerer Wortlaut wird abgelehnt und die Stelle genannt", async () => {
    const e = await beispiel();
    const ergebnis = await geprueftMitAbdruck(
      inhaltMitAuswahl(
        e,
        alle(e).map((b) => (b.name === "Zwei" ? { ...b, anweisung: "" } : b)),
      ),
    );
    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok) return;
    expect(ergebnis.stelle).toBe("bots[1].anweisung");
  });

  it("wird die Leitung abgewählt, lehnt schon die Vorschau ab", async () => {
    const e = await beispiel();
    const ergebnis = await geprueftMitAbdruck(
      inhaltMitAuswahl(
        e,
        alle(e).filter((b) => b.name !== "Eins"),
      ),
    );
    expect(ergebnis.ok).toBe(false);
  });

  it("ein Bot, der wie ein Team heißt, wird abgelehnt", async () => {
    const e = await beispiel();
    const ergebnis = await geprueftMitAbdruck({
      ...e,
      bots: e.bots.map((b) => (b.name === "Zwei" ? { ...b, name: "Team Zwei" } : b)),
    });
    expect(ergebnis.ok).toBe(false);
  });
});
