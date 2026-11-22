/**
 * PaiBot – Tests: Suche im Doku-Index. Feste Fragen gegen den echten Index (mit Treffer und
 * Fallen ohne Treffer), gleiche Ergebnisse bei gleicher Eingabe, Obergrenzen und Ausschnitt um
 * den ersten Treffer.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, it } from "vitest";
import { FALLEN, GOLDEN_FAELLE } from "./testdaten/indizes";

// Die Gegenprobe im Kommentar ist die Änderung, die den Fall rot machen muss.

describe("Feste Fragen gegen den echten Index", () => {
  // Gegenprobe: Gewichtung Titel und Text vertauschen bzw. Schwelle auf 0 → mindestens ein Fall rot.
  for (const fall of GOLDEN_FAELLE) {
    it.todo(
      `„${fall.frage}“ liefert ${fall.seite}${fall.anker === undefined ? "" : `#${fall.anker}`}`,
    );
  }
  for (const frage of FALLEN) {
    it.todo(`„${frage}“ findet nichts`);
  }
});

describe("Gleiche Eingabe, gleiches Ergebnis", () => {
  // Gegenprobe: Sortierung über `Math.random` oder die Reihenfolge eines `Set` der Eingabe.
  it.todo(
    "zweimal suchen und den Index zweimal laden: dieselben Abschnitte in derselben Reihenfolge",
  );
  it.todo("Gleichstand der Punkte: Reihenfolge im Index");
});

describe("Obergrenzen und Ausschnitt", () => {
  it.todo("höchstens 4 Abschnitte");
  it.todo("Text je Abschnitt höchstens 1 500 Zeichen, gekürzte Ränder mit …");
  it.todo(
    "Summe aller Texte und Titel höchstens 6 000 Zeichen; was nicht passt, fällt als ganzer Abschnitt weg",
  );
  // Gegenprobe: Fenster vom Anfang statt um den ersten Treffer → das Treffer-Wort fehlt.
  it.todo("der Ausschnitt eines langen Abschnitts enthält das erste Treffer-Wort");
  it.todo("höchstens 3 Suchanfragen je Aufruf, je Anfrage zählen höchstens 12 Wörter");
  it.todo(
    "Anfrage ohne Begriff nach dem Normalisieren (nur Stoppwörter, nur Zeichen): kein Treffer",
  );
});
