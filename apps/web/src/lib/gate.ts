/**
 * PaiBot – das Tor für Nutzer-Aktionen der Web-App: Regeln aus der Datenbank, Belege mit dem
 * Signaturschlüssel der Installation.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type DerivedKey, decryptSecret } from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import { createGate, type Gate, ruleSnapshot } from "@paibot/gate";
import { cachedReceiptKeys, createReceiptWriter, type ReceiptKeys } from "@paibot/receipts";
import { secretAad, signingKeySecretBinding } from "@paibot/shared/bindung";
import { PaiBotError } from "@paibot/shared/fehler";

/** Uhr des Tors. */
export interface Uhr {
  now(): Date;
}

/**
 * Signaturschlüssel aus der Datenbank: aktiven Schlüssel lesen und entschlüsseln (gebunden an
 * Kennung und öffentlichen Teil). Einmal geladen, bleibt er im Speicher. Vor der Einrichtung gibt
 * es keinen: dann `einrichtung_offen`.
 */
export function belegSchluesselAus(db: Database, schluessel: DerivedKey<"keys-v1">): ReceiptKeys {
  return cachedReceiptKeys(async () => {
    const aktiv = await repo.installationKeys.getActive(db);
    if (aktiv === undefined) throw new PaiBotError("einrichtung_offen");
    const aad = secretAad(signingKeySecretBinding(aktiv.id, aktiv.publicKey));
    return { keyId: aktiv.id, privateKey: decryptSecret(aktiv.privateKeyEnc, schluessel, { aad }) };
  });
}

/** Baut das Tor auf `db` (auch eine Transaktion) mit den angegebenen Schlüsseln. */
export function torAuf(db: Database, schluessel: ReceiptKeys, uhr: Uhr): Gate {
  return createGate({
    rules: {
      load: async () => {
        const { stand, rules } = await repo.rules.loadSnapshot(db);
        return ruleSnapshot(rules, stand);
      },
    },
    receipts: createReceiptWriter(db, schluessel),
    clock: uhr,
  });
}
