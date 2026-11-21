/**
 * PaiBot – Tests der installierbaren Web-App: Manifest, Symbole, Metadaten, kein Offline-Modus.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { istDatei } from "../lib/zugang/weiterleitung";
import manifest from "./manifest";

const APP = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(APP, "../..");
const PUBLIC = path.join(WEB, "public");
const layout = readFileSync(path.join(APP, "layout.tsx"), "utf8");
const tokens = readFileSync(path.resolve(WEB, "../../packages/ui/src/tokens.css"), "utf8");

// ---------------------------------------------------------------- PNG lesen (ohne Abhängigkeit)

interface Bild {
  breite: number;
  hoehe: number;
  /** Farbtyp nach PNG: 2 = RGB, 6 = RGBA. */
  farbtyp: number;
  /** RGBA-Pixel, Zeile für Zeile. */
  pixel: Uint8Array;
}

/** Liest ein 8-Bit-PNG (RGB oder RGBA, ohne Zeilensprung). */
function lesePng(datei: string): Bild {
  const daten = readFileSync(datei);
  expect(daten.subarray(0, 8).toString("hex"), `${datei}: keine PNG-Datei`).toBe(
    "89504e470d0a1a0a",
  );
  let pos = 8;
  let kopf: Buffer | undefined;
  const idat: Buffer[] = [];
  while (pos < daten.length) {
    const laenge = daten.readUInt32BE(pos);
    const typ = daten.toString("latin1", pos + 4, pos + 8);
    const inhalt = daten.subarray(pos + 8, pos + 8 + laenge);
    if (typ === "IHDR") kopf = inhalt;
    if (typ === "IDAT") idat.push(inhalt);
    pos += 12 + laenge;
  }
  if (!kopf) throw new Error(`${datei}: IHDR fehlt`);
  const breite = kopf.readUInt32BE(0);
  const hoehe = kopf.readUInt32BE(4);
  const tiefe = kopf[8];
  const farbtyp = kopf[9] as number;
  const zeilensprung = kopf[12];
  if (tiefe !== 8 || (farbtyp !== 2 && farbtyp !== 6) || zeilensprung !== 0) {
    throw new Error(
      `${datei}: nur 8-Bit RGB/RGBA ohne Zeilensprung (tiefe ${tiefe}, typ ${farbtyp})`,
    );
  }
  const bpp = farbtyp === 6 ? 4 : 3;
  const roh = inflateSync(Buffer.concat(idat));
  const zeile = breite * bpp;
  const aus = new Uint8Array(breite * hoehe * bpp);
  for (let y = 0; y < hoehe; y++) {
    const filter = roh[y * (zeile + 1)];
    for (let x = 0; x < zeile; x++) {
      const r = roh[y * (zeile + 1) + 1 + x] as number;
      const a = x >= bpp ? (aus[y * zeile + x - bpp] as number) : 0;
      const b = y > 0 ? (aus[(y - 1) * zeile + x] as number) : 0;
      const c = x >= bpp && y > 0 ? (aus[(y - 1) * zeile + x - bpp] as number) : 0;
      let wert: number;
      switch (filter) {
        case 0:
          wert = r;
          break;
        case 1:
          wert = r + a;
          break;
        case 2:
          wert = r + b;
          break;
        case 3:
          wert = r + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          wert = r + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`${datei}: unbekannter Filter ${filter}`);
      }
      aus[y * zeile + x] = wert & 0xff;
    }
  }
  const pixel = new Uint8Array(breite * hoehe * 4);
  for (let i = 0; i < breite * hoehe; i++) {
    pixel[i * 4] = aus[i * bpp] as number;
    pixel[i * 4 + 1] = aus[i * bpp + 1] as number;
    pixel[i * 4 + 2] = aus[i * bpp + 2] as number;
    pixel[i * 4 + 3] = bpp === 4 ? (aus[i * bpp + 3] as number) : 255;
  }
  return { breite, hoehe, farbtyp, pixel };
}

function pixel(bild: Bild, x: number, y: number): [number, number, number, number] {
  const i = (y * bild.breite + x) * 4;
  return [...bild.pixel.subarray(i, i + 4)] as [number, number, number, number];
}

const hexZuRgb = (hex: string) =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Wert eines Tokens im dunklen (`:root {`) oder hellen Block. */
function token(kopf: string, name: string): string {
  const start = tokens.indexOf(kopf);
  const ende = tokens.indexOf("}", start);
  const m = tokens.slice(start, ende).match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`${name} fehlt in ${kopf}`);
  return (m[1] as string).trim();
}

const datei = (src: string) => path.join(PUBLIC, src.replace(/^\//, ""));

// ---------------------------------------------------------------- Tests

describe("Manifest der Web-App", () => {
  const m = manifest();

  it("hat die Pflichtfelder für das Installieren-Angebot in Chromium", () => {
    expect(m.name).toBe("PaiBot");
    expect(m.short_name).toBe("PaiBot");
    expect((m.short_name ?? "").length).toBeLessThanOrEqual(12);
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.id).toBe("/");
    expect(["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"]).toContain(
      m.display,
    );
    expect(m.lang).toBe("de");
    // start_url liegt im Geltungsbereich
    expect((m.start_url ?? "").startsWith(m.scope ?? "")).toBe(true);
    // keine Felder, die Hintergrunddienste einschalten würden
    expect(Object.keys(m)).not.toContain("serviceworker");
    expect(Object.keys(m)).not.toContain("gcm_sender_id");
  });

  it("Farben folgen dem dunklen Design (--bg)", () => {
    const bg = token(":root {", "--bg");
    expect(m.background_color).toBe(bg);
    expect(m.theme_color).toBe(bg);
  });

  it("hat Symbole 192 und 512, je für „any“ und „maskable“, als PNG", () => {
    const icons = m.icons ?? [];
    for (const zweck of ["any", "maskable"]) {
      for (const groesse of ["192x192", "512x512"]) {
        const passend = icons.filter((i) => i.purpose === zweck && i.sizes === groesse);
        expect(passend.length, `${zweck} ${groesse}`).toBe(1);
        expect(passend[0]?.type).toBe("image/png");
      }
    }
  });

  it("jede Symbol-Datei existiert, ist ein PNG und hat genau die angegebene Größe", () => {
    for (const icon of m.icons ?? []) {
      const pfad = datei(icon.src);
      expect(existsSync(pfad), icon.src).toBe(true);
      const bild = lesePng(pfad);
      expect(`${bild.breite}x${bild.hoehe}`, icon.src).toBe(icon.sizes);
    }
  });

  it("maskierbare Symbole: deckend bis zum Rand, Zeichen nur in der sicheren Zone (Kreis 80 %)", () => {
    const bg = hexZuRgb(token(":root {", "--bg"));
    for (const icon of (m.icons ?? []).filter((i) => i.purpose === "maskable")) {
      const bild = lesePng(datei(icon.src));
      const mitte = bild.breite / 2;
      const radius = bild.breite * 0.4;
      let ausserhalb = 0;
      let zeichen = 0;
      for (let y = 0; y < bild.hoehe; y++) {
        for (let x = 0; x < bild.breite; x++) {
          const [r, g, b, a] = pixel(bild, x, y);
          expect(a, `${icon.src} durchsichtig bei ${x},${y}`).toBe(255);
          const abweichung = Math.max(
            Math.abs(r - bg[0]),
            Math.abs(g - bg[1]),
            Math.abs(b - bg[2]),
          );
          const imKreis = Math.hypot(x + 0.5 - mitte, y + 0.5 - mitte) <= radius;
          if (abweichung > 8) {
            zeichen++;
            if (!imKreis) ausserhalb++;
          }
        }
      }
      expect(ausserhalb, `${icon.src}: Pixel des Zeichens außerhalb der sicheren Zone`).toBe(0);
      expect(zeichen, `${icon.src}: kein Zeichen zu sehen`).toBeGreaterThan(bild.breite);
    }
  });

  it("Symbole für „any“ zeigen ein Zeichen (nicht leer, nicht einfarbig)", () => {
    for (const icon of (m.icons ?? []).filter((i) => i.purpose === "any")) {
      const bild = lesePng(datei(icon.src));
      let sichtbar = 0;
      for (let i = 3; i < bild.pixel.length; i += 4) if ((bild.pixel[i] as number) > 0) sichtbar++;
      const anteil = sichtbar / (bild.breite * bild.hoehe);
      expect(anteil, icon.src).toBeGreaterThan(0.2);
      expect(anteil, icon.src).toBeLessThan(1);
    }
  });

  it("Manifest und Symbole sind ohne Anmeldung erreichbar", () => {
    expect(istDatei("/manifest.webmanifest")).toBe(true);
    for (const icon of m.icons ?? []) expect(istDatei(icon.src), icon.src).toBe(true);
    expect(istDatei("/icons/apple-touch-icon.png")).toBe(true);
  });
});

describe("Metadaten im Layout", () => {
  it("Apple-Touch-Icon 180×180, deckend (iOS füllt Durchsichtiges schwarz)", () => {
    expect(layout).toContain(
      'apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]',
    );
    const bild = lesePng(datei("/icons/apple-touch-icon.png"));
    expect([bild.breite, bild.hoehe]).toEqual([180, 180]);
    for (let i = 3; i < bild.pixel.length; i += 4) expect(bild.pixel[i]).toBe(255);
  });

  it("iOS-Angaben: als Web-App startbar, mit Titel", () => {
    expect(layout).toMatch(/appleWebApp:\s*\{\s*capable:\s*true,\s*title:\s*APP_NAME/);
  });

  it("Symbole im Browser-Tab existieren", () => {
    for (const m of layout.matchAll(/url: "(\/icons\/[^"]+)"/g)) {
      expect(existsSync(datei(m[1] as string)), m[1]).toBe(true);
    }
    expect(lesePng(datei("/icons/favicon-32.png")).breite).toBe(32);
  });

  it("Farbe der Browser-Leiste folgt hellem und dunklem Design (--bg)", () => {
    const hell = token(':root[data-theme="light"]', "--bg");
    const dunkel = token(":root {", "--bg");
    expect(layout).toContain(`{ media: "(prefers-color-scheme: light)", color: "${hell}" }`);
    expect(layout).toContain(`{ media: "(prefers-color-scheme: dark)", color: "${dunkel}" }`);
  });
});

describe("Bewusst ohne Offline-Modus, Hintergrund-Cache und Push", () => {
  function quelltexte(ordner: string): string[] {
    return readdirSync(ordner, { recursive: true, encoding: "utf8" })
      .filter((d) => /\.(ts|tsx|js|mjs)$/.test(d) && !/\.test\.(ts|tsx)$/.test(d))
      .map((d) => path.join(ordner, d));
  }

  it("registriert keinen Service Worker und fragt nicht nach Mitteilungen", () => {
    const treffer: string[] = [];
    for (const q of quelltexte(path.join(WEB, "src"))) {
      const text = readFileSync(q, "utf8");
      if (/serviceWorker|PushManager|Notification\.requestPermission|caches\.open/.test(text)) {
        treffer.push(path.relative(WEB, q));
      }
    }
    expect(treffer).toEqual([]);
  });

  it("liefert keine Service-Worker-Datei aus und hat kein PWA-Plugin", () => {
    const dateien = readdirSync(PUBLIC, { recursive: true, encoding: "utf8" });
    expect(dateien.filter((d) => /(^|\/)(sw|service-worker|workbox)[^/]*\.js$/.test(d))).toEqual(
      [],
    );
    const paket = readFileSync(path.join(WEB, "package.json"), "utf8");
    expect(paket).not.toMatch(/next-pwa|workbox|serwist/);
    const config = readFileSync(path.join(WEB, "next.config.ts"), "utf8");
    expect(config).not.toMatch(/withPWA|serwist|workbox/i);
  });
});
