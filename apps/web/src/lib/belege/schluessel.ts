/**
 * PaiBot – öffentlicher Schlüssel dieser Installation für die Anzeige auf der Seite „Belege“:
 * Kurzform zum Vergleichen, Kennung, seit wann, und frühere Schlüssel. Nur öffentliche Angaben.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type Database, repo } from "@paibot/db";

/** Öffentliche Angaben eines Schlüssels; der private Teil verlässt den Server nie. */
export interface SchluesselAngabe {
  keyId: string;
  /** Öffentlicher Schlüssel (Base64), wie im Export. */
  publicKey: string;
  /** Kurzform der Prüfsumme des Schlüssels zum Vergleichen, z. B. `3f9c-2ab1-77d0-e4c5`. */
  kurzform: string;
  /** Seit wann (Datum in der Zeitzone der Installation). */
  seit: string;
  /** Bis wann, nur bei früheren Schlüsseln. */
  bis?: string;
}

export interface SchluesselAnzeige {
  /** Der Schlüssel, mit dem neue Belege signiert werden; fehlt vor der Einrichtung. */
  aktiv?: SchluesselAngabe;
  /** Frühere Schlüssel (nach einem Wechsel), neueste zuerst; sie prüfen ältere Belege. */
  frueher: SchluesselAngabe[];
}

function datum(iso: string, zeitzone: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: zeitzone }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 10);
  }
}

/** Liest die Schlüssel und gibt nur ihre öffentlichen Angaben weiter. */
export async function schluesselAnzeige(
  db: Database,
  zeitzone: string,
): Promise<SchluesselAnzeige> {
  const alle = await repo.installationKeys.list(db);
  const angaben = alle.map((k): SchluesselAngabe & { aktiv: boolean } => ({
    keyId: k.id,
    publicKey: k.publicKey,
    kurzform: k.fingerprint,
    seit: datum(k.createdAt, zeitzone),
    ...(k.retiredAt === undefined ? {} : { bis: datum(k.retiredAt, zeitzone) }),
    aktiv: k.retiredAt === undefined,
  }));
  const ohneMarke = ({ aktiv: _aktiv, ...rest }: SchluesselAngabe & { aktiv: boolean }) => rest;
  const aktiv = angaben.filter((a) => a.aktiv).at(-1);
  return {
    ...(aktiv === undefined ? {} : { aktiv: ohneMarke(aktiv) }),
    frueher: angaben
      .filter((a) => !a.aktiv)
      .reverse()
      .map(ohneMarke),
  };
}
