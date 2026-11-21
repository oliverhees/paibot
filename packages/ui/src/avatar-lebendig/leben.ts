/**
 * PaiBot – Takt des lebendigen Avatars: Blinzeln, Blick, Atmen, einmalige Regungen und Mund-Takt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Reine Steuerung ohne DOM: Die Umgebung (Zeitgeber, Zeiger, Sichtbarkeit, „weniger Bewegung“)
// und die Bühne (was auf dem Bild passiert) werden hineingereicht. So lässt sich alles ohne
// Browser prüfen. Es gibt keine Dauerschleife über Einzelbilder: Es läuft nur, was ein Zeitgeber
// oder ein Ereignis auslöst, und im Ruhezustand ohne Bewegung läuft nichts.

import type { Zufall } from "../avatar/zufall";
import {
  ATEM_ZUSTAENDE,
  AUSDRUCK_GESICHT,
  type AvatarAusdruck,
  type AvatarLebendigZustand,
  type Blick,
  blickFrei,
  gesichtFuer,
  type Regung,
  STANDARD_EINGABE_BLICK,
  ZUSTAND_REGUNG,
} from "./daten";

type Zeitgeber = unknown;

export interface LebenUmgebung {
  zufall: Zufall;
  setzeZeit(fn: () => void, ms: number): Zeitgeber;
  loescheZeit(z: Zeitgeber): void;
  /** Millisekunden, nur zum Vergleichen. */
  jetzt(): number;
  /** Ist Bewegung erlaubt? Nein bei „weniger Bewegung“. */
  bewegungErlaubt(): boolean;
  /** Ist die Seite zu sehen? Im Hintergrund-Tab nein. */
  sichtbar(): boolean;
  /** Gibt es einen Zeiger (Maus), dem man folgen könnte? Am Handy nein. */
  hatZeiger(): boolean;
  /** Meldet die Zeigerposition (höchstens einmal je Bild), `null` wenn er das Fenster verlässt. */
  zeigerLauschen(melde: (p: { x: number; y: number } | null) => void): () => void;
  /** Meldet, wenn sich Sichtbarkeit oder „weniger Bewegung“ ändern. */
  umgebungLauschen(melde: () => void): () => void;
}

export interface LebenBuehne {
  /** Mitte des Avatars im Fenster, `null` solange er nicht im Bild steht. */
  mitte(): { x: number; y: number } | null;
  blinzeln(zu: boolean): void;
  blick(x: number, y: number): void;
  atmen(an: boolean): void;
  /** Mund beim Schreiben: Öffnung 0 bis etwa 1,1, `null` für die Ruhelage. */
  sprech(offen: number | null): void;
  regung(name: Regung | null): void;
  ausdruck(name: AvatarAusdruck | null): void;
}

export interface LebenEinstellung {
  zustand: AvatarLebendigZustand;
  folgtZeiger: boolean;
  /** Ohne jede Bewegung (z. B. in Listen). */
  still: boolean;
  /** Liefert die Schreibstelle im Fenster, zu der der Avatar beim Zuhören schaut. */
  blickBezug?: (() => { x: number; y: number } | null) | undefined;
}

const zwischen = (z: Zufall, von: number, bis: number) => von + z() * (bis - von);

/** Richtung von der Mitte zu einem Punkt, in Raster-Einheiten; je näher, desto kleiner der Ausschlag. */
export function richtungZu(
  mitte: { x: number; y: number },
  ziel: { x: number; y: number },
  weit: number,
): Blick {
  const dx = ziel.x - mitte.x;
  const dy = ziel.y - mitte.y;
  const d = Math.hypot(dx, dy) || 1;
  const m = Math.min(1, d / weit);
  return { x: (dx / d) * m * 1.5, y: (dy / d) * m * 1.35 };
}

/** Öffnung des Mundes für ein Text-Stück der Länge `n`. */
export function mundOeffnung(n: number): number {
  return Math.min(1.08, 0.48 + n / 26);
}

export class Leben {
  private readonly zeiten = new Set<Zeitgeber>();
  private einst: LebenEinstellung = { zustand: "ruhig", folgtZeiger: false, still: false };
  private bekannt = false;
  private ausdruckName: AvatarAusdruck | null = null;
  private seitenblick = false;
  private zeiger: { x: number; y: number } | null = null;
  private zeigerZeit = Number.NEGATIVE_INFINITY;
  private abmeldenZeiger: (() => void) | null = null;
  private readonly abmeldenUmgebung: () => void;
  private sprechZeit: Zeitgeber | null = null;
  private regungZeit: Zeitgeber | null = null;
  private ausdruckZeit: Zeitgeber | null = null;
  private beendet = false;

  constructor(
    private readonly umg: LebenUmgebung,
    private readonly buehne: LebenBuehne,
  ) {
    this.abmeldenUmgebung = umg.umgebungLauschen(() => this.neuStarten());
  }

  /** Anzahl offener Zeitgeber (für Tests und Aufräum-Prüfung). */
  get offeneZeitgeber(): number {
    return this.zeiten.size;
  }

  /** Läuft ein Zeiger-Lauscher? */
  get lauschtAufZeiger(): boolean {
    return this.abmeldenZeiger !== null;
  }

  /** Darf sich überhaupt etwas bewegen? */
  private get bewegt(): boolean {
    return !this.beendet && !this.einst.still && this.umg.bewegungErlaubt();
  }

  /** Läuft das ruhige Leben? Nein bei „angehalten“, im Hintergrund und ohne Bewegung. */
  private get lebt(): boolean {
    return this.bewegt && this.umg.sichtbar() && this.einst.zustand !== "angehalten";
  }

  konfiguriere(neu: LebenEinstellung): void {
    const alt = this.einst;
    const wechsel = this.bekannt && alt.zustand !== neu.zustand;
    this.einst = neu;
    this.bekannt = true;
    if (wechsel) {
      // Ein Ausdruck gehört zum alten Zustand.
      this.ausdruckBeenden();
      this.sprechBeenden();
    }
    this.neuStarten();
    if (wechsel && this.bewegt && this.umg.sichtbar()) {
      const r = ZUSTAND_REGUNG[neu.zustand];
      if (r) this.regungStarten(r.regung, r.dauer);
    }
  }

  /** Richtet den Blick neu aus, z. B. wenn die Schreibstelle gewandert ist. */
  blickNeu(): void {
    if (this.beendet) return;
    if (!this.lebt) this.buehne.blick(...this.standBlick());
    else if (!this.seitenblick) this.richteBlick();
  }

  /** Einmaliger Ausdruck. Ohne Bewegung oder im Hintergrund geschieht nichts. */
  ausdruck(name: AvatarAusdruck): void {
    if (!this.bewegt || !this.umg.sichtbar()) return;
    const eintrag = AUSDRUCK_GESICHT[name];
    this.ausdruckBeenden();
    this.ausdruckName = name;
    this.buehne.ausdruck(name);
    this.regungStarten(eintrag.regung, eintrag.dauer + 300);
    this.ausdruckZeit = this.zeit(() => {
      this.ausdruckZeit = null;
      this.ausdruckName = null;
      this.buehne.ausdruck(null);
    }, eintrag.dauer);
  }

  /** Ein Text-Stück der Länge `laenge` ist angekommen: Der Mund öffnet sich kurz, aber nur beim Schreiben. */
  textStueck(laenge: number): void {
    if (this.einst.zustand !== "schreibt" || !this.bewegt || !this.umg.sichtbar()) return;
    if (!Number.isFinite(laenge) || laenge <= 0) return;
    this.buehne.sprech(mundOeffnung(laenge));
    if (this.sprechZeit !== null) this.loesche(this.sprechZeit);
    this.sprechZeit = this.zeit(() => {
      this.sprechZeit = null;
      this.buehne.sprech(null);
    }, 105);
  }

  /** Alles beenden: Zeitgeber löschen, Lauscher abmelden. */
  stop(): void {
    this.beendet = true;
    this.alleLoeschen();
    this.zeigerAbmelden();
    this.abmeldenUmgebung();
  }

  // ---------- Innenleben ----------

  private zeit(fn: () => void, ms: number): Zeitgeber {
    const z = this.umg.setzeZeit(() => {
      this.zeiten.delete(z);
      if (!this.beendet) fn();
    }, ms);
    this.zeiten.add(z);
    return z;
  }

  private loesche(z: Zeitgeber): void {
    this.umg.loescheZeit(z);
    this.zeiten.delete(z);
  }

  private alleLoeschen(): void {
    for (const z of this.zeiten) this.umg.loescheZeit(z);
    this.zeiten.clear();
    this.sprechZeit = null;
    this.regungZeit = null;
    this.ausdruckZeit = null;
  }

  private ausdruckBeenden(): void {
    if (this.ausdruckZeit !== null) this.loesche(this.ausdruckZeit);
    this.ausdruckZeit = null;
    if (this.ausdruckName !== null) {
      this.ausdruckName = null;
      this.buehne.ausdruck(null);
    }
    this.regungBeenden();
  }

  private sprechBeenden(): void {
    if (this.sprechZeit !== null) this.loesche(this.sprechZeit);
    this.sprechZeit = null;
    this.buehne.sprech(null);
  }

  private regungStarten(name: Regung, dauer: number): void {
    this.regungBeenden();
    this.buehne.regung(name);
    this.regungZeit = this.zeit(() => {
      this.regungZeit = null;
      this.buehne.regung(null);
    }, dauer);
  }

  private regungBeenden(): void {
    if (this.regungZeit !== null) this.loesche(this.regungZeit);
    this.regungZeit = null;
    this.buehne.regung(null);
  }

  private zeigerAbmelden(): void {
    this.abmeldenZeiger?.();
    this.abmeldenZeiger = null;
    this.zeiger = null;
  }

  private folgtZeigerJetzt(): boolean {
    return (
      this.einst.folgtZeiger && blickFrei(this.einst.zustand) && this.umg.hatZeiger() && this.lebt
    );
  }

  /** Blick im Standbild: der feste Blick des Zustands. */
  private standBlick(): [number, number] {
    const b = gesichtFuer(this.einst.zustand).blick;
    if (b === "eingabe") return [STANDARD_EINGABE_BLICK.x, STANDARD_EINGABE_BLICK.y];
    return [b.x, b.y];
  }

  private richteBlick(): void {
    const b = gesichtFuer(this.einst.zustand).blick;
    const mitte = this.buehne.mitte();
    if (b === "eingabe") {
      const ziel = this.einst.blickBezug?.() ?? null;
      if (mitte && ziel) {
        const r = richtungZu(mitte, ziel, 160);
        this.buehne.blick(r.x, r.y);
      } else {
        this.buehne.blick(STANDARD_EINGABE_BLICK.x, STANDARD_EINGABE_BLICK.y);
      }
      return;
    }
    if (blickFrei(this.einst.zustand) && this.zeiger && mitte && this.folgtZeigerJetzt()) {
      const r = richtungZu(mitte, this.zeiger, 280);
      this.buehne.blick(r.x, r.y);
      return;
    }
    this.buehne.blick(b.x, b.y);
  }

  /** Alles nach einer Änderung der Einstellung oder der Umgebung neu aufsetzen. */
  private neuStarten(): void {
    if (this.beendet) return;
    // Laufende Schleifen (Blinzeln, Blick) stoppen; einmalige Dinge (Ausdruck, Regung) laufen aus.
    for (const z of [...this.zeiten]) {
      if (z !== this.ausdruckZeit && z !== this.regungZeit && z !== this.sprechZeit)
        this.loesche(z);
    }
    this.seitenblick = false;
    this.buehne.blinzeln(false);

    if (!this.bewegt || !this.umg.sichtbar()) {
      // Standbild (oder pausiert im Hintergrund): nichts läuft, alles in Ruhelage.
      this.ausdruckBeenden();
      this.sprechBeenden();
      this.buehne.atmen(false);
      this.zeigerAbmelden();
      this.buehne.blick(...this.standBlick());
      return;
    }
    if (this.einst.zustand === "angehalten") {
      this.buehne.atmen(false);
      this.zeigerAbmelden();
      this.buehne.blick(...this.standBlick());
      return;
    }

    this.buehne.atmen(ATEM_ZUSTAENDE.includes(this.einst.zustand));
    this.zeigerAnmelden();
    this.richteBlick();
    this.blinzelSchleife();
    if (this.einst.zustand === "ruhig") this.seitenblickSchleife();
    if (this.einst.zustand === "denkt") this.denkSchleife();
  }

  private zeigerAnmelden(): void {
    const soll = this.folgtZeigerJetzt();
    if (!soll) {
      if (this.abmeldenZeiger) this.zeigerAbmelden();
      return;
    }
    if (this.abmeldenZeiger) return;
    this.abmeldenZeiger = this.umg.zeigerLauschen((p) => {
      this.zeiger = p;
      if (p) this.zeigerZeit = this.umg.jetzt();
      if (!this.seitenblick) this.richteBlick();
    });
  }

  private blinzelSchleife(): void {
    const z = this.umg.zufall;
    const warte =
      this.einst.zustand === "denkt" ? zwischen(z, 3500, 7000) : zwischen(z, 2200, 6500);
    this.zeit(() => {
      if (this.ausdruckName === null) this.blinzeln();
      if (z() < 0.18) {
        this.zeit(() => {
          if (this.ausdruckName === null) this.blinzeln();
        }, 230);
      }
      this.blinzelSchleife();
    }, warte);
  }

  private blinzeln(): void {
    this.buehne.blinzeln(true);
    this.zeit(() => this.buehne.blinzeln(false), 95);
  }

  /** Gelegentlich kurz zur Seite schauen, aber nur, wenn der Zeiger gerade ruht. */
  private seitenblickSchleife(): void {
    const z = this.umg.zufall;
    this.zeit(
      () => {
        const zeigerRuht = !this.folgtZeigerJetzt() || this.umg.jetzt() - this.zeigerZeit > 3000;
        if (this.ausdruckName === null && zeigerRuht) {
          this.seitenblick = true;
          const s = z() < 0.5 ? -1 : 1;
          this.buehne.blick(s * zwischen(z, 1.1, 1.6), zwischen(z, -0.5, 0.5));
          this.zeit(
            () => {
              this.seitenblick = false;
              this.richteBlick();
            },
            zwischen(z, 900, 1600),
          );
        }
        this.seitenblickSchleife();
      },
      zwischen(z, 5000, 11000),
    );
  }

  /** Beim Denken wandert der Blick langsam oben herum, nur bis der erste Text kommt. */
  private denkSchleife(): void {
    const z = this.umg.zufall;
    let seite = 0;
    const schritt = () => {
      this.zeit(
        () => {
          seite ^= 1;
          this.buehne.blick(seite ? 0.5 : 1.3, seite ? -1.55 : -1.3);
          schritt();
        },
        zwischen(z, 1000, 1500),
      );
    };
    schritt();
  }
}
