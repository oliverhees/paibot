/**
 * PaiBot – Test: Die Suche bleibt auch über einen Index nahe der Größengrenze schnell, auch bei
 * Eingaben, die als regulärer Ausdruck teuer wären.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it } from "vitest";
import { dokuIndexAusText, MAX_INDEX_BYTES } from "./index-laden";
import { sucheImIndex } from "./suche";
import { testIndexText } from "./testdaten/echter-index";
import { grosseAbschnitte } from "./testdaten/indizes";

// Der große Index entsteht mit `grosseAbschnitte` aus `testdaten/indizes.ts`: Wörter aus einem
// kleinen Vorrat, also treffen die Begriffe fast jeden Abschnitt (der teuerste Fall).

const text = testIndexText(grosseAbschnitte(MAX_INDEX_BYTES - 300_000));
const index = dokuIndexAusText(text);

/** Median und größter Wert von 20 Läufen in Millisekunden. */
function messe(anfragen: string[]): { median: number; max: number } {
  const zeiten: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    sucheImIndex(index, anfragen);
    zeiten.push(performance.now() - start);
  }
  zeiten.sort((a, b) => a - b);
  return { median: zeiten[10] ?? Number.POSITIVE_INFINITY, max: zeiten[19] ?? 0 };
}

describe("Zeit der Suche", () => {
  it("der Test-Index liegt nahe an der Grenze von 4 MB und darunter", () => {
    const bytes = Buffer.byteLength(text);
    expect(bytes).toBeGreaterThan(3_500_000);
    expect(bytes).toBeLessThanOrEqual(MAX_INDEX_BYTES);
  });

  // Gegenprobe: die Eingabe als regulären Ausdruck auswerten → Zeit-Test rot (oder Ergebnis falsch).
  it("längste Suche über einen Index nahe 4 MB: Median von 20 Läufen unter 50 ms", () => {
    const anfragen = [
      "anbieter modell grenze beleg schleuse einstellung verlauf antwort regel sicherung zugang kette",
      "werkzeug abschnitt fassung schritt anbieter modell grenze beleg schleuse einstellung verlauf antwort",
      "regel sicherung zugang kette werkzeug abschnitt fassung schritt anbieter modell grenze beleg",
    ];
    const { median, max } = messe(anfragen);
    console.info(
      `Suche über ${Buffer.byteLength(text)} Bytes: Median ${median.toFixed(2)} ms, größter Wert ${max.toFixed(2)} ms`,
    );
    expect(median).toBeLessThan(50);
    expect(sucheImIndex(index, anfragen).length).toBeGreaterThan(0);
  });

  it("Eingaben (a+)+$, 200 × a und 200 Sonderzeichen: unter 50 ms, kein Treffer", () => {
    const eingaben = ["(a+)+$", "a".repeat(200), "!?*+[](){}^$|\\.".repeat(14).slice(0, 200)];
    const { median } = messe(eingaben);
    expect(median).toBeLessThan(50);
    expect(sucheImIndex(index, eingaben)).toEqual([]);
  });
});
