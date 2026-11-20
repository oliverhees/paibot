/**
 * PaiBot – das Tor als einziger Weg zur Ausführung: Regeln laden, entscheiden, Beleg schreiben,
 * nur bei Erlaubnis ausführen, Ergebnis belegen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ActionRequest, ActionType, Facts } from "@paibot/shared/aktionen";
import type { ReceiptResult, ReceiptUndo } from "@paibot/shared/belege";
import { PaiBotError } from "@paibot/shared/fehler";
import type { HmacDigest } from "@paibot/shared/grundtypen";
import type { ReceiptId } from "@paibot/shared/ids";
import type { Decision, GatePermit, Outcome, RuleDefinition } from "@paibot/shared/tor";
import { notImplemented } from "@paibot/stub";
import { OUTCOME_ERROR_CODE } from "./evaluate";

/** Quelle der aktiven Regeln (in der Datenbank: `rules.listActive`). */
export interface RuleProvider {
  /** Alle Regeln, die gerade gelten, je Regel die neueste Fassung. */
  listActive(): Promise<readonly RuleDefinition[]>;
}

/** Uhr des Tors. Das Tor liest die Zeit nie selbst. */
export interface Clock {
  now(): Date;
}

/** Verweis auf einen geschriebenen Beleg. */
export interface ReceiptRef {
  receiptId: ReceiptId;
  seq: number;
}

/** Was das Tor als Beleg „Entscheidung“ festhält. */
export interface DecisionRecord<T extends ActionType = ActionType> {
  action: ActionRequest<T>;
  facts: Facts<T>;
  decision: Decision;
  time: Date;
  /** Kontext-Prüfsumme über die ausgehende Anfrage bzw. die Eingabe. */
  context?: { digest: HmacDigest };
  undo?: ReceiptUndo;
}

/** Was das Tor als Beleg „Ergebnis“ festhält. */
export interface ResultRecord<T extends ActionType = ActionType> {
  action: ActionRequest<T>;
  result: ReceiptResult;
  time: Date;
  undo?: ReceiptUndo;
}

/**
 * Schreibt Belege (umgesetzt im Beleg-Paket). Jeder Aufruf hängt genau einen Eintrag an die Kette
 * an oder wirft; ein geworfener Fehler heißt: nichts wurde angehängt.
 */
export interface ReceiptWriter {
  appendDecision(record: DecisionRecord): Promise<ReceiptRef>;
  appendResult(record: ResultRecord): Promise<ReceiptRef>;
}

/** Anschlüsse des Tors an die Außenwelt. */
export interface GatePorts {
  rules: RuleProvider;
  receipts: ReceiptWriter;
  clock: Clock;
}

/** Ergebnis der Ausführung: der Rückgabewert und was im Beleg „Ergebnis“ steht. */
export interface Executed<R> {
  value: R;
  result: ReceiptResult;
}

/** Führt eine erlaubte Aktion aus. Läuft nur mit einer Berechtigung des Tors. */
export type Execute<T extends ActionType, R> = (permit: GatePermit<T>) => Promise<Executed<R>>;

/** Zusätzliche Angaben für den Beleg „Entscheidung“. */
export interface GateRunOptions {
  context?: { digest: HmacDigest };
  undo?: ReceiptUndo;
}

/** Ergebnis von `gate.run` bei erlaubter und ausgeführter Aktion. */
export interface GateRunResult<R> {
  value: R;
  decision: Decision;
  receipts: { decision: ReceiptRef; result: ReceiptRef };
}

export interface Gate {
  /**
   * Der einzige Weg, eine Aktion auszuführen.
   *
   * 1. Aktion und Fakten werden gegen die Verträge geprüft; ungültig → `PaiBotError("eingabe_ungueltig")`,
   *    kein Beleg.
   * 2. Regeln laden (`RuleProvider`), `evaluate`.
   * 3. Beleg „Entscheidung“ schreiben. Scheitert das, wird nichts ausgeführt und der Fehler weitergeworfen.
   * 4. Bei `allow`: Berechtigung ausstellen und `execute(permit)` aufrufen.
   *    - Gelingt es: Beleg „Ergebnis“ mit `result` aus `execute`.
   *    - Wirft es: Beleg „Ergebnis“ mit `status: "cancelled"` (bei `AbortError`) oder
   *      `status: "error"` und dem Code des `PaiBotError` (sonst `intern`); danach wird der
   *      ursprüngliche Fehler weitergeworfen.
   * 5. Bei `deny`, `ask` oder `prepare`: nichts wird ausgeführt; Beleg „Ergebnis“ mit
   *    `status: "denied"` und dem Code aus `OUTCOME_ERROR_CODE`; danach `GateDenied`. In dieser
   *    Fassung gibt es weder Freigabe noch Vorbereitung, `ask` und `prepare` enden deshalb so.
   *
   * Invariante: Jede Aktion, die bis Schritt 3 kommt, hat genau zwei Belege, verbunden über
   * `action.actionId`.
   */
  run<T extends ActionType, R>(
    action: ActionRequest<T>,
    facts: Facts<T>,
    execute: Execute<T, R>,
    options?: GateRunOptions,
  ): Promise<GateRunResult<R>>;
}

/** Baut das Tor mit seinen Anschlüssen. Hält keinen eigenen Zustand außer den Ports. */
export function createGate(ports: GatePorts): Gate {
  return notImplemented("gate.createGate", ports);
}

/**
 * Das Tor hat eine Aktion nicht erlaubt. Code `abgelehnt` (Ergebnis `deny`) oder `regel_fehlt`
 * (`ask`, `prepare`); `text` ist der Grund aus der Entscheidung.
 */
export class GateDenied extends PaiBotError {
  readonly outcome: Exclude<Outcome, "allow">;
  readonly decision: Decision;
  readonly receipts: { decision: ReceiptRef; result: ReceiptRef };

  constructor(decision: Decision, receipts: { decision: ReceiptRef; result: ReceiptRef }) {
    const outcome = decision.outcome === "allow" ? "deny" : decision.outcome;
    super(OUTCOME_ERROR_CODE[outcome], { text: decision.reason });
    this.name = "GateDenied";
    this.outcome = outcome;
    this.decision = decision;
    this.receipts = receipts;
  }
}

export function isGateDenied(value: unknown): value is GateDenied {
  return value instanceof GateDenied;
}
