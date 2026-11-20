/**
 * PaiBot – Teile des Beleg-Protokolls, die Schlüssel brauchen und nur auf dem Server laufen:
 * Signieren und Kontext-Prüfung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { DerivedKey } from "@paibot/crypto";
import type { ReceiptEntry } from "@paibot/shared/belege";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import { notImplemented } from "@paibot/stub";
import type { CheckResult } from "./verify";

/**
 * Signiert eine Beleg-Prüfsumme: Ed25519 über die 32 Rohbyte (nicht über den Hex-Text), Ergebnis
 * base64url ohne Auffüllung (86 Zeichen).
 */
export function signReceipt(hash: Sha256Digest, privateKey: string): string {
  return notImplemented("receipts.signReceipt", hash, privateKey);
}

/**
 * Prüfung 5: Passt die Kontext-Prüfsumme des Belegs zum noch gespeicherten Inhalt? `content`
 * fehlt, wenn der Inhalt gelöscht ist → `entfaellt`. Belege ohne `context` → `entfaellt`.
 */
export function checkContext(
  entry: ReceiptEntry,
  content: string | undefined,
  contextKey: DerivedKey<"context-v1">,
): CheckResult {
  return notImplemented("receipts.checkContext", entry, content, contextKey);
}
