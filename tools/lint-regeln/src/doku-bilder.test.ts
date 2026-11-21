/**
 * PaiBot – Tests der Werkzeuge für Doku-Bilder: Liste der Aufnahmen, Reihenfolge der Zustände,
 * Sonderwerte und der Schutz der Wegwerf-Datenbank.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const laden = async <T>(rel: string) =>
  (await import(pathToFileURL(path.join(ROOT, rel)).href)) as T;

type Eintrag = Record<string, unknown> & { name: string; vorher: Record<string, unknown>[] };
const liste = await laden<{
  pruefeListe: (roh: unknown) => Eintrag[];
  ordneAufnahmen: (a: Eintrag[]) => Eintrag[];
  ListenFehler: new (text: string) => Error;
}>("scripts/doku/liste.mjs");
const lauf = await laden<{
  neuerDatenbankName: (zufall?: string) => string;
  istDokuDatenbank: (name: unknown) => boolean;
  istDokuRolle: (name: unknown) => boolean;
  rollenName: (db: string) => string;
  wegwerfWert: (laenge?: number) => string;
  setzeSonderwert: (text: string, lauf: Record<string, string>) => string;
  schreibeLauf: (daten: unknown, datei: string) => void;
  leseLauf: (datei: string) => Record<string, unknown> | undefined;
  aendereLauf: (aenderung: unknown, datei: string) => Record<string, unknown>;
  loescheLauf: (datei: string) => void;
}>("scripts/doku/lauf.mjs");
const datenbank = await laden<{
  loescheDatenbank: (
    root: string,
    verwalter: string,
    ziel: { name: string; rolle: string; kennung: string },
  ) => Promise<void>;
  legeDatenbankAn: (
    root: string,
    verwalter: string,
    kennung: string,
  ) => Promise<{ name: string; rolle: string; loesche: () => Promise<void> }>;
  zaehleDokuReste: (root: string, verwalter: string) => Promise<{ datenbanken: number }>;
}>("scripts/doku/datenbank.mjs");

const pruefe = (aufnahmen: unknown[], ablaeufe?: unknown) =>
  liste.pruefeListe({ aufnahmen, ...(ablaeufe ? { ablaeufe } : {}) });
const fehlerText = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(liste.ListenFehler);
    return (error as Error).message;
  }
  throw new Error("kein Fehler");
};

describe("Liste der Aufnahmen", () => {
  it("alte Einträge (nur klick/warteAuf) bleiben gültig und bekommen Standardwerte", () => {
    const [a] = pruefe([
      { name: "alt", pfad: "/", vorher: [{ klick: "button" }, { warteAuf: "main" }] },
    ]);
    expect(a).toMatchObject({ breite: 1280, hoehe: 800, skalierung: 2, modus: "app", status: 200 });
    expect(a?.vorher).toEqual([{ klick: { css: "button", genau: true } }, { warteAuf: "main" }]);
  });

  it("neue Schritte: tippe mit Sonderwert, taste, warteAufText, gehe, Ziel als Objekt", () => {
    const [a] = pruefe([
      {
        name: "neu",
        pfad: "/einrichtung",
        zustand: "frisch",
        vorher: [
          { tippe: "Einrichtungs-Code", text: "$einrichtungs-code" },
          { tippe: { beschriftung: "Schlüssel für", genau: false }, text: "$anbieter-schluessel" },
          { klick: { rolle: "button", name: "Weiter" } },
          { taste: "Enter" },
          { warteAufText: "Passwort festlegen" },
          { gehe: "/anmelden" },
        ],
      },
    ]);
    expect(a?.vorher).toHaveLength(6);
    expect(a?.vorher[0]).toEqual({
      tippe: { beschriftung: "Einrichtungs-Code", genau: true },
      text: "$einrichtungs-code",
    });
  });

  it("Abläufe werden eingesetzt, auch geschachtelt", () => {
    const [a] = pruefe([{ name: "a", pfad: "/", vorher: [{ ablauf: "zwei" }, { taste: "Tab" }] }], {
      eins: [{ taste: "A" }],
      zwei: [{ ablauf: "eins" }, { taste: "B" }],
    });
    expect(a?.vorher).toEqual([{ taste: "A" }, { taste: "B" }, { taste: "Tab" }]);
  });

  it.each([
    [[{ name: "a", pfad: "/", anmeldung: true }], "Mit „anmeldung“ braucht es „zustand“"],
    [[{ name: "a", pfad: "/", zustand: "frisch", anmeldung: true }], "Mit „anmeldung“"],
    [[{ name: "a", pfad: "/", zustand: "irgendwie" }], "„zustand“ ist eines von"],
    [[{ name: "a", pfad: "/", modus: "entwicklung", zustand: "frisch" }], "Entwicklungs-Seiten"],
    [
      [{ name: "a", pfad: "/", vorher: [{ tippe: "Feld", text: "$geheim" }] }],
      "Unbekannter Sonderwert",
    ],
    [[{ name: "a", pfad: "/", vorher: [{ tippe: "Feld" }] }], "„tippe“ braucht „text“"],
    [[{ name: "a", pfad: "/", vorher: [{ klick: "a", taste: "B" }] }], "genau eine Aktion"],
    [[{ name: "a", pfad: "/", vorher: [{ schiebe: "a" }] }], "genau eine Aktion"],
    [[{ name: "a", pfad: "/", vorher: [{ klick: "a", extra: 1 }] }], "Unbekannte Felder"],
    [[{ name: "a", pfad: "/", vorher: [{ gehe: "anmelden" }] }], "beginnt"],
    [[{ name: "a", pfad: "/", vorher: [{ klick: { css: "a", text: "b" } }] }], "genau eines von"],
    [
      [{ name: "a", pfad: "/", vorher: [{ klick: { text: "a", name: "b" } }] }],
      "nur zusammen mit „rolle“",
    ],
    [[{ name: "a", pfad: "/", vorher: [{ ablauf: "fehlt" }] }], "gibt es nicht"],
    [[{ name: "a", pfad: "/", danach: "eingerichtet" }], "„danach“"],
    [[{ name: "a", pfad: "/", status: 99 }], "„status“"],
    [
      [
        { name: "a", pfad: "/" },
        { name: "a", pfad: "/" },
      ],
      "doppelt",
    ],
    [
      [
        { name: "a", pfad: "/", zustand: "frisch", danach: "eingerichtet" },
        { name: "b", pfad: "/", zustand: "frisch", danach: "eingerichtet" },
      ],
      "Nur eine Aufnahme",
    ],
  ])("ungültig: %j", (aufnahmen, meldung) => {
    expect(fehlerText(() => pruefe(aufnahmen))).toContain(meldung);
  });

  it("ein Ablauf, der sich selbst aufruft, ist ein Fehler", () => {
    const text = fehlerText(() =>
      pruefe([{ name: "a", pfad: "/", vorher: [{ ablauf: "x" }] }], {
        x: [{ ablauf: "y" }],
        y: [{ ablauf: "x" }],
      }),
    );
    expect(text).toContain("ruft sich selbst auf");
  });

  it("ordnet: Entwicklung, ohne Zustand, frisch (mit „danach“ zuletzt), eingerichtet, Beispiel-Daten", () => {
    const geordnet = liste.ordneAufnahmen(
      pruefe([
        { name: "daten", pfad: "/", zustand: "mit-beispieldaten" },
        { name: "anmelden", pfad: "/anmelden", zustand: "eingerichtet" },
        { name: "fertig", pfad: "/einrichtung", zustand: "frisch", danach: "eingerichtet" },
        { name: "code", pfad: "/einrichtung", zustand: "frisch" },
        { name: "egal", pfad: "/" },
        { name: "vorschau", pfad: "/_komponenten/app", modus: "entwicklung" },
        { name: "start", pfad: "/", zustand: "eingerichtet", anmeldung: true },
        { name: "passwort", pfad: "/einrichtung", zustand: "frisch" },
      ]),
    );
    expect(geordnet.map((a) => a.name)).toEqual([
      "vorschau",
      "egal",
      "code",
      "passwort",
      "fertig",
      "anmelden",
      "start",
      "daten",
    ]);
  });

  it("die echte Liste docs/screenshots.json ist gültig", async () => {
    const { readFileSync } = await import("node:fs");
    const roh = JSON.parse(readFileSync(path.join(ROOT, "docs", "screenshots.json"), "utf8"));
    expect(liste.pruefeListe(roh).length).toBeGreaterThan(0);
  });
});

describe("Sonderwerte und Lauf-Datei", () => {
  const werte = { einrichtungsCode: "CODE", passwort: "PW", anbieterSchluessel: "KEY" };

  it("setzt Sonderwerte ein und lässt normalen Text, $$ steht für ein $", () => {
    expect(lauf.setzeSonderwert("$einrichtungs-code", werte)).toBe("CODE");
    expect(lauf.setzeSonderwert("$passwort", werte)).toBe("PW");
    expect(lauf.setzeSonderwert("$anbieter-schluessel", werte)).toBe("KEY");
    expect(lauf.setzeSonderwert("Hallo", werte)).toBe("Hallo");
    expect(lauf.setzeSonderwert("$$5", werte)).toBe("$5");
  });

  it("unbekannter Sonderwert oder fehlender Wert ist ein Fehler", () => {
    expect(() => lauf.setzeSonderwert("$geheim", werte)).toThrow("Unbekannter Sonderwert");
    expect(() => lauf.setzeSonderwert("$passwort", {})).toThrow("fehlt der Wert");
  });

  it("Wegwerf-Werte haben feste Länge, nur Buchstaben und Ziffern, und sind jedes Mal anders", () => {
    const a = lauf.wegwerfWert(24);
    const b = lauf.wegwerfWert(24);
    expect(a).toMatch(/^[A-Za-z0-9]{24}$/);
    expect(a).not.toBe(b);
  });

  it("die Lauf-Datei ist nur für den eigenen Benutzer lesbar und lässt sich ändern und löschen", () => {
    const ordner = mkdtempSync(path.join(tmpdir(), "paibot-doku-lauf-"));
    try {
      const datei = path.join(ordner, "unter", "lauf.json");
      lauf.schreibeLauf({ zustand: "frisch", url: "http://127.0.0.1:1" }, datei);
      expect(statSync(datei).mode & 0o077).toBe(0);
      expect(lauf.aendereLauf({ zustand: "eingerichtet" }, datei)).toMatchObject({
        zustand: "eingerichtet",
        url: "http://127.0.0.1:1",
      });
      lauf.loescheLauf(datei);
      expect(lauf.leseLauf(datei)).toBeUndefined();
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  });
});

describe("Schutz der Wegwerf-Datenbank", () => {
  it("Namen haben einen festen Vorsatz und eine feste Form", () => {
    const name = lauf.neuerDatenbankName();
    expect(lauf.istDokuDatenbank(name)).toBe(true);
    expect(lauf.istDokuRolle(lauf.rollenName(name))).toBe(true);
    for (const fremd of [
      "paibot",
      "postgres",
      "paibot_doku_",
      "paibot_doku_123",
      "x_paibot_doku_aaaaaaaaaaaa",
    ]) {
      expect(lauf.istDokuDatenbank(fremd), fremd).toBe(false);
    }
    expect(() => lauf.rollenName("paibot")).toThrow();
    expect(() => lauf.neuerDatenbankName("x; drop database")).toThrow();
  });

  it("löscht nie eine Datenbank, deren Name nicht von pnpm doku:app stammt (ohne Verbindung)", async () => {
    for (const ziel of [
      { name: "paibot", rolle: "paibot_app", kennung: "k" },
      { name: "paibot_doku_aaaaaaaaaaaa", rolle: "paibot_app", kennung: "k" },
      { name: "paibot_doku_aaaaaaaaaaaa", rolle: "paibot_doku_bbbbbbbbbbbb_app", kennung: "k" },
    ]) {
      await expect(
        datenbank.loescheDatenbank(ROOT, "postgres://niemand@127.0.0.1:1/x", ziel),
      ).rejects.toThrow("Nicht gelöscht");
    }
  });

  // Mit echtem Postgres (Wegwerf-Server wie bei den anderen Postgres-Tests).
  const url = process.env.PAIBOT_TEST_DATABASE_URL;
  it.skipIf(!url)(
    "legt an, verweigert das Löschen mit fremdem Vermerk und löscht mit dem eigenen",
    async () => {
      const verwalter = url as string;
      const db = await datenbank.legeDatenbankAn(ROOT, verwalter, "kennung-a");
      try {
        await expect(
          datenbank.loescheDatenbank(ROOT, verwalter, {
            name: db.name,
            rolle: db.rolle,
            kennung: "kennung-b",
          }),
        ).rejects.toThrow("Vermerk");
      } finally {
        await db.loesche();
      }
      const reste = await datenbank.zaehleDokuReste(ROOT, verwalter);
      expect(reste.datenbanken).toBe(0);
    },
  );
});
