/**
 * PaiBot – Namen aus fremder Herkunft (Antworten von Anbietern, Anbieter-Listen, eigene Eingaben)
 * vor dem Speichern und Anzeigen bereinigen. Ohne Zod, damit es auch im Browser läuft.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/** Steuerzeichen, Formatzeichen (u. a. Schreibrichtung, Null-Breite) und Zeilen-/Absatztrenner. */
const UNSICHTBAR = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;
/** Jede Folge von Leerraum wird ein einzelnes Leerzeichen. */
const LEERRAUM = /\s+/gu;

/**
 * Bereinigter Anzeigetext: ohne Steuer- und Formatzeichen, Leerraum zusammengefasst, an den Enden
 * gekürzt und auf `maxZeichen` Zeichen (Codepoints) begrenzt. Kein Text oder nur Unsichtbares:
 * `undefined`. Das Ergebnis ist reiner Text; eingefügt wird es nie als HTML.
 */
export function anzeigeText(wert: unknown, maxZeichen: number): string | undefined {
  if (typeof wert !== "string") return undefined;
  const sauber = wert.normalize("NFC").replace(UNSICHTBAR, "").replace(LEERRAUM, " ").trim();
  if (sauber === "") return undefined;
  const zeichen = Array.from(sauber);
  return zeichen.length > maxZeichen ? zeichen.slice(0, maxZeichen).join("").trimEnd() : sauber;
}

/** Ist der Text schon in bereinigter Form (gleich `anzeigeText(wert, maxZeichen)`)? */
export function istAnzeigeText(wert: string, maxZeichen: number): boolean {
  return anzeigeText(wert, maxZeichen) === wert;
}

/**
 * Ahmt ein Name den Wortlaut der Kennzeichnung einer Regel nach („… laut Regel …“)? Solche Namen
 * nimmt PaiBot nicht an: Sie würden neben dem Namen wie die echte Kennzeichnung aussehen. Sie
 * wären in Karte, Kopf und Zeile unter der Antwort überall dort ein Risiko, wo ein Name steht;
 * deshalb wird am Ursprung abgelehnt, nicht an jeder Anzeige einzeln.
 */
export function ahmtKennzeichnungNach(name: string): boolean {
  return /laut[\s\u00a0]*regel/i.test(name.normalize("NFKC"));
}
