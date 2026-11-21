/**
 * PaiBot – prüft am Quelltext, wohin der Fokus in den Dialogen des Chats beim Öffnen geht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TEXT = readFileSync(new URL("../../app/(app)/chat/ChatSeite.tsx", import.meta.url), "utf8");

/** Quelltext einer Funktion der Datei bis zur nächsten Funktion auf oberster Ebene. */
function funktion(name: string): string {
  const start = TEXT.indexOf(`\nfunction ${name}(`);
  expect(start, name).toBeGreaterThan(0);
  const ende = TEXT.indexOf("\nfunction ", start + 1);
  return TEXT.slice(start, ende === -1 ? undefined : ende);
}

describe("Fokus in den Dialogen des Chats", () => {
  it("Umbenennen: der Fokus geht ins Feld „Titel“, nicht auf „Schließen“", () => {
    const umbenennen = funktion("Umbenennen");
    const anfang = umbenennen.indexOf("<TextField");
    const feld = umbenennen.slice(anfang, umbenennen.indexOf("/>", anfang));
    expect(feld).toContain('label={t("chat.umbenennen.feld")}');
    expect(feld).toMatch(/\sdata-erster-fokus(\s|\/|=\{true\})/);
    // autoFocus würde vor der Fokus-Falle greifen: Sie merkte sich dann das Feld statt des
    // auslösenden Knopfs und gäbe den Fokus nach dem Schließen nicht zurück.
    expect(umbenennen).not.toContain("autoFocus");
  });

  it("Löschen: der Fokus geht auf „Abbrechen“", () => {
    const loeschen = funktion("Loeschen");
    expect(loeschen).toMatch(/<Button art="zweit" onClick=\{onAbbrechen\} data-erster-fokus>/);
    expect(loeschen).not.toContain("autoFocus");
  });

  it("kein Dialog des Chats nutzt autoFocus", () => {
    expect(TEXT).not.toContain("autoFocus");
  });
});
