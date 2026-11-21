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
 * Grenzen je Auftrag (Tiefe, Anzahl, Token, Zeit) als reine Funktion. Ein fehlender oder
 * unbrauchbarer Fakt gilt als verletzt, nie als „nicht geprüft“.
 */

export interface AuftragsGrenzen {
  /** Höchste erlaubte Tiefe; die Wurzel hat Tiefe 0. */
  readonly maxTiefe: number;
  /** Höchste Anzahl Aufträge im Baum, den neuen eingerechnet. */
  readonly maxAnzahl: number;
  /** Token-Budget des Baums: erreicht oder darüber ist verbraucht. */
  readonly maxTokens: number;
  /** Höchstalter des Baums (Alter der Wurzel) in Minuten: erreicht oder darüber ist abgelaufen. */
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

/** Was über den Auftragsbaum bekannt ist. Alles Pflicht; was fehlt, ist verletzt. */
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

export type GrenzName = "tiefe" | "anzahl" | "budget" | "zeit";

export interface Verletzung {
  readonly grenze: GrenzName;
  readonly grund: "ueberschritten" | "fakt_fehlt";
  readonly wert?: number;
  readonly limit: number;
}

export type GrenzErgebnis =
  | { readonly ok: true }
  | { readonly ok: false; readonly verletzt: readonly Verletzung[] };

function pruefeBereich(grenzen: AuftragsGrenzen): void {
  for (const schluessel of Object.keys(AUFTRAGS_GRENZEN_BEREICH) as (keyof AuftragsGrenzen)[]) {
    const wert = grenzen[schluessel];
    const bereich = AUFTRAGS_GRENZEN_BEREICH[schluessel];
    if (!Number.isInteger(wert) || wert < bereich.min || wert > bereich.max) {
      throw new RangeError(`Grenze ${schluessel} außerhalb des erlaubten Bereichs`);
    }
  }
}

function brauchbar(wert: number | undefined, ganzzahl: boolean): wert is number {
  if (typeof wert !== "number" || !Number.isFinite(wert) || wert < 0) return false;
  return ganzzahl ? Number.isInteger(wert) : true;
}

/**
 * Prüft alle vier Grenzen und meldet jede verletzte. `tiefe` und `anzahl` dürfen den Höchstwert
 * erreichen, `tokens` und das Alter nicht (dort heißt „erreicht“ schon „verbraucht“).
 */
export function pruefeAuftragGrenzen(
  fakten: AuftragsFakten,
  grenzen: AuftragsGrenzen = STANDARD_AUFTRAGS_GRENZEN,
): GrenzErgebnis {
  pruefeBereich(grenzen);
  const verletzt: Verletzung[] = [];
  const pruefe = (
    grenze: GrenzName,
    wert: number | undefined,
    limit: number,
    ganzzahl: boolean,
    zuViel: (w: number) => boolean,
  ) => {
    if (!brauchbar(wert, ganzzahl)) {
      verletzt.push({ grenze, grund: "fakt_fehlt", limit });
    } else if (zuViel(wert)) {
      verletzt.push({ grenze, grund: "ueberschritten", wert, limit });
    }
  };
  pruefe("tiefe", fakten.tiefe, grenzen.maxTiefe, true, (w) => w > grenzen.maxTiefe);
  pruefe("anzahl", fakten.anzahl, grenzen.maxAnzahl, true, (w) => w > grenzen.maxAnzahl);
  pruefe("budget", fakten.tokens, grenzen.maxTokens, false, (w) => w >= grenzen.maxTokens);
  pruefe(
    "zeit",
    fakten.alterSekunden,
    grenzen.maxMinuten * 60,
    false,
    (w) => w >= grenzen.maxMinuten * 60,
  );
  return verletzt.length === 0 ? { ok: true } : { ok: false, verletzt };
}
