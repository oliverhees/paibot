/**
 * PaiBot – Kontext eines Laufs: alles in einem Lesestand laden, Verlauf begrenzen, Fakten der
 * Modell-Anfrage bilden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { contextDigest, type DerivedKey } from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import {
  probeSchleuse,
  providerTargetFacts,
  type SchleuseConnection,
  type SchleuseHealthOptions,
  type SchleuseStatus,
} from "@paibot/llm";
import type { ModelChoice } from "@paibot/llm/modell";
import type { Facts } from "@paibot/shared/aktionen";
import { targetOrigin } from "@paibot/shared/bindung";
import type { MessageId, RunId } from "@paibot/shared/ids";
import type { ToolSpec, TurnMessage } from "@paibot/shared/motor";
import type {
  Bot,
  Conversation,
  Message,
  Model,
  Provider,
  Route,
  Run,
  SchleuseMode,
  Settings,
} from "@paibot/shared/objekte";
import { auftragFakten } from "./auftrag-fakten";
import type { SchrittFakten } from "./nahtstellen";
import type { RunSchleuseStatus } from "./vertrag";

/** Alles, was ein Lauf aus der Datenbank braucht, gelesen in einem Lesestand. */
export interface RunContext {
  run: Run;
  conversation: Conversation;
  bot: Bot;
  settings: Settings;
  /** Modell des Bots; fehlt, wenn keines gewählt ist oder es nicht mehr existiert. */
  model?: Model;
  /** Anbieter des Modells mit verschlüsseltem Schlüssel. */
  provider?: { provider: Provider; apiKeyEnc?: string };
  /**
   * Letzte Nachrichten der Person und End-Antworten (ohne Zwischentexte eines Laufs mit
   * Werkzeugen) bis einschließlich der auslösenden Nachricht, älteste zuerst.
   */
  messages: Message[];
  /** Verbrauchte Token (Eingabe plus Ausgabe) seit Mitternacht in der Zeitzone der Einstellungen. */
  tokensToday: number;
}

/** Ergebnis des Ladens: der Kontext, oder der Lauf ohne Kontext und was fehlt. */
export type LoadedRun =
  | { found: false }
  | { found: true; run: Run; missing: "einrichtung_offen" | "nicht_gefunden" }
  | { found: true; run: Run; context: RunContext };

/**
 * Lädt Lauf, Unterhaltung, Bot, Einstellungen, Modell, Anbieter, Verlauf und Tagesverbrauch in
 * einer Lese-Transaktion mit `repeatable read`: alle Werte stammen aus demselben Stand der
 * Datenbank. Fehlen die Einstellungen (Einrichtung offen) oder Bot, steht das in `missing`.
 */
export async function loadRunContext(
  db: Database,
  runId: RunId,
  options: { now: Date; historyMaxMessages: number },
): Promise<LoadedRun> {
  return db.transaction(
    async (tx): Promise<LoadedRun> => {
      const run = await repo.runs.get(tx, runId);
      if (run === undefined) return { found: false };
      const [conversation, bot, settings] = await Promise.all([
        repo.conversations.get(tx, run.conversationId),
        repo.bots.get(tx, run.botId),
        repo.settings.get(tx),
      ]);
      if (settings === undefined || settings.setupCompletedAt === undefined) {
        return { found: true, run, missing: "einrichtung_offen" };
      }
      // Ein Faden (Unterhaltung eines Teams) startet in dieser Fassung keinen Lauf.
      if (conversation === undefined || bot === undefined || conversation.kind === "faden") {
        return { found: true, run, missing: "nicht_gefunden" };
      }
      const model = bot.modelId === undefined ? undefined : await repo.models.get(tx, bot.modelId);
      const provider =
        model === undefined ? undefined : await repo.providers.getWithKey(tx, model.providerId);
      // Nur Nachrichten der Person und End-Antworten: Zwischentexte zählen weder für die Grenze
      // noch gehen sie an das Modell.
      const recent = await repo.messages.listForConversation(tx, conversation.id, {
        limit: options.historyMaxMessages,
        nurAntworten: true,
      });
      const tokensToday = await repo.messages.tokensSince(
        tx,
        startOfDay(options.now, settings.timezone),
      );
      const context: RunContext = {
        run,
        conversation,
        bot,
        settings,
        ...(model === undefined ? {} : { model }),
        ...(provider === undefined ? {} : { provider }),
        messages: upToTrigger(recent, run.triggerMessageId),
        tokensToday,
      };
      return { found: true, run, context };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/** Nachrichten bis einschließlich der auslösenden; spätere bleiben weg. */
function upToTrigger(messages: Message[], triggerId: string): Message[] {
  const index = messages.findIndex((message) => message.id === triggerId);
  return index === -1 ? messages : messages.slice(0, index + 1);
}

/** Mitternacht des Tages von `now` in der Zeitzone `timezone`, als Zeitpunkt. */
export function startOfDay(now: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const wallAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  const offset = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day")) - offset);
}

function usableAnswer(message: Message): boolean {
  return (
    message.role === "assistant" &&
    message.step === undefined &&
    (message.status === "complete" || message.status === "cancelled") &&
    message.content !== ""
  );
}

/**
 * Je Nachricht der Person höchstens eine Antwort: Wurde eine Antwort neu erzeugt, stehen mehrere
 * Antworten (Fassungen) hintereinander. Es zählt die neueste brauchbare (fertig oder abgebrochen,
 * mit Text); ersetzte Fassungen sieht das Modell nicht. Eine neue Fassung ohne Text ersetzt nichts.
 */
function currentAnswers(messages: readonly Message[]): Message[] {
  const result: Message[] = [];
  let answer: Message | undefined;
  for (const message of messages) {
    if (message.role === "user") {
      if (answer !== undefined) result.push(answer);
      answer = undefined;
      result.push(message);
    } else if (usableAnswer(message)) {
      answer = message;
    }
  }
  if (answer !== undefined) result.push(answer);
  return result;
}

/**
 * Verlauf für das Modell: nur Nachrichten der Person und je Nachricht die geltende End-Antwort des
 * Bots (`currentAnswers`), neueste zuerst gezählt, bis `maxChars` erreicht ist. Älteres wird
 * abgeschnitten, nie zusammengefasst; die auslösende Nachricht bleibt immer drin.
 */
export function buildHistory(messages: readonly Message[], maxChars: number): TurnMessage[] {
  return buildHistoryWithRuns(messages, maxChars).history;
}

/**
 * Wie `buildHistory`, dazu die Läufe der End-Antworten, die tatsächlich im Verlauf stehen (für
 * fremde Inhalte: `untrustedInput`). Fällt eine Antwort aus dem Verlauf, fehlt auch ihr Lauf.
 */
export function buildHistoryWithRuns(
  messages: readonly Message[],
  maxChars: number,
): { history: TurnMessage[]; runIds: RunId[]; messageIds: MessageId[] } {
  const usable = currentAnswers(messages);
  const kept: TurnMessage[] = [];
  const runIds: RunId[] = [];
  const messageIds: MessageId[] = [];
  let chars = 0;
  for (let i = usable.length - 1; i >= 0; i--) {
    const message = usable[i] as Message;
    const next = chars + message.content.length;
    if (kept.length > 0 && next > maxChars) break;
    chars = next;
    if (message.role === "user") {
      kept.unshift({ role: "user", text: message.content });
    } else {
      kept.unshift({ role: "assistant", text: message.content });
      messageIds.unshift(message.id);
      if (message.runId !== undefined) runIds.unshift(message.runId);
    }
  }
  return { history: kept, runIds, messageIds };
}

/**
 * Zeichen einer Eingabe an das Modell: Anweisung, Text aller Nachrichten, jeder Werkzeug-Aufruf
 * und jedes Ergebnis (als JSON) und Name, Beschreibung und JSON-Schema jedes angebotenen
 * Werkzeugs.
 */
export function requestChars(
  system: string,
  history: readonly TurnMessage[],
  tools: readonly ToolSpec[] = [],
): number {
  let chars = system.length;
  for (const entry of history) {
    if (entry.role === "user") chars += entry.text.length;
    else if (entry.role === "assistant") {
      chars += entry.text.length;
      for (const call of entry.toolCalls ?? []) chars += JSON.stringify(call).length;
    } else {
      for (const result of entry.results) chars += JSON.stringify(result).length;
    }
  }
  for (const tool of tools) {
    chars += tool.name.length + tool.description.length + JSON.stringify(tool.inputSchema).length;
  }
  return chars;
}

/** Vorsatz der Kontext-Prüfsumme über die ausgehende Anfrage ohne Werkzeuge. */
export const REQUEST_DIGEST_PREFIX = "pb-anfrage/v1\n";
/** Vorsatz der Kontext-Prüfsumme, wenn Werkzeuge angeboten sind oder Schritte im Verlauf stehen. */
export const REQUEST_DIGEST_PREFIX_TOOLS = "pb-anfrage/v2\n";

/** Ein angebotenes Werkzeug, wie es in die Kontext-Prüfsumme eingeht. */
export interface DigestTool {
  name: string;
  description: string;
  inputSchema: ToolSpec["inputSchema"];
  toolDigest: string;
}

/**
 * Kontext-Prüfsumme über die ausgehende Anfrage (Anweisung, Verlauf, Modell, Weg) für den Beleg
 * „Entscheidung“. Sind Werkzeuge angeboten oder stehen Werkzeug-Aufrufe bzw. Ergebnisse im
 * Verlauf, gilt der Vorsatz v2 mit der Liste der Werkzeuge (Name, Beschreibung, Schema, Abdruck);
 * sonst bleibt die Prüfsumme Byte für Byte wie in v1. Nur die Prüfsumme geht in den Beleg, nie
 * der Inhalt.
 */
export function requestDigest(
  key: DerivedKey<"context-v1">,
  input: {
    system: string;
    history: readonly TurnMessage[];
    modelId: string;
    route: Route;
    tools?: readonly DigestTool[];
  },
): string {
  const tools = input.tools ?? [];
  const withSteps = input.history.some(
    (entry) =>
      entry.role === "tool" || (entry.role === "assistant" && entry.toolCalls !== undefined),
  );
  if (tools.length === 0 && !withSteps) {
    const payload = JSON.stringify({
      history: input.history,
      modelId: input.modelId,
      route: input.route,
      system: input.system,
    });
    return contextDigest(key, `${REQUEST_DIGEST_PREFIX}${payload}`);
  }
  const payload = JSON.stringify({
    history: input.history,
    modelId: input.modelId,
    route: input.route,
    system: input.system,
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      toolDigest: tool.toolDigest,
    })),
  });
  return contextDigest(key, `${REQUEST_DIGEST_PREFIX_TOOLS}${payload}`);
}

/** Wahl von Anbieter und Modell für `resolveModel`, aus demselben Lesestand wie die Fakten. */
export function modelChoice(
  context: RunContext & Required<Pick<RunContext, "model" | "provider">>,
): ModelChoice {
  const { provider, apiKeyEnc } = context.provider;
  return {
    provider: {
      id: provider.id,
      templateKey: provider.templateKey,
      baseUrl: provider.baseUrl,
      region: provider.region,
      ...(apiKeyEnc === undefined ? {} : { apiKeyEnc }),
    },
    model: {
      id: context.model.id,
      slug: context.model.slug,
      displayName: context.model.displayName,
    },
    conversationId: context.conversation.id,
  };
}

/** Weg zum Modell, wie er in den Fakten steht. */
export interface RouteChoice {
  mode: SchleuseMode;
  route: Route;
  schleuseReachable: boolean;
}

/**
 * Bestimmt den Weg: Modus aus Unterhaltung, sonst Standard der Einstellungen. Ist die
 * Datenschleuse gefordert, aber nicht installiert oder nicht erreichbar, bleibt der Weg
 * `schleuse` mit `schleuseReachable: false` – das Tor lehnt dann ab. Einen Rückfall auf `direct`
 * gibt es nicht.
 */
export function chooseRoute(
  conversation: Pick<Conversation, "schleuseMode">,
  settings: Pick<Settings, "schleuseModeDefault">,
  status: SchleuseStatus,
): RouteChoice {
  const mode = conversation.schleuseMode ?? settings.schleuseModeDefault;
  if (mode === "off") return { mode, route: "direct", schleuseReachable: status.reachable };
  return { mode, route: "schleuse", schleuseReachable: status.installed && status.reachable };
}

/**
 * Fakten der Aktion `modell.anfragen`, nur aus der Datenbank und dem Zustand der Datenschleuse,
 * nie aus Inhalten. Das Ziel (`targetOrigin`, `targetDigest`) kommt aus dem gelesenen Anbieter;
 * bei Weg `schleuse` ist der lesbare Origin der der Datenschleuse.
 */
export function modelFacts(input: {
  context: RunContext & Required<Pick<RunContext, "model" | "provider">>;
  route: RouteChoice;
  schleuse: SchleuseConnection | undefined;
  inputChars: number;
  maxInputChars: number;
  /** Ausgabegrenze dieses Schritts (`ausgabeGrenze`). */
  maxOutputTokens: number;
  /** Tagesverbrauch vom Lauf-Anfang plus Verbrauch dieses Laufs (`tokensHeute`). */
  tokensToday: number;
  /** Lauf-Fakten des Schritts (`schrittFakten`). */
  schritt: SchrittFakten;
  /** Ob der Bot jetzt pausiert ist, frisch gelesen je Schritt (`readBotPaused`); fehlt er: `true`. */
  botPaused: boolean;
}): Facts<"modell.anfragen"> {
  const { context, route } = input;
  const { provider } = context.provider;
  const target = providerTargetFacts(provider.id, provider.baseUrl);
  if (route.route === "schleuse" && input.schleuse !== undefined) {
    target.targetOrigin = targetOrigin(input.schleuse.baseUrl);
  }
  return {
    botPaused: input.botPaused,
    botOfConversation: context.run.botId === context.conversation.botId,
    providerId: provider.id,
    providerEnabled: provider.enabled,
    region: provider.region,
    route: route.route,
    requestedMode: route.mode,
    schleuseReachable: route.schleuseReachable,
    inputChars: input.inputChars,
    maxInputChars: input.maxInputChars,
    maxOutputTokens: input.maxOutputTokens,
    botMaxOutputTokens: context.bot.maxOutputTokens,
    tokensToday: input.tokensToday,
    ...(context.settings.dailyTokenBudget === undefined
      ? {}
      : { dailyTokenBudget: context.settings.dailyTokenBudget }),
    killSwitch: context.settings.killSwitch,
    ...target,
    ...input.schritt,
    // Unterhaltung, Zweck und Auftrag (ab Fassung 5). Aufträge gibt es in diesem Stand noch nicht
    // (ihre Tabellen kommen später).
    ...auftragFakten({ conversation: context.conversation }),
  };
}

/**
 * Zustand der Datenschleuse für einen Lauf aus der Prüfung in zwei Stufen (`probeSchleuse`):
 * erreichbar heißt `bereit` – sie läuft und nimmt ihren Schlüssel an. Wirft nie.
 */
export async function readSchleuseStatus(
  connection: SchleuseConnection | undefined,
  options?: SchleuseHealthOptions,
): Promise<RunSchleuseStatus> {
  if (connection === undefined) return { installed: false, reachable: false, state: "aus" };
  const { state } = await probeSchleuse(connection, options);
  return { installed: true, reachable: state === "bereit", state };
}
