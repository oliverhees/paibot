/**
 * PaiBot – Beispiel-Uhr für die Doku-Bilder: Web-App und Worker der Beispiel-Umgebung sehen eine
 * feste, fast stehende Uhrzeit statt der echten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Nur für `pnpm doku:app`: wird mit `node --import` vor Web-App und Worker geladen, wenn
// PAIBOT_DOKU_UHR gesetzt ist („<Startzeit ISO>|<echte Startzeit in ms>|<Faktor>“). Danach gilt in
// diesem Prozess für `Date`:
//   jetzt = Startzeit + (echte Zeit − echter Start) / Faktor
// Mit Faktor 1000 vergeht in einer Stunde Aufnahme nur gut eine Sekunde. So zeigen Uhrzeiten in
// den Bildern bei jedem Lauf dasselbe. Zeitgeber (`setTimeout`, `performance.now`) laufen normal.
// Zeiten, die die Datenbank selbst setzt, bleiben echt.

/** Liest die Angabe; `undefined`, wenn sie fehlt oder ungültig ist. */
export function leseUhr(text) {
  if (typeof text !== "string" || text === "") return undefined;
  const [start, echt, faktor] = text.split("|");
  const startMs = Date.parse(start);
  const echtMs = Number(echt);
  const f = Number(faktor);
  if (!Number.isFinite(startMs) || !Number.isFinite(echtMs) || !(f >= 1)) return undefined;
  return { startMs, echtMs, faktor: f };
}

/** Zeit der Beispiel-Uhr zur echten Zeit `echtJetzt`. */
export function beispielZeit(uhr, echtJetzt) {
  return Math.floor(uhr.startMs + (echtJetzt - uhr.echtMs) / uhr.faktor);
}

/** Ersetzt `Date` im laufenden Prozess durch die Beispiel-Uhr. */
export function stelleUhr(uhr) {
  const EchtesDate = globalThis.Date;
  const echtNow = EchtesDate.now.bind(EchtesDate);
  const jetzt = () => beispielZeit(uhr, echtNow());
  class BeispielDate extends EchtesDate {
    constructor(...args) {
      if (args.length === 0) super(jetzt());
      else super(...args);
    }
    static now() {
      return jetzt();
    }
    // Daten, die Node selbst erzeugt (z. B. fs.stat), gelten weiter als Date
    static [Symbol.hasInstance](wert) {
      return wert instanceof EchtesDate;
    }
  }
  // Eigene Kopien von Date.UTC und Date.parse: Manche Hüllen um Date kopieren nur eigene Felder
  for (const name of ["UTC", "parse"]) {
    Object.defineProperty(BeispielDate, name, {
      value: EchtesDate[name].bind(EchtesDate),
      writable: true,
      configurable: true,
    });
  }
  // Ohne `new` aufgerufen liefert Date einen Text der aktuellen Zeit
  const DateFunktion = new Proxy(BeispielDate, {
    apply: () => new BeispielDate().toString(),
  });
  globalThis.Date = DateFunktion;
}

// biome-ignore lint/suspicious/noUndeclaredEnvVars: nur für die Beispiel-Umgebung von doku:app
const angabe = leseUhr(process.env.PAIBOT_DOKU_UHR);
if (angabe) stelleUhr(angabe);
