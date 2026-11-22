/**
 * PaiBot – Namen für das Modell: `<app-kurzname>__<name bereinigt>`, höchstens 64 Zeichen, nur die
 * Zeichen `A-Z a-z 0-9 _ -`, je Installation eindeutig. Der Original-Name geht nur an den Server,
 * nie ans Modell.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

/** Zulässige Namen von Werkzeugen für das Modell (wie im Vertrag der Werkzeuge). */
export const MODELL_NAME_MUSTER = /^[A-Za-z0-9_-]{1,64}$/;

/** Zulässiger Kurzname einer App. */
export const APP_KURZNAME_MUSTER = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Trenner zwischen App und Werkzeug. Eingebaute Werkzeuge enthalten ihn nie. */
export const NAMEN_TRENNER = "__";

const MAX_LAENGE = 64;
const MIN_TEIL = 1;

/** Macht aus einem fremden Namen den Namensteil: nur erlaubte Zeichen, keine doppelten Unterstriche. */
export function bereinigeNamensteil(original: string): string {
  const ersetzt = original
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[_-]+/, "")
    .replace(/[_-]+$/, "");
  return ersetzt.length === 0 ? "werkzeug" : ersetzt;
}

export interface ModellNameEintrag {
  /** Name genau wie vom Server geliefert; nur für den Aufruf an den Server. */
  original: string;
  /** Name für das Modell. */
  modellName: string;
}

/**
 * Vergibt die Modell-Namen für alle Werkzeuge einer App. Die Zuteilung hängt nur von den Namen ab,
 * nicht von der Reihenfolge der Liste: Es wird nach Original-Name sortiert, bei Gleichheit nach
 * Zähler (`_2`, `_3` …). `bereitsVergeben` sind die Namen anderer Apps der Installation.
 */
export function vergebeModellNamen(
  appKurzname: string,
  originalNamen: readonly string[],
  bereitsVergeben: ReadonlySet<string> = new Set(),
): ModellNameEintrag[] {
  if (!APP_KURZNAME_MUSTER.test(appKurzname)) {
    throw new RangeError("Kurzname der App ist ungültig");
  }
  const vorsatz = `${appKurzname}${NAMEN_TRENNER}`;
  if (vorsatz.length + MIN_TEIL > MAX_LAENGE) {
    throw new RangeError("Kurzname der App ist zu lang für Werkzeug-Namen");
  }
  const platz = MAX_LAENGE - vorsatz.length;
  const vergeben = new Set(bereitsVergeben);
  const eindeutigeOriginale = [...new Set(originalNamen)].sort();
  const zuordnung = new Map<string, string>();
  for (const original of eindeutigeOriginale) {
    const basis = bereinigeNamensteil(original).slice(0, platz);
    let kandidat = `${vorsatz}${basis}`;
    for (let zaehler = 2; vergeben.has(kandidat); zaehler++) {
      const endung = `_${zaehler}`;
      kandidat = `${vorsatz}${basis.slice(0, Math.max(MIN_TEIL, platz - endung.length))}${endung}`;
    }
    vergeben.add(kandidat);
    zuordnung.set(original, kandidat);
  }
  return originalNamen.map((original) => ({
    original,
    modellName: zuordnung.get(original) as string,
  }));
}
