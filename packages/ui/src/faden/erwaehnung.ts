/**
 * PaiBot – Reine Hilfen für die @-Auswahl der Bots im Eingabefeld.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/** Eine angefangene Erwähnung vor dem Cursor: wo das @ steht und was danach getippt wurde. */
export interface OffeneErwaehnung {
  /** Stelle des @ im Text. */
  start: number;
  /** Getippter Teil nach dem @ (ohne @), bis zum Cursor. */
  suche: string;
}

/**
 * Sucht die angefangene Erwähnung direkt vor dem Cursor. Ein @ zählt nur am Textanfang oder
 * nach Leerraum (so bleibt „mail@beispiel.de“ eine Adresse); die Suche endet am Leerraum.
 */
export function erwaehnungAmCursor(text: string, cursor: number): OffeneErwaehnung | null {
  const ende = Math.max(0, Math.min(cursor, text.length));
  for (let i = ende - 1; i >= 0; i--) {
    const zeichen = text[i] as string;
    if (/\s/u.test(zeichen)) return null;
    if (zeichen === "@") {
      const davor = i === 0 ? "" : (text[i - 1] as string);
      if (davor !== "" && !/\s/u.test(davor)) return null;
      return { start: i, suche: text.slice(i + 1, ende) };
    }
  }
  return null;
}

/** Kleinschreibung ohne Akzente, damit „Lektorat“ auch bei „lekt“ und „Éa“ bei „ea“ passt. */
function glatt(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("de");
}

/**
 * Bots, deren Name mit der Suche beginnt, zuerst; danach die, die sie enthalten. Die Reihenfolge
 * innerhalb jeder Gruppe bleibt wie in der Liste. Ohne Suche kommen alle in Listen-Reihenfolge.
 */
export function filtereNamen<T extends { name: string }>(liste: readonly T[], suche: string): T[] {
  const s = glatt(suche);
  if (s === "") return [...liste];
  const anfang: T[] = [];
  const enthaelt: T[] = [];
  for (const eintrag of liste) {
    const name = glatt(eintrag.name);
    if (name.startsWith(s)) anfang.push(eintrag);
    else if (name.includes(s)) enthaelt.push(eintrag);
  }
  return [...anfang, ...enthaelt];
}

/** Ersetzt die angefangene Erwähnung durch „@Name “ und liefert Text und neue Cursor-Stelle. */
export function erwaehnungEinsetzen(
  text: string,
  offen: OffeneErwaehnung,
  cursor: number,
  name: string,
): { text: string; cursor: number } {
  const vorne = text.slice(0, offen.start);
  const hinten = text.slice(Math.max(cursor, offen.start));
  const einfuegen = `@${name} `;
  // Steht nach dem Cursor schon ein Leerzeichen, wird keines doppelt gesetzt.
  const rest = hinten.startsWith(" ") ? hinten.slice(1) : hinten;
  return { text: vorne + einfuegen + rest, cursor: vorne.length + einfuegen.length };
}

/** Nächste Auswahl in der Liste mit Pfeiltasten; überspringt gesperrte Einträge, springt am Ende rum. */
export function naechsteAuswahl(
  gesperrt: readonly boolean[],
  aktuell: number,
  richtung: 1 | -1,
): number {
  const n = gesperrt.length;
  if (n === 0 || gesperrt.every(Boolean)) return -1;
  let i = aktuell;
  for (let schritt = 0; schritt < n; schritt++) {
    i = i < 0 ? (richtung === 1 ? 0 : n - 1) : (i + richtung + n) % n;
    if (!gesperrt[i]) return i;
  }
  return -1;
}

/** Hängt „@Name “ an den Text an (für die Leiste „Aufrufen“): mit Leerzeichen davor, wenn nötig. */
export function erwaehnungAnhaengen(text: string, name: string): string {
  const trenner = text === "" || /\s$/u.test(text) ? "" : " ";
  return `${text}${trenner}@${name} `;
}
