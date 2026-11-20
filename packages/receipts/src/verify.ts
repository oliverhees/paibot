/**
 * PaiBot – unabhängiger Prüfer für Belege und die ganze Kette; läuft ohne Datenbank und ohne
 * Node-APIs, also auch im Browser.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { PublicKeyInfo, ReceiptEntry } from "@paibot/shared/belege";
import type { Decision, RuleDefinition, RuleRef } from "@paibot/shared/tor";
import { notImplemented } from "@paibot/stub";

export * from "./build";
export * from "./canonical";
export * from "./hash";
export * from "./jsonl";

/**
 * Einzelne Prüfungen, in dieser Reihenfolge. `kontext` braucht den Kontext-Schlüssel und läuft
 * nur auf dem Server (`checkContext`).
 */
export const CHECK_NAMES = ["inhalt", "signatur", "kette", "entscheidung", "kontext"] as const;
export type CheckName = (typeof CHECK_NAMES)[number];

/** `entfaellt`: die Prüfung trifft auf diesen Eintrag nicht zu oder es fehlen Daten dafür. */
export type CheckStatus = "ok" | "fehler" | "entfaellt";

export interface CheckResult {
  check: CheckName;
  status: CheckStatus;
  /** Laufende Nummer des geprüften Eintrags. */
  seq: number;
  /** Bei `signatur`: Kurzform des Schlüssels (`fingerprint`). */
  fingerprint?: string;
  /** Bei `entscheidung`: die Regel, aus der die Entscheidung folgt. */
  rule?: RuleRef;
}

export interface VerifyOptions {
  /**
   * Regel-Fassungen, die zum Zeitpunkt der Entscheidungen galten. Fehlen sie, ist die Prüfung
   * `entscheidung` `entfaellt`.
   */
  rules?: readonly RuleDefinition[];
}

/**
 * Prüft einen Eintrag (Prüfungen 1 bis 4):
 * - `inhalt`: Prüfsumme des Körpers neu berechnet gleich `entry.hash`.
 * - `signatur`: Ed25519 über die 32 Rohbyte von `entry.hash` mit dem öffentlichen Schlüssel von
 *   `entry.keyId` aus `publicKeys` (Web Crypto). Unbekannter Schlüssel → `fehler`.
 * - `kette`: `body.prev` gleich `prev.hash` und `seq` gleich `prev.seq + 1`; ohne `prev` muss
 *   `seq` 1 und `prev` `ZERO_PREV` sein.
 * - `entscheidung`: nur bei Typ `decision` und mit `options.rules`, sonst `entfaellt` (`reevaluate`).
 *
 * Zusagen: liefert immer genau vier Ergebnisse in der Reihenfolge von `CHECK_NAMES` ohne `kontext`;
 * wirft nicht bei manipulierten Daten, sondern meldet `fehler`. Erzeugt keinen Beleg.
 */
export function verifyReceipt(
  entry: ReceiptEntry,
  prev: ReceiptEntry | null,
  publicKeys: readonly PublicKeyInfo[],
  options?: VerifyOptions,
): Promise<CheckResult[]> {
  return notImplemented("receipts.verifyReceipt", entry, prev, publicKeys, options);
}

/** Bericht über eine ganze Kette. */
export interface ChainReport {
  ok: boolean;
  /** Anzahl geprüfter Einträge. */
  checked: number;
  /** Kopf der Kette nach dem letzten Eintrag. */
  head?: { seq: number; hash: string };
  /** Erste Stelle, an der eine Prüfung `fehler` meldet, mit allen Ergebnissen dieses Eintrags. */
  firstFailure?: { seq: number; index: number; checks: CheckResult[] };
}

/**
 * Prüft eine Kette von Anfang an (erster Eintrag `seq` 1). Erkennt veränderte, gelöschte,
 * eingeschobene und vertauschte Einträge, fremde Signaturen und umgebogene `prev`.
 *
 * Zusagen: `ok` genau dann, wenn kein Eintrag `fehler` meldet; `firstFailure` nennt die erste
 * betroffene Stelle. Einträge des Typs `key_change` machen den neuen Schlüssel für die folgenden
 * Einträge gültig, sofern er in `publicKeys` steht.
 */
export function verifyChain(
  entries: Iterable<ReceiptEntry> | AsyncIterable<ReceiptEntry>,
  publicKeys: readonly PublicKeyInfo[],
  options?: VerifyOptions,
): Promise<ChainReport> {
  return notImplemented("receipts.verifyChain", entries, publicKeys, options);
}

/** Ergebnis des Nachrechnens einer Entscheidung. */
export interface Reevaluation {
  status: CheckStatus;
  /** Was das Tor mit den gespeicherten Fakten und Regeln heute entscheidet. */
  expected?: Decision;
}

/**
 * Rechnet die Entscheidung eines Belegs `decision` aus den gespeicherten Fakten und den
 * Regel-Fassungen nach (`evaluate` des Tors, ohne KI). `ok`, wenn `outcome`, `stage`, `rules` und
 * `limits` übereinstimmen; `fehler` bei Abweichung; `entfaellt` bei anderen Typen.
 */
export function reevaluate(entry: ReceiptEntry, rules: readonly RuleDefinition[]): Reevaluation {
  return notImplemented("receipts.reevaluate", entry, rules);
}

/**
 * Wer einen Beleg `key_change` signiert hat: `previous` (der alte Schlüssel, Regelfall) oder `new`
 * (der alte Schlüssel war nicht mehr vorhanden; dann ist der öffentliche Schlüssel von
 * `entry.keyId` gleich `facts.publicKey`). `undefined` bei anderen Typen oder unbekanntem Schlüssel.
 */
export function keyChangeSigner(
  entry: ReceiptEntry,
  publicKeys: readonly PublicKeyInfo[],
): "previous" | "new" | undefined {
  return notImplemented("receipts.keyChangeSigner", entry, publicKeys);
}
