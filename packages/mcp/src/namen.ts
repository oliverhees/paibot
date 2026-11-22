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
 * Vergibt die Modell-Namen für alle Werkzeuge einer App. `bekannt` ist die gespeicherte Zuordnung
 * Original-Name → Modell-Name der App und **Pflicht** (eine leere Zuordnung beim ersten Abruf):
 * Namen darin bleiben unverändert, und **alle** zählen als vergeben, auch wenn ihr Werkzeug in der
 * Liste fehlt. Ein neues Werkzeug des Servers verdrängt so nie ein bestätigtes von seinem Namen,
 * auch nicht, nachdem dieses vorübergehend verschwunden war. Nur die neuen Werkzeuge werden
 * vergeben, sortiert nach Original-Name, bei Gleichheit mit Zähler (`_2`, `_3` …); ihre Zuteilung
 * hängt damit nicht von der Reihenfolge der Liste ab. `bereitsVergeben` sind die Namen anderer Apps
 * der Installation.
 *
 * Eine gespeicherte Zuordnung, die nicht stimmt, wird abgewiesen und nie still geändert (`RangeError`):
 * ein Name, der nicht zu dieser App gehört (`<kurzname>__…`) oder nicht zum Namensmuster passt, ein
 * Name, der zwei Werkzeugen gehört, und ein Name, der schon in `bereitsVergeben` steht. Das sind
 * Fehler der Daten (der eindeutige Index in der Datenbank verhindert sie); ein bestätigtes
 * Werkzeug wird deshalb nicht umbenannt. Fehlt `bekannt` (`TypeError`), gibt es keine Vergabe.
 */
export function vergebeModellNamen(
  appKurzname: string,
  originalNamen: readonly string[],
  bereitsVergeben: ReadonlySet<string>,
  bekannt: ReadonlyMap<string, string>,
): ModellNameEintrag[] {
  if (!APP_KURZNAME_MUSTER.test(appKurzname)) {
    throw new RangeError("Kurzname der App ist ungültig");
  }
  if (typeof bekannt?.get !== "function" || typeof bekannt.values !== "function") {
    throw new TypeError("Die gespeicherte Zuordnung der Namen fehlt");
  }
  if (typeof bereitsVergeben?.has !== "function") {
    throw new TypeError("Die Namen anderer Apps fehlen");
  }
  const vorsatz = `${appKurzname}${NAMEN_TRENNER}`;
  if (vorsatz.length + MIN_TEIL > MAX_LAENGE) {
    throw new RangeError("Kurzname der App ist zu lang für Werkzeug-Namen");
  }
  const platz = MAX_LAENGE - vorsatz.length;
  const vergeben = new Set(bereitsVergeben);
  // Erst alle bekannten Namen reservieren, auch die von Werkzeugen, die in der Liste fehlen.
  const gespeichert = new Set<string>();
  for (const name of bekannt.values()) {
    if (!name.startsWith(vorsatz) || !MODELL_NAME_MUSTER.test(name)) {
      throw new RangeError("Ein gespeicherter Name gehört nicht zu dieser App");
    }
    if (gespeichert.has(name)) throw new RangeError("Ein gespeicherter Name ist doppelt vergeben");
    if (bereitsVergeben.has(name)) {
      throw new RangeError("Ein gespeicherter Name gehört schon einer anderen App");
    }
    gespeichert.add(name);
    vergeben.add(name);
  }
  const eindeutigeOriginale = [...new Set(originalNamen)].sort();
  const zuordnung = new Map<string, string>();
  for (const original of eindeutigeOriginale) {
    const name = bekannt.get(original);
    if (name !== undefined) zuordnung.set(original, name);
  }
  for (const original of eindeutigeOriginale) {
    if (zuordnung.has(original)) continue;
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
