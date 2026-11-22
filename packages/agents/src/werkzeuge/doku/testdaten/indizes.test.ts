/**
 * PaiBot – Test: Die Testdaten des Nachschlagens passen zum echten Doku-Index (Seiten und Anker der
 * festen Fragen gibt es, die Kern-Wörter der Fallen nicht) und haben die Ränder, die die Tests
 * brauchen (unsichtbare Zeichen, langer Abschnitt, viele Treffer, großer Index).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  EINGESCHLEUSTES_WERKZEUG,
  EINSCHLEUSUNG,
  FALLEN,
  FALLEN_WOERTER,
  GOLDEN_FAELLE,
  grosseAbschnitte,
  LANG,
  SPAETES_WORT,
  type TestAbschnitt,
  UNSICHTBAR,
  UNSICHTBAR_BEREINIGT,
  UNSICHTBARE_ZEICHEN,
  VIELE_TREFFER,
  VIELES_WORT,
} from "./indizes";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");

/** Abschnitte des echten Index, gebaut wie `pnpm doku:index`, ohne eine Datei zu schreiben. */
let echte: TestAbschnitt[] = [];

beforeAll(async () => {
  const skript = pathToFileURL(path.join(ROOT, "scripts", "doku-index.mjs")).href;
  const modul = (await import(skript)) as {
    baueIndex(o: { wurzel: string }): { index: { abschnitte: TestAbschnitt[] } };
  };
  echte = modul.baueIndex({ wurzel: ROOT }).index.abschnitte;
});

describe("Testdaten gegen den echten Doku-Index", () => {
  it("jede feste Frage zeigt auf eine Seite (und einen Anker), die es im Index gibt", () => {
    expect(GOLDEN_FAELLE.length).toBeGreaterThanOrEqual(6);
    for (const fall of GOLDEN_FAELLE) {
      const seite = echte.filter((a) => a.seite === fall.seite);
      expect(seite.length, fall.frage).toBeGreaterThan(0);
      if (fall.anker !== undefined) {
        expect(
          seite.some((a) => a.anker === fall.anker),
          `${fall.seite}#${fall.anker}`,
        ).toBe(true);
      }
    }
  });

  it("kein Abschnitt des Index enthält ein Kern-Wort der Fallen; jede Falle nennt eins", () => {
    expect(FALLEN.length).toBeGreaterThanOrEqual(4);
    for (const wort of FALLEN_WOERTER) {
      const treffer = echte.filter((a) => `${a.titel} ${a.text}`.toLowerCase().includes(wort));
      expect(
        treffer.map((a) => a.id),
        wort,
      ).toEqual([]);
    }
    for (const frage of FALLEN) {
      expect(
        FALLEN_WOERTER.some((wort) => frage.toLowerCase().includes(wort)),
        frage,
      ).toBe(true);
    }
  });

  it("keine Seite des Index stammt aus den Testdaten", () => {
    const testSeiten = [...LANG, ...VIELE_TREFFER, ...EINSCHLEUSUNG, ...UNSICHTBAR].map(
      (a) => a.seite,
    );
    expect(echte.filter((a) => testSeiten.includes(a.seite))).toEqual([]);
    expect(echte.some((a) => a.text.includes(EINGESCHLEUSTES_WERKZEUG))).toBe(false);
  });
});

describe("Ränder der Test-Indizes", () => {
  it("der unsichtbare Abschnitt enthält jedes der vier Zeichen, bereinigt bleibt der Satz", () => {
    const [a] = UNSICHTBAR;
    for (const zeichen of UNSICHTBARE_ZEICHEN) expect(`${a?.titel}${a?.text}`).toContain(zeichen);
    let bereinigt = a?.text ?? "";
    for (const zeichen of UNSICHTBARE_ZEICHEN) bereinigt = bereinigt.split(zeichen).join("");
    expect(bereinigt).toBe(UNSICHTBAR_BEREINIGT);
  });

  it("der lange Abschnitt hat über 1 500 Zeichen, das späte Wort steht nach Zeichen 1 500", () => {
    const text = LANG[0]?.text ?? "";
    expect(text.length).toBeGreaterThan(4000);
    expect(text.indexOf(SPAETES_WORT)).toBeGreaterThan(1500);
  });

  it("viele Treffer: sechs Abschnitte mit je 2 000 Zeichen und dem Wort", () => {
    expect(VIELE_TREFFER).toHaveLength(6);
    for (const a of VIELE_TREFFER) {
      expect(a.text).toHaveLength(2000);
      expect(a.text).toContain(VIELES_WORT);
    }
  });

  it("der große Index ist deterministisch und erreicht die gewünschte Größe", () => {
    const ziel = 200_000;
    const a = grosseAbschnitte(ziel);
    expect(JSON.stringify(a).length).toBeGreaterThanOrEqual(ziel);
    expect(grosseAbschnitte(ziel)).toEqual(a);
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
  });
});
