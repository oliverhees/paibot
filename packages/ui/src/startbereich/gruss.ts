/**
 * PaiBot – Tageszeit-Gruß aus Uhrzeit und Zeitzone (reine Funktion).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

export type Tageszeit = "morgen" | "tag" | "abend" | "spaet";

/** Zeitzone, wenn keine oder eine unbekannte angegeben ist (wie in den Einstellungen). */
export const STANDARD_ZEITZONE = "Europe/Berlin";

function stundeMit(jetzt: Date, zeitzone: string): number {
  const teile = new Intl.DateTimeFormat("de-DE", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: zeitzone,
  }).formatToParts(jetzt);
  return Number(teile.find((teil) => teil.type === "hour")?.value);
}

/** Volle Stunde (0 bis 23) in der Zeitzone; eine unbekannte Zeitzone ersetzt Europe/Berlin. */
export function stundeIn(jetzt: Date, zeitzone: string = STANDARD_ZEITZONE): number {
  try {
    return stundeMit(jetzt, zeitzone);
  } catch {
    return stundeMit(jetzt, STANDARD_ZEITZONE);
  }
}

/** 5 bis 10 Uhr Morgen, 11 bis 16 Tag, 17 bis 22 Abend, sonst später Stunde. */
export function tageszeitFuerStunde(stunde: number): Tageszeit {
  if (stunde >= 5 && stunde < 11) return "morgen";
  if (stunde >= 11 && stunde < 17) return "tag";
  if (stunde >= 17 && stunde < 23) return "abend";
  return "spaet";
}

/** Tageszeit für einen Zeitpunkt; bei einem ungültigen Datum `undefined` (dann kein Gruß). */
export function tageszeitIn(
  jetzt: Date,
  zeitzone: string = STANDARD_ZEITZONE,
): Tageszeit | undefined {
  if (Number.isNaN(jetzt.getTime())) return undefined;
  return tageszeitFuerStunde(stundeIn(jetzt, zeitzone));
}
