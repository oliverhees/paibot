/**
 * PaiBot – Daten des lebendigen Avatars: Gesicht je Form, Mimik je Zustand und je Ausdruck.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { AvatarShape } from "@paibot/shared/objekte";

/** Die Zustände, die der Avatar zeigen kann. Wer sie wählt, entscheidet der Aufrufer. */
export const AVATAR_LEBENDIG_ZUSTAENDE = [
  "ruhig",
  "hoert_zu",
  "denkt",
  "schreibt",
  "wartet",
  "fertig",
  "fehler",
  "angehalten",
] as const;
export type AvatarLebendigZustand = (typeof AVATAR_LEBENDIG_ZUSTAENDE)[number];

/** Einmalige Ausdrücke; sie legen sich kurz über den Zustand. */
export const AVATAR_AUSDRUECKE = [
  "nicken",
  "kopfschuetteln",
  "anpacken",
  "einverstanden",
  "zwinkern",
  "staunen",
] as const;
export type AvatarAusdruck = (typeof AVATAR_AUSDRUECKE)[number];

export type AugenArt = "punkt" | "bogen" | "pause";
export type MundArt = "laecheln" | "o" | "sprech" | "gerade" | "grinsen" | "zickzack" | "pause";
export type Eckzeichen = "" | "warn" | "fehler";
/** Körperbewegungen, die einmal ablaufen. */
export type Regung =
  | "hops"
  | "zucken"
  | "ring"
  | "nicken"
  | "staunen"
  | "zwinkern"
  | "schuetteln"
  | "anpacken"
  | "ducken";

/** Lage und Größe eines Auges: gleichmäßiger Maßstab `s`, oder `sx`/`sy` einzeln, dazu Versatz `y`. */
export interface AugenPose {
  s?: number;
  sx?: number;
  sy?: number;
  y?: number;
}

/** Braue: sichtbar (`o`), Versatz `y` und Drehung `r` in Grad. */
export interface Braue {
  o: 0 | 1;
  y?: number;
  r?: number;
}

export interface Blick {
  x: number;
  y: number;
}

/** Ein Gesicht, wie es eine Tabelle beschreibt; was fehlt, kommt aus den Grundwerten. */
export interface GesichtEintrag {
  aug?: AugenArt;
  augL?: AugenArt;
  augR?: AugenArt;
  al?: AugenPose;
  ar?: AugenPose;
  bl?: Braue;
  br?: Braue;
  glanz?: boolean;
  zu?: boolean;
  mund?: MundArt;
  /** Maßstab des runden Mundes „o“. */
  mundS?: number;
  /** Zusatz-Verschiebung des Mundes (CSS-Transform). */
  mundT?: string;
  /** Haltung des ganzen Körpers (CSS-Transform). */
  pose?: string;
  /** Blickrichtung in Raster-Einheiten, oder „eingabe“: zur Schreibstelle. */
  blick?: Blick | "eingabe";
  grau?: boolean;
  ring?: boolean;
  eck?: Eckzeichen;
  /** Sieht nach Arbeit aus (Denken, Schreiben, Anpacken). Nur Arbeits-Zustände dürfen das. */
  arbeit?: boolean;
}

/** Gesicht mit allen Werten. */
export interface Gesicht {
  augL: AugenArt;
  augR: AugenArt;
  al: Required<AugenPose>;
  ar: Required<AugenPose>;
  bl: Required<Braue>;
  br: Required<Braue>;
  glanz: boolean;
  zu: boolean;
  mund: MundArt;
  mundS: number;
  mundT: string;
  pose: string;
  blick: Blick | "eingabe";
  grau: boolean;
  ring: boolean;
  eck: Eckzeichen;
  arbeit: boolean;
}

/** Zustände, in denen der Avatar nach Arbeit aussehen darf. */
export const ARBEITS_ZUSTAENDE: readonly AvatarLebendigZustand[] = ["denkt", "schreibt"];

/** Mimik und Haltung je Zustand; auch als Standbild unterscheidbar. */
export const ZUSTAND_GESICHT: Record<AvatarLebendigZustand, GesichtEintrag> = {
  ruhig: {},
  hoert_zu: {
    al: { s: 1.16 },
    ar: { s: 1.16 },
    mund: "o",
    mundS: 0.8,
    pose: "rotate(-7deg) translate(-0.4px, 0.4px)",
    blick: "eingabe",
  },
  denkt: {
    al: { s: 0.7, y: -0.6 },
    ar: { s: 1.28, y: -1 },
    br: { o: 1, y: -1.3, r: -7 },
    mund: "gerade",
    mundT: "translate(1.7px, 0.3px) rotate(-10deg)",
    pose: "rotate(4deg) scale(0.98, 1.035)",
    blick: { x: 1.3, y: -1.35 },
    arbeit: true,
  },
  schreibt: {
    al: { sx: 1.2, sy: 0.62, y: 0.8 },
    ar: { sx: 1.2, sy: 0.62, y: 0.8 },
    mund: "sprech",
    pose: "rotate(-3deg) scale(1.035, 0.97) translate(0, 0.4px)",
    blick: { x: -0.5, y: 1.1 },
    arbeit: true,
  },
  wartet: {
    al: { s: 1.36 },
    ar: { s: 1.36 },
    glanz: true,
    bl: { o: 1, y: -1.5 },
    br: { o: 1, y: -1.5 },
    mund: "o",
    mundS: 1,
    pose: "translate(0, -1.4px) scale(0.97, 1.06)",
    ring: true,
    eck: "warn",
    blick: { x: 0, y: 0.3 },
  },
  fertig: {
    aug: "bogen",
    mund: "grinsen",
    pose: "scale(1.02, 0.99)",
  },
  fehler: {
    al: { s: 0.86, y: 0.8 },
    ar: { s: 0.86, y: 0.8 },
    bl: { o: 1, r: -17, y: 0.5 },
    br: { o: 1, r: 17, y: 0.5 },
    mund: "zickzack",
    pose: "rotate(3deg) scale(1.02, 0.95) translate(0, 0.8px)",
    eck: "fehler",
    blick: { x: -0.2, y: 0.7 },
  },
  angehalten: {
    aug: "pause",
    mund: "pause",
    grau: true,
    pose: "scale(1.05, 0.9) translate(0, 1.4px)",
    blick: { x: 0, y: 0 },
  },
};

export interface AusdruckEintrag {
  /** So lange liegt der Ausdruck über dem Zustand (ms). */
  dauer: number;
  /** Körperbewegung dazu (nur ohne „weniger Bewegung“). */
  regung: Regung;
  gesicht: GesichtEintrag;
}

/** Kleine Ausdrücke: einmalig, 0,6 bis 1,5 s, nie zufällig. */
export const AUSDRUCK_GESICHT: Record<AvatarAusdruck, AusdruckEintrag> = {
  nicken: { dauer: 560, regung: "nicken", gesicht: { aug: "bogen", mund: "laecheln" } },
  staunen: {
    dauer: 1500,
    regung: "staunen",
    gesicht: {
      al: { s: 1.5 },
      ar: { s: 1.5 },
      glanz: true,
      bl: { o: 1, y: -2.3 },
      br: { o: 1, y: -2.3 },
      mund: "o",
      mundS: 1.35,
    },
  },
  zwinkern: {
    dauer: 950,
    regung: "zwinkern",
    gesicht: { augR: "bogen", mund: "laecheln", mundT: "translate(0.9px, -0.2px) rotate(-7deg)" },
  },
  kopfschuetteln: {
    dauer: 950,
    regung: "schuetteln",
    gesicht: { bl: { o: 1, r: -14, y: 0.3 }, br: { o: 1, r: 14, y: 0.3 }, mund: "gerade" },
  },
  anpacken: {
    dauer: 850,
    regung: "anpacken",
    gesicht: {
      al: { sx: 1.12, sy: 0.78 },
      ar: { sx: 1.12, sy: 0.78 },
      bl: { o: 1, r: 7, y: 0.9 },
      br: { o: 1, r: -7, y: 0.9 },
      mund: "gerade",
      mundS: 1,
      arbeit: true,
    },
  },
  einverstanden: { dauer: 900, regung: "ducken", gesicht: { zu: true, mund: "laecheln" } },
};

/** Körperbewegung, die beim Wechsel in einen Zustand einmal abläuft, und wie lange sie dauert (ms). */
export const ZUSTAND_REGUNG: Partial<
  Record<AvatarLebendigZustand, { regung: Regung; dauer: number }>
> = {
  fertig: { regung: "hops", dauer: 1000 },
  fehler: { regung: "zucken", dauer: 600 },
  wartet: { regung: "ring", dauer: 3500 },
};

const KEINE_BRAUE: Required<Braue> = { o: 0, y: 0, r: 0 };

function auge(p: AugenPose | undefined): Required<AugenPose> {
  const s = p?.s ?? 1;
  return { s, sx: p?.sx ?? s, sy: p?.sy ?? s, y: p?.y ?? 0 };
}

function braue(b: Braue | undefined): Required<Braue> {
  return b ? { ...KEINE_BRAUE, ...b } : KEINE_BRAUE;
}

/**
 * Das Gesicht eines Zustands, mit einem Ausdruck darüber. Der Ausdruck ersetzt nur, was er nennt;
 * alles andere kommt aus dem Zustand.
 */
export function gesichtFuer(zustand: AvatarLebendigZustand, ausdruck?: AvatarAusdruck | null) {
  const z = ZUSTAND_GESICHT[zustand];
  const a = ausdruck ? AUSDRUCK_GESICHT[ausdruck].gesicht : {};
  const o = { ...z, ...a };
  const aug = o.aug ?? "punkt";
  const gesicht: Gesicht = {
    augL: o.augL ?? aug,
    augR: o.augR ?? aug,
    al: auge(o.al),
    ar: auge(o.ar),
    bl: braue(o.bl),
    br: braue(o.br),
    glanz: o.glanz ?? false,
    zu: o.zu ?? false,
    mund: o.mund ?? "laecheln",
    mundS: o.mundS ?? 1,
    mundT: o.mundT ?? "none",
    pose: o.pose ?? "none",
    blick: o.blick ?? { x: 0, y: 0 },
    grau: o.grau ?? false,
    ring: o.ring ?? false,
    eck: o.eck ?? "",
    arbeit: (z.arbeit ?? false) || (a.arbeit ?? false),
  };
  return gesicht;
}

/** Blick, wenn nichts Besseres bekannt ist: leicht nach links unten, zum Eingabefeld. */
export const STANDARD_EINGABE_BLICK: Blick = { x: -1.2, y: 1.3 };

/** Zustände, in denen der Avatar atmet. */
export const ATEM_ZUSTAENDE: readonly AvatarLebendigZustand[] = ["ruhig", "hoert_zu", "wartet"];

/** Zustände ohne festen Blick: dort darf der Avatar dem Zeiger folgen. */
export function blickFrei(zustand: AvatarLebendigZustand): boolean {
  return ZUSTAND_GESICHT[zustand].blick === undefined;
}

/** Größe, bis zu der die Mimik vereinfacht wird (Brauen und Glanz entfallen, Linien werden dicker). */
export const KLEIN_BIS = 28;

/**
 * Gesicht je Form: Lage und Größe von Augen, Mund und Brauen auf dem 40er-Raster.
 * Eine neue Form braucht nur einen Eintrag hier (und ihren Umriss in `avatar/formen.ts`).
 */
export interface FormGesicht {
  /** Augenmitten links und rechts, Höhe und Radius des Auges. */
  augen: { lx: number; rx: number; y: number; r: number };
  /** Mitte und Maßstab des Mundes (Grundmaß 1 = breites Lächeln wie beim Blatt). */
  mund: { x: number; y: number; s: number };
  /** Wangen-Punkte (nur Blüte): Mitten links/rechts, Höhe, Radius. */
  wangen?: { lx: number; rx: number; y: number; r: number };
}

export const FORM_GESICHT: Record<AvatarShape, FormGesicht> = {
  blatt: { augen: { lx: 15.6, rx: 24.4, y: 18.6, r: 2.4 }, mund: { x: 20, y: 26, s: 1 } },
  bogen: { augen: { lx: 15.4, rx: 24.6, y: 19.4, r: 2.3 }, mund: { x: 20, y: 27, s: 0.7 } },
  kiesel: { augen: { lx: 15.1, rx: 24.9, y: 19.4, r: 2.3 }, mund: { x: 20, y: 25.8, s: 0.95 } },
  raute: { augen: { lx: 15.6, rx: 24.4, y: 17.8, r: 2.2 }, mund: { x: 20, y: 25.4, s: 0.75 } },
  dee: { augen: { lx: 15.4, rx: 25, y: 18.3, r: 2.4 }, mund: { x: 20.4, y: 25.6, s: 0.95 } },
  wabe: { augen: { lx: 15.2, rx: 24.8, y: 18.2, r: 2.1 }, mund: { x: 20, y: 25.4, s: 0.75 } },
  bluete: {
    augen: { lx: 14.6, rx: 25.4, y: 18.8, r: 2 },
    mund: { x: 20, y: 25, s: 0.7 },
    wangen: { lx: 11.6, rx: 28.4, y: 22.8, r: 1.7 },
  },
};

/** Abstand der Brauen über der Augenmitte. */
export const BRAUEN_ABSTAND = 5.2;

/** Größter Blick-Ausschlag in Raster-Einheiten (Zeiger, Seitenblick, Schreibstelle). */
export const BLICK_MAX = { x: 2, y: 1.6 };
