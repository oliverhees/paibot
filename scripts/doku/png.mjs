/**
 * PaiBot – kleines PNG-Werkzeug für die Doku-Bilder: liest ein Bild, überdeckt Flächen mit der Farbe
 * ihrer Umgebung und schreibt es wieder, ohne weitere Pakete.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Für das Feld „verdecke“ in docs/screenshots.json: Stellen, die bei jedem Lauf anders aussehen
// (Uhrzeit der Datenbank, Kennungen, Prüfsummen), werden im fertigen Bild mit der häufigsten Farbe
// direkt um sie herum gefüllt. So passt die Fläche zu Hintergrund, Karte oder abgedunkelter Fläche
// hinter einem Dialog, und ein zweiter Lauf liefert dieselben Bytes. Die Seite selbst bleibt
// unberührt. Unterstützt werden PNGs mit 8 Bit je Kanal, RGB oder RGBA, ohne Zeilensprung (so
// schreibt sie Chromium).
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATUR = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABELLE = (() => {
  const tabelle = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabelle[n] = c >>> 0;
  }
  return tabelle;
})();

function crc32(daten) {
  let c = 0xffffffff;
  for (const byte of daten) c = CRC_TABELLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Liest ein PNG; liefert Breite, Höhe, Bytes je Pixel und die rohen Pixel (Zeile für Zeile). */
export function lesePng(puffer) {
  if (!puffer.subarray(0, 8).equals(SIGNATUR)) throw new Error("Kein PNG.");
  let breite;
  let hoehe;
  let bpp;
  const idat = [];
  for (let i = 8; i < puffer.length; ) {
    const laenge = puffer.readUInt32BE(i);
    const typ = puffer.toString("latin1", i + 4, i + 8);
    const inhalt = puffer.subarray(i + 8, i + 8 + laenge);
    if (typ === "IHDR") {
      breite = inhalt.readUInt32BE(0);
      hoehe = inhalt.readUInt32BE(4);
      const tiefe = inhalt[8];
      const farbe = inhalt[9];
      const zeilensprung = inhalt[12];
      if (tiefe !== 8 || (farbe !== 2 && farbe !== 6) || zeilensprung !== 0) {
        throw new Error("Nur PNG mit 8 Bit, RGB oder RGBA, ohne Zeilensprung.");
      }
      bpp = farbe === 6 ? 4 : 3;
    } else if (typ === "IDAT") idat.push(inhalt);
    else if (typ === "IEND") break;
    i += 12 + laenge;
  }
  if (breite === undefined) throw new Error("PNG ohne IHDR.");
  const roh = inflateSync(Buffer.concat(idat));
  const zeile = breite * bpp;
  const pixel = Buffer.alloc(zeile * hoehe);
  let vorige = Buffer.alloc(zeile);
  for (let y = 0; y < hoehe; y += 1) {
    const start = y * (zeile + 1);
    const filter = roh[start];
    const aktuell = pixel.subarray(y * zeile, (y + 1) * zeile);
    roh.copy(aktuell, 0, start + 1, start + 1 + zeile);
    for (let x = 0; x < zeile; x += 1) {
      const a = x >= bpp ? aktuell[x - bpp] : 0;
      const b = vorige[x];
      const c = x >= bpp ? vorige[x - bpp] : 0;
      let wert = 0;
      if (filter === 1) wert = a;
      else if (filter === 2) wert = b;
      else if (filter === 3) wert = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        wert = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`Unbekannter PNG-Filter ${filter}.`);
      aktuell[x] = (aktuell[x] + wert) & 0xff;
    }
    vorige = aktuell;
  }
  return { breite, hoehe, bpp, pixel };
}

function stueck(typ, inhalt) {
  const kopf = Buffer.alloc(8);
  kopf.writeUInt32BE(inhalt.length, 0);
  kopf.write(typ, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([kopf.subarray(4), inhalt])), 0);
  return Buffer.concat([kopf, inhalt, crc]);
}

/** Schreibt ein PNG (jede Zeile mit Filter 0, fest komprimiert: gleiche Pixel, gleiche Bytes). */
export function schreibePng({ breite, hoehe, bpp, pixel }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0);
  ihdr.writeUInt32BE(hoehe, 4);
  ihdr[8] = 8;
  ihdr[9] = bpp === 4 ? 6 : 2;
  const zeile = breite * bpp;
  const roh = Buffer.alloc((zeile + 1) * hoehe);
  for (let y = 0; y < hoehe; y += 1) {
    pixel.copy(roh, y * (zeile + 1) + 1, y * zeile, (y + 1) * zeile);
  }
  return Buffer.concat([
    SIGNATUR,
    stueck("IHDR", ihdr),
    stueck("IDAT", deflateSync(roh, { level: 9 })),
    stueck("IEND", Buffer.alloc(0)),
  ]);
}

/** Häufigste Farbe auf dem Rand direkt außerhalb der Fläche (2 Pixel Abstand). */
export function umgebungsFarbe(bild, flaeche) {
  const { breite, hoehe, bpp, pixel } = bild;
  const zaehler = new Map();
  const nimm = (x, y) => {
    if (x < 0 || y < 0 || x >= breite || y >= hoehe) return;
    const o = (y * breite + x) * bpp;
    const schluessel = pixel.subarray(o, o + bpp).toString("hex");
    zaehler.set(schluessel, (zaehler.get(schluessel) ?? 0) + 1);
  };
  const x0 = flaeche.x - 2;
  const y0 = flaeche.y - 2;
  const x1 = flaeche.x + flaeche.breite + 1;
  const y1 = flaeche.y + flaeche.hoehe + 1;
  for (let x = x0; x <= x1; x += 1) {
    nimm(x, y0);
    nimm(x, y1);
  }
  for (let y = y0 + 1; y < y1; y += 1) {
    nimm(x0, y);
    nimm(x1, y);
  }
  let beste;
  let anzahl = -1;
  for (const [schluessel, n] of zaehler) {
    if (n > anzahl || (n === anzahl && schluessel < beste)) {
      beste = schluessel;
      anzahl = n;
    }
  }
  return beste === undefined ? Buffer.alloc(bpp, 0) : Buffer.from(beste, "hex");
}

/**
 * Füllt jede Fläche ({ x, y, breite, hoehe } in Bildpixeln) mit der Farbe ihrer Umgebung. Alle
 * Farben werden vor dem Füllen bestimmt, damit sich nahe Flächen nicht gegenseitig beeinflussen.
 */
export function verdecke(bild, flaechen) {
  const ganz = flaechen
    .map((f) => {
      const x = Math.max(0, Math.floor(f.x));
      const y = Math.max(0, Math.floor(f.y));
      const x1 = Math.min(bild.breite, Math.ceil(f.x + f.breite));
      const y1 = Math.min(bild.hoehe, Math.ceil(f.y + f.hoehe));
      return { x, y, breite: x1 - x, hoehe: y1 - y };
    })
    .filter((f) => f.breite > 0 && f.hoehe > 0);
  const farben = ganz.map((f) => umgebungsFarbe(bild, f));
  ganz.forEach((f, i) => {
    for (let y = f.y; y < f.y + f.hoehe; y += 1) {
      for (let x = f.x; x < f.x + f.breite; x += 1) {
        farben[i].copy(bild.pixel, (y * bild.breite + x) * bild.bpp);
      }
    }
  });
  return bild;
}
