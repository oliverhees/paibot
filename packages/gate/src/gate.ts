/**
 * PaiBot – das Tor als einziger Weg zur Ausführung: Regeln laden, entscheiden, Beleg schreiben,
 * nur bei Erlaubnis ausführen, Ergebnis belegen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  ACTIONS,
  type ActionRequest,
  type ActionType,
  actionRequestSchema,
  type Facts,
} from "@paibot/shared/aktionen";
import type { ReceiptResult, ReceiptUndo } from "@paibot/shared/belege";
import { type ErrorCode, invalidInput, isPaiBotError, PaiBotError } from "@paibot/shared/fehler";
import { type HmacDigest, sha256DigestSchema, toIsoTime } from "@paibot/shared/grundtypen";
import type { ActionId, ReceiptId } from "@paibot/shared/ids";
import {
  type Decision,
  type GatePermit,
  type Outcome,
  type RuleSnapshot,
  ruleContent,
  ruleDefinitionSchema,
  STANDARD_RULE_VERSIONS,
} from "@paibot/shared/tor";
import { denialCode, evaluate } from "./evaluate";
import { issuePermit, revokePermit } from "./permit-registry";
import { hashRule, type RuleWithSeq, ruleSnapshot } from "./regel-hash";

/**
 * Quelle der Regeln: liefert den Regelstand (in der Datenbank `rules.loadSnapshot`, je Regel mit
 * `hashRule`). Jede Regel trägt ihre Prüfsumme und ihre Nummer im Regel-Protokoll, `stand` ist die
 * höchste Nummer, die die Quelle sah.
 */
export interface RuleSnapshotProvider {
  /** Die Regeln, die gerade gelten (je Regel die neueste Fassung), mit dem Stand. */
  load(): Promise<RuleSnapshot>;
}

/**
 * Frühere Form der Regel-Quelle: nur die Liste der Regeln. Das Tor prüft sie wie einen Regelstand
 * (`verifyRuleSnapshot`), die Entscheidung trägt dann aber weder Prüfsummen noch Stand.
 *
 * @deprecated `RuleSnapshotProvider` (`load`) benutzen.
 */
export interface LegacyRuleProvider {
  listActive(): Promise<readonly RuleWithSeq[]>;
}

/** Quelle der Regeln: `RuleSnapshotProvider` oder (veraltet) `LegacyRuleProvider`. */
export type RuleProvider = RuleSnapshotProvider | LegacyRuleProvider;

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
   * 2. Regelstand laden (`RuleProvider`) und prüfen (`verifyRuleSnapshot`): Stimmt eine Regel
   *    nicht (Inhalt ungültig, Prüfsumme passt nicht, Standard-Regel weicht von ihrer Fassung im
   *    Code ab), endet der Aufruf mit `PaiBotError("intern")` – ohne Beleg, ohne Ausführung.
   *    Danach `evaluate` (Eingabe, Vorbedingungen, Grenzen, Regeln).
   * 3. Beleg „Entscheidung“ schreiben. Scheitert das, wird nichts ausgeführt und der Fehler weitergeworfen.
   * 4. Bei `allow`: Berechtigung ausstellen und `execute(permit)` aufrufen.
   *    - Gelingt es: Beleg „Ergebnis“ mit `result` aus `execute`.
   *    - Wirft es: Beleg „Ergebnis“ mit `status: "cancelled"` (bei `AbortError`) oder
   *      `status: "error"` und dem Code des `PaiBotError` (sonst `intern`); danach wird der
   *      ursprüngliche Fehler weitergeworfen.
   * 5. Bei `deny`, `ask` oder `prepare`: nichts wird ausgeführt; Beleg „Ergebnis“ mit
   *    `status: "denied"` und dem Code aus `denialCode` (bei verletzter Vorbedingung deren
   *    Fehlercode, sonst `OUTCOME_ERROR_CODE`); danach `GateDenied`. In dieser Fassung gibt es
   *    weder Freigabe noch Vorbereitung im Tor, `ask` und `prepare` enden deshalb so; bei `ask`
   *    trägt `GateDenied` den Zustand, mit dem die Lauf-Steuerung auf die Freigabe wartet.
   *
   * Invariante: Jede Aktion, die bis Schritt 3 kommt, hat genau zwei Belege, verbunden über
   * `action.actionId`.
   *
   * Die Berechtigung gilt nur während `execute`; danach erkennt `isGatePermit` sie nicht mehr.
   * Scheitert das Schreiben des Belegs „Ergebnis“, wird dieser Fehler geworfen (das Protokoll ist
   * dann unvollständig und muss auffallen).
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
  const { rules, receipts, clock } = ports;

  return {
    async run<T extends ActionType, R>(
      action: ActionRequest<T>,
      facts: Facts<T>,
      execute: Execute<T, R>,
      options: GateRunOptions = {},
    ): Promise<GateRunResult<R>> {
      // 1. Eingabe prüfen. Ungültig heißt: kein Beleg, keine Ausführung.
      const parsedAction = actionRequestSchema.safeParse(action);
      if (!parsedAction.success) throw invalidInput(parsedAction.error, action);
      const checkedAction = parsedAction.data as ActionRequest<T>;
      const parsedFacts = ACTIONS[checkedAction.type].facts.safeParse(facts);
      if (!parsedFacts.success) throw invalidInput(parsedFacts.error, facts);
      const checkedFacts = parsedFacts.data as Facts<T>;

      // 2. Regelstand laden, prüfen und entscheiden.
      const loaded = await loadRules(rules);
      const decision = evaluate(checkedAction, checkedFacts, loaded);

      // 3. Beleg „Entscheidung“. Scheitert er, wird nichts ausgeführt.
      const decisionRecord: DecisionRecord = {
        action: checkedAction,
        facts: checkedFacts,
        decision,
        time: clock.now(),
      };
      if (options.context !== undefined) decisionRecord.context = options.context;
      if (options.undo !== undefined) decisionRecord.undo = options.undo;
      const decisionRef = await receipts.appendDecision(decisionRecord);

      // 5. Nicht erlaubt: nichts ausführen, Ergebnis „abgelehnt“ belegen.
      if (decision.outcome !== "allow") {
        const resultRef = await receipts.appendResult({
          action: checkedAction,
          result: { status: "denied", code: denialCode(decision) },
          time: clock.now(),
        });
        throw new GateDenied(
          decision,
          { decision: decisionRef, result: resultRef },
          { actionId: checkedAction.actionId, type: checkedAction.type },
        );
      }

      // 4. Erlaubt: mit Berechtigung ausführen und das Ergebnis belegen.
      const permit = issuePermit(
        checkedAction,
        checkedFacts,
        decisionRef.receiptId,
        toIsoTime(clock.now()),
      );
      let executed: Executed<R>;
      try {
        executed = await execute(permit);
      } catch (error) {
        revokePermit(permit);
        await receipts.appendResult({
          action: checkedAction,
          result: failureResult(error),
          time: clock.now(),
        });
        throw error;
      }
      revokePermit(permit);

      const resultRef = await receipts.appendResult({
        action: checkedAction,
        result: executed.result,
        time: clock.now(),
      });
      return {
        value: executed.value,
        decision,
        receipts: { decision: decisionRef, result: resultRef },
      };
    },
  };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/** Beleg-Ergebnis für eine Ausführung, die mit einem Fehler endete. */
function failureResult(error: unknown): ReceiptResult {
  if (isAbortError(error)) return { status: "cancelled" };
  return { status: "error", code: isPaiBotError(error) ? error.code : "intern" };
}

/**
 * Was die Lauf-Steuerung für den gespeicherten Werkzeug-Aufruf braucht, wenn das Tor ihn nicht
 * erlaubt hat (passt zu `repo.toolCalls.recordDecision`):
 * - `ask`: der Aufruf wartet auf die Freigabe des Besitzers, nur der Beleg „Entscheidung“ zählt;
 * - `deny`: der Aufruf ist abgelehnt, mit beiden Belegen, dem Grund für das Modell und dem Code.
 */
export type DeniedToolCall =
  | { outcome: "ask"; actionId: ActionId; decisionReceiptId: ReceiptId }
  | {
      outcome: "deny";
      actionId: ActionId;
      decisionReceiptId: ReceiptId;
      resultReceiptId: ReceiptId;
      output: string;
      errorCode: ErrorCode;
    };

/**
 * Das Tor hat eine Aktion nicht erlaubt. `code` ist `denialCode(decision)`: der Fehlercode einer
 * verletzten Vorbedingung (z. B. `lauf_aktiv`), sonst `abgelehnt` (Ergebnis `deny`) oder
 * `regel_fehlt` (`ask`, `prepare`); `text` ist der Grund aus der Entscheidung.
 *
 * Bei `outcome: "ask"` wartet die Aktion auf eine Freigabe (`waitsForApproval`); `actionId`,
 * `decision` und `receipts` reichen, um den Zustand zu speichern und später fortzusetzen.
 */
export class GateDenied extends PaiBotError {
  readonly outcome: Exclude<Outcome, "allow">;
  readonly decision: Decision;
  readonly receipts: { decision: ReceiptRef; result: ReceiptRef };
  /** Kennung der Aktion (bei Werkzeug-Aufrufen zugleich die Kennung des Aufrufs). */
  readonly actionId: ActionId;
  readonly action: ActionType;

  constructor(
    decision: Decision,
    receipts: { decision: ReceiptRef; result: ReceiptRef },
    action: { actionId: ActionId; type: ActionType },
  ) {
    const outcome = decision.outcome === "allow" ? "deny" : decision.outcome;
    super(denialCode({ ...decision, outcome }), { text: decision.reason });
    this.name = "GateDenied";
    this.outcome = outcome;
    this.decision = decision;
    this.receipts = receipts;
    this.actionId = action.actionId;
    this.action = action.type;
  }

  /** Wartet die Aktion auf eine Freigabe des Besitzers (Regel „fragen“)? */
  get waitsForApproval(): boolean {
    return this.outcome === "ask";
  }

  /** Angaben für den gespeicherten Werkzeug-Aufruf (`repo.toolCalls.recordDecision`). */
  toolCallDecision(): DeniedToolCall {
    const decisionReceiptId = this.receipts.decision.receiptId;
    if (this.waitsForApproval) {
      return { outcome: "ask", actionId: this.actionId, decisionReceiptId };
    }
    return {
      outcome: "deny",
      actionId: this.actionId,
      decisionReceiptId,
      resultReceiptId: this.receipts.result.receiptId,
      output: this.decision.reason,
      errorCode: this.code,
    };
  }
}

export function isGateDenied(value: unknown): value is GateDenied {
  return value instanceof GateDenied;
}

function failClosed(): never {
  throw new PaiBotError("intern");
}

/**
 * Lädt den Regelstand aus der Quelle und prüft ihn. Die frühere Form (`listActive`) wird genauso
 * geprüft, entscheidet aber wie bisher nur mit der Liste: ohne Prüfsummen und ohne Stand.
 */
async function loadRules(provider: RuleProvider): Promise<RuleSnapshot | readonly RuleWithSeq[]> {
  if ("load" in provider && typeof provider.load === "function") {
    return verifyRuleSnapshot(await provider.load());
  }
  const rules = await (provider as LegacyRuleProvider).listActive();
  await verifyRuleSnapshot(await ruleSnapshot(rules));
  return rules.map((rule) => ruleContent(rule));
}

let standardHashes: Promise<ReadonlySet<string>> | undefined;

/** Prüfsummen aller Fassungen der Standard-Regeln aus dem Code. */
function knownStandardHashes(): Promise<ReadonlySet<string>> {
  standardHashes ??= Promise.all(STANDARD_RULE_VERSIONS.map((rule) => hashRule(rule))).then(
    (hashes) => new Set(hashes),
  );
  return standardHashes;
}

/**
 * Prüft einen Regelstand, bevor das Tor damit entscheidet (fail-closed, sonst
 * `PaiBotError("intern")`):
 * - `stand` ist eine positive Ganzzahl, jede Regel hat eine Nummer zwischen 1 und `stand`;
 * - der Inhalt jeder Regel passt zu `ruleDefinitionSchema`;
 * - die mitgelieferte Prüfsumme ist die Prüfsumme des Inhalts (`hashRule`);
 * - jede Regel mit Quelle `standard` gleicht inhaltlich genau einer Fassung aus
 *   `STANDARD_RULE_VERSIONS` – eine in der Datenbank veränderte Standard-Regel zählt nie.
 * Gibt den Regelstand unverändert zurück.
 */
export async function verifyRuleSnapshot(snapshot: RuleSnapshot): Promise<RuleSnapshot> {
  const { stand, rules } = snapshot as { stand: unknown; rules: unknown };
  if (typeof stand !== "number" || !Number.isSafeInteger(stand) || stand < 1) failClosed();
  if (!Array.isArray(rules)) failClosed();
  const known = await knownStandardHashes();
  for (const rule of snapshot.rules) {
    if (!Number.isSafeInteger(rule.seq) || rule.seq < 1 || rule.seq > stand) failClosed();
    if (!sha256DigestSchema.safeParse(rule.hash).success) failClosed();
    const content = ruleDefinitionSchema.safeParse(ruleContent(rule));
    if (!content.success) failClosed();
    const hash = await hashRule(rule);
    if (hash !== rule.hash) failClosed();
    if (rule.source === "standard" && !known.has(hash)) failClosed();
  }
  return snapshot;
}
