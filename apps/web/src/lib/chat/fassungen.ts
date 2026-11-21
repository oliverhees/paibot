/**
 * PaiBot – Fassungen einer Antwort: Wird die letzte Antwort neu erzeugt, entsteht zur selben
 * Nachricht eine weitere Antwort. Alle Antworten des Bots zwischen zwei Nachrichten der Person
 * sind Fassungen derselben Antwort; die neueste gilt, die älteren sind ersetzt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/** Stelle einer Antwort unter ihren Fassungen. */
export interface Fassung {
  /** 1 = älteste. */
  nr: number;
  von: number;
  /** Kennungen aller Fassungen dieser Antwort, älteste zuerst. */
  alle: readonly string[];
}

/**
 * Fassungen je Antwort des Bots, nach Kennung. Einträge ohne `rolle` (z. B. Hinweise zu Läufen
 * ohne Antwort) zählen nicht und trennen auch nicht.
 */
export function fassungenVon(
  eintraege: readonly { id: string; rolle?: "du" | "bot" }[],
): Map<string, Fassung> {
  const ergebnis = new Map<string, Fassung>();
  let gruppe: string[] = [];
  const abschliessen = () => {
    gruppe.forEach((id, i) => {
      ergebnis.set(id, { nr: i + 1, von: gruppe.length, alle: gruppe });
    });
    gruppe = [];
  };
  for (const e of eintraege) {
    if (e.rolle === "du") abschliessen();
    else if (e.rolle === "bot") gruppe.push(e.id);
  }
  abschliessen();
  return ergebnis;
}
