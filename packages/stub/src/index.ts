/**
 * PaiBot – Fehler „noch nicht umgesetzt“ für Funktionen, deren Schnittstelle schon feststeht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/** Code des Fehlers. Er gehört nicht zur Liste der API-Fehlercodes; die API meldet ihn als `intern`. */
export const NOT_IMPLEMENTED_CODE = "noch_nicht_umgesetzt";

/**
 * Wird von jeder Funktion geworfen, deren Signatur schon feststeht, deren Umsetzung aber noch
 * fehlt. `feature` nennt die Funktion, z. B. `crypto.encryptSecret`.
 */
export class NotImplementedError extends Error {
  readonly code = NOT_IMPLEMENTED_CODE;
  readonly feature: string;

  constructor(feature: string) {
    super(`Noch nicht umgesetzt: ${feature}`);
    this.name = "NotImplementedError";
    this.feature = feature;
  }
}

/**
 * Wirft immer `NotImplementedError` für die genannte Funktion. Die Argumente der Funktion werden
 * mitgegeben, damit ihre Signatur vollständig bleibt; sie werden nicht ausgewertet.
 */
export function notImplemented(feature: string, ..._args: unknown[]): never {
  throw new NotImplementedError(feature);
}

/** Typwächter für `NotImplementedError`. */
export function isNotImplemented(value: unknown): value is NotImplementedError {
  return value instanceof NotImplementedError;
}
