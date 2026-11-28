/**
 * PaiBot – Fassung 5 der Tor-Auswertung „Zusammenarbeit“: Fassung 4 und dazu die Aktionen
 * `auftrag.uebergeben` und `auftrag.melden` (Bot) sowie `auftrag.abbrechen`, `auftrag.abnehmen`,
 * `auftrag.zurueckgeben`, `auftrag.zettel_aendern` und `auftrag.budget_erhoehen` (Besitzer), die
 * Fakten `conversationKind`, `botHatAuftrag`, `auftragArt`, `zweck` und die Fakten des
 * Auftragsbaums an `modell.anfragen`, `auftragArt` an `werkzeug.aufrufen`, `conversationKind` und
 * die Erwähnungen an `nachricht.senden`, die Herkunft `pai` eines Entwurfs, die Vorbedingungen
 * V-39 bis V-41, die Grenzen G-09 bis G-13, G-38, G-39 und G-41 bis G-46 (dazu G-15 an der
 * Übergabe und G-03 für Zettel) und der Deckel D-02.
 * Diese Datei wird nie mehr geändert.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

// Alles hier ist eine Kopie, kein Verweis auf geteilte Schemas und keiner auf Fassung 1 oder 2:
// Ändert sich später ein geteiltes Schema, bleibt Fassung 5 gleich. Importiert werden nur Grund-Schemas,
// die per Definition nie geändert werden (Kennungen, Prüfsummen-Formate), Typen und Texte.
// Die Aktionen und Arten von Akteuren stehen hier als feste Liste, nicht aus den lebenden Verträgen:
// Eine später neu hinzukommende Aktion berührt Fassung 5 weder im Typ noch im Verhalten.

import type { ErrorCode } from "@paibot/shared/fehler";
import { hmacDigestSchema, sha256DigestSchema } from "@paibot/shared/grundtypen";
import { ID_BODY_PATTERN, ID_PREFIX, idSchema } from "@paibot/shared/ids";
import { t } from "@paibot/shared/texte";
import type {
  Decision,
  GateLimitName,
  LimitCheck,
  ListDecision,
  Outcome,
  PreconditionCheck,
  RuleCondition,
  RuleDefinition,
  RuleSnapshot,
  Stage,
  StoredRuleRef,
} from "@paibot/shared/tor";
import { z } from "zod";
import type {
  CapDefinition,
  EvaluatedRule,
  FormatLimitFn,
  FormatPrecondition,
  GateFormatSpec,
} from "./typ";

// ---------------------------------------------------------------------------------------------
// Bausteine (Kopien)

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
/** Summe der Zuschläge eines Baums: höchstens 5 × 10 000 Token (G-46, Zuschlag fest). */
const zuschlagSumme = z.number().int().min(0).max(50000);
const positiveInt = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const credential = z.enum(["sitzung", "passwort", "einrichtungs_code"]);
const schleuseMode = z.enum(["off", "on"]);
const route = z.enum(["direct", "schleuse"]);
const region = z.enum(["eu", "non_eu", "local"]);
const toolName = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const toolSource = z.enum(["eingebaut", "mcp"]);
const toolKind = z.enum(["lesen", "schreiben"]);
const toolServer = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const toolKey = z
  .string()
  .max(140)
  .regex(/^[a-z][a-z0-9]*(\/[a-z0-9][a-z0-9_.-]{0,63}){1,2}$/);
const toolReach = z.enum(["intern", "nach_aussen"]);
const trigger = z.enum(["chat", "automation"]);
const deviceKind = z.enum(["browser"]);
const origin = z
  .string()
  .max(200)
  .regex(/^https?:\/\/[^/?#@\s]+$/);
const botFields = z.enum(["name", "instructions", "avatarShape", "color", "maxOutputTokens"]);
const settingsFields = z.enum(["timezone", "historyTokenLimit", "dailyTokenBudget"]);

const conversationId = idSchema("conversation");
const messageId = idSchema("message");
const runId = idSchema("run");
const botId = idSchema("bot");
const providerId = idSchema("provider");
const modelId = idSchema("model");
const ownerId = idSchema("owner");
const installationId = idSchema("installation");
const actionId = idSchema("action");
const deviceId = idSchema("device");
const appId = idSchema("app");
const appToolId = idSchema("tool");
const appOrigin = z
  .string()
  .max(200)
  .regex(/^https:\/\/[^/?#@\s]+$/);
const appAuthKind = z.enum(["keine", "token"]);
const appAccess = z.enum(["keiner", "lesen"]);
const appToolClass = z.enum(["lesen", "schreiben", "gesperrt"]);
const appToolStatus = z.enum(["neu", "bestaetigt", "geaendert", "entfernt", "gesperrt"]);
const teamId = z.string().regex(new RegExp(`^tea_${ID_BODY_PATTERN}$`));
const entwurfId = z.string().regex(new RegExp(`^ent_${ID_BODY_PATTERN}$`));
const teamFields = z.enum(["name", "lead", "collaboration", "acceptance"]);
const entwurfHerkunft = z.enum(["vorlage", "pai"]);
const auftragId = z.string().regex(new RegExp(`^auf_${ID_BODY_PATTERN}$`));
const auftragArt = z.enum([
  "keiner",
  "wurzel",
  "uebergabe",
  "bitte",
  "rueckkehr",
  "faecher",
  "sammeln",
  "rueckmeldung",
  "rueckgabe",
]);
const conversationKind = z.enum(["direkt", "faden"]);
const botRolle = z.enum(["stabschef", "leitung", "mitglied", "keine"]);
const zielRolle = z.enum(["stabschef", "leitung", "mitglied", "selbst", "ohne_team"]);
const uebergabeArt = z.enum(["team", "uebergabe", "bitte", "rueckgabe"]);
const zusammenarbeit = z.enum(["aus", "leitung_fuehrt"]);
const meldung = z.enum(["fertig", "frage"]);
const zweck = z.enum(["chat", "team_entwurf"]);

/** Arten von Akteuren der Fassung 5, als feste Liste. */
type ActorKind = "besitzer" | "bot";

const ACTOR_PATTERN = new RegExp(`^(besitzer|bot:${ID_PREFIX.bot}_${ID_BODY_PATTERN})$`);
const ACTOR_FACT = "akteur";

const ownerFacts = { credential, device: deviceId.optional() };

function action<K extends ActorKind>(actor: K, target: z.ZodRawShape, facts: z.ZodRawShape) {
  return { actor, target: z.strictObject(target), facts: z.strictObject(facts) as z.ZodType };
}

const toolFacts = {
  toolName,
  toolSource,
  toolServer: toolServer.optional(),
  toolKind,
};

/** Pflicht-Fakten jeder Aktion, über die ein Werkzeug-Wunsch entschieden wird. */
const toolGateFacts = {
  ...toolFacts,
  toolKey,
  toolDigest: sha256DigestSchema,
  toolReach,
  toolForeign: z.boolean(),
  toolRegistered: z.boolean(),
  toolOffered: z.boolean(),
  inputValid: z.boolean(),
  untrustedInput: z.boolean(),
  step: count,
  callIndexInStep: count,
  maxCallsPerStep: positiveInt,
  callsInRun: count,
  maxCallsPerRun: positiveInt,
  killSwitch: z.boolean(),
  trigger,
};

/**
 * Fakten eines Aufrufs eines App-Werkzeugs: genau bei Quelle `mcp` alle gesetzt, sonst keiner.
 * Sie kommen aus der Datenbank bzw. der Steuerung des Laufs, nie vom Server der App oder vom Modell.
 */
const appToolFacts = {
  appId: appId.optional(),
  appToolId: appToolId.optional(),
  toolVersion: positiveInt.optional(),
  toolStatus: appToolStatus.optional(),
  appAccess: appAccess.optional(),
  targetDigest: sha256DigestSchema.optional(),
  confirmedToolDigest: sha256DigestSchema.optional(),
  confirmedTargetDigest: sha256DigestSchema.optional(),
  stepAppId: appId.optional(),
};
const APP_TOOL_FACT_NAMES = Object.keys(appToolFacts);

/**
 * Passen Quelle, Server und Fakten der App zusammen? Server genau bei Quelle `mcp`; bei `mcp` alle
 * Fakten der App, Reichweite `nach_aussen`, fremde Inhalte und eine Kennung `mcp/<server>/…`;
 * sonst kein Fakt der App und keine Kennung, die mit `mcp/` beginnt.
 */
function toolSourceConsistent(value: unknown): boolean {
  const record = value as Record<string, unknown>;
  const mcp = record.toolSource === "mcp";
  if (mcp !== (record.toolServer !== undefined)) return false;
  const present = APP_TOOL_FACT_NAMES.filter((name) => record[name] !== undefined).length;
  const key = record.toolKey;
  if (mcp) {
    return (
      present === APP_TOOL_FACT_NAMES.length &&
      record.toolReach === "nach_aussen" &&
      record.toolForeign === true &&
      typeof key === "string" &&
      key.startsWith(`mcp/${String(record.toolServer)}/`)
    );
  }
  return present === 0 && !(typeof key === "string" && key.startsWith("mcp/"));
}

function toolAction(target: z.ZodRawShape, facts: z.ZodRawShape) {
  return {
    actor: "bot" as const,
    target: z.strictObject(target),
    facts: z.strictObject(facts).refine(toolSourceConsistent, {
      path: ["toolSource"],
    }) as z.ZodType,
  };
}

/** Prüfungen der Adresse beim Verbinden (Vorbedingung V-19), gerechnet vom Server. */
const addressFacts = {
  addressHttps: z.boolean(),
  addressPublic: z.boolean(),
  addressPort443: z.boolean(),
  addressUserinfo: z.boolean(),
  addressQuery: z.boolean(),
  addressFragment: z.boolean(),
};

/** Ein Token ist genau bei Anmeldung `token` hinterlegt. */
function withTokenRule<T extends { facts: z.ZodType }>(spec: T): T {
  return {
    ...spec,
    facts: spec.facts.refine(
      (value) =>
        ((value as { authKind?: unknown }).authKind === "token") ===
        ((value as { tokenSet?: unknown }).tokenSet === true),
      { path: ["tokenSet"] },
    ) as z.ZodType,
  };
}

/** Aktionen der Fassung 2, als feste Liste (ohne `werkzeug.freigeben` und `werkzeug.ausfuehren`). */
type Action2 =
  | "einrichtung.abschliessen"
  | "zugang.anmelden"
  | "zugang.abmelden"
  | "zugang.alle_abmelden"
  | "zugang.passwort_aendern"
  | "anbieter.speichern"
  | "anbieter.loeschen"
  | "modell.waehlen"
  | "bot.aendern"
  | "schleuse.umschalten"
  | "einstellung.aendern"
  | "unterhaltung.anlegen"
  | "unterhaltung.umbenennen"
  | "unterhaltung.loeschen"
  | "nachricht.senden"
  | "modell.anfragen"
  | "lauf.abbrechen"
  | "belege.exportieren"
  | "werkzeug.aufrufen"
  | "geraet.hinzufuegen"
  | "geraet.entfernen"
  | "geraet.bestaetigen"
  | "notaus.umschalten"
  | "unterhaltung.exportieren"
  | "antwort.neu_erzeugen";

/** Neue Aktionen der Fassung 3. */
type AppAction3 =
  | "app.verbinden"
  | "app.werkzeuge_bestaetigen"
  | "app.zugriff_setzen"
  | "app.trennen";

/** Neue Aktionen der Fassung 4 (alle vom Besitzer). */
type TeamAction4 =
  | "bot.anlegen"
  | "bot.loeschen"
  | "bot.pausieren"
  | "team.anlegen"
  | "team.aendern"
  | "team.loeschen"
  | "bot.team_setzen"
  | "team.entwurf_erstellen"
  | "team.entwurf_verwerfen"
  | "team.entwurf_anlegen"
  | "team.entwurf_zuruecknehmen"
  | "faden.anlegen"
  | "einstellung.stabschef_setzen";

/** Neue Aktionen der Fassung 5: zwei für Bots, fünf für den Besitzer. */
type AuftragAction5 =
  | "auftrag.uebergeben"
  | "auftrag.melden"
  | "auftrag.abbrechen"
  | "auftrag.abnehmen"
  | "auftrag.zurueckgeben"
  | "auftrag.zettel_aendern"
  | "auftrag.budget_erhoehen";

/** Aktionen der Fassung 5. */
type Action5 = Action2 | AppAction3 | TeamAction4 | AuftragAction5;

/**
 * Widersprüchliche Fakten sind ungültig (an `modell.anfragen` und `auftrag.melden`):
 * `botHatAuftrag = true` mit `auftragArt = keiner` (ein gültiger Auftrag hat immer eine Art, sonst
 * entfielen G-11 und G-12, während R-016 bzw. R-018 erlaubt); im Faden `auftragArt = keiner` (jeder
 * Lauf im Faden gehört zu dessen Baum) oder `botOfConversation = true` (ein Faden hat keinen
 * eigenen Bot).
 */
function auftragStimmig(value: unknown): boolean {
  const record = value as Record<string, unknown>;
  if (record.botHatAuftrag === true && record.auftragArt === "keiner") return false;
  if (record.conversationKind === "faden" && record.auftragArt === "keiner") return false;
  if (record.conversationKind === "faden" && record.botOfConversation === true) return false;
  return true;
}

function withAuftragRule<T extends { facts: z.ZodType }>(spec: T): T {
  return {
    ...spec,
    facts: spec.facts.refine(auftragStimmig, { path: ["auftragArt"] }) as z.ZodType,
  };
}

/** Passt die Meldung zur Rolle? `fertig` nur die Leitung, `frage` Leitung oder Mitglied. */
function meldungStimmig(value: unknown): boolean {
  const record = value as Record<string, unknown>;
  const passt =
    record.meldung === "fertig"
      ? record.botRolle === "leitung"
      : record.botRolle === "leitung" || record.botRolle === "mitglied";
  return record.meldungPasstZurRolle === passt;
}

const ACTIONS_5 = {
  "einrichtung.abschliessen": action(
    "besitzer",
    { installationId },
    { ...ownerFacts, setupOpen: z.boolean() },
  ),
  "zugang.anmelden": action("besitzer", { ownerId }, { ...ownerFacts, remember: z.boolean() }),
  "zugang.abmelden": action("besitzer", { ownerId }, ownerFacts),
  "zugang.alle_abmelden": action("besitzer", { ownerId }, { ...ownerFacts, sessions: count }),
  "zugang.passwort_aendern": action(
    "besitzer",
    { ownerId },
    { ...ownerFacts, currentPasswordVerified: z.boolean() },
  ),
  "anbieter.speichern": action(
    "besitzer",
    { providerId },
    {
      ...ownerFacts,
      created: z.boolean(),
      region,
      keySet: z.boolean(),
      managementKeySet: z.boolean().optional(),
    },
  ),
  "anbieter.loeschen": action("besitzer", { providerId }, ownerFacts),
  "modell.waehlen": action("besitzer", { botId, modelId }, ownerFacts),
  "bot.aendern": action(
    "besitzer",
    { botId },
    { ...ownerFacts, fields: z.array(botFields).min(1) },
  ),
  "schleuse.umschalten": action(
    "besitzer",
    { conversationId: conversationId.optional() },
    {
      ...ownerFacts,
      scope: z.enum(["unterhaltung", "standard"]),
      mode: schleuseMode,
      previousMode: schleuseMode.optional(),
      schleuseInstalled: z.boolean(),
    },
  ),
  "einstellung.aendern": action(
    "besitzer",
    { installationId },
    { ...ownerFacts, fields: z.array(settingsFields).min(1) },
  ),
  "unterhaltung.anlegen": action("besitzer", { conversationId, botId }, ownerFacts),
  "unterhaltung.umbenennen": action("besitzer", { conversationId }, ownerFacts),
  "unterhaltung.loeschen": action("besitzer", { conversationId }, ownerFacts),
  "nachricht.senden": action(
    "besitzer",
    { conversationId, messageId },
    {
      ...ownerFacts,
      inputChars: count,
      maxInputChars: positiveInt,
      conversationExists: z.boolean(),
      runActive: z.boolean(),
      killSwitch: z.boolean(),
      botPaused: z.boolean(),
      conversationKind,
      erwaehnungen: count.optional(),
      maxErwaehnungen: positiveInt.optional(),
    },
  ),
  "modell.anfragen": withAuftragRule(
    action(
      "bot",
      { conversationId, runId, botId, modelId },
      {
        botOfConversation: z.boolean(),
        providerId,
        providerEnabled: z.boolean(),
        region,
        route,
        requestedMode: schleuseMode,
        schleuseReachable: z.boolean(),
        inputChars: count,
        maxInputChars: positiveInt,
        maxOutputTokens: positiveInt,
        botMaxOutputTokens: positiveInt,
        tokensToday: count,
        dailyTokenBudget: positiveInt.optional(),
        killSwitch: z.boolean(),
        targetOrigin: origin,
        targetDigest: sha256DigestSchema,
        step: count,
        maxSteps: positiveInt,
        runTokens: count,
        stepTokenEstimate: count,
        maxRunTokens: positiveInt,
        toolCount: count,
        untrustedInput: z.boolean(),
        trigger,
        botPaused: z.boolean(),
        conversationKind,
        botHatAuftrag: z.boolean(),
        auftragArt,
        zweck,
        baumTokens: count.optional(),
        maxBaumTokens: positiveInt.optional(),
        baumZuschlagTokens: zuschlagSumme.optional(),
        baumSekunden: count.optional(),
        maxBaumSekunden: positiveInt.optional(),
      },
    ),
  ),
  "lauf.abbrechen": action(
    "besitzer",
    { conversationId, runId },
    { ...ownerFacts, runActive: z.boolean() },
  ),
  "belege.exportieren": action("besitzer", { installationId }, { ...ownerFacts, entries: count }),
  "werkzeug.aufrufen": toolAction(
    { conversationId, runId, botId },
    {
      ...toolGateFacts,
      botOfConversation: z.boolean(),
      runRunning: z.boolean(),
      argsDigest: hmacDigestSchema,
      ...appToolFacts,
      botPaused: z.boolean(),
      auftragArt,
    },
  ),
  "geraet.hinzufuegen": action("besitzer", { deviceId }, { ...ownerFacts, kind: deviceKind }),
  "geraet.entfernen": action(
    "besitzer",
    { deviceId },
    { ...ownerFacts, deviceActive: z.boolean(), thisDevice: z.boolean() },
  ),
  "geraet.bestaetigen": action("besitzer", { deviceId }, { ...ownerFacts, newDevices: count }),
  "notaus.umschalten": action(
    "besitzer",
    { installationId },
    { ...ownerFacts, on: z.boolean(), wasOn: z.boolean(), currentPasswordVerified: z.boolean() },
  ),
  "unterhaltung.exportieren": action(
    "besitzer",
    { conversationId },
    { ...ownerFacts, conversationExists: z.boolean(), messages: count },
  ),
  "antwort.neu_erzeugen": action(
    "besitzer",
    { conversationId, messageId },
    {
      ...ownerFacts,
      conversationExists: z.boolean(),
      runActive: z.boolean(),
      answerIsLatest: z.boolean(),
      killSwitch: z.boolean(),
    },
  ),
  "app.verbinden": withTokenRule(
    action(
      "besitzer",
      { appId },
      {
        ...ownerFacts,
        created: z.boolean(),
        authKind: appAuthKind,
        tokenSet: z.boolean(),
        targetOrigin: appOrigin,
        targetDigest: sha256DigestSchema,
        ...addressFacts,
      },
    ),
  ),
  "app.werkzeuge_bestaetigen": action(
    "besitzer",
    { appId, toolId: appToolId },
    {
      ...ownerFacts,
      toolClass: appToolClass,
      toolVersion: positiveInt,
      toolDigest: sha256DigestSchema,
      seenToolDigest: sha256DigestSchema,
      toolStatus: appToolStatus,
      targetDigest: sha256DigestSchema,
    },
  ),
  "app.zugriff_setzen": action(
    "besitzer",
    { appId, botId },
    { ...ownerFacts, access: appAccess, previousAccess: appAccess },
  ),
  "app.trennen": action("besitzer", { appId }, { ...ownerFacts, tokenSet: z.boolean() }),
  "bot.anlegen": action(
    "besitzer",
    { botId },
    { ...ownerFacts, botsAfter: count, maxBots: positiveInt },
  ),
  "bot.loeschen": action(
    "besitzer",
    { botId },
    { ...ownerFacts, isDefaultBot: z.boolean(), botRunActive: z.boolean() },
  ),
  "bot.pausieren": action(
    "besitzer",
    { botId },
    { ...ownerFacts, paused: z.boolean(), wasPaused: z.boolean() },
  ),
  "team.anlegen": action("besitzer", { teamId }, { ...ownerFacts }),
  "team.aendern": action(
    "besitzer",
    { teamId },
    {
      ...ownerFacts,
      fields: z.array(teamFields).min(1),
      teamExists: z.boolean(),
      leadInTeam: z.boolean(),
    },
  ),
  "team.loeschen": action("besitzer", { teamId }, { ...ownerFacts, teamExists: z.boolean() }),
  "bot.team_setzen": action(
    "besitzer",
    { botId, teamId: teamId.optional() },
    { ...ownerFacts, teamExists: z.boolean() },
  ),
  "team.entwurf_erstellen": action(
    "besitzer",
    { entwurfId },
    {
      ...ownerFacts,
      herkunft: entwurfHerkunft,
      offeneEntwuerfe: count,
      maxOffeneEntwuerfe: positiveInt,
      entwuerfeHeute: count,
      maxEntwuerfeProTag: positiveInt,
      killSwitch: z.boolean(),
    },
  ),
  "team.entwurf_verwerfen": action(
    "besitzer",
    { entwurfId },
    { ...ownerFacts, entwurfOffen: z.boolean() },
  ),
  "team.entwurf_anlegen": action(
    "besitzer",
    { entwurfId },
    {
      ...ownerFacts,
      entwurfOffen: z.boolean(),
      entwurfDigest: sha256DigestSchema,
      seenEntwurfDigest: sha256DigestSchema,
      namesFree: z.boolean(),
      modelsAvailable: z.boolean(),
      contactInDraft: z.boolean(),
      draftBots: count,
      maxDraftBots: positiveInt,
      botsAfter: count,
      maxBots: positiveInt,
      killSwitch: z.boolean(),
    },
  ),
  "team.entwurf_zuruecknehmen": action(
    "besitzer",
    { entwurfId },
    { ...ownerFacts, allUnused: z.boolean(), allUnchanged: z.boolean() },
  ),
  "faden.anlegen": action(
    "besitzer",
    { conversationId, teamId, zettelDigest: sha256DigestSchema },
    { ...ownerFacts, teamExists: z.boolean(), zettelChars: count, maxZettelChars: positiveInt },
  ),
  "einstellung.stabschef_setzen": action(
    "besitzer",
    { installationId },
    { ...ownerFacts, on: z.boolean(), wasOn: z.boolean() },
  ),
  "auftrag.uebergeben": action(
    "bot",
    {
      conversationId,
      runId,
      botId,
      toBotId: botId,
      auftragId,
      zettelDigest: sha256DigestSchema,
      teamId: teamId.optional(),
    },
    {
      geberRolle: botRolle,
      zielRolle,
      art: uebergabeArt,
      auftragArt,
      sameTeam: z.boolean(),
      conversationKind,
      zusammenarbeit,
      stabschefErlaubt: z.boolean(),
      trigger,
      untrustedInput: z.boolean(),
      killSwitch: z.boolean(),
      toBotPaused: z.boolean(),
      auftragOffen: z.boolean(),
      zielHatAuftrag: z.boolean(),
      zielImPfad: z.boolean(),
      tiefe: count,
      maxTiefe: positiveInt,
      baumAuftraege: count,
      maxBaumAuftraege: positiveInt,
      baumSekunden: count,
      maxBaumSekunden: positiveInt,
      uebergabeAntworten: count,
      maxUebergabeAntworten: positiveInt,
      offeneUnterauftraege: count,
      maxBreite: positiveInt,
      auftraegeAnZiel: count,
      maxAuftraegeJeMitglied: positiveInt,
      bittenImAuftrag: count,
      maxBitten: positiveInt,
      zettelChars: count,
      maxZettelChars: positiveInt,
    },
  ),
  "auftrag.melden": {
    actor: "bot" as const,
    target: z.strictObject({ conversationId, runId, botId, auftragId }),
    facts: z
      .strictObject({
        meldung,
        botRolle,
        meldungPasstZurRolle: z.boolean(),
        botHatAuftrag: z.boolean(),
        conversationKind,
        auftragArt,
        auftragOffen: z.boolean(),
        untrustedInput: z.boolean(),
        killSwitch: z.boolean(),
        rueckfragenImFaden: count,
        maxRueckfragen: positiveInt,
      })
      .refine(meldungStimmig, { path: ["meldungPasstZurRolle"] })
      .refine(auftragStimmig, { path: ["auftragArt"] }) as z.ZodType,
  },
  "auftrag.abbrechen": action(
    "besitzer",
    { conversationId, auftragId },
    { ...ownerFacts, auftragOffen: z.boolean() },
  ),
  "auftrag.abnehmen": action(
    "besitzer",
    { conversationId, auftragId },
    { ...ownerFacts, auftragOffen: z.boolean() },
  ),
  "auftrag.zurueckgeben": action(
    "besitzer",
    { conversationId, auftragId, toBotId: botId, zettelDigest: sha256DigestSchema },
    {
      ...ownerFacts,
      zettelChars: count,
      maxZettelChars: positiveInt,
      killSwitch: z.boolean(),
    },
  ),
  "auftrag.zettel_aendern": action(
    "besitzer",
    { conversationId, auftragId, zettelDigest: sha256DigestSchema },
    {
      ...ownerFacts,
      auftragOffen: z.boolean(),
      auftragGestartet: z.boolean(),
      zettelChars: count,
      maxZettelChars: positiveInt,
    },
  ),
  "auftrag.budget_erhoehen": action(
    "besitzer",
    { conversationId, auftragId },
    {
      ...ownerFacts,
      auftragOffen: z.boolean(),
      baumTokens: count,
      maxBaumTokens: positiveInt,
      baumZuschlagTokens: zuschlagSumme,
      zuschlagTokens: z.literal(10000),
      zuschlaege: count,
      maxZuschlaege: z.literal(5),
    },
  ),
} as const satisfies Record<Action5, unknown>;

type Spec5Action = (typeof ACTIONS_5)[keyof typeof ACTIONS_5];

const ACTION_TYPES_5 = Object.keys(ACTIONS_5) as Action5[];

/** Fakten, die die Aktion laut Fassung 5 kennt (Schlüssel des Fakten-Schemas). */
const FACT_NAMES_5: Readonly<Record<string, ReadonlySet<string>>> = Object.fromEntries(
  ACTION_TYPES_5.map((type) => {
    const facts = (ACTIONS_5[type] as Spec5Action).facts as unknown as {
      shape?: Record<string, unknown>;
      def?: { schema?: { shape?: Record<string, unknown> } };
    };
    const shape = facts.shape ?? facts.def?.schema?.shape ?? {};
    return [type, new Set(Object.keys(shape))];
  }),
);

function hasAction(type: unknown): type is Action5 {
  return typeof type === "string" && Object.hasOwn(ACTIONS_5, type);
}

const requestVariants = ACTION_TYPES_5.map((type) =>
  z.strictObject({
    actionId,
    type: z.literal(type),
    actor: z.custom<string>((value) => typeof value === "string" && ACTOR_PATTERN.test(value)),
    target: (ACTIONS_5[type] as Spec5Action).target,
  }),
);

const REQUEST_5 = z
  .discriminatedUnion("type", requestVariants as [never, ...never[]])
  .refine(
    (request: { type: Action5; actor: string }) =>
      actorKindOf(request.actor) === (ACTIONS_5[request.type] as Spec5Action).actor,
    { path: ["actor"] },
  ) as unknown as z.ZodType;

function actorKindOf(actor: string): ActorKind {
  return actor === "besitzer" ? "besitzer" : "bot";
}

// ---------------------------------------------------------------------------------------------
// Vorbedingungen, Grenzen, Deckel, Fehlercodes, Felder im Beleg (Kopien)

const TOOL_GATE_ACTIONS_5 = ["werkzeug.aufrufen"] as const;

const LIMITS_BY_ID_5 = {
  "G-01": "schleuse_gefordert",
  "G-02": "anbieter_region",
  "G-03": "laenge",
  "G-04": "tagesbudget",
  "G-05": "not_aus",
  "G-16": "lauf_schritte",
  "G-17": "lauf_aufrufe",
  "G-18": "lauf_token",
  "G-06": "app_zugriff",
  "G-07": "werkzeug_bestaetigt",
  "G-08": "app_ziel",
  "G-40": "eine_app_je_schritt",
  "G-15": "bot_bereit",
  "G-32": "entwurf_umfang",
  "G-33": "bots_gesamt",
  "G-34": "entwuerfe_je_tag",
  "G-09": "auftrag_tiefe",
  "G-10": "auftrag_anzahl",
  "G-11": "auftrag_budget",
  "G-12": "auftrag_zeit",
  "G-13": "kein_kreis",
  "G-38": "erwaehnungen_je_nachricht",
  "G-39": "uebergaben_je_lauf",
  "G-41": "auftrag_breite",
  "G-42": "werkzeug_im_auftrag",
  "G-43": "auftraege_je_mitglied",
  "G-44": "rueckfragen_je_faden",
  "G-45": "bitten_je_auftrag",
  "G-46": "zuschlaege_je_baum",
} as const;
// Die Namen ab G-06 (außer G-16 bis G-18) kennen die heutigen Verträge noch nicht
// (`GateLimitName`).
const LIMIT_ORDER_5 = Object.values(LIMITS_BY_ID_5) as unknown as GateLimitName[];
const LIMIT_ID_BY_NAME_5 = Object.fromEntries(
  Object.entries(LIMITS_BY_ID_5).map(([id, name]) => [name, id]),
) as Record<string, string>;
/** Grenzen der Läufe; eine verletzte ergibt den Fehlercode `limit_erreicht`. */
const RUN_LIMITS_5: readonly string[] = ["lauf_schritte", "lauf_aufrufe", "lauf_token"];

const PRECONDITIONS_5: Readonly<Record<string, FormatPrecondition>> = {
  "V-01": {
    name: "unterhaltung_vorhanden",
    actions: ["nachricht.senden", "unterhaltung.exportieren", "antwort.neu_erzeugen"],
    require: [{ fact: "conversationExists", op: "eq", value: true }],
    errorCode: "nicht_gefunden",
  },
  "V-02": {
    name: "kein_lauf_aktiv",
    actions: ["nachricht.senden", "antwort.neu_erzeugen"],
    require: [{ fact: "runActive", op: "eq", value: false }],
    errorCode: "lauf_aktiv",
  },
  "V-03": {
    name: "lauf_aktiv",
    actions: ["lauf.abbrechen"],
    require: [{ fact: "runActive", op: "eq", value: true }],
    errorCode: "nicht_gefunden",
  },
  "V-04": {
    name: "schleuse_eingerichtet",
    actions: ["schleuse.umschalten"],
    when: [{ fact: "mode", op: "eq", value: "on" }],
    require: [{ fact: "schleuseInstalled", op: "eq", value: true }],
    errorCode: "schleuse_nicht_installiert",
  },
  "V-05": {
    name: "lauf_laeuft",
    actions: ["werkzeug.aufrufen", "werkzeug.ausfuehren"],
    require: [{ fact: "runRunning", op: "eq", value: true }],
    errorCode: "nicht_gefunden",
  },
  "V-06": {
    name: "passwort_bestaetigt",
    actions: ["zugang.passwort_aendern"],
    require: [{ fact: "currentPasswordVerified", op: "eq", value: true }],
    errorCode: "passwort_falsch",
  },
  "V-07": {
    name: "einrichtung_offen",
    actions: ["einrichtung.abschliessen"],
    require: [{ fact: "setupOpen", op: "eq", value: true }],
    errorCode: "einrichtung_fertig",
  },
  "V-08": {
    name: "freigabe_wartet",
    actions: ["werkzeug.freigeben"],
    require: [
      { fact: "callWaiting", op: "eq", value: true },
      { fact: "callExpired", op: "eq", value: false },
    ],
    errorCode: "nicht_gefunden",
  },
  "V-09": {
    name: "freigabe_passt",
    actions: ["werkzeug.freigeben"],
    require: [{ fact: "argsDigest", op: "eq", value: { fact: "waitingArgsDigest" } }],
    errorCode: "abgelehnt",
  },
  "V-10": {
    name: "notaus_aufheben_bestaetigt",
    actions: ["notaus.umschalten"],
    when: [{ fact: "on", op: "eq", value: false }],
    require: [{ fact: "currentPasswordVerified", op: "eq", value: true }],
    errorCode: "passwort_falsch",
  },
  "V-11": {
    name: "antwort_ist_letzte",
    actions: ["antwort.neu_erzeugen"],
    require: [{ fact: "answerIsLatest", op: "eq", value: true }],
    errorCode: "nicht_gefunden",
  },
  "V-12": {
    name: "werkzeug_angeboten",
    actions: TOOL_GATE_ACTIONS_5,
    require: [
      { fact: "toolRegistered", op: "eq", value: true },
      { fact: "toolOffered", op: "eq", value: true },
    ],
    errorCode: "werkzeug_unbekannt",
  },
  "V-13": {
    name: "eingabe_gueltig",
    actions: TOOL_GATE_ACTIONS_5,
    require: [{ fact: "inputValid", op: "eq", value: true }],
    errorCode: "werkzeug_eingabe_ungueltig",
  },
  "V-14": {
    name: "aufrufe_je_schritt",
    actions: TOOL_GATE_ACTIONS_5,
    require: [{ fact: "callIndexInStep", op: "lt", value: { fact: "maxCallsPerStep" } }],
    errorCode: "limit_erreicht",
  },
  "V-19": {
    name: "app_adresse_erlaubt",
    actions: ["app.verbinden"],
    require: [
      { fact: "addressHttps", op: "eq", value: true },
      { fact: "addressPublic", op: "eq", value: true },
      { fact: "addressPort443", op: "eq", value: true },
      { fact: "addressUserinfo", op: "eq", value: false },
      { fact: "addressQuery", op: "eq", value: false },
      { fact: "addressFragment", op: "eq", value: false },
    ],
    errorCode: "app_adresse_unzulaessig" as ErrorCode,
  },
  "V-38": {
    name: "abdruck_gesehen",
    actions: ["app.werkzeuge_bestaetigen"],
    require: [
      { fact: "seenToolDigest", op: "eq", value: { fact: "toolDigest" } },
      { fact: "toolStatus", op: "in", value: ["neu", "bestaetigt", "geaendert", "gesperrt"] },
    ],
    errorCode: "werkzeug_abdruck_ungesehen" as ErrorCode,
  },
  "V-25": {
    name: "team_vorhanden",
    actions: ["team.aendern", "team.loeschen", "bot.team_setzen", "faden.anlegen"],
    require: [{ fact: "teamExists", op: "eq", value: true }],
    errorCode: "nicht_gefunden",
  },
  "V-27": {
    name: "entwurf_offen",
    actions: ["team.entwurf_verwerfen", "team.entwurf_anlegen"],
    require: [{ fact: "entwurfOffen", op: "eq", value: true }],
    errorCode: "nicht_gefunden",
  },
  "V-28": {
    name: "entwurf_fassung_passt",
    actions: ["team.entwurf_anlegen"],
    require: [{ fact: "seenEntwurfDigest", op: "eq", value: { fact: "entwurfDigest" } }],
    errorCode: "entwurf_veraltet" as ErrorCode,
  },
  "V-29": {
    name: "entwurf_namen_frei",
    actions: ["team.entwurf_anlegen"],
    require: [{ fact: "namesFree", op: "eq", value: true }],
    errorCode: "entwurf_name_vergeben" as ErrorCode,
  },
  "V-30": {
    name: "entwurf_modelle_vorhanden",
    actions: ["team.entwurf_anlegen"],
    require: [{ fact: "modelsAvailable", op: "eq", value: true }],
    errorCode: "entwurf_modell_fehlt" as ErrorCode,
  },
  "V-31": {
    name: "entwurf_ansprechpartner",
    actions: ["team.entwurf_anlegen"],
    require: [{ fact: "contactInDraft", op: "eq", value: true }],
    errorCode: "entwurf_ansprechpartner_fehlt" as ErrorCode,
  },
  "V-37": {
    name: "standard_bot_bleibt",
    actions: ["bot.loeschen"],
    require: [{ fact: "isDefaultBot", op: "eq", value: false }],
    errorCode: "standard_bot_bleibt" as ErrorCode,
  },
  "V-42": {
    name: "kein_lauf_des_bots",
    actions: ["bot.loeschen"],
    require: [{ fact: "botRunActive", op: "eq", value: false }],
    errorCode: "lauf_aktiv",
  },
  "V-43": {
    name: "entwurf_unbenutzt",
    actions: ["team.entwurf_zuruecknehmen"],
    require: [
      { fact: "allUnused", op: "eq", value: true },
      { fact: "allUnchanged", op: "eq", value: true },
    ],
    errorCode: "entwurf_benutzt" as ErrorCode,
  },
  "V-44": {
    name: "leitung_im_team",
    actions: ["team.aendern"],
    require: [{ fact: "leadInTeam", op: "eq", value: true }],
    errorCode: "leitung_nicht_im_team" as ErrorCode,
  },
  "V-39": {
    name: "auftrag_offen",
    actions: [
      "auftrag.uebergeben",
      "auftrag.melden",
      "auftrag.abbrechen",
      "auftrag.abnehmen",
      "auftrag.zettel_aendern",
      "auftrag.budget_erhoehen",
    ],
    require: [],
    requireFor: {
      "auftrag.melden": [{ fact: "auftragOffen", op: "eq", value: true }],
      "auftrag.abbrechen": [{ fact: "auftragOffen", op: "eq", value: true }],
      "auftrag.abnehmen": [{ fact: "auftragOffen", op: "eq", value: true }],
      "auftrag.zettel_aendern": [
        { fact: "auftragOffen", op: "eq", value: true },
        { fact: "auftragGestartet", op: "eq", value: false },
      ],
      "auftrag.budget_erhoehen": [{ fact: "auftragOffen", op: "eq", value: true }],
    },
    requireOneOfFor: {
      "auftrag.uebergeben": [
        // Auftrag des Gebers offen; ohne Auftrag lässt V-40 nur Pai aus deinem Direkt-Chat zu.
        [
          { fact: "auftragArt", op: "eq", value: "keiner" },
          { fact: "auftragOffen", op: "eq", value: true },
        ],
        // Bei einer Rückgabe hat der Empfänger in dieser Wurzel einen Auftrag.
        [
          { fact: "art", op: "ne", value: "rueckgabe" },
          { fact: "zielHatAuftrag", op: "eq", value: true },
        ],
      ],
    },
    errorCode: "auftrag_nicht_offen" as ErrorCode,
  },
  "V-40": {
    name: "uebergabe_weg_erlaubt",
    actions: ["auftrag.uebergeben"],
    require: [],
    requireAnyOf: [
      // Pai → Leitung eines Teams: nur aus deinem Direkt-Chat, nur in Läufen auf deine Nachricht.
      [
        { fact: "geberRolle", op: "eq", value: "stabschef" },
        { fact: "art", op: "eq", value: "team" },
        { fact: "zielRolle", op: "eq", value: "leitung" },
        { fact: "conversationKind", op: "eq", value: "direkt" },
        { fact: "auftragArt", op: "eq", value: "keiner" },
        { fact: "trigger", op: "eq", value: "chat" },
      ],
      // Leitung → Mitglied ihres Teams (Übergabe) im Faden.
      [
        { fact: "geberRolle", op: "eq", value: "leitung" },
        { fact: "art", op: "eq", value: "uebergabe" },
        { fact: "zielRolle", op: "eq", value: "mitglied" },
        { fact: "sameTeam", op: "eq", value: true },
        { fact: "conversationKind", op: "eq", value: "faden" },
        { fact: "auftragArt", op: "in", value: ["wurzel", "uebergabe", "rueckkehr", "sammeln"] },
      ],
      // Leitung → Mitglied ihres Teams (Rückgabe) im Faden.
      [
        { fact: "geberRolle", op: "eq", value: "leitung" },
        { fact: "art", op: "eq", value: "rueckgabe" },
        { fact: "zielRolle", op: "eq", value: "mitglied" },
        { fact: "sameTeam", op: "eq", value: true },
        { fact: "conversationKind", op: "eq", value: "faden" },
        { fact: "auftragArt", op: "in", value: ["wurzel", "uebergabe", "rueckkehr", "sammeln"] },
      ],
      // Mitglied mit Auftrag der Leitung → Kollege im selben Team (Bitte) im Faden.
      [
        { fact: "geberRolle", op: "eq", value: "mitglied" },
        { fact: "art", op: "eq", value: "bitte" },
        { fact: "zielRolle", op: "eq", value: "mitglied" },
        { fact: "sameTeam", op: "eq", value: true },
        { fact: "conversationKind", op: "eq", value: "faden" },
        { fact: "auftragArt", op: "eq", value: "uebergabe" },
      ],
    ],
    errorCode: "weg_nicht_erlaubt" as ErrorCode,
  },
  "V-41": {
    name: "budget_ausgeschoepft",
    actions: ["auftrag.budget_erhoehen"],
    require: [],
    requireAtLeastSum: { fact: "baumTokens", sumOf: ["maxBaumTokens", "baumZuschlagTokens"] },
    errorCode: "budget_nicht_ausgeschoepft" as ErrorCode,
  },
};
const PRECONDITION_IDS_5 = Object.keys(PRECONDITIONS_5);
const PRECONDITION_NAMES_5 = PRECONDITION_IDS_5.map(
  (id) => (PRECONDITIONS_5[id] as FormatPrecondition).name,
);
const PRECONDITION_ID_BY_NAME_5 = Object.fromEntries(
  PRECONDITION_IDS_5.map((id) => [(PRECONDITIONS_5[id] as FormatPrecondition).name, id]),
) as Record<string, string>;

const CAPS_5: readonly CapDefinition[] = [
  {
    id: "D-01",
    name: "fremd_dann_fragen",
    actions: ["werkzeug.aufrufen"],
    // biome-ignore lint/suspicious/noThenProperty: Feld des Vertrags (ein Text, keine Funktion)
    then: "ask",
    when: [{ fact: "untrustedInput", op: "eq", value: true }],
    anyOf: [
      { fact: "toolKind", op: "eq", value: "schreiben" },
      { fact: "toolReach", op: "eq", value: "nach_aussen" },
    ],
  },
  {
    // Endform ohne Wirkungs-Bedingung (leeres `anyOf`): Nach fremden Inhalten gibt es keine
    // Übergabe; aus `allow` und auch aus `ask` wird `deny` (anders als D-01, das nur aus `allow`
    // ein `ask` macht). Sonst würde R-009 nach fremden Inhalten fragen statt ablehnen. Gilt
    // unabhängig von den Regeln, auch wenn eine Regel alles erlaubt.
    id: "D-02",
    name: "fremd_dann_verboten",
    actions: ["auftrag.uebergeben"],
    // biome-ignore lint/suspicious/noThenProperty: Feld des Vertrags (ein Text, keine Funktion)
    then: "deny",
    when: [{ fact: "untrustedInput", op: "eq", value: true }],
    anyOf: [],
  },
];
const CAP_ORDER_5 = CAPS_5.map((cap) => cap.name);

const ERROR_CODES_5 = [
  "nicht_angemeldet",
  "pruefzeichen_fehlt",
  "herkunft_falsch",
  "eingabe_ungueltig",
  "nicht_gefunden",
  "zu_viele_versuche",
  "passwort_falsch",
  "einrichtungs_code_falsch",
  "einrichtung_offen",
  "einrichtung_fertig",
  "regel_fehlt",
  "abgelehnt",
  "lauf_aktiv",
  "kein_modell",
  "schleuse_blockiert",
  "schleuse_nicht_installiert",
  "anbieter_nicht_erreichbar",
  "schluessel_ungueltig",
  "schluessel_passt_nicht",
  "antwort_zu_gross",
  "limit_erreicht",
  "regel_unbekannt",
  "unterbrochen",
  "intern",
  "angehalten",
  "freigabe_noetig",
  "werkzeug_unbekannt",
  "werkzeug_eingabe_ungueltig",
  "werkzeug_zeitgrenze",
  "werkzeug_fehler",
  "ausgang_unbekannt",
  "schritte_aufgebraucht",
  "zu_viele_aufrufe",
  "app_nicht_erreichbar",
  "app_zugang_ungueltig",
  "app_adresse_unzulaessig",
  "app_kein_mcp",
  "app_befehl_nicht_erlaubt",
  "app_version_unbekannt",
  "werkzeug_geaendert",
  "werkzeug_kein_zugriff",
  "werkzeug_ergebnis_zu_gross",
  "werkzeug_schema_nicht_pruefbar",
  "app_braucht_eingabe",
  "werkzeug_platzhalter",
  "werkzeug_zweite_app",
  "werkzeug_abdruck_ungesehen",
  "bot_pausiert",
  "entwurf_veraltet",
  "entwurf_name_vergeben",
  "entwurf_modell_fehlt",
  "entwurf_ansprechpartner_fehlt",
  "entwurf_benutzt",
  "standard_bot_bleibt",
  "leitung_nicht_im_team",
  "entwurf_zu_gross",
  "auftrag_nicht_offen",
  "weg_nicht_erlaubt",
  "ziel_in_anderem_team",
  "budget_nicht_ausgeschoepft",
  "auftrag_grenze",
  "werkzeug_im_auftrag",
  "nach_fremden_inhalten",
  "zusammenarbeit_aus",
] as const;

const scalar = z.union([z.string().max(200), z.number().int(), z.boolean()]);
const checkResult = z.enum(["ok", "verletzt", "entfaellt"]);
const capCheck = z.strictObject({
  name: z.enum(CAP_ORDER_5 as [string, ...string[]]),
  result: z.enum(["entfaellt", "nicht_noetig", "gedeckelt"]),
});

const decisionFields = {
  /** Fassung im Beleg: ab Fassung 2 Pflicht. */
  gateFormat: z.literal(5),
  outcome: z.enum(["allow", "deny", "ask", "prepare"]),
  stage: z.enum(["ask", "prepare", "execute"]),
  rules: z.array(
    z.strictObject({
      id: z.union([z.string().regex(/^R-\d{3}$/), idSchema("rule")]),
      version: positiveInt,
      hash: sha256DigestSchema.optional(),
    }),
  ),
  limits: z.array(
    z.strictObject({
      name: z.enum(LIMIT_ORDER_5 as [string, ...string[]]),
      result: checkResult,
      value: scalar.optional(),
    }),
  ),
  /** Vorbedingungen der Aktion: ab Fassung 2 Pflicht. */
  preconditions: z.array(
    z.strictObject({
      name: z.enum(PRECONDITION_NAMES_5 as [string, ...string[]]),
      result: checkResult,
    }),
  ),
  ruleStand: positiveInt.optional(),
  reason: z.string().min(1).max(500),
};

/** Felder der Entscheidung, für alle Aktionen gemeinsam: Deckel dürfen fehlen. */
const DECISION_5 = z.strictObject({ ...decisionFields, caps: z.array(capCheck).optional() });

/** Felder der Entscheidung je Aktion: Deckel genau bei Aktionen mit Deckel, in ihrer Reihenfolge. */
function decisionFor(type: string): z.ZodType {
  const caps = capsOf(type);
  if (caps.length === 0) return z.strictObject(decisionFields);
  return z.strictObject({
    ...decisionFields,
    caps: z.tuple(
      caps.map((cap) =>
        z.strictObject({
          name: z.literal(cap.name),
          result: z.enum(["entfaellt", "nicht_noetig", "gedeckelt"]),
        }),
      ) as unknown as [z.ZodType, ...z.ZodType[]],
    ),
  });
}

const RESULT_5 = z.strictObject({
  status: z.enum(["ok", "error", "cancelled", "denied"]),
  code: z.enum(ERROR_CODES_5).optional(),
  digest: hmacDigestSchema.optional(),
  tokens: z.strictObject({ input: count, output: count }).optional(),
  servedBy: z
    .strictObject({
      provider: z
        .string()
        .regex(/^[a-z0-9][a-z0-9._-]{0,63}$/)
        .optional(),
      model: z
        .string()
        .regex(/^[\x21-\x7e]{1,200}$/)
        .optional(),
    })
    .optional(),
  modelReported: z.string().max(200).optional(),
  docStand: z.string().max(80).optional(),
  found: count.optional(),
});

// ---------------------------------------------------------------------------------------------
// Auswertung (Kopie, erweitert um die Grenzen der Läufe und die Deckel)

type FactRecord = Readonly<Record<string, unknown>>;
type Comparable = string | number | boolean;

function isComparable(value: unknown): value is Comparable {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function factValue(facts: FactRecord, name: string): unknown {
  return Object.hasOwn(facts, name) ? facts[name] : undefined;
}

function conditionHolds(condition: RuleCondition, facts: FactRecord): boolean {
  const left = factValue(facts, condition.fact);
  if (!isComparable(left)) return false;

  const raw = condition.value;
  if (condition.op === "in") {
    return Array.isArray(raw) && raw.some((item) => item === left);
  }
  if (Array.isArray(raw)) return false;

  let right: unknown = raw;
  if (typeof raw === "object" && raw !== null) {
    right = factValue(facts, raw.fact);
  }
  if (!isComparable(right)) return false;

  switch (condition.op) {
    case "eq":
      return left === right;
    case "ne":
      return left !== right;
    case "lt":
    case "lte":
    case "gt":
    case "gte":
      if (typeof left !== "number" || typeof right !== "number") return false;
      if (condition.op === "lt") return left < right;
      if (condition.op === "lte") return left <= right;
      if (condition.op === "gt") return left > right;
      return left >= right;
    default:
      return false;
  }
}

function factContext(action: { actor: string }, facts: unknown): FactRecord {
  return { ...(facts as FactRecord), [ACTOR_FACT]: actorKindOf(action.actor) };
}

function preconditionsOf(type: string): string[] {
  return PRECONDITION_IDS_5.filter((id) =>
    (PRECONDITIONS_5[id] as FormatPrecondition).actions.includes(type),
  );
}

function capsOf(type: string): CapDefinition[] {
  return CAPS_5.filter((cap) => cap.actions.includes(type));
}

function checkPreconditions(
  action: { type: string; actor: string },
  facts: unknown,
): PreconditionCheck[] {
  const context = factContext(action, facts);
  return preconditionsOf(action.type).map((id) => {
    const precondition = PRECONDITIONS_5[id] as FormatPrecondition;
    const name = precondition.name as PreconditionCheck["name"];
    const when = precondition.when ?? [];
    if (!when.every((condition) => conditionHolds(condition, context))) {
      return { name, result: "entfaellt" };
    }
    return {
      name,
      result: preconditionHolds(precondition, action.type, context) ? "ok" : "verletzt",
    };
  });
}

/**
 * Gilt die Vorbedingung? Alle Bedingungen aus `require` und aus `requireFor[type]`; aus jeder
 * Gruppe in `requireOneOfFor[type]` mindestens eine Bedingung; bei
 * `requireAnyOf` mindestens eine Gruppe ganz; bei `requireAtLeastSum` `fact >= a + b` (fehlt ein
 * Fakt, ist keine Ganzzahl oder liegt die Summe außerhalb der sicheren Ganzzahlen: nicht erfüllt).
 */
function preconditionHolds(
  precondition: FormatPrecondition,
  type: string,
  context: FactRecord,
): boolean {
  const holds = (condition: RuleCondition) => conditionHolds(condition, context);
  if (!precondition.require.every(holds)) return false;
  if (!(precondition.requireFor?.[type] ?? []).every(holds)) return false;
  if (!(precondition.requireOneOfFor?.[type] ?? []).every((group) => group.some(holds))) {
    return false;
  }
  const anyOf = precondition.requireAnyOf;
  if (anyOf !== undefined && !anyOf.some((group) => group.every(holds))) return false;
  const sum = precondition.requireAtLeastSum;
  if (sum !== undefined) {
    const value = factValue(context, sum.fact);
    const a = factValue(context, sum.sumOf[0]);
    const b = factValue(context, sum.sumOf[1]);
    if (!isCount(value) || !isCount(a) || !isCount(b)) return false;
    const total = a + b;
    if (!isCount(total)) return false;
    if (value < total) return false;
  }
  return true;
}

function fact(facts: unknown, name: string): unknown {
  const record = facts as FactRecord;
  return Object.hasOwn(record, name) ? record[name] : undefined;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function check(name: GateLimitName, ok: boolean, value?: string | number | boolean): LimitCheck {
  const result: LimitCheck = { name, result: ok ? "ok" : "verletzt" };
  if (value !== undefined) result.value = value;
  return result;
}

function notApplicable(name: GateLimitName): LimitCheck {
  return { name, result: "entfaellt" };
}

function scalarOrUndefined(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string") return value.slice(0, 200);
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  return undefined;
}

function hasFact(type: string, name: string): boolean {
  return FACT_NAMES_5[type]?.has(name) === true;
}

/** G-01 `schleuse_gefordert`. */
export const limitSchleuseGefordert: FormatLimitFn = (action, facts) => {
  const name = "schleuse_gefordert";
  if (action.type !== "modell.anfragen") return notApplicable(name);
  const mode = fact(facts, "requestedMode");
  const routeValue = fact(facts, "route");
  const value = scalarOrUndefined(routeValue);
  if (mode === "off") return check(name, true, value);
  return check(name, routeValue === "schleuse" && fact(facts, "schleuseReachable") === true, value);
};

/** G-02 `anbieter_region`. */
export const limitAnbieterRegion: FormatLimitFn = (action, facts) => {
  const name = "anbieter_region";
  if (action.type !== "modell.anfragen") return notApplicable(name);
  const regionValue = fact(facts, "region");
  const allowed = regionValue === "eu" || regionValue === "local";
  return check(
    name,
    fact(facts, "providerEnabled") === true && allowed,
    scalarOrUndefined(regionValue),
  );
};

/** Aktionen, an denen G-03 den Zettel prüft (`zettelChars <= maxZettelChars`). */
const ZETTEL_ACTIONS_5: readonly string[] = [
  "faden.anlegen",
  "auftrag.uebergeben",
  "auftrag.zettel_aendern",
  "auftrag.zurueckgeben",
];

/** G-03 `laenge`: Eingabe einer Nachricht bzw. Anfrage, oder die Länge eines Zettels. */
export const limitLaenge: FormatLimitFn = (action, facts) => {
  const name = "laenge";
  if (ZETTEL_ACTIONS_5.includes(action.type)) {
    const zettelChars = fact(facts, "zettelChars");
    const maxZettelChars = fact(facts, "maxZettelChars");
    return check(
      name,
      isCount(zettelChars) && isCount(maxZettelChars) && zettelChars <= maxZettelChars,
      isCount(zettelChars) ? zettelChars : undefined,
    );
  }
  if (action.type !== "nachricht.senden" && action.type !== "modell.anfragen") {
    return notApplicable(name);
  }
  const inputChars = fact(facts, "inputChars");
  const maxInputChars = fact(facts, "maxInputChars");
  let ok = isCount(inputChars) && isCount(maxInputChars) && inputChars <= maxInputChars;
  if (action.type === "modell.anfragen") {
    const maxOutput = fact(facts, "maxOutputTokens");
    const botMaxOutput = fact(facts, "botMaxOutputTokens");
    ok = ok && isCount(maxOutput) && isCount(botMaxOutput) && maxOutput <= botMaxOutput;
  }
  return check(name, ok, isCount(inputChars) ? inputChars : undefined);
};

/** G-04 `tagesbudget`. */
export const limitTagesbudget: FormatLimitFn = (action, facts) => {
  const name = "tagesbudget";
  if (action.type !== "modell.anfragen") return notApplicable(name);
  const budget = fact(facts, "dailyTokenBudget");
  if (budget === undefined) return notApplicable(name);
  const tokensToday = fact(facts, "tokensToday");
  return check(
    name,
    isCount(budget) && isCount(tokensToday) && tokensToday < budget,
    isCount(tokensToday) ? tokensToday : undefined,
  );
};

/** G-05 `not_aus`: jede Aktion, die laut Fassung 5 `killSwitch` kennt oder ihn mitbringt. */
export const limitNotAus: FormatLimitFn = (action, facts) => {
  const name = "not_aus";
  const killSwitch = fact(facts, "killSwitch");
  const concerned = hasFact(action.type, "killSwitch") || killSwitch !== undefined;
  if (!concerned) return notApplicable(name);
  return check(
    name,
    killSwitch === false,
    typeof killSwitch === "boolean" ? killSwitch : undefined,
  );
};

/** G-16 `lauf_schritte`: `step < maxSteps`; fehlt ein Fakt oder ist keine Ganzzahl: verletzt. */
export const limitLaufSchritte: FormatLimitFn = (action, facts) => {
  const name = "lauf_schritte";
  if (action.type !== "modell.anfragen") return notApplicable(name);
  const step = fact(facts, "step");
  const maxSteps = fact(facts, "maxSteps");
  return check(
    name,
    isCount(step) && isCount(maxSteps) && step < maxSteps,
    isCount(step) ? step : undefined,
  );
};

/** G-17 `lauf_aufrufe`: `callsInRun < maxCallsPerRun`; fehlt ein Fakt oder ist keine Ganzzahl: verletzt. */
export const limitLaufAufrufe: FormatLimitFn = (action, facts) => {
  const name = "lauf_aufrufe";
  if (!(TOOL_GATE_ACTIONS_5 as readonly string[]).includes(action.type)) {
    return notApplicable(name);
  }
  const calls = fact(facts, "callsInRun");
  const maxCalls = fact(facts, "maxCallsPerRun");
  return check(
    name,
    isCount(calls) && isCount(maxCalls) && calls < maxCalls,
    isCount(calls) ? calls : undefined,
  );
};

/**
 * G-18 `lauf_token`: `runTokens + stepTokenEstimate <= maxRunTokens`; fehlt ein Fakt oder ist
 * keine Ganzzahl: verletzt. Liegt die Summe außerhalb der sicheren Ganzzahlen, ist sie größer als
 * jede zulässige Grenze: verletzt, ohne Wert, damit der Beleg schreibbar bleibt.
 */
export const limitLaufToken: FormatLimitFn = (action, facts) => {
  const name = "lauf_token";
  if (action.type !== "modell.anfragen") return notApplicable(name);
  const runTokens = fact(facts, "runTokens");
  const estimate = fact(facts, "stepTokenEstimate");
  const maxRunTokens = fact(facts, "maxRunTokens");
  const both = isCount(runTokens) && isCount(estimate);
  const raw = both ? runTokens + estimate : undefined;
  const sum = isCount(raw) ? raw : undefined;
  return check(name, sum !== undefined && isCount(maxRunTokens) && sum <= maxRunTokens, sum);
};

const APP_TOOL_ACTIONS_5: readonly string[] = ["werkzeug.aufrufen"];

/**
 * Betrifft die Prüfung einen Aufruf eines App-Werkzeugs? Ja bei `werkzeug.aufrufen`, außer die
 * Quelle ist genau `eingebaut` und kein Fakt einer App ist da (dann entfallen G-06 bis G-08 und
 * G-40). Fehlt die Quelle oder steht ein Fakt einer App dabei, gilt die Prüfung (fail closed).
 */
function appToolConcerned(action: { type: string }, facts: unknown): boolean {
  if (!APP_TOOL_ACTIONS_5.includes(action.type)) return false;
  if (fact(facts, "toolSource") !== "eingebaut") return true;
  return APP_TOOL_FACT_NAMES.some((name) => fact(facts, name) !== undefined);
}

function textOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value.slice(0, 200) : undefined;
}

/** G-06 `app_zugriff`: `appAccess = lesen` und `toolKind = lesen`; sonst verletzt. */
export const limitAppZugriff: FormatLimitFn = (action, facts) => {
  const name = "app_zugriff" as GateLimitName;
  if (!appToolConcerned(action, facts)) return notApplicable(name);
  const access = fact(facts, "appAccess");
  return check(
    name,
    access === "lesen" && fact(facts, "toolKind") === "lesen",
    textOrUndefined(access),
  );
};

/**
 * G-07 `werkzeug_bestaetigt`: `toolStatus = bestaetigt` und `toolDigest = confirmedToolDigest`
 * (beide Text); sonst verletzt.
 */
export const limitWerkzeugBestaetigt: FormatLimitFn = (action, facts) => {
  const name = "werkzeug_bestaetigt" as GateLimitName;
  if (!appToolConcerned(action, facts)) return notApplicable(name);
  const status = fact(facts, "toolStatus");
  const digest = fact(facts, "toolDigest");
  return check(
    name,
    status === "bestaetigt" &&
      typeof digest === "string" &&
      digest === fact(facts, "confirmedToolDigest"),
    textOrUndefined(status),
  );
};

/** G-08 `app_ziel`: `targetDigest = confirmedTargetDigest` (beide Text); sonst verletzt. */
export const limitAppZiel: FormatLimitFn = (action, facts) => {
  const name = "app_ziel" as GateLimitName;
  if (!appToolConcerned(action, facts)) return notApplicable(name);
  const target = fact(facts, "targetDigest");
  return check(name, typeof target === "string" && target === fact(facts, "confirmedTargetDigest"));
};

/**
 * G-40 `eine_app_je_schritt`: `stepAppId = appId` (beide Text). `stepAppId` ist die App des ersten
 * App-Aufrufs im Schritt; fehlt der Fakt, ist die Grenze verletzt.
 */
export const limitEineAppJeSchritt: FormatLimitFn = (action, facts) => {
  const name = "eine_app_je_schritt" as GateLimitName;
  if (!appToolConcerned(action, facts)) return notApplicable(name);
  const stepApp = fact(facts, "stepAppId");
  return check(name, typeof stepApp === "string" && stepApp === fact(facts, "appId"));
};

/** Aktionen, an denen G-15 prüft, ob der Bot der Unterhaltung bereit ist (nicht pausiert). */
const BOT_READY_ACTIONS_5: readonly string[] = [
  "modell.anfragen",
  "nachricht.senden",
  "werkzeug.aufrufen",
];

/**
 * G-15 `bot_bereit`: `botPaused = false`, an `auftrag.uebergeben` `toBotPaused = false` (der
 * Empfänger); fehlt der Fakt oder ist er kein Wahrheitswert: verletzt.
 */
export const limitBotBereit: FormatLimitFn = (action, facts) => {
  const name = "bot_bereit" as GateLimitName;
  if (action.type === "auftrag.uebergeben") {
    const toPaused = fact(facts, "toBotPaused");
    return check(name, toPaused === false, typeof toPaused === "boolean" ? toPaused : undefined);
  }
  if (!BOT_READY_ACTIONS_5.includes(action.type)) return notApplicable(name);
  const paused = fact(facts, "botPaused");
  return check(name, paused === false, typeof paused === "boolean" ? paused : undefined);
};

/** G-32 `entwurf_umfang`: `draftBots <= maxDraftBots`; fehlt ein Fakt oder ist keine Ganzzahl: verletzt. */
export const limitEntwurfUmfang: FormatLimitFn = (action, facts) => {
  const name = "entwurf_umfang" as GateLimitName;
  if (action.type !== "team.entwurf_anlegen") return notApplicable(name);
  const bots = fact(facts, "draftBots");
  const max = fact(facts, "maxDraftBots");
  return check(
    name,
    isCount(bots) && isCount(max) && bots <= max,
    isCount(bots) ? bots : undefined,
  );
};

/** G-33 `bots_gesamt`: `botsAfter <= maxBots`; fehlt ein Fakt oder ist keine Ganzzahl: verletzt. */
export const limitBotsGesamt: FormatLimitFn = (action, facts) => {
  const name = "bots_gesamt" as GateLimitName;
  if (action.type !== "bot.anlegen" && action.type !== "team.entwurf_anlegen") {
    return notApplicable(name);
  }
  const after = fact(facts, "botsAfter");
  const max = fact(facts, "maxBots");
  return check(
    name,
    isCount(after) && isCount(max) && after <= max,
    isCount(after) ? after : undefined,
  );
};

/**
 * G-34 `entwuerfe_je_tag`: `offeneEntwuerfe < maxOffeneEntwuerfe` und
 * `entwuerfeHeute < maxEntwuerfeProTag`; fehlt ein Fakt oder ist keine Ganzzahl: verletzt. Der
 * Wert im Beleg nennt bei einer Verletzung die Ursache (`offeneEntwuerfe=<Zahl>`, bei beiden
 * zuerst die offenen, sonst `entwuerfeHeute=<Zahl>`); sonst ist er die Zahl `entwuerfeHeute`.
 */
export const limitEntwuerfeJeTag: FormatLimitFn = (action, facts) => {
  const name = "entwuerfe_je_tag" as GateLimitName;
  if (action.type !== "team.entwurf_erstellen") return notApplicable(name);
  const open = fact(facts, "offeneEntwuerfe");
  const maxOpen = fact(facts, "maxOffeneEntwuerfe");
  const today = fact(facts, "entwuerfeHeute");
  const maxToday = fact(facts, "maxEntwuerfeProTag");
  if (!isCount(open) || !isCount(maxOpen) || !isCount(today) || !isCount(maxToday)) {
    return check(name, false, isCount(today) ? today : undefined);
  }
  if (open >= maxOpen) return check(name, false, `offeneEntwuerfe=${open}`);
  if (today >= maxToday) return check(name, false, `entwuerfeHeute=${today}`);
  return check(name, true, today);
};

/** `a < b`, beide Ganzzahlen ≥ 0; sonst verletzt. Wert im Beleg: `a`, wenn es eine Ganzzahl ist. */
function countBelow(name: GateLimitName, facts: unknown, a: string, b: string): LimitCheck {
  const value = fact(facts, a);
  const max = fact(facts, b);
  return check(
    name,
    isCount(value) && isCount(max) && value < max,
    isCount(value) ? value : undefined,
  );
}

/** `a <= b`, beide Ganzzahlen ≥ 0; sonst verletzt. Wert im Beleg: `a`, wenn es eine Ganzzahl ist. */
function countAtMost(name: GateLimitName, facts: unknown, a: string, b: string): LimitCheck {
  const value = fact(facts, a);
  const max = fact(facts, b);
  return check(
    name,
    isCount(value) && isCount(max) && value <= max,
    isCount(value) ? value : undefined,
  );
}

/** Ist der Fakt da (auch mit falschem Typ)? */
function present(facts: unknown, name: string): boolean {
  return Object.hasOwn(facts as FactRecord, name);
}

const BAUM_FACT_NAMES_5 = [
  "baumTokens",
  "maxBaumTokens",
  "baumZuschlagTokens",
  "baumSekunden",
  "maxBaumSekunden",
] as const;

/**
 * Betrifft eine Grenze des Auftragsbaums (G-11, G-12) diese Anfrage an ein Modell? Ja, sobald
 * `auftragArt` nicht genau `keiner` ist (auch wenn der Fakt fehlt) oder ein Fakt des Baums
 * mitkommt (fail closed).
 */
function baumConcerned(action: { type: string }, facts: unknown): boolean {
  if (action.type !== "modell.anfragen") return false;
  if (fact(facts, "auftragArt") !== "keiner") return true;
  return BAUM_FACT_NAMES_5.some((name) => present(facts, name));
}

/** G-09 `auftrag_tiefe`: `tiefe <= maxTiefe` (an `auftrag.uebergeben`). */
export const limitAuftragTiefe: FormatLimitFn = (action, facts) => {
  const name = "auftrag_tiefe" as GateLimitName;
  if (action.type !== "auftrag.uebergeben") return notApplicable(name);
  return countAtMost(name, facts, "tiefe", "maxTiefe");
};

/** G-10 `auftrag_anzahl`: `baumAuftraege < maxBaumAuftraege` (an `auftrag.uebergeben`). */
export const limitAuftragAnzahl: FormatLimitFn = (action, facts) => {
  const name = "auftrag_anzahl" as GateLimitName;
  if (action.type !== "auftrag.uebergeben") return notApplicable(name);
  return countBelow(name, facts, "baumAuftraege", "maxBaumAuftraege");
};

/**
 * G-11 `auftrag_budget`: `baumTokens < maxBaumTokens + baumZuschlagTokens` (an `modell.anfragen`,
 * wenn `baumConcerned`). Fehlt ein Fakt oder ist keine Ganzzahl: verletzt. Liegt die Summe
 * außerhalb der sicheren Ganzzahlen: verletzt (fail closed). Wert im Beleg: `baumTokens`.
 */
export const limitAuftragBudget: FormatLimitFn = (action, facts) => {
  const name = "auftrag_budget" as GateLimitName;
  if (!baumConcerned(action, facts)) return notApplicable(name);
  const tokens = fact(facts, "baumTokens");
  const max = fact(facts, "maxBaumTokens");
  const zuschlag = fact(facts, "baumZuschlagTokens");
  const value = isCount(tokens) ? tokens : undefined;
  if (!isCount(tokens) || !isCount(max) || !isCount(zuschlag)) return check(name, false, value);
  const grenze = max + zuschlag;
  if (!isCount(grenze)) return check(name, false, value);
  return check(name, tokens < grenze, value);
};

/**
 * G-12 `auftrag_zeit`: `baumSekunden < maxBaumSekunden` (an `auftrag.uebergeben` und an
 * `modell.anfragen`, wenn `baumConcerned`).
 */
export const limitAuftragZeit: FormatLimitFn = (action, facts) => {
  const name = "auftrag_zeit" as GateLimitName;
  if (action.type !== "auftrag.uebergeben" && !baumConcerned(action, facts)) {
    return notApplicable(name);
  }
  return countBelow(name, facts, "baumSekunden", "maxBaumSekunden");
};

/** G-13 `kein_kreis`: `zielImPfad = false` (an `auftrag.uebergeben`); ohne Wert im Beleg. */
export const limitKeinKreis: FormatLimitFn = (action, facts) => {
  const name = "kein_kreis" as GateLimitName;
  if (action.type !== "auftrag.uebergeben") return notApplicable(name);
  return check(name, fact(facts, "zielImPfad") === false);
};

/**
 * G-38 `erwaehnungen_je_nachricht`: `erwaehnungen <= maxErwaehnungen` (an `nachricht.senden`).
 * Entfällt nur im Direkt-Chat, wenn keiner der beiden Fakten da ist; sonst fehlt einer: verletzt.
 */
export const limitErwaehnungen: FormatLimitFn = (action, facts) => {
  const name = "erwaehnungen_je_nachricht" as GateLimitName;
  if (action.type !== "nachricht.senden") return notApplicable(name);
  if (
    fact(facts, "conversationKind") === "direkt" &&
    !present(facts, "erwaehnungen") &&
    !present(facts, "maxErwaehnungen")
  ) {
    return notApplicable(name);
  }
  return countAtMost(name, facts, "erwaehnungen", "maxErwaehnungen");
};

/** G-39 `uebergaben_je_lauf`: `uebergabeAntworten < maxUebergabeAntworten` (an `auftrag.uebergeben`). */
export const limitUebergabenJeLauf: FormatLimitFn = (action, facts) => {
  const name = "uebergaben_je_lauf" as GateLimitName;
  if (action.type !== "auftrag.uebergeben") return notApplicable(name);
  return countBelow(name, facts, "uebergabeAntworten", "maxUebergabeAntworten");
};

/** G-41 `auftrag_breite`: `offeneUnterauftraege < maxBreite` (an `auftrag.uebergeben`). */
export const limitAuftragBreite: FormatLimitFn = (action, facts) => {
  const name = "auftrag_breite" as GateLimitName;
  if (action.type !== "auftrag.uebergeben") return notApplicable(name);
  return countBelow(name, facts, "offeneUnterauftraege", "maxBreite");
};

/**
 * G-42 `werkzeug_im_auftrag`: `werkzeug.aufrufen` nur bei `auftragArt = keiner`; jede andere Art
 * und ein fehlender Fakt: verletzt. Wert im Beleg: die Art.
 */
export const limitWerkzeugImAuftrag: FormatLimitFn = (action, facts) => {
  const name = "werkzeug_im_auftrag" as GateLimitName;
  if (action.type !== "werkzeug.aufrufen") return notApplicable(name);
  const art = fact(facts, "auftragArt");
  return check(name, art === "keiner", textOrUndefined(art));
};

/**
 * G-43 `auftraege_je_mitglied`: `auftraegeAnZiel < maxAuftraegeJeMitglied` (an
 * `auftrag.uebergeben`, außer bei Art `team` und `bitte`; bei fehlender oder unbekannter Art gilt
 * sie).
 */
export const limitAuftraegeJeMitglied: FormatLimitFn = (action, facts) => {
  const name = "auftraege_je_mitglied" as GateLimitName;
  const art = fact(facts, "art");
  if (action.type !== "auftrag.uebergeben" || art === "team" || art === "bitte") {
    return notApplicable(name);
  }
  return countBelow(name, facts, "auftraegeAnZiel", "maxAuftraegeJeMitglied");
};

/**
 * G-44 `rueckfragen_je_faden`: `rueckfragenImFaden < maxRueckfragen` (an `auftrag.melden`, außer
 * bei Meldung `fertig`).
 */
export const limitRueckfragen: FormatLimitFn = (action, facts) => {
  const name = "rueckfragen_je_faden" as GateLimitName;
  if (action.type !== "auftrag.melden" || fact(facts, "meldung") === "fertig") {
    return notApplicable(name);
  }
  return countBelow(name, facts, "rueckfragenImFaden", "maxRueckfragen");
};

/**
 * G-45 `bitten_je_auftrag`: `bittenImAuftrag < maxBitten` (an `auftrag.uebergeben` bei Art
 * `bitte`; bei fehlender oder unbekannter Art gilt sie).
 */
export const limitBitten: FormatLimitFn = (action, facts) => {
  const name = "bitten_je_auftrag" as GateLimitName;
  const art = fact(facts, "art");
  if (
    action.type !== "auftrag.uebergeben" ||
    art === "team" ||
    art === "uebergabe" ||
    art === "rueckgabe"
  ) {
    return notApplicable(name);
  }
  return countBelow(name, facts, "bittenImAuftrag", "maxBitten");
};

/** G-46 `zuschlaege_je_baum`: `zuschlaege < maxZuschlaege` (an `auftrag.budget_erhoehen`). */
export const limitZuschlaege: FormatLimitFn = (action, facts) => {
  const name = "zuschlaege_je_baum" as GateLimitName;
  if (action.type !== "auftrag.budget_erhoehen") return notApplicable(name);
  return countBelow(name, facts, "zuschlaege", "maxZuschlaege");
};

const LIMITS_5: Readonly<Record<string, FormatLimitFn>> = {
  schleuse_gefordert: limitSchleuseGefordert,
  anbieter_region: limitAnbieterRegion,
  laenge: limitLaenge,
  tagesbudget: limitTagesbudget,
  not_aus: limitNotAus,
  lauf_schritte: limitLaufSchritte,
  lauf_aufrufe: limitLaufAufrufe,
  lauf_token: limitLaufToken,
  app_zugriff: limitAppZugriff,
  werkzeug_bestaetigt: limitWerkzeugBestaetigt,
  app_ziel: limitAppZiel,
  eine_app_je_schritt: limitEineAppJeSchritt,
  bot_bereit: limitBotBereit,
  entwurf_umfang: limitEntwurfUmfang,
  bots_gesamt: limitBotsGesamt,
  entwuerfe_je_tag: limitEntwuerfeJeTag,
  auftrag_tiefe: limitAuftragTiefe,
  auftrag_anzahl: limitAuftragAnzahl,
  auftrag_budget: limitAuftragBudget,
  auftrag_zeit: limitAuftragZeit,
  kein_kreis: limitKeinKreis,
  erwaehnungen_je_nachricht: limitErwaehnungen,
  uebergaben_je_lauf: limitUebergabenJeLauf,
  auftrag_breite: limitAuftragBreite,
  werkzeug_im_auftrag: limitWerkzeugImAuftrag,
  auftraege_je_mitglied: limitAuftraegeJeMitglied,
  rueckfragen_je_faden: limitRueckfragen,
  bitten_je_auftrag: limitBitten,
  zuschlaege_je_baum: limitZuschlaege,
};

function checkLimits(action: { type: string }, facts: unknown): LimitCheck[] {
  return LIMIT_ORDER_5.map((name) => (LIMITS_5[name] as FormatLimitFn)(action, facts));
}

function isValidInput(action: unknown, facts: unknown): boolean {
  if (!REQUEST_5.safeParse(action).success) return false;
  const type = (action as { type: Action5 }).type;
  return (ACTIONS_5[type] as Spec5Action).facts.safeParse(facts).success;
}

function compareRules(a: RuleDefinition, b: RuleDefinition): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return a.version - b.version;
}

function outcomeOf(rule: RuleDefinition): Outcome {
  if (rule.effect === "deny") return "deny";
  if (rule.effect === "ask") return "ask";
  if (rule.stage === "execute") return "allow";
  return rule.stage === "prepare" ? "prepare" : "ask";
}

function ruleApplies(
  rule: RuleDefinition,
  action: { type: string; actor: string },
  facts: unknown,
): boolean {
  if (rule.enabled !== true) return false;
  if (rule.action !== "*" && rule.action !== action.type) return false;
  const context = factContext(action, facts);
  return rule.conditions.every((condition) => conditionHolds(condition, context));
}

/**
 * Greift der Deckel für diese Fakten (`when` gilt und mindestens eine Bedingung aus `anyOf`; ein
 * leeres `anyOf` stellt keine weitere Bedingung)?
 */
function capApplies(cap: CapDefinition, action: { actor: string }, facts: unknown): boolean {
  const context = factContext(action, facts);
  return (
    cap.when.every((condition) => conditionHolds(condition, context)) &&
    (cap.anyOf.length === 0 || cap.anyOf.some((condition) => conditionHolds(condition, context)))
  );
}

function limitReason(violated: readonly LimitCheck[]): string {
  const names = violated.map((entry) => {
    const id = LIMIT_ID_BY_NAME_5[entry.name] as string;
    return t("tor.grenze", { id, name: t(`regel.${id}` as never) });
  });
  return t("tor.grenze_verletzt", { grenzen: names.join(", ") }).slice(0, 500);
}

function preconditionReason(violated: readonly PreconditionCheck[]): string {
  const names = violated.map((entry) => {
    const id = PRECONDITION_ID_BY_NAME_5[entry.name] as string;
    return t("tor.grenze", { id, name: t(`regel.${id}` as never) });
  });
  return t("tor.vorbedingung_verletzt", { vorbedingungen: names.join(", ") }).slice(0, 500);
}

function invalidInputReason(): string {
  return `${t("fehler.abgelehnt")} ${t("fehler.eingabe_ungueltig")}`;
}

function ruleRef(rule: EvaluatedRule): StoredRuleRef {
  const ref: StoredRuleRef = { id: rule.id, version: rule.version };
  if (typeof rule.hash === "string") ref.hash = rule.hash;
  return ref;
}

type CapEntry = { name: string; result: "entfaellt" | "nicht_noetig" | "gedeckelt" };

function evaluate(action: unknown, facts: unknown, rules: RuleSnapshot): Decision;
function evaluate(action: unknown, facts: unknown, rules: readonly EvaluatedRule[]): ListDecision;
function evaluate(
  action: unknown,
  facts: unknown,
  rules: readonly EvaluatedRule[] | RuleSnapshot,
): Decision | ListDecision;
function evaluate(
  action: unknown,
  facts: unknown,
  rules: readonly EvaluatedRule[] | RuleSnapshot,
): Decision | ListDecision {
  const snapshot = Array.isArray(rules) ? undefined : (rules as RuleSnapshot);
  const ruleList: readonly EvaluatedRule[] = snapshot ? snapshot.rules : (rules as EvaluatedRule[]);
  const stand = snapshot === undefined ? {} : { ruleStand: snapshot.stand };

  // 1. Eingabe
  if (!isValidInput(action, facts)) {
    const type = (action as { type?: unknown } | null)?.type;
    const known = hasAction(type);
    const caps: CapEntry[] = known
      ? capsOf(type).map((cap) => ({ name: cap.name, result: "entfaellt" }))
      : [];
    return {
      outcome: "deny",
      stage: "ask",
      matchedRules: [],
      limits: LIMIT_ORDER_5.map((name) => ({ name, result: "entfaellt" })),
      preconditions: known
        ? preconditionsOf(type).map((id) => ({
            name: (PRECONDITIONS_5[id] as FormatPrecondition).name as PreconditionCheck["name"],
            result: "entfaellt",
          }))
        : [],
      ...(caps.length > 0 ? { caps } : {}),
      ...stand,
      reason: invalidInputReason(),
    } as Decision;
  }

  // 2. Vorbedingungen, 3. Grenzen, 4. Regeln
  const request = action as { type: string; actor: string };
  const preconditions = checkPreconditions(request, facts);
  const limits = checkLimits(request, facts);
  const candidates = ruleList.filter((rule) => ruleApplies(rule, request, facts));
  const winner = [...candidates].sort(compareRules)[0];
  const stage: Stage = winner ? winner.stage : "ask";
  const matchedRules = winner ? [ruleRef(winner)] : [];
  const base = { stage, matchedRules, limits, preconditions, ...stand };

  let decision: { outcome: Outcome; stage: Stage; reason: string };
  const violatedPreconditions = preconditions.filter((entry) => entry.result === "verletzt");
  const violated = limits.filter((entry) => entry.result === "verletzt");
  if (violatedPreconditions.length > 0) {
    decision = { outcome: "deny", stage, reason: preconditionReason(violatedPreconditions) };
  } else if (violated.length > 0) {
    decision = { outcome: "deny", stage, reason: limitReason(violated) };
  } else if (!winner) {
    decision = { outcome: "ask", stage: "ask", reason: t("fehler.regel_fehlt") };
  } else {
    decision = { outcome: outcomeOf(winner), stage, reason: winner.reason };
  }

  // 5. Deckel: nur nach den Regeln. Ein Deckel `ask` macht nur aus `allow` ein `ask`; ein Deckel
  // `deny` macht aus jedem Ergebnis außer `deny` ein `deny`.
  const caps: CapEntry[] = [];
  for (const cap of capsOf(request.type)) {
    const noetig = cap.then === "deny" ? decision.outcome !== "deny" : decision.outcome === "allow";
    if (!capApplies(cap, request, facts)) {
      caps.push({ name: cap.name, result: "entfaellt" });
    } else if (!noetig) {
      caps.push({ name: cap.name, result: "nicht_noetig" });
    } else {
      caps.push({ name: cap.name, result: "gedeckelt" });
      decision = { outcome: cap.then, stage: "ask", reason: t(`tor.deckel.${cap.id}` as never) };
    }
  }

  return {
    outcome: decision.outcome,
    ...base,
    stage: decision.stage,
    ...(caps.length > 0 ? { caps } : {}),
    reason: decision.reason,
  } as Decision;
}

/** Grenzen der Apps, der Bots und Entwürfe und ihr Fehlercode, in der Reihenfolge der Grenzen. */
const LIMIT_CODES_5: readonly (readonly [string, string])[] = [
  ["app_zugriff", "werkzeug_kein_zugriff"],
  ["werkzeug_bestaetigt", "werkzeug_geaendert"],
  ["app_ziel", "werkzeug_geaendert"],
  ["eine_app_je_schritt", "werkzeug_zweite_app"],
  ["bot_bereit", "bot_pausiert"],
  ["entwurf_umfang", "entwurf_zu_gross"],
  ["bots_gesamt", "limit_erreicht"],
  ["entwuerfe_je_tag", "limit_erreicht"],
  ["werkzeug_im_auftrag", "werkzeug_im_auftrag"],
  ["erwaehnungen_je_nachricht", "limit_erreicht"],
];

/** Grenzen eines Auftrags; eine verletzte ergibt den Fehlercode `auftrag_grenze`. */
const AUFTRAG_LIMITS_5: readonly string[] = [
  "auftrag_tiefe",
  "auftrag_anzahl",
  "auftrag_budget",
  "auftrag_zeit",
  "kein_kreis",
  "uebergaben_je_lauf",
  "auftrag_breite",
  "auftraege_je_mitglied",
  "rueckfragen_je_faden",
  "bitten_je_auftrag",
  "zuschlaege_je_baum",
];

/**
 * Lehnt V-40 einen Weg ab, dessen Ziel in einem anderen Team ist? Geber Leitung oder Mitglied,
 * Ziel Leitung oder Mitglied, `sameTeam = false`. Ein Bot ohne Team (`ohne_team`) zählt nicht dazu.
 */
function zielInAnderemTeam(facts: unknown): boolean {
  if (facts === null || typeof facts !== "object") return false;
  const geber = fact(facts, "geberRolle");
  const ziel = fact(facts, "zielRolle");
  return (
    (geber === "leitung" || geber === "mitglied") &&
    (ziel === "leitung" || ziel === "mitglied") &&
    fact(facts, "sameTeam") === false
  );
}

/**
 * Fehlercode für das Ergebnis einer nicht erlaubten Entscheidung: verletzte Vorbedingung (erste
 * nach Kennung) → ihr Code, bei V-40 mit Ziel in einem anderen Team `ziel_in_anderem_team` (dafür
 * die Fakten); Not-Aus → `angehalten`; Grenze eines Laufs (G-16 bis G-18) → `limit_erreicht`;
 * Grenzen der Apps, Bots und Entwürfe wie in Fassung 4; G-42 → `werkzeug_im_auftrag`; G-38 →
 * `limit_erreicht`; Deckel D-02 gedeckelt → `nach_fremden_inhalten`; Grenze eines Auftrags →
 * `auftrag_grenze`; sonst `abgelehnt` (`deny`), bei `ask` über R-009 (Weg erlaubt, Schalter aus)
 * `zusammenarbeit_aus`, sonst `regel_fehlt` (`ask`, `prepare`).
 * Die Codes ab Fassung 3 kennen die heutigen Verträge noch nicht (`ErrorCode`).
 */
function denialCode(
  decision: Pick<Decision, "outcome" | "preconditions"> & {
    limits?: Decision["limits"];
    caps?: readonly { name: string; result: string }[];
    matchedRules?: readonly { id: string }[];
  },
  facts?: unknown,
): ErrorCode {
  const violatedIds = (decision.preconditions ?? [])
    .filter((entry) => entry.result === "verletzt")
    .map((entry) => PRECONDITION_ID_BY_NAME_5[entry.name])
    .filter((id): id is string => id !== undefined)
    .sort();
  const first = violatedIds[0];
  if (first !== undefined) {
    if (first === "V-40" && zielInAnderemTeam(facts)) return "ziel_in_anderem_team" as ErrorCode;
    return (PRECONDITIONS_5[first] as FormatPrecondition).errorCode;
  }
  const limits = decision.limits ?? [];
  const violated = (name: string) =>
    limits.some((entry) => entry.name === name && entry.result === "verletzt");
  if (violated("not_aus")) return "angehalten";
  if (RUN_LIMITS_5.some(violated)) return "limit_erreicht";
  for (const [name, code] of LIMIT_CODES_5) if (violated(name)) return code as ErrorCode;
  const gedeckelt = (decision.caps ?? []).some(
    (cap) => cap.name === "fremd_dann_verboten" && cap.result === "gedeckelt",
  );
  if (gedeckelt) return "nach_fremden_inhalten" as ErrorCode;
  if (AUFTRAG_LIMITS_5.some(violated)) return "auftrag_grenze" as ErrorCode;
  if (decision.outcome === "deny" || decision.outcome === "allow") return "abgelehnt";
  if (decision.matchedRules?.some((rule) => rule.id === "R-009")) {
    return "zusammenarbeit_aus" as ErrorCode;
  }
  return "regel_fehlt";
}

/** Fassung 5, eingefroren und in Kraft. */
export const GATE_FORMAT_5: GateFormatSpec = {
  format: 5,
  actions: ACTION_TYPES_5,
  facts: Object.fromEntries(ACTION_TYPES_5.map((type) => [type, ACTIONS_5[type].facts])),
  target: Object.fromEntries(ACTION_TYPES_5.map((type) => [type, ACTIONS_5[type].target])),
  actor: Object.fromEntries(ACTION_TYPES_5.map((type) => [type, ACTIONS_5[type].actor])),
  request: REQUEST_5,
  decision: DECISION_5,
  decisionFor,
  result: RESULT_5,
  errorCodes: ERROR_CODES_5,
  preconditions: PRECONDITIONS_5,
  limits: LIMITS_5,
  limitOrder: LIMIT_ORDER_5,
  caps: CAPS_5,
  capOrder: CAP_ORDER_5,
  denialCode,
  hasFact,
  conditionHolds,
  ruleApplies,
  checkPreconditions,
  checkLimits,
  evaluate,
};
