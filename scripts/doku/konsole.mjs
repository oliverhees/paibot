/**
 * PaiBot – welche Konsolen-Meldung einer Aufnahme der Doku-Bilder nicht als Fehler zählt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

// Jede Meldung `error` oder `warning` der Konsole macht eine Aufnahme ungültig. Genau eine
// Ausnahme gibt es: Der Entwicklungs-Server von Next warnt auf jeder Seite unter /_komponenten,
// ein vorgeladenes Stylesheet werde nicht gleich gebraucht. Die Ausnahme gilt nur
//   - für die Art `warning` (nie für `error`),
//   - nur für Aufnahmen der Art „entwicklung“,
//   - nur für den Satz am Anfang der Meldung (nichts, was den Satz bloß irgendwo enthält).

const BEKANNTE_DEV_WARNUNG = /^The resource \S+ was preloaded using link preload but not used/u;

/** Ist das die bekannte Warnung des Entwicklungs-Servers, die eine Aufnahme nicht ungültig macht? */
export function istBekannteDevWarnung(art, text, entwicklung) {
  return entwicklung === true && art === "warning" && BEKANNTE_DEV_WARNUNG.test(text);
}
