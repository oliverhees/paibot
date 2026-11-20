/**
 * PaiBot – Ablauf von Blinzeln, Blick und Laune der Avatare.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/** Zufallsquelle zwischen 0 (einschließlich) und 1 (ausschließlich); in Tests austauschbar. */
export type Zufall = () => number;

const zwischen = (zufall: Zufall, von: number, bis: number) => von + zufall() * (bis - von);

export interface Blinzeln {
  /** Dauer des Lidschlags in ms. */
  dauer: number;
  /** Zweiter Lidschlag: Abstand zum ersten und Dauer, falls es einen gibt. */
  zweites?: { nach: number; dauer: number };
  /** Wartezeit bis zum nächsten Blinzeln in ms. */
  naechstesNach: number;
}

export function planeBlinzeln(zufall: Zufall): Blinzeln {
  const doppelt = zufall() < 0.25;
  return {
    dauer: 130,
    ...(doppelt ? { zweites: { nach: 260, dauer: 120 } } : {}),
    naechstesNach: zwischen(zufall, 1600, 6000),
  };
}

export interface Blick {
  x: number;
  y: number;
  naechsterNach: number;
}

export function planeBlick(zufall: Zufall): Blick {
  const x = zufall() < 0.3 ? 0 : zwischen(zufall, -1.9, 1.9);
  const y = zufall() < 0.45 ? 0 : zwischen(zufall, -1.3, 1.1);
  return { x, y, naechsterNach: zwischen(zufall, 1100, 4000) };
}

export type LaunenArt = "staunen" | "huepfen" | "wackeln" | "reden";

export interface Laune {
  art: LaunenArt;
  dauer: number;
  naechsteNach: number;
}

export function planeLaune(zufall: Zufall): Laune {
  const wahl = zufall();
  let art: LaunenArt;
  let dauer: number;
  if (wahl < 0.34) {
    art = "staunen";
    dauer = zwischen(zufall, 500, 1200);
  } else if (wahl < 0.6) {
    art = "huepfen";
    dauer = 620;
  } else if (wahl < 0.82) {
    art = "wackeln";
    dauer = 700;
  } else {
    art = "reden";
    dauer = zwischen(zufall, 700, 1500);
  }
  return { art, dauer, naechsteNach: zwischen(zufall, 2600, 8000) };
}

/**
 * Blickrichtung zum Zeiger: Verschiebung der Augen in Raster-Einheiten.
 * Liegt der Zeiger außerhalb von `max(70, Breite × 1.4)`, schauen die Augen geradeaus.
 */
export function blickZumZeiger(
  mitte: { x: number; y: number },
  zeiger: { x: number; y: number },
  breite: number,
): { x: number; y: number } | null {
  const dx = zeiger.x - mitte.x;
  const dy = zeiger.y - mitte.y;
  const abstand = Math.hypot(dx, dy);
  if (abstand > Math.max(70, breite * 1.4) || abstand === 0) return null;
  return { x: (dx / abstand) * 2, y: (dy / abstand) * 1.5 };
}
