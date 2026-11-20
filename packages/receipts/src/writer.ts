/**
 * PaiBot – Belege unter Sperre an die Kette in der Datenbank anhängen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Db } from "@paibot/db";
import type { ReceiptRef, ReceiptWriter } from "@paibot/gate";
import type { ReceiptEntry } from "@paibot/shared/belege";
import type { InstallationId, KeyId } from "@paibot/shared/ids";
import { notImplemented } from "@paibot/stub";

/** Nummer der Transaktions-Sperre, unter der Belege angehängt werden. */
export const RECEIPT_LOCK_ID = 2026112001;

/** Ein Signaturschlüssel mit seinem entschlüsselten privaten Teil (nur im Speicher). */
export interface SigningKeyRef {
  keyId: KeyId;
  privateKey: string;
}

/** Liefert den Schlüssel, mit dem neue Belege signiert werden. */
export interface ReceiptKeys {
  current(): Promise<SigningKeyRef>;
}

/** Beleg „Start“ bei der Einrichtung. */
export interface StartInput {
  installationId: InstallationId;
  key: SigningKeyRef & { publicKey: string };
  /** Stand der Software (`PAIBOT_BUILD` oder `<version>+dev`). */
  software: string;
  time: Date;
}

/**
 * Beleg „Schlüsselwechsel“. Der Beleg nennt den neuen Schlüssel (`facts.newKeyId`,
 * `facts.publicKey`) und den bisherigen (`facts.previousKeyId`). Ist der alte private Schlüssel
 * vorhanden, signiert er (`facts.signedBy: "previous"`, `keyId` = bisheriger Schlüssel); fehlt er,
 * signiert der neue Schlüssel selbst (`facts.signedBy: "new"`, `keyId` = neuer Schlüssel).
 */
export interface KeyChangeInput {
  next: SigningKeyRef & { publicKey: string };
  previous?: { keyId: KeyId; privateKey?: string };
  time: Date;
}

/** Schreiber für die Belege-Kette. Erfüllt den Port `ReceiptWriter` des Tors. */
export interface ReceiptChainWriter extends ReceiptWriter {
  /** Erster Eintrag der Kette (`seq` 1, `prev` = `ZERO_PREV`). Fehler, wenn die Kette nicht leer ist. */
  appendStart(input: StartInput): Promise<ReceiptRef>;
  appendKeyChange(input: KeyChangeInput): Promise<ReceiptRef>;
  /** Letzter Eintrag der Kette oder `undefined` bei leerer Kette. */
  head(): Promise<ReceiptEntry | undefined>;
}

/**
 * Baut den Schreiber. Jedes Anhängen läuft in einer Transaktion mit
 * `pg_advisory_xact_lock(RECEIPT_LOCK_ID)`: Kopf lesen, Körper bauen (`buildReceipt`), hashen,
 * signieren, einfügen (`belege.appendLocked`), danach Ereignis `beleg.created`, wenn der Beleg zu
 * einer Unterhaltung gehört.
 *
 * Zusagen: Auch bei gleichzeitigen Schreibern (web und worker) bleibt die Kette lückenlos und
 * unverzweigt. Belege enthalten nie Inhalte von Nachrichten.
 */
export function createReceiptWriter(db: Db, keys: ReceiptKeys): ReceiptChainWriter {
  return notImplemented("receipts.createReceiptWriter", db, keys);
}
