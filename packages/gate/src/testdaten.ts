/**
 * PaiBot – Beispiel-Aktionen und -Fakten für die Tests des Tors (nur in Tests benutzt).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  ACTION_TYPES,
  type ActionRequest,
  type ActionType,
  botActor,
  type Facts,
} from "@paibot/shared/aktionen";
import { type ActionId, type BotId, newId } from "@paibot/shared/ids";

export const BOT_ID: BotId = newId("bot");

const ids = {
  installationId: newId("installation"),
  ownerId: newId("owner"),
  providerId: newId("provider"),
  botId: BOT_ID,
  modelId: newId("model"),
  conversationId: newId("conversation"),
  messageId: newId("message"),
  runId: newId("run"),
};

const TARGETS: { [T in ActionType]: ActionRequest<T>["target"] } = {
  "einrichtung.abschliessen": { installationId: ids.installationId },
  "zugang.anmelden": { ownerId: ids.ownerId },
  "zugang.abmelden": { ownerId: ids.ownerId },
  "zugang.alle_abmelden": { ownerId: ids.ownerId },
  "zugang.passwort_aendern": { ownerId: ids.ownerId },
  "anbieter.speichern": { providerId: ids.providerId },
  "anbieter.loeschen": { providerId: ids.providerId },
  "modell.waehlen": { botId: ids.botId, modelId: ids.modelId },
  "bot.aendern": { botId: ids.botId },
  "schleuse.umschalten": { conversationId: ids.conversationId },
  "einstellung.aendern": { installationId: ids.installationId },
  "unterhaltung.anlegen": { conversationId: ids.conversationId, botId: ids.botId },
  "unterhaltung.umbenennen": { conversationId: ids.conversationId },
  "unterhaltung.loeschen": { conversationId: ids.conversationId },
  "nachricht.senden": { conversationId: ids.conversationId, messageId: ids.messageId },
  "modell.anfragen": {
    conversationId: ids.conversationId,
    runId: ids.runId,
    botId: ids.botId,
    modelId: ids.modelId,
  },
  "lauf.abbrechen": { conversationId: ids.conversationId, runId: ids.runId },
  "belege.exportieren": { installationId: ids.installationId },
};

/** Fakten, bei denen jede Aktion mit den Standard-Regeln erlaubt ist. */
const GOOD_FACTS: { [T in ActionType]: Facts<T> } = {
  "einrichtung.abschliessen": { credential: "einrichtungs_code" },
  "zugang.anmelden": { credential: "passwort", remember: true },
  "zugang.abmelden": { credential: "sitzung" },
  "zugang.alle_abmelden": { credential: "sitzung", sessions: 3 },
  "zugang.passwort_aendern": { credential: "sitzung" },
  "anbieter.speichern": { credential: "sitzung", created: true, region: "eu", keySet: true },
  "anbieter.loeschen": { credential: "sitzung" },
  "modell.waehlen": { credential: "sitzung" },
  "bot.aendern": { credential: "sitzung", fields: ["name"] },
  "schleuse.umschalten": {
    credential: "sitzung",
    scope: "unterhaltung",
    mode: "on",
    previousMode: "off",
    schleuseInstalled: true,
  },
  "einstellung.aendern": { credential: "sitzung", fields: ["timezone"] },
  "unterhaltung.anlegen": { credential: "sitzung" },
  "unterhaltung.umbenennen": { credential: "sitzung" },
  "unterhaltung.loeschen": { credential: "sitzung" },
  "nachricht.senden": {
    credential: "sitzung",
    inputChars: 120,
    maxInputChars: 32000,
    conversationExists: true,
    runActive: false,
    killSwitch: false,
  },
  "modell.anfragen": {
    botOfConversation: true,
    providerId: ids.providerId,
    providerEnabled: true,
    region: "eu",
    route: "schleuse",
    requestedMode: "on",
    schleuseReachable: true,
    inputChars: 812,
    maxInputChars: 32000,
    maxOutputTokens: 1024,
    botMaxOutputTokens: 2048,
    tokensToday: 5000,
    dailyTokenBudget: 100000,
    killSwitch: false,
  },
  "lauf.abbrechen": { credential: "sitzung", runActive: true },
  "belege.exportieren": { credential: "sitzung", entries: 42 },
};

export function sampleAction<T extends ActionType>(type: T, actionId?: ActionId): ActionRequest<T> {
  const actor = type === "modell.anfragen" ? botActor(BOT_ID) : "besitzer";
  return {
    actionId: actionId ?? newId("action"),
    type,
    actor,
    target: structuredClone(TARGETS[type]),
  } as ActionRequest<T>;
}

export function sampleFacts<T extends ActionType>(type: T): Facts<T> {
  return structuredClone(GOOD_FACTS[type]) as Facts<T>;
}

export { ACTION_TYPES };
