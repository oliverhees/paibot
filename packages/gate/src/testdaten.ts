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
  ACTIONS,
  type ActionRequest,
  type ActionType,
  botActor,
  type Facts,
} from "@paibot/shared/aktionen";
import { type ActionId, type BotId, newId } from "@paibot/shared/ids";
import { currentGateFormat } from "./fassungen/index";

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
  toolCallId: newId("action"),
  approvalId: newId("action"),
  deviceId: newId("device"),
  appId: newId("app"),
  toolId: newId("tool"),
};

const TEAM_ID = `tea_${"0".repeat(26)}`;
const ENTWURF_ID = `ent_${"0".repeat(26)}`;
/** Ab Fassung 5: ein Faden, ein Auftrag darin, der Empfänger einer Übergabe und der Zettel. */
const FADEN_ID = newId("conversation");
const AUFTRAG_ID = `auf_${"0".repeat(26)}`;
const ZIEL_BOT_ID = newId("bot");
const ZETTEL_DIGEST = `sha256:${"3d".repeat(32)}`;

const ARGS_DIGEST = `hmac-sha256:${"a7".repeat(32)}`;

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
  "werkzeug.aufrufen": { conversationId: ids.conversationId, runId: ids.runId, botId: ids.botId },
  "werkzeug.freigeben": {
    conversationId: ids.conversationId,
    runId: ids.runId,
    toolCallId: ids.toolCallId,
  },
  "werkzeug.ausfuehren": {
    conversationId: ids.conversationId,
    runId: ids.runId,
    botId: ids.botId,
    toolCallId: ids.toolCallId,
    approvalId: ids.approvalId,
  },
  "geraet.hinzufuegen": { deviceId: ids.deviceId },
  "geraet.entfernen": { deviceId: ids.deviceId },
  "geraet.bestaetigen": { deviceId: ids.deviceId },
  "notaus.umschalten": { installationId: ids.installationId },
  "unterhaltung.exportieren": { conversationId: ids.conversationId },
  "antwort.neu_erzeugen": { conversationId: ids.conversationId, messageId: ids.messageId },
  "app.verbinden": { appId: ids.appId },
  "app.werkzeuge_bestaetigen": { appId: ids.appId, toolId: ids.toolId },
  "app.zugriff_setzen": { appId: ids.appId, botId: ids.botId },
  "app.trennen": { appId: ids.appId },
  "bot.anlegen": { botId: ids.botId },
  "bot.loeschen": { botId: ids.botId },
  "bot.pausieren": { botId: ids.botId },
  "team.anlegen": { teamId: TEAM_ID },
  "team.aendern": { teamId: TEAM_ID },
  "team.loeschen": { teamId: TEAM_ID },
  "bot.team_setzen": { botId: ids.botId, teamId: TEAM_ID },
  "team.entwurf_erstellen": { entwurfId: ENTWURF_ID },
  "team.entwurf_verwerfen": { entwurfId: ENTWURF_ID },
  "team.entwurf_anlegen": { entwurfId: ENTWURF_ID },
  "team.entwurf_zuruecknehmen": { entwurfId: ENTWURF_ID },
  "faden.anlegen": {
    conversationId: ids.conversationId,
    teamId: TEAM_ID,
    zettelDigest: `sha256:${"3d".repeat(32)}`,
  },
  "einstellung.stabschef_setzen": { installationId: ids.installationId },
  "auftrag.uebergeben": {
    conversationId: FADEN_ID,
    runId: ids.runId,
    botId: ids.botId,
    toBotId: ZIEL_BOT_ID,
    auftragId: AUFTRAG_ID,
    zettelDigest: ZETTEL_DIGEST,
  },
  "auftrag.melden": {
    conversationId: FADEN_ID,
    runId: ids.runId,
    botId: ids.botId,
    auftragId: AUFTRAG_ID,
  },
  "auftrag.abbrechen": {
    conversationId: FADEN_ID,
    auftragId: AUFTRAG_ID,
  },
  "auftrag.abnehmen": {
    conversationId: FADEN_ID,
    auftragId: AUFTRAG_ID,
  },
  "auftrag.zurueckgeben": {
    conversationId: FADEN_ID,
    auftragId: AUFTRAG_ID,
    toBotId: ZIEL_BOT_ID,
    zettelDigest: ZETTEL_DIGEST,
  },
  "auftrag.zettel_aendern": {
    conversationId: FADEN_ID,
    auftragId: AUFTRAG_ID,
    zettelDigest: ZETTEL_DIGEST,
  },
  "auftrag.budget_erhoehen": {
    conversationId: FADEN_ID,
    auftragId: AUFTRAG_ID,
  },
};

/**
 * Fakten, bei denen jede Vorbedingung und jede Grenze eingehalten ist. Mit den Standard-Regeln
 * ist damit jede Aktion erlaubt, außer `werkzeug.aufrufen` (R-005 fragt nach). Für
 * `werkzeug.ausfuehren` liegt eine erteilte, unbenutzte Freigabe für denselben Abdruck vor.
 */
const GOOD_FACTS: { [T in ActionType]: Facts<T> } = {
  "einrichtung.abschliessen": { credential: "einrichtungs_code", setupOpen: true },
  "zugang.anmelden": { credential: "passwort", remember: true },
  "zugang.abmelden": { credential: "sitzung" },
  "zugang.alle_abmelden": { credential: "sitzung", sessions: 3 },
  "zugang.passwort_aendern": { credential: "sitzung", currentPasswordVerified: true },
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
    botPaused: false,
    conversationKind: "direkt",
  },
  "modell.anfragen": {
    botPaused: false,
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
    targetOrigin: "https://api.eurouter.ai",
    targetDigest: `sha256:${"5e".repeat(32)}`,
    step: 0,
    maxSteps: 1,
    runTokens: 0,
    stepTokenEstimate: 1227,
    maxRunTokens: 500000,
    toolCount: 0,
    untrustedInput: false,
    trigger: "chat",
    conversationKind: "direkt",
    botHatAuftrag: false,
    auftragArt: "keiner",
    zweck: "chat",
  },
  "lauf.abbrechen": { credential: "sitzung", runActive: true },
  "belege.exportieren": { credential: "sitzung", entries: 42 },
  "werkzeug.aufrufen": {
    botPaused: false,
    auftragArt: "keiner",
    botOfConversation: true,
    runRunning: true,
    toolName: "notiz_lesen",
    toolSource: "eingebaut",
    toolKind: "lesen",
    argsDigest: ARGS_DIGEST,
    killSwitch: false,
    toolKey: "eingebaut/notiz.lesen",
    toolDigest: `sha256:${"0d".repeat(32)}`,
    toolReach: "intern",
    toolForeign: false,
    toolRegistered: true,
    toolOffered: true,
    inputValid: true,
    untrustedInput: false,
    step: 0,
    callIndexInStep: 0,
    maxCallsPerStep: 8,
    callsInRun: 0,
    maxCallsPerRun: 16,
    trigger: "chat",
  },
  "werkzeug.freigeben": {
    credential: "sitzung",
    answer: "erteilen",
    callWaiting: true,
    callExpired: false,
    argsDigest: ARGS_DIGEST,
    waitingArgsDigest: ARGS_DIGEST,
  },
  "werkzeug.ausfuehren": {
    botOfConversation: true,
    runRunning: true,
    toolName: "notiz_lesen",
    toolSource: "eingebaut",
    toolKind: "lesen",
    argsDigest: ARGS_DIGEST,
    killSwitch: false,
    approvalGranted: true,
    approvalConsumed: false,
    approvalExpired: false,
    approvalArgsDigest: ARGS_DIGEST,
  },
  "geraet.hinzufuegen": { credential: "sitzung", kind: "browser" },
  "geraet.entfernen": { credential: "sitzung", deviceActive: true, thisDevice: false },
  "geraet.bestaetigen": { credential: "sitzung", newDevices: 1 },
  // Aufheben mit bestätigtem Passwort: so ist die Vorbedingung V-10 geprüft und erfüllt.
  "notaus.umschalten": {
    credential: "sitzung",
    on: false,
    wasOn: true,
    currentPasswordVerified: true,
  },
  "unterhaltung.exportieren": { credential: "sitzung", conversationExists: true, messages: 4 },
  "antwort.neu_erzeugen": {
    credential: "sitzung",
    conversationExists: true,
    runActive: false,
    answerIsLatest: true,
    killSwitch: false,
  },
  "app.verbinden": {
    credential: "sitzung",
    created: true,
    authKind: "token",
    tokenSet: true,
    targetOrigin: "https://app.beispiel.test",
    targetDigest: `sha256:${"b1".repeat(32)}`,
    addressHttps: true,
    addressPublic: true,
    addressPort443: true,
    addressUserinfo: false,
    addressQuery: false,
    addressFragment: false,
  },
  "app.werkzeuge_bestaetigen": {
    credential: "sitzung",
    toolClass: "lesen",
    toolVersion: 1,
    toolDigest: `sha256:${"c2".repeat(32)}`,
    seenToolDigest: `sha256:${"c2".repeat(32)}`,
    toolStatus: "neu",
    targetDigest: `sha256:${"b1".repeat(32)}`,
  },
  "app.zugriff_setzen": { credential: "sitzung", access: "lesen", previousAccess: "keiner" },
  "app.trennen": { credential: "sitzung", tokenSet: true },
  "bot.anlegen": { credential: "sitzung", botsAfter: 2, maxBots: 50 },
  "bot.loeschen": { credential: "sitzung", isDefaultBot: false, botRunActive: false },
  "bot.pausieren": { credential: "sitzung", paused: true, wasPaused: false },
  "team.anlegen": { credential: "sitzung" },
  "team.aendern": { credential: "sitzung", fields: ["name"], teamExists: true, leadInTeam: true },
  "team.loeschen": { credential: "sitzung", teamExists: true },
  "bot.team_setzen": { credential: "sitzung", teamExists: true },
  "team.entwurf_erstellen": {
    credential: "sitzung",
    herkunft: "vorlage",
    offeneEntwuerfe: 0,
    maxOffeneEntwuerfe: 5,
    entwuerfeHeute: 0,
    maxEntwuerfeProTag: 20,
    killSwitch: false,
  },
  "team.entwurf_verwerfen": { credential: "sitzung", entwurfOffen: true },
  "team.entwurf_anlegen": {
    credential: "sitzung",
    entwurfOffen: true,
    entwurfDigest: `sha256:${"4e".repeat(32)}`,
    seenEntwurfDigest: `sha256:${"4e".repeat(32)}`,
    namesFree: true,
    modelsAvailable: true,
    contactInDraft: true,
    draftBots: 3,
    maxDraftBots: 6,
    botsAfter: 4,
    maxBots: 50,
    killSwitch: false,
  },
  "team.entwurf_zuruecknehmen": { credential: "sitzung", allUnused: true, allUnchanged: true },
  "faden.anlegen": {
    credential: "sitzung",
    teamExists: true,
    zettelChars: 120,
    maxZettelChars: 4000,
  },
  "einstellung.stabschef_setzen": { credential: "sitzung", on: true, wasOn: false },
  "auftrag.uebergeben": {
    geberRolle: "leitung",
    zielRolle: "mitglied",
    art: "uebergabe",
    auftragArt: "wurzel",
    sameTeam: true,
    conversationKind: "faden",
    zusammenarbeit: "leitung_fuehrt",
    stabschefErlaubt: false,
    trigger: "chat",
    untrustedInput: false,
    killSwitch: false,
    toBotPaused: false,
    auftragOffen: true,
    zielHatAuftrag: true,
    zielImPfad: false,
    tiefe: 1,
    maxTiefe: 3,
    baumAuftraege: 1,
    maxBaumAuftraege: 20,
    baumSekunden: 60,
    maxBaumSekunden: 1800,
    uebergabeAntworten: 0,
    maxUebergabeAntworten: 1,
    offeneUnterauftraege: 0,
    maxBreite: 6,
    auftraegeAnZiel: 0,
    maxAuftraegeJeMitglied: 3,
    bittenImAuftrag: 0,
    maxBitten: 1,
    zettelChars: 240,
    maxZettelChars: 2000,
  },
  "auftrag.melden": {
    meldung: "fertig",
    botRolle: "leitung",
    meldungPasstZurRolle: true,
    botHatAuftrag: true,
    conversationKind: "faden",
    auftragArt: "wurzel",
    auftragOffen: true,
    untrustedInput: false,
    killSwitch: false,
    rueckfragenImFaden: 0,
    maxRueckfragen: 3,
  },
  "auftrag.abbrechen": {
    credential: "sitzung",
    auftragOffen: true,
  },
  "auftrag.abnehmen": {
    credential: "sitzung",
    auftragOffen: true,
  },
  "auftrag.zurueckgeben": {
    credential: "sitzung",
    zettelChars: 80,
    maxZettelChars: 2000,
    killSwitch: false,
  },
  "auftrag.zettel_aendern": {
    credential: "sitzung",
    auftragOffen: true,
    auftragGestartet: false,
    zettelChars: 300,
    maxZettelChars: 2000,
  },
  "auftrag.budget_erhoehen": {
    credential: "sitzung",
    auftragOffen: true,
    baumTokens: 200000,
    maxBaumTokens: 200000,
    baumZuschlagTokens: 0,
    zuschlagTokens: 10000,
    zuschlaege: 0,
    maxZuschlaege: 5,
  },
};

/**
 * Aktionen, über die das Tor in der aktuellen Fassung entscheidet (`currentGateFormat().actions`,
 * ohne `werkzeug.freigeben` und `werkzeug.ausfuehren`).
 */
export const DECIDED_ACTIONS = currentGateFormat().actions as readonly ActionType[];
/** Aktionen der aktuellen Fassung, die ein Bot auslöst. */
export const DECIDED_BOT_ACTIONS = DECIDED_ACTIONS.filter((type) => ACTIONS[type].actor === "bot");
/** Aktionen der aktuellen Fassung des Besitzers. */
export const DECIDED_OWNER_ACTIONS = DECIDED_ACTIONS.filter(
  (type) => ACTIONS[type].actor === "besitzer",
);

/** Aktionen, die ein Bot auslöst (aus den Verträgen). */
export const BOT_ACTIONS = ACTION_TYPES.filter((type) => ACTIONS[type].actor === "bot");
/** Aktionen des Besitzers (aus den Verträgen). */
export const OWNER_ACTIONS = ACTION_TYPES.filter((type) => ACTIONS[type].actor === "besitzer");

export function sampleAction<T extends ActionType>(type: T, actionId?: ActionId): ActionRequest<T> {
  const actor = ACTIONS[type].actor === "bot" ? botActor(BOT_ID) : "besitzer";
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
