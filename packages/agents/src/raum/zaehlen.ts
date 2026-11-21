/**
 * PaiBot – Aufträge zählen (je Mitglied, Bitten, Breite)
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/**
 * Zähl-Fakten aus der Liste der Aufträge eines Baums. Gezählt wird immer aus den Aufträgen selbst,
 * nie aus einem Zähler, den ein Knoten oder ein Bot mitbringt. Die Funktionen liefern nur Zahlen
 * („wie viele gibt es, wie viele wären es mit dem neuen, wo liegt die Grenze“); ob etwas abgelehnt
 * wird, entscheidet allein das Tor. Sie werfen nie; ein unbrauchbarer Wert zählt nicht mit.
 */

export interface AuftragsEintrag {
  readonly id: string;
  /** `null` bei der Wurzel. */
  readonly elternId: string | null;
  readonly wurzelId: string;
  /** Der Bot, der den Auftrag gegeben hat; `null`, wenn die Person ihn gegeben hat. */
  readonly geberBotId: string | null;
  readonly empfaengerBotId: string;
  /** `wurzel`, `uebergabe`, `bitte`, `rueckkehr`, `faecher`, `sammeln`, `rueckmeldung`, `rueckgabe`. */
  readonly art: string;
  /** `gefragt`, `arbeitet`, `fertig`, `gescheitert`, `abgelehnt`, `abgebrochen`, … */
  readonly status: string;
}

export interface ZaehlFakt {
  /** Bisher gezählt. */
  readonly anzahl: number;
  /** Zahl mit dem neuen Auftrag (gleich `anzahl`, wenn die Art des neuen nicht mitzählt). */
  readonly mitNeuem: number;
  readonly grenze: number;
  /** `mitNeuem` liegt über der Grenze. */
  readonly ueberschreitet: boolean;
}

/** Aufträge der Leitung an dasselbe Mitglied je Wurzel: 1 Übergabe und 2 Rückgaben. */
export const STANDARD_AUFTRAEGE_JE_MITGLIED = 3;
/** Bitten je Mitglieds-Auftrag. */
export const STANDARD_BITTEN_JE_AUFTRAG = 1;
/** Offene Unter-Aufträge je Auftrag. */
export const STANDARD_BREITE = 6;

/** Endzustände; alles andere (auch ein unbekannter Wert) gilt als offen. */
const ENDZUSTAENDE: ReadonlySet<string> = new Set([
  "fertig",
  "gescheitert",
  "abgelehnt",
  "abgebrochen",
]);

function fakt(anzahl: number, neuZaehlt: boolean, grenze: number): ZaehlFakt {
  const mitNeuem = anzahl + (neuZaehlt ? 1 : 0);
  return { anzahl, mitNeuem, grenze, ueberschreitet: mitNeuem > grenze };
}

/**
 * Aufträge der Leitung (`leitungBotId` als Geber) an `empfaengerBotId` in der Wurzel: alle der
 * Arten `uebergabe` und `rueckgabe`. Nicht mitgezählt werden Bitten und die Arten, die der Server
 * selbst anlegt (`rueckkehr`, `sammeln`, `rueckmeldung`); sonst sperrte sich die Leitung selbst.
 * Eine neue `@Name:`-Übergabe zählt wie eine Rückgabe: so lässt sich die Grenze nicht umgehen.
 */
export function zaehleAuftraegeJeMitglied(
  auftraege: readonly AuftragsEintrag[],
  wurzelId: string,
  leitungBotId: string,
  empfaengerBotId: string,
  neueArt: string | null = null,
  grenze: number = STANDARD_AUFTRAEGE_JE_MITGLIED,
): ZaehlFakt {
  const anzahl = auftraege.filter(
    (a) =>
      a.wurzelId === wurzelId &&
      a.geberBotId === leitungBotId &&
      a.empfaengerBotId === empfaengerBotId &&
      (a.art === "uebergabe" || a.art === "rueckgabe"),
  ).length;
  return fakt(anzahl, neueArt === "uebergabe" || neueArt === "rueckgabe", grenze);
}

/** Bitten, die ein Auftrag schon gestellt hat (Aufträge der Art `bitte` unter ihm). */
export function zaehleBitten(
  auftraege: readonly AuftragsEintrag[],
  bittenderAuftragId: string,
  neueArt: string | null = null,
  grenze: number = STANDARD_BITTEN_JE_AUFTRAG,
): ZaehlFakt {
  const anzahl = auftraege.filter(
    (a) => a.elternId === bittenderAuftragId && a.art === "bitte",
  ).length;
  return fakt(anzahl, neueArt === "bitte", grenze);
}

/** Offene Unter-Aufträge eines Auftrags (Breite); `neue` ist die Zahl der Zeilen, die dazukommen. */
export function zaehleBreite(
  auftraege: readonly AuftragsEintrag[],
  elternAuftragId: string,
  neue = 0,
  grenze: number = STANDARD_BREITE,
): ZaehlFakt {
  const anzahl = auftraege.filter(
    (a) => a.elternId === elternAuftragId && !ENDZUSTAENDE.has(a.status),
  ).length;
  const zusatz = Number.isInteger(neue) && neue > 0 ? neue : 0;
  const mitNeuem = anzahl + zusatz;
  return { anzahl, mitNeuem, grenze, ueberschreitet: mitNeuem > grenze };
}
