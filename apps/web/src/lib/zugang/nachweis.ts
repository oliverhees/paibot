/**
 * PaiBot – geprüfte Sitzung und Nachweise für das Tor: Objekte, die nur der Zugang erzeugt und die
 * sich nicht nachbauen lassen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Credential } from "@paibot/shared/aktionen";
import type { OwnerId } from "@paibot/shared/ids";

/**
 * Eine Sitzung, die der Zugang gerade gegen die Datenbank geprüft hat. Eingefroren; ein Objekt mit
 * denselben Feldern, das nicht vom Zugang stammt, erkennt `istGepruefteSitzung` nicht an.
 */
export interface GepruefteSitzung {
  /** `sessions.id` = SHA-256 des Cookie-Werts (nicht geheim, nicht umkehrbar). */
  readonly id: string;
  readonly ownerId: OwnerId;
  readonly createdAt: string;
  readonly expiresAt: string;
}

/**
 * Wie sich der Besitzer für eine Aktion ausgewiesen hat. Daraus – und nur daraus – setzt der Rahmen
 * der API-Routen den Fakt `credential` für das Tor.
 */
export interface Nachweis {
  readonly art: Credential;
  /** Bei `sitzung` die geprüfte Sitzung, bei `passwort` der Besitzer. */
  readonly sitzung?: GepruefteSitzung;
  readonly ownerId?: OwnerId;
}

const sitzungen = new WeakSet<object>();
const nachweise = new WeakSet<object>();

export function istGepruefteSitzung(wert: unknown): wert is GepruefteSitzung {
  return typeof wert === "object" && wert !== null && sitzungen.has(wert);
}

export function istNachweis(wert: unknown): wert is Nachweis {
  return typeof wert === "object" && wert !== null && nachweise.has(wert);
}

/**
 * Nur für den Zugang (`lib/zugang/*`): macht aus einer gerade gelesenen Sitzungszeile eine
 * geprüfte Sitzung. Andere Teile der App holen Sitzungen über `sitzungAusAnfrage` bzw. `besitzerSeite`.
 */
export function _gepruefteSitzung(werte: GepruefteSitzung): GepruefteSitzung {
  const sitzung = Object.freeze({
    id: werte.id,
    ownerId: werte.ownerId,
    createdAt: werte.createdAt,
    expiresAt: werte.expiresAt,
  });
  sitzungen.add(sitzung);
  return sitzung;
}

/** Nachweis „Sitzung“ aus einer geprüften Sitzung; wirft bei allem anderen. */
export function nachweisAusSitzung(sitzung: GepruefteSitzung): Nachweis {
  if (!istGepruefteSitzung(sitzung)) throw new TypeError("Keine geprüfte Sitzung.");
  const nachweis = Object.freeze({ art: "sitzung" as const, sitzung, ownerId: sitzung.ownerId });
  nachweise.add(nachweis);
  return nachweis;
}

/** Nur für den Zugang: Nachweis „Passwort“, erst nachdem das Passwort geprüft wurde. */
export function _nachweisPasswort(ownerId: OwnerId): Nachweis {
  const nachweis = Object.freeze({ art: "passwort" as const, ownerId });
  nachweise.add(nachweis);
  return nachweis;
}

/** Nur für den Zugang: Nachweis „Einrichtungs-Code“, erst nachdem der Code geprüft wurde. */
export function _nachweisCode(): Nachweis {
  const nachweis = Object.freeze({ art: "einrichtungs_code" as const });
  nachweise.add(nachweis);
  return nachweis;
}
