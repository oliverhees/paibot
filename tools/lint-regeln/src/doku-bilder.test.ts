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
import { createRequire } from "node:module";
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

  /** Gibt es genau diese Datenbank und Rolle auf dem Server (0 oder 1)? */
  async function vorhanden(verwalter: string, name: string, rolle: string) {
    const modul = createRequire(path.join(ROOT, "packages", "db", "package.json"))("postgres");
    const postgres = (typeof modul === "function" ? modul : modul.default) as (
      url: string,
      optionen: Record<string, unknown>,
    ) => {
      (teile: TemplateStringsArray, ...werte: unknown[]): Promise<Record<string, number>[]>;
      end: (optionen: { timeout: number }) => Promise<void>;
    };
    const sql = postgres(verwalter, { max: 1, onnotice: () => undefined, connect_timeout: 10 });
    try {
      const [zahl] = await sql`
        select
          (select count(*)::int from pg_database where datname = ${name}) as datenbank,
          (select count(*)::int from pg_roles where rolname = ${rolle}) as rolle`;
      if (zahl === undefined) throw new Error("keine Antwort vom Server");
      return zahl;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
  it.skipIf(!url)(
    "legt an, verweigert das Löschen mit fremdem Vermerk und löscht mit dem eigenen",
    async () => {
      const verwalter = url as string;
      const db = await datenbank.legeDatenbankAn(ROOT, verwalter, "kennung-a");
      // Nur die eigene Datenbank zählt: Andere Läufe (z. B. ein laufendes `pnpm doku:app`) dürfen
      // auf demselben Server gleichzeitig ihre eigenen Doku-Datenbanken haben.
      expect((await vorhanden(verwalter, db.name, db.rolle)).datenbank).toBe(1);
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
      expect(await vorhanden(verwalter, db.name, db.rolle)).toEqual({ datenbank: 0, rolle: 0 });
    },
  );
});

describe("Beispiel-Umgebung: Datenschleuse, Test-Anbieter, verdeckte Stellen", () => {
  it("„datenschleuse“: Standard „aus“ bei Aufnahmen mit Zustand, nur bekannte Werte", () => {
    const [a, b, c] = pruefe([
      { name: "a", pfad: "/", zustand: "eingerichtet" },
      { name: "b", pfad: "/", zustand: "eingerichtet", datenschleuse: "bereit" },
      { name: "c", pfad: "/" },
    ]);
    expect(a?.datenschleuse).toBe("aus");
    expect(b?.datenschleuse).toBe("bereit");
    expect(c?.datenschleuse).toBeUndefined();
    expect(
      fehlerText(() =>
        pruefe([{ name: "x", pfad: "/", zustand: "eingerichtet", datenschleuse: "an" }]),
      ),
    ).toContain("„datenschleuse“ ist eines von");
    expect(fehlerText(() => pruefe([{ name: "x", pfad: "/", datenschleuse: "bereit" }]))).toContain(
      "nur zusammen mit „zustand“",
    );
  });

  it("Ziel mit „nr“ wählt einen von mehreren Treffern", () => {
    const [a] = pruefe([
      {
        name: "a",
        pfad: "/",
        vorher: [{ klick: { rolle: "link", name: "B", genau: false, nr: 0 } }],
      },
    ]);
    expect(a?.vorher[0]).toEqual({ klick: { rolle: "link", name: "B", genau: false, nr: 0 } });
    expect(
      fehlerText(() =>
        pruefe([{ name: "x", pfad: "/", vorher: [{ klick: { css: "a", nr: -1 } }] }]),
      ),
    ).toContain("„nr“");
  });

  it("Schritte „zeige“ und „anbieter“; unbekannte Felder des Anbieters sind ein Fehler", () => {
    const [a] = pruefe([
      {
        name: "a",
        pfad: "/",
        vorher: [{ zeige: "h2" }, { anbieter: { reply: "Hallo", chunkDelayMs: 200 } }],
      },
    ]);
    expect(a?.vorher).toEqual([
      { zeige: { css: "h2", genau: true } },
      { anbieter: { reply: "Hallo", chunkDelayMs: 200 } },
    ]);
    expect(
      fehlerText(() => pruefe([{ name: "x", pfad: "/", vorher: [{ anbieter: { apiKey: "k" } }] }])),
    ).toContain("kennt „apiKey“ nicht");
    expect(
      fehlerText(() =>
        pruefe([{ name: "x", pfad: "/", vorher: [{ anbieter: { chunkDelayMs: -1 } }] }]),
      ),
    ).toContain("ganze Zahl");
  });

  it("„verdecke“ ist eine Liste von CSS-Selectoren, Standard leer", () => {
    const [a, b] = pruefe([
      { name: "a", pfad: "/" },
      { name: "b", pfad: "/", verdecke: ["time"] },
    ]);
    expect(a?.verdecke).toEqual([]);
    expect(b?.verdecke).toEqual(["time"]);
    expect(fehlerText(() => pruefe([{ name: "x", pfad: "/", verdecke: "time" }]))).toContain(
      "Liste von CSS-Selectoren",
    );
  });
});

type Antwort = {
  status?: number;
  daten?: unknown;
  weiter?: { apiKey: string; koerper: Record<string, unknown> };
};
const attrappe = await laden<{
  antwortDerAttrappe: (a: Record<string, unknown>) => Antwort;
  starteAttrappe: (a: Record<string, unknown>) => Promise<{
    url: string;
    setzeZustand: (z: string) => void;
    stop: () => Promise<void>;
  }>;
}>("scripts/doku/schleuse-attrappe.mjs");
describe("Beispiel-Datenschleuse (Attrappe)", () => {
  const frage = (zustand: string, methode: string, pfad: string, kopf = {}, koerper = "") =>
    attrappe.antwortDerAttrappe({ zustand, schluessel: "s", methode, pfad, kopf, koerper });
  const mit = { authorization: "Bearer s" };

  it("zeigt dem Worker die drei Zustände so, wie die Prüfung sie unterscheidet", () => {
    expect(frage("bereit", "GET", "/health/liveliness").status).toBe(200);
    expect(frage("bereit", "GET", "/v1/models", mit).status).toBe(200);
    expect(frage("bereit", "GET", "/v1/models").status).toBe(401);
    expect(frage("schluessel_falsch", "GET", "/health/liveliness").status).toBe(200);
    expect(frage("schluessel_falsch", "GET", "/v1/models", mit).status).toBe(401);
    expect(frage("nicht_erreichbar", "GET", "/health/liveliness").status).toBe(503);
  });

  it("reicht Chat-Anfragen nur mit Schlüssel weiter, ohne api_key im Körper, Modell ohne Vorsatz", () => {
    const koerper = JSON.stringify({ model: "eigen/beispiel/allrounder", api_key: "k", n: 1 });
    expect(frage("bereit", "POST", "/v1/chat/completions", {}, koerper).status).toBe(401);
    const a = frage("bereit", "POST", "/v1/chat/completions", mit, koerper);
    expect(a.weiter).toEqual({ apiKey: "k", koerper: { model: "beispiel/allrounder", n: 1 } });
    expect(frage("bereit", "POST", "/v1/chat/completions", mit, "kein json").status).toBe(400);
  });

  it("läuft nur an 127.0.0.1 und wechselt den Zustand", async () => {
    const a = await attrappe.starteAttrappe({ schluessel: "s", anbieterUrl: "http://127.0.0.1:9" });
    try {
      expect(new URL(a.url).hostname).toBe("127.0.0.1");
      expect((await fetch(`${a.url}/health/liveliness`)).status).toBe(200);
      a.setzeZustand("nicht_erreichbar");
      expect((await fetch(`${a.url}/health/liveliness`)).status).toBe(503);
      expect(() => a.setzeZustand("kaputt")).toThrow("Unbekannter Zustand");
    } finally {
      await a.stop();
    }
  });
});

type Bild = { breite: number; hoehe: number; bpp: number; pixel: Buffer };
const png = await laden<{
  lesePng: (b: Buffer) => Bild;
  schreibePng: (b: Bild) => Buffer;
  umgebungsFarbe: (b: Bild, f: Record<string, number>) => Buffer;
  verdecke: (b: Bild, f: Record<string, number>[]) => Bild;
}>("scripts/doku/png.mjs");
const { deflateSync } = await import("node:zlib");

describe("Stellen im Bild verdecken (PNG)", () => {
  const bildMit = (breite: number, hoehe: number, farbe: number[]): Bild => {
    const pixel = Buffer.alloc(breite * hoehe * 4);
    for (let i = 0; i < breite * hoehe; i += 1) Buffer.from(farbe).copy(pixel, i * 4);
    return { breite, hoehe, bpp: 4, pixel };
  };

  it("schreibt und liest ein Bild verlustfrei, gleiche Pixel geben gleiche Bytes", () => {
    const bild = bildMit(5, 4, [14, 14, 16, 255]);
    bild.pixel[0] = 200;
    const a = png.schreibePng(bild);
    expect(png.schreibePng(png.lesePng(a)).equals(a)).toBe(true);
    expect(png.lesePng(a).pixel.equals(bild.pixel)).toBe(true);
  });

  it("liest auch Zeilen mit Filter (wie Chromium sie schreibt)", () => {
    // 2×1 RGB mit Filter 1 (Sub): zweites Pixel als Abstand zum ersten
    const roh = Buffer.from([1, 10, 20, 30, 5, 5, 5]);
    const kopf = Buffer.alloc(13);
    kopf.writeUInt32BE(2, 0);
    kopf.writeUInt32BE(1, 4);
    kopf[8] = 8;
    kopf[9] = 2;
    const roh8 = png.schreibePng({ breite: 2, hoehe: 1, bpp: 3, pixel: Buffer.alloc(6) });
    // IDAT des selbst geschriebenen Bilds durch eines mit Filter ersetzen
    const ohneIdat = (b: Buffer) => b.subarray(0, 33);
    const idat = deflateSync(roh);
    const laenge = Buffer.alloc(4);
    laenge.writeUInt32BE(idat.length, 0);
    const datei = Buffer.concat([
      ohneIdat(roh8),
      laenge,
      Buffer.from("IDAT"),
      idat,
      Buffer.alloc(4),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("IEND"),
      Buffer.alloc(4),
    ]);
    expect([...png.lesePng(datei).pixel]).toEqual([10, 20, 30, 15, 25, 35]);
  });

  it("füllt eine Fläche mit der häufigsten Farbe direkt um sie herum", () => {
    const bild = bildMit(20, 20, [25, 25, 28, 255]);
    // „Uhrzeit“ in der Mitte
    for (let y = 8; y < 12; y += 1) {
      for (let x = 6; x < 14; x += 1)
        Buffer.from([250, 250, 250, 255]).copy(bild.pixel, (y * 20 + x) * 4);
    }
    expect([...png.umgebungsFarbe(bild, { x: 6, y: 8, breite: 8, hoehe: 4 })]).toEqual([
      25, 25, 28, 255,
    ]);
    png.verdecke(bild, [{ x: 6, y: 8, breite: 8, hoehe: 4 }]);
    expect(bild.pixel.equals(bildMit(20, 20, [25, 25, 28, 255]).pixel)).toBe(true);
  });

  it("Flächen am Rand und außerhalb des Bilds sind kein Fehler", () => {
    const bild = bildMit(4, 4, [1, 2, 3, 255]);
    expect(() =>
      png.verdecke(bild, [
        { x: -5, y: -5, breite: 6, hoehe: 6 },
        { x: 10, y: 10, breite: 3, hoehe: 3 },
      ]),
    ).not.toThrow();
  });
});

const beispiel = await laden<{
  Keksdose: new () => {
    nimm(a: Response): void;
    finde(n: string): { name: string; wert: string } | undefined;
    setze(n: string, w: string): void;
    kopf(): string;
  };
  meldeAn(lauf: Record<string, unknown>): Promise<unknown>;
  BEISPIEL_GERAET: string;
  geraetAusKeksen(
    kekse: { name: string; value: string }[] | undefined,
  ): { name: string; wert: string } | undefined;
  geraetAlsKeks(
    lauf: Record<string, unknown> | undefined,
  ): { name: string; value: string; url: string } | undefined;
  stelleHer(ziel: string, datei: string): Promise<{ lauf: Record<string, unknown> }>;
}>("scripts/doku-beispieldaten.mjs");
const { createServer: httpServer } = await import("node:http");

describe("Beispiel-Gerät der Doku-Umgebung", () => {
  const daten = beispiel;

  /** Kleine Attrappe der App: Einrichtung setzt ein Geräte-Cookie, Anmelden merkt sich die Cookies. */
  async function attrappe() {
    const anmeldungen: string[] = [];
    const kennungen: string[] = [];
    const server = httpServer((req, res) => {
      const kopf: Record<string, string | string[]> = { "content-type": "text/html" };
      if (req.url === "/api/einrichtung" && req.method === "POST") {
        kopf["set-cookie"] = ["pb_sitzung=s1; Path=/", "pb_geraet=kennung.zeichen; Path=/"];
        res.writeHead(200, { ...kopf, "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, daten: {} }));
        return;
      }
      if (req.url === "/api/zugang/anmelden" && req.method === "POST") {
        anmeldungen.push(String(req.headers.cookie ?? ""));
        kennungen.push(String(req.headers["user-agent"] ?? ""));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, daten: { angemeldet: true } }));
        return;
      }
      res.writeHead(200, kopf);
      res.end('<meta name="pb-pruefzeichen" content="p">');
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const adresse = server.address() as { port: number };
    return {
      url: `http://127.0.0.1:${adresse.port}`,
      anmeldungen,
      kennungen,
      stop: () => new Promise((r) => server.close(r)),
    };
  }

  it("findet das Geräte-Cookie auch mit Präfix __Host-", () => {
    const dose = new daten.Keksdose();
    dose.setze("__Host-pb_geraet", "w");
    expect(dose.finde("pb_geraet")).toEqual({ name: "__Host-pb_geraet", wert: "w" });
    expect(dose.finde("pb_sitzung")).toBeUndefined();
  });

  it("Aufnahme-Browser und Beispiel-Daten teilen ein Gerät: Cookie merken und mitbringen", () => {
    expect(
      daten.geraetAusKeksen([
        { name: "pb_sitzung", value: "s" },
        { name: "pb_geraet", value: "g.1" },
      ]),
    ).toEqual({ name: "pb_geraet", wert: "g.1" });
    expect(daten.geraetAusKeksen([{ name: "__Host-pb_geraet", value: "g.2" }])).toEqual({
      name: "__Host-pb_geraet",
      wert: "g.2",
    });
    expect(daten.geraetAusKeksen([{ name: "pb_sitzung", value: "s" }])).toBeUndefined();
    expect(daten.geraetAusKeksen(undefined)).toBeUndefined();
    const lauf = {
      url: "http://127.0.0.1:3000",
      beispielGeraet: { name: "pb_geraet", wert: "g.1" },
    };
    expect(daten.geraetAlsKeks(lauf)).toEqual({
      name: "pb_geraet",
      value: "g.1",
      url: "http://127.0.0.1:3000",
    });
    expect(daten.geraetAlsKeks({ url: "http://127.0.0.1:3000" })).toBeUndefined();
    expect(daten.geraetAlsKeks(undefined)).toBeUndefined();
  });

  it("die Einrichtung merkt das Geräte-Cookie; die Anmeldung danach ist dasselbe Gerät", async () => {
    const app = await attrappe();
    const ordner = mkdtempSync(path.join(tmpdir(), "paibot-doku-geraet-"));
    try {
      const datei = path.join(ordner, "lauf.json");
      lauf.schreibeLauf(
        { zustand: "frisch", url: app.url, einrichtungsCode: "C", passwort: "P" },
        datei,
      );
      const { lauf: nachher } = await daten.stelleHer("eingerichtet", datei);
      expect(nachher.beispielGeraet).toEqual({ name: "pb_geraet", wert: "kennung.zeichen" });
      await daten.meldeAn(nachher);
      expect(app.anmeldungen.at(-1)).toContain("pb_geraet=kennung.zeichen");
      // Ohne gemerktes Gerät (ältere Lauf-Datei) bleibt es wie bisher: neues Gerät.
      await daten.meldeAn({ ...nachher, beispielGeraet: undefined });
      expect(app.anmeldungen.at(-1)).not.toContain("pb_geraet");
      // Das Cookie gilt nur in derselben Art Browser: Mit gemerkter Kennung meldet sich der Besuch
      // mit genau dieser an, sonst mit der Beispiel-Kennung.
      expect(app.kennungen.at(-1)).toBe(daten.BEISPIEL_GERAET);
      const kennung = "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/150.0.0.0";
      const gemerkt = nachher.beispielGeraet as Record<string, unknown>;
      await daten.meldeAn({ ...nachher, beispielGeraet: { ...gemerkt, kennung } });
      expect(app.anmeldungen.at(-1)).toContain("pb_geraet=kennung.zeichen");
      expect(app.kennungen.at(-1)).toBe(kennung);
    } finally {
      await app.stop();
      rmSync(ordner, { recursive: true, force: true });
    }
  });
});
