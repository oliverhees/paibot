/**
 * PaiBot – Antwort der Suche in Unterhaltungen, wie sie zur Oberfläche geht. Nur Typen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/** Text um eine Fundstelle in drei Teilen; `treffer` ist leer, wenn nichts zu markieren ist. */
export interface SuchAusschnitt {
  vor: string;
  treffer: string;
  nach: string;
  /** Vor `vor` steht noch Text (Anzeige „…“). */
  gekuerztVorne: boolean;
  /** Nach `nach` steht noch Text (Anzeige „…“). */
  gekuerztHinten: boolean;
}

export interface TitelTreffer {
  unterhaltungId: string;
  titel: SuchAusschnitt;
  /** ISO-Zeit der letzten Nachricht. */
  zeit: string;
}

export interface NachrichtTreffer {
  unterhaltungId: string;
  titel: string;
  nachrichtId: string;
  rolle: "du" | "bot";
  /** ISO-Zeit der Nachricht. */
  zeit: string;
  ausschnitt: SuchAusschnitt;
}

export interface SuchErgebnis {
  /** Das Suchwort, wie der Server es verstanden hat (gekürzt, Normalform). */
  suchwort: string;
  titel: TitelTreffer[];
  nachrichten: NachrichtTreffer[];
  /** Versatz für die nächste Seite, wenn es weitere Treffer gibt. */
  weiter?: number;
}
