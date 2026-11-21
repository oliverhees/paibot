/**
 * PaiBot – Tests des Takts vom lebendigen Avatar (ohne Browser, mit erfundener Umgebung).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { AVATAR_LEBENDIG_ZUSTAENDE, type AvatarLebendigZustand } from "./daten";
import { Leben, type LebenBuehne, type LebenUmgebung, mundOeffnung, richtungZu } from "./leben";

/** Umgebung mit eigener Uhr: `weiter(ms)` lässt die Zeitgeber der Reihe nach ablaufen. */
function umgebung(start: Partial<{ bewegung: boolean; sichtbar: boolean; zeiger: boolean }> = {}) {
  let zeit = 0;
  let naechste = 1;
  const offen = new Map<number, { an: number; fn: () => void }>();
  const s = { bewegung: true, sichtbar: true, zeiger: true, ...start };
  let samen = 7;
  const zufall = () => {
    samen = (samen * 16807) % 2147483647;
    return samen / 2147483647;
  };
  const lauscher = { zeiger: 0, zeigerAbgemeldet: 0, umgebung: 0, umgebungAbgemeldet: 0 };
  let meldeZeiger: ((p: { x: number; y: number } | null) => void) | null = null;
  let meldeUmgebung: (() => void) | null = null;
  const umg: LebenUmgebung = {
    zufall,
    setzeZeit: (fn, ms) => {
      const id = naechste++;
      offen.set(id, { an: zeit + ms, fn });
      return id;
    },
    loescheZeit: (z) => {
      offen.delete(z as number);
    },
    jetzt: () => zeit,
    bewegungErlaubt: () => s.bewegung,
    sichtbar: () => s.sichtbar,
    hatZeiger: () => s.zeiger,
    zeigerLauschen: (f) => {
      lauscher.zeiger++;
      meldeZeiger = f;
      return () => {
        lauscher.zeigerAbgemeldet++;
        meldeZeiger = null;
      };
    },
    umgebungLauschen: (f) => {
      lauscher.umgebung++;
      meldeUmgebung = f;
      return () => {
        lauscher.umgebungAbgemeldet++;
        meldeUmgebung = null;
      };
    },
  };
  return {
    umg,
    s,
    lauscher,
    offen: () => offen.size,
    zeiger: (p: { x: number; y: number } | null) => meldeZeiger?.(p),
    umgebungGeaendert: () => meldeUmgebung?.(),
    weiter(ms: number) {
      const ende = zeit + ms;
      for (;;) {
        let besteId = -1;
        let beste = Number.POSITIVE_INFINITY;
        for (const [id, e] of offen) {
          if (e.an < beste) {
            beste = e.an;
            besteId = id;
          }
        }
        if (besteId < 0 || beste > ende) break;
        const e = offen.get(besteId);
        offen.delete(besteId);
        zeit = beste;
        e?.fn();
      }
      zeit = ende;
    },
  };
}

function buehne() {
  const ruf = {
    blinzeln: [] as boolean[],
    blick: [] as [number, number][],
    atmen: [] as boolean[],
    sprech: [] as (number | null)[],
    regung: [] as (string | null)[],
    ausdruck: [] as (string | null)[],
  };
  const b: LebenBuehne = {
    mitte: () => ({ x: 100, y: 100 }),
    blinzeln: (z) => ruf.blinzeln.push(z),
    blick: (x, y) => ruf.blick.push([x, y]),
    atmen: (a) => ruf.atmen.push(a),
    sprech: (o) => ruf.sprech.push(o),
    regung: (n) => ruf.regung.push(n),
    ausdruck: (n) => ruf.ausdruck.push(n),
  };
  return { b, ruf };
}

function start(
  zustand: AvatarLebendigZustand,
  opt: Partial<{ folgtZeiger: boolean; still: boolean }> = {},
  uopt: Parameters<typeof umgebung>[0] = {},
) {
  const u = umgebung(uopt);
  const { b, ruf } = buehne();
  const leben = new Leben(u.umg, b);
  leben.konfiguriere({ zustand, folgtZeiger: false, still: false, ...opt });
  return { u, ruf, leben };
}

describe("Takt des lebendigen Avatars", () => {
  it("blinzelt unregelmäßig und atmet im Ruhezustand", () => {
    const { u, ruf } = start("ruhig");
    expect(ruf.atmen.at(-1)).toBe(true);
    u.weiter(60_000);
    const zu = ruf.blinzeln.filter(Boolean).length;
    expect(zu).toBeGreaterThanOrEqual(8);
    expect(zu).toBeLessThanOrEqual(40);
  });

  it("schaut im Ruhezustand ab und zu kurz zur Seite, aber nie nach oben wie beim Denken", () => {
    const { u, ruf } = start("ruhig");
    u.weiter(120_000);
    const seiten = ruf.blick.filter(([x]) => Math.abs(x) >= 1.1);
    expect(seiten.length).toBeGreaterThanOrEqual(5);
    expect(ruf.blick.every(([, y]) => y >= -0.5)).toBe(true);
  });

  it("lässt den Blick nur beim Denken oben wandern", () => {
    for (const z of AVATAR_LEBENDIG_ZUSTAENDE) {
      const { u, ruf } = start(z);
      u.weiter(60_000);
      const oben = ruf.blick.some(([, y]) => y <= -1.3);
      expect(oben, z).toBe(z === "denkt");
    }
  });

  it("bewegt den Mund nur im Zustand „schreibt“ und nur pro Text-Stück", () => {
    for (const z of AVATAR_LEBENDIG_ZUSTAENDE) {
      const { u, ruf, leben } = start(z);
      ruf.sprech.length = 0;
      leben.textStueck(12);
      leben.textStueck(3);
      u.weiter(1000);
      const bewegt = ruf.sprech.some((v) => v !== null);
      expect(bewegt, z).toBe(z === "schreibt");
    }
    const { u, ruf, leben } = start("schreibt");
    ruf.sprech.length = 0;
    u.weiter(5000);
    expect(ruf.sprech).toEqual([]); // ohne Text-Stück steht der Mund
    leben.textStueck(26);
    expect(ruf.sprech).toEqual([mundOeffnung(26)]);
    u.weiter(120);
    expect(ruf.sprech.at(-1)).toBeNull(); // schließt sich wieder
  });

  it("öffnet den Mund je nach Länge des Stücks weiter oder weniger weit", () => {
    expect(mundOeffnung(1)).toBeLessThan(mundOeffnung(8));
    expect(mundOeffnung(1000)).toBe(1.08);
  });

  it("ignoriert leere und ungültige Text-Stücke", () => {
    const { ruf, leben } = start("schreibt");
    ruf.sprech.length = 0;
    leben.textStueck(0);
    leben.textStueck(Number.NaN);
    leben.textStueck(-3);
    expect(ruf.sprech).toEqual([]);
  });

  it("startet bei weniger Bewegung keinen einzigen Zeitgeber und keinen Lauscher", () => {
    for (const z of AVATAR_LEBENDIG_ZUSTAENDE) {
      const { u, ruf, leben } = start(z, { folgtZeiger: true }, { bewegung: false });
      expect(u.offen(), z).toBe(0);
      expect(u.lauscher.zeiger, z).toBe(0);
      leben.ausdruck("nicken");
      leben.textStueck(10);
      u.weiter(60_000);
      expect(u.offen(), z).toBe(0);
      expect(ruf.blinzeln.filter(Boolean), z).toEqual([]);
      expect(
        ruf.atmen.every((a) => a === false),
        z,
      ).toBe(true);
      expect(
        ruf.regung.every((r) => r === null),
        z,
      ).toBe(true);
      expect(
        ruf.ausdruck.every((a) => a === null),
        z,
      ).toBe(true);
      expect(
        ruf.sprech.every((v) => v === null),
        z,
      ).toBe(true);
    }
  });

  it("bleibt mit `still` ebenso stehen", () => {
    const { u, ruf } = start("ruhig", { still: true });
    u.weiter(30_000);
    expect(u.offen()).toBe(0);
    expect(ruf.blinzeln.filter(Boolean)).toEqual([]);
  });

  it("rührt sich im Zustand „angehalten“ nicht", () => {
    const { u, ruf } = start("angehalten", { folgtZeiger: true });
    u.weiter(60_000);
    expect(u.offen()).toBe(0);
    expect(u.lauscher.zeiger).toBe(0);
    expect(ruf.blinzeln.filter(Boolean)).toEqual([]);
    expect(ruf.atmen.at(-1)).toBe(false);
  });

  it("hängt nur mit `folgtZeiger` einen Zeiger-Lauscher an, und nur mit Maus", () => {
    expect(start("ruhig").u.lauscher.zeiger).toBe(0);
    expect(start("ruhig", { folgtZeiger: true }).u.lauscher.zeiger).toBe(1);
    expect(start("ruhig", { folgtZeiger: true }, { zeiger: false }).u.lauscher.zeiger).toBe(0);
    // In Zuständen mit festem Blick folgt er dem Zeiger nicht.
    expect(start("schreibt", { folgtZeiger: true }).u.lauscher.zeiger).toBe(0);
  });

  it("folgt dem Zeiger in engem Rahmen und schaut geradeaus, wenn er das Fenster verlässt", () => {
    const { u, ruf } = start("ruhig", { folgtZeiger: true });
    u.zeiger({ x: 200, y: 100 });
    const [x, y] = ruf.blick.at(-1) ?? [0, 0];
    expect(x).toBeGreaterThan(0.4);
    expect(x).toBeLessThanOrEqual(1.5);
    expect(Math.abs(y)).toBeLessThan(0.01);
    u.zeiger(null);
    expect(ruf.blick.at(-1)).toEqual([0, 0]);
  });

  it("schaut beim Zuhören zur Schreibstelle, sonst nach links unten", () => {
    const u = umgebung();
    const { b, ruf } = buehne();
    const leben = new Leben(u.umg, b);
    leben.konfiguriere({
      zustand: "hoert_zu",
      folgtZeiger: false,
      still: false,
      blickBezug: () => ({ x: 300, y: 100 }),
    });
    const [x] = ruf.blick.at(-1) ?? [0];
    expect(x).toBeGreaterThan(0.5);
    leben.konfiguriere({ zustand: "hoert_zu", folgtZeiger: false, still: false });
    expect(ruf.blick.at(-1)).toEqual([-1.2, 1.3]);
  });

  it("pausiert im Hintergrund und läuft danach weiter", () => {
    const { u, ruf } = start("ruhig");
    expect(u.offen()).toBeGreaterThan(0);
    u.s.sichtbar = false;
    u.umgebungGeaendert();
    expect(u.offen()).toBe(0);
    expect(ruf.atmen.at(-1)).toBe(false);
    u.weiter(60_000);
    expect(u.offen()).toBe(0);
    u.s.sichtbar = true;
    u.umgebungGeaendert();
    expect(u.offen()).toBeGreaterThan(0);
    expect(ruf.atmen.at(-1)).toBe(true);
  });

  it("hält an, wenn „weniger Bewegung“ während des Betriebs eingeschaltet wird", () => {
    const { u } = start("ruhig", { folgtZeiger: true });
    expect(u.lauscher.zeiger).toBe(1);
    u.s.bewegung = false;
    u.umgebungGeaendert();
    expect(u.offen()).toBe(0);
    expect(u.lauscher.zeiger).toBe(u.lauscher.zeigerAbgemeldet);
  });

  it("räumt beim Beenden alle Zeitgeber und Lauscher auf", () => {
    const { u, leben } = start("schreibt");
    leben.textStueck(5);
    leben.ausdruck("nicken");
    expect(u.offen()).toBeGreaterThan(0);
    leben.stop();
    expect(u.offen()).toBe(0);
    expect(u.lauscher.umgebungAbgemeldet).toBe(1);
    const z = start("ruhig", { folgtZeiger: true });
    z.leben.stop();
    expect(z.u.lauscher.zeigerAbgemeldet).toBe(1);
    z.u.weiter(60_000);
    expect(z.u.offen()).toBe(0);
  });

  it("zeigt einen Ausdruck kurz, mit Bewegung, und nimmt ihn dann zurück", () => {
    const { u, ruf, leben } = start("ruhig");
    leben.ausdruck("nicken");
    expect(ruf.ausdruck.at(-1)).toBe("nicken");
    expect(ruf.regung.at(-1)).toBe("nicken");
    u.weiter(700);
    expect(ruf.ausdruck.at(-1)).toBeNull();
    u.weiter(1000);
    expect(ruf.regung.at(-1)).toBeNull();
  });

  it("blinzelt nicht, solange ein Ausdruck liegt", () => {
    const { u, ruf, leben } = start("ruhig");
    leben.ausdruck("staunen");
    ruf.blinzeln.length = 0;
    u.weiter(1400);
    expect(ruf.blinzeln.filter(Boolean)).toEqual([]);
  });

  it("macht beim Wechsel zu „fertig“ einen Freudensprung, beim ersten Zeichnen nicht", () => {
    const { ruf, leben } = start("fertig");
    expect(ruf.regung.filter(Boolean)).toEqual([]);
    leben.konfiguriere({ zustand: "ruhig", folgtZeiger: false, still: false });
    leben.konfiguriere({ zustand: "fertig", folgtZeiger: false, still: false });
    expect(ruf.regung.filter(Boolean)).toEqual(["hops"]);
  });

  it("läuft kein Zeitgeber ohne Auftrag weiter: Standbild-Zustände haben nur das Leben-Gerüst", () => {
    const { u } = start("wartet");
    // Blinzel-Schleife läuft; mehr nicht (kein Seitenblick, kein Denken, kein Zeiger).
    expect(u.offen()).toBeLessThanOrEqual(2);
  });

  it("richtet die Blickrichtung nach Abstand aus", () => {
    const m = { x: 0, y: 0 };
    expect(richtungZu(m, { x: 280, y: 0 }, 280).x).toBeCloseTo(1.5);
    expect(richtungZu(m, { x: 28, y: 0 }, 280).x).toBeCloseTo(0.15);
    expect(richtungZu(m, { x: 0, y: 0 }, 280)).toEqual({ x: 0, y: 0 });
  });
});
