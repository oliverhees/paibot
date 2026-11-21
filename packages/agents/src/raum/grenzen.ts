/**
 * PaiBot – Grenzen je Auftrag im Teamchat
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/**
 * Messwerte zu den Grenzen je Auftrag (Tiefe, Anzahl, Token, Zeit). Die Funktion liefert nur
 * Fakten: Wert, Grenze, „fehlt“ und „überschreitet“. Sie entscheidet nichts und wirft nicht;
 * ob etwas abgelehnt wird (und dass ein fehlender Fakt als verletzt gilt), entscheidet allein das
 * Tor, damit es keinen zweiten Weg ohne Beleg gibt.
 */

export interface AuftragsGrenzen {
  /** Höchste erlaubte Tiefe; die Wurzel hat Tiefe 0. */
  readonly maxTiefe: number;
  /** Höchste Anzahl Aufträge im Baum, den neuen eingerechnet. */
  readonly maxAnzahl: number;
  /** Token-Budget des Baums. */
  readonly maxTokens: number;
  /** Höchstalter des Baums (Alter der Wurzel) in Minuten. */
  readonly maxMinuten: number;
}

export const STANDARD_AUFTRAGS_GRENZEN: AuftragsGrenzen = {
  maxTiefe: 3,
  maxAnzahl: 20,
  maxTokens: 200_000,
  maxMinuten: 30,
};

export const AUFTRAGS_GRENZEN_BEREICH = {
  maxTiefe: { min: 1, max: 8 },
  maxAnzahl: { min: 1, max: 100 },
  maxTokens: { min: 1_000, max: 2_000_000 },
  maxMinuten: { min: 1, max: 240 },
} as const;

/** Was über den Auftragsbaum bekannt ist; jeder Wert kann fehlen. */
export interface AuftragsFakten {
  /** Tiefe des Auftrags, der gestartet werden soll (Wurzel = 0). */
  readonly tiefe?: number | undefined;
  /** Aufträge im Baum, der neue eingerechnet. */
  readonly anzahl?: number | undefined;
  /** Token aller bisherigen Läufe im Baum. */
  readonly tokens?: number | undefined;
  /** Alter der Wurzel in Sekunden. */
  readonly alterSekunden?: number | undefined;
}

/** Messwert zu einer Grenze. */
export interface Messwert {
  /** Der gemessene Wert; `null`, wenn er fehlt oder unbrauchbar ist (keine Zahl, negativ, unendlich). */
  readonly wert: number | null;
  /** Die Grenze (Zeit in Sekunden). */
  readonly grenze: number;
  /** Der Fakt fehlt oder ist unbrauchbar. */
  readonly fehlt: boolean;
  /** Der Wert liegt über der Grenze (Tiefe, Anzahl) bzw. hat sie erreicht (Token, Zeit). `false`, wenn der Fakt fehlt. */
  readonly ueberschreitet: boolean;
}

export interface GrenzMessung {
  /** Alle vier Grenzen liegen im erlaubten Bereich und sind ganze Zahlen. */
  readonly grenzenGueltig: boolean;
  readonly tiefe: Messwert;
  readonly anzahl: Messwert;
  readonly budget: Messwert;
  readonly zeit: Messwert;
}

function grenzenImBereich(grenzen: AuftragsGrenzen): boolean {
  return (Object.keys(AUFTRAGS_GRENZEN_BEREICH) as (keyof AuftragsGrenzen)[]).every((k) => {
    const wert = grenzen[k];
    const bereich = AUFTRAGS_GRENZEN_BEREICH[k];
    return Number.isInteger(wert) && wert >= bereich.min && wert <= bereich.max;
  });
}

function messe(
  roh: number | undefined,
  grenze: number,
  ganzzahl: boolean,
  erreicht: (wert: number, grenze: number) => boolean,
): Messwert {
  const brauchbar =
    typeof roh === "number" &&
    Number.isFinite(roh) &&
    roh >= 0 &&
    (!ganzzahl || Number.isInteger(roh));
  if (!brauchbar) return { wert: null, grenze, fehlt: true, ueberschreitet: false };
  return { wert: roh, grenze, fehlt: false, ueberschreitet: erreicht(roh, grenze) };
}

/**
 * Misst die Fakten gegen die Grenzen. `tiefe` und `anzahl` dürfen die Grenze erreichen, `tokens`
 * und das Alter nicht (dort heißt „erreicht“ schon „verbraucht“). Wirft nie: Grenzen außerhalb des
 * Bereichs zeigt `grenzenGueltig = false` an.
 */
export function messeAuftragsGrenzen(
  fakten: AuftragsFakten,
  grenzen: AuftragsGrenzen = STANDARD_AUFTRAGS_GRENZEN,
): GrenzMessung {
  return {
    grenzenGueltig: grenzenImBereich(grenzen),
    tiefe: messe(fakten.tiefe, grenzen.maxTiefe, true, (w, g) => w > g),
    anzahl: messe(fakten.anzahl, grenzen.maxAnzahl, true, (w, g) => w > g),
    budget: messe(fakten.tokens, grenzen.maxTokens, false, (w, g) => w >= g),
    zeit: messe(fakten.alterSekunden, grenzen.maxMinuten * 60, false, (w, g) => w >= g),
  };
}
