/**
 * PaiBot – Tests: Der Doku-Index wird einmal geladen und streng geprüft (Größe, Form, Prüfsumme,
 * eindeutige Kennungen, keine unsichtbaren Zeichen); jeder Fehler hält an, ohne Inhalt des Index
 * in der Meldung. Der echte Index lädt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, it } from "vitest";

// Die Gegenprobe im Kommentar ist die Änderung, die den Fall rot machen muss. Die Test-Indizes
// stehen in `testdaten/indizes.ts`; die Dateien schreibt der Test in einen eigenen Ordner.

describe("Laden des Doku-Index", () => {
  it.todo("der echte Index (gebaut wie pnpm doku:index) lädt; Stand mit Version und Prüfsumme");
  it.todo("Datei über 4 MB: Fehler mit Meldung, kein Werkzeug");
  it.todo("falsches format oder falsches v: Fehler mit Meldung");
  it.todo("unbekanntes Feld in der Datei oder in einem Abschnitt: Fehler mit Meldung");
  it.todo("doppelte Kennung eines Abschnitts: Fehler mit Meldung");
  // Gegenprobe: Vergleich der Prüfsumme entfernen → die geänderte Datei lädt.
  it.todo("geänderter Abschnitt bei alter Prüfsumme: Fehler mit Meldung");
  it.todo("unsichtbares Zeichen in einem Text: Fehler mit Meldung");
  it.todo("keine Meldung enthält Text aus dem Index");
  it.todo("der geladene Index ist eingefroren");
});
