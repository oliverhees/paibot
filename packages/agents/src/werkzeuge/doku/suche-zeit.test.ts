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

import { describe, it } from "vitest";

// Der große Index entsteht mit `grosseAbschnitte` aus `testdaten/indizes.ts`.

describe("Zeit der Suche", () => {
  // Gegenprobe: die Eingabe als regulären Ausdruck auswerten → Zeit-Test rot (oder Ergebnis falsch).
  it.todo("längste Suche über einen Index nahe 4 MB: Median von 20 Läufen unter 50 ms");
  it.todo("Eingaben (a+)+$, 200 × a und 200 Sonderzeichen: unter 50 ms, kein Treffer");
});
