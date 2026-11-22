/**
 * PaiBot – Vertrag der Tor-Fassung 4 „Bots, Teams und Fäden als Daten“: was Fassung 4 gegenüber
 * Fassung 3 neu kennt (Aktionen des Besitzers für Bots, Teams, Entwürfe und Fäden, den Fakt
 * `botPaused`, die Grenzen G-15, G-32 bis G-34, die Vorbedingungen V-25, V-27 bis V-31, V-37 und
 * V-42 bis V-44, Fehlercodes). Der Vertrag steht zur Prüfung, ist aber noch nicht eingefroren und
 * nicht in Kraft: Das Tor entscheidet weiter mit `GATE_FORMAT` aus `./gate`, und die Listen
 * `LIMITS_BY_ID` und `PRECONDITIONS` dort bleiben, wie sie sind. Die neuen Aktionen stehen in
 * `ACTIONS`, aber in `UNSTORED_ACTION_TYPES`, bis die Datenbank sie speichern kann.
 *
 * Die Auswertung steht in `packages/gate/src/fassungen/fassung-4.ts`; ein Test dort prüft, dass
 * sie genau diesen Vertrag umsetzt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { z } from "zod";
import { countSchema, positiveIntSchema, sha256DigestSchema } from "./grundtypen";
import { ID_BODY_PATTERN, idSchema } from "./id";

/** Nummer der Fassung, die dieser Vertrag beschreibt. */
export const FORMAT_4 = 4;

/**
 * Kennung eines Teams (`tea_…`) und eines Entwurfs (`ent_…`). Die Arten stehen noch nicht in
 * `ID_PREFIX`; die Vorsilben sind ein Vorschlag, bis die Datenbank sie festlegt.
 */
export const teamIdSchema = z.string().regex(new RegExp(`^tea_${ID_BODY_PATTERN}$`));
export const entwurfIdSchema = z.string().regex(new RegExp(`^ent_${ID_BODY_PATTERN}$`));

/** Neue Aktionen der Fassung 4 (alle vom Besitzer, kein Bot darf eine auslösen). */
export const TEAM_ACTION_TYPES = [
  "bot.anlegen",
  "bot.loeschen",
  "bot.pausieren",
  "team.anlegen",
  "team.aendern",
  "team.loeschen",
  "bot.team_setzen",
  "team.entwurf_erstellen",
  "team.entwurf_verwerfen",
  "team.entwurf_anlegen",
  "team.entwurf_zuruecknehmen",
  "faden.anlegen",
  "einstellung.stabschef_setzen",
] as const;
export type TeamActionType = (typeof TEAM_ACTION_TYPES)[number];

/** Felder eines Teams, die `team.aendern` betreffen kann. */
export const TEAM_FIELDS = ["name", "lead", "collaboration", "acceptance"] as const;

/** Herkunft eines Entwurfs. In Fassung 4 nur die Vorlage aus dem Image. */
export const ENTWURF_HERKUENFTE = ["vorlage"] as const;

const botId = idSchema("bot");
const conversationId = idSchema("conversation");
const installationId = idSchema("installation");
const deviceId = idSchema("device");
const credentialSchema = z.enum(["sitzung", "passwort", "einrichtungs_code"]);
const ownerFacts = { credential: credentialSchema, device: deviceId.optional() };

/**
 * Ziel und Fakten je neuer Aktion der Fassung 4 (Rohform; streng in der Auswertung). Alle Fakten
 * kommen vom Server aus der Datenbank, nie vom Browser und nie vom Modell. Namen, Anweisungen,
 * Zettel und Entwürfe stehen nie darin, nur Zahlen, Wahrheitswerte und Abdrücke.
 */
export const TEAM_ACTION_SHAPES = {
  /** Der Besitzer legt einen Bot an; `botsAfter` ist die Zahl der Bots nach dem Anlegen. */
  "bot.anlegen": {
    actorKind: "besitzer",
    target: { botId },
    facts: { ...ownerFacts, botsAfter: countSchema, maxBots: positiveIntSchema },
  },
  /** Der Besitzer löscht einen Bot (V-37: nicht der Standard-Bot, V-42: kein aktiver Lauf). */
  "bot.loeschen": {
    actorKind: "besitzer",
    target: { botId },
    facts: { ...ownerFacts, isDefaultBot: z.boolean(), botRunActive: z.boolean() },
  },
  /** Der Besitzer pausiert einen Bot (`paused: true`) oder hebt die Pause auf. */
  "bot.pausieren": {
    actorKind: "besitzer",
    target: { botId },
    facts: { ...ownerFacts, paused: z.boolean(), wasPaused: z.boolean() },
  },
  /** Der Besitzer legt ein Team an. */
  "team.anlegen": {
    actorKind: "besitzer",
    target: { teamId: teamIdSchema },
    facts: { ...ownerFacts },
  },
  /** Der Besitzer ändert Name, Leitung, Zusammenarbeit oder Abnahme-Standard eines Teams. */
  "team.aendern": {
    actorKind: "besitzer",
    target: { teamId: teamIdSchema },
    facts: {
      ...ownerFacts,
      fields: z.array(z.enum(TEAM_FIELDS)).min(1),
      teamExists: z.boolean(),
      /**
       * Die neue Leitung gehört zum Team (Vorbedingung V-44). Steht `lead` nicht in `fields`, ist
       * der Wert wahr.
       */
      leadInTeam: z.boolean(),
    },
  },
  /** Der Besitzer löscht ein Team. */
  "team.loeschen": {
    actorKind: "besitzer",
    target: { teamId: teamIdSchema },
    facts: { ...ownerFacts, teamExists: z.boolean() },
  },
  /**
   * Der Besitzer ordnet einen Bot einem Team zu oder nimmt ihn heraus (kein `teamId`). Beim
   * Herausnehmen ist `teamExists` wahr, denn es gibt kein Team, das fehlen könnte.
   */
  "bot.team_setzen": {
    actorKind: "besitzer",
    target: { botId, teamId: teamIdSchema.optional() },
    facts: { ...ownerFacts, teamExists: z.boolean() },
  },
  /** Der Besitzer erstellt einen Entwurf aus einer Vorlage (G-34, Not-Aus G-05). */
  "team.entwurf_erstellen": {
    actorKind: "besitzer",
    target: { entwurfId: entwurfIdSchema },
    facts: {
      ...ownerFacts,
      herkunft: z.enum(ENTWURF_HERKUENFTE),
      offeneEntwuerfe: countSchema,
      maxOffeneEntwuerfe: positiveIntSchema,
      entwuerfeHeute: countSchema,
      maxEntwuerfeProTag: positiveIntSchema,
      killSwitch: z.boolean(),
    },
  },
  /** Der Besitzer verwirft einen offenen Entwurf. */
  "team.entwurf_verwerfen": {
    actorKind: "besitzer",
    target: { entwurfId: entwurfIdSchema },
    facts: { ...ownerFacts, entwurfOffen: z.boolean() },
  },
  /**
   * Der Besitzer legt aus einem Entwurf das Team und seine Bots an, in einer Transaktion. Er
   * bestätigt genau den Abdruck, den er gesehen hat (V-28). Zugriffe, Regeln, Automationen und
   * Merkzettel sind in Fassung 4 nicht Teil des Entwurfs und stehen nicht in den Fakten.
   */
  "team.entwurf_anlegen": {
    actorKind: "besitzer",
    target: { entwurfId: entwurfIdSchema },
    facts: {
      ...ownerFacts,
      entwurfOffen: z.boolean(),
      /** Abdruck des gespeicherten Entwurfs. */
      entwurfDigest: sha256DigestSchema,
      /** Abdruck, den der Besitzer in der Vorschau gesehen hat. */
      seenEntwurfDigest: sha256DigestSchema,
      namesFree: z.boolean(),
      modelsAvailable: z.boolean(),
      contactInDraft: z.boolean(),
      draftBots: countSchema,
      maxDraftBots: positiveIntSchema,
      botsAfter: countSchema,
      maxBots: positiveIntSchema,
      killSwitch: z.boolean(),
    },
  },
  /** Der Besitzer nimmt ein angelegtes Team zurück, solange nichts benutzt oder geändert ist. */
  "team.entwurf_zuruecknehmen": {
    actorKind: "besitzer",
    target: { entwurfId: entwurfIdSchema },
    facts: { ...ownerFacts, allUnused: z.boolean(), allUnchanged: z.boolean() },
  },
  /**
   * Der Besitzer legt einen Faden an (eine Unterhaltung eines Teams) mit einem Zettel. Im Ziel
   * steht nur der Abdruck des Zettels, in den Fakten nur seine Länge.
   */
  "faden.anlegen": {
    actorKind: "besitzer",
    target: { conversationId, teamId: teamIdSchema, zettelDigest: sha256DigestSchema },
    facts: {
      ...ownerFacts,
      teamExists: z.boolean(),
      zettelChars: countSchema,
      maxZettelChars: positiveIntSchema,
    },
  },
  /** Der Besitzer schaltet Pai als Stabschef ein oder aus. */
  "einstellung.stabschef_setzen": {
    actorKind: "besitzer",
    target: { installationId },
    facts: { ...ownerFacts, on: z.boolean(), wasOn: z.boolean() },
  },
} as const satisfies Record<
  TeamActionType,
  { actorKind: "besitzer"; target: z.ZodRawShape; facts: z.ZodRawShape }
>;

/**
 * Neuer Pflicht-Fakt an `modell.anfragen`, `nachricht.senden` und `werkzeug.aufrufen` (damit G-15 und `bot.pausieren` im Tor wirken): Der Bot
 * der Unterhaltung ist pausiert. Füllwert für den Obermengen-Test: `false`.
 */
export const BOT_PAUSED_FACTS = { botPaused: z.boolean() } as const;

/** Aktionen, an denen Grenze G-15 `bot_bereit` prüft. */
export const BOT_READY_ACTIONS = [
  "modell.anfragen",
  "nachricht.senden",
  "werkzeug.aufrufen",
] as const;

/** Neue Grenzen der Fassung 4; sie stehen in jeder Entscheidung hinter G-40. */
export const LIMITS_BY_ID_4 = {
  /** `botPaused = false` (an `modell.anfragen`, `nachricht.senden` und `werkzeug.aufrufen`). */
  "G-15": "bot_bereit",
  /** `draftBots <= maxDraftBots` (an `team.entwurf_anlegen`). */
  "G-32": "entwurf_umfang",
  /** `botsAfter <= maxBots` (an `bot.anlegen` und `team.entwurf_anlegen`). */
  "G-33": "bots_gesamt",
  /** `offeneEntwuerfe < maxOffeneEntwuerfe` und `entwuerfeHeute < maxEntwuerfeProTag`; der Wert im Beleg nennt bei Verletzung die Ursache. */
  "G-34": "entwuerfe_je_tag",
} as const;

/** Neue Vorbedingungen der Fassung 4. */
export const PRECONDITIONS_4 = {
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
    errorCode: "entwurf_veraltet",
  },
  "V-29": {
    name: "entwurf_namen_frei",
    actions: ["team.entwurf_anlegen"],
    require: [{ fact: "namesFree", op: "eq", value: true }],
    errorCode: "entwurf_name_vergeben",
  },
  "V-30": {
    name: "entwurf_modelle_vorhanden",
    actions: ["team.entwurf_anlegen"],
    require: [{ fact: "modelsAvailable", op: "eq", value: true }],
    errorCode: "entwurf_modell_fehlt",
  },
  "V-31": {
    name: "entwurf_ansprechpartner",
    actions: ["team.entwurf_anlegen"],
    require: [{ fact: "contactInDraft", op: "eq", value: true }],
    errorCode: "entwurf_ansprechpartner_fehlt",
  },
  "V-37": {
    name: "standard_bot_bleibt",
    actions: ["bot.loeschen"],
    require: [{ fact: "isDefaultBot", op: "eq", value: false }],
    errorCode: "standard_bot_bleibt",
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
    errorCode: "entwurf_benutzt",
  },
  "V-44": {
    name: "leitung_im_team",
    actions: ["team.aendern"],
    require: [{ fact: "leadInTeam", op: "eq", value: true }],
    errorCode: "leitung_nicht_im_team",
  },
} as const;

/** Neue Fehlercodes der Fassung 4 mit ihrem HTTP-Status. */
export const ERROR_STATUS_4 = {
  /** Der Bot der Unterhaltung ist pausiert (Grenze G-15). */
  bot_pausiert: 409,
  /** Der Entwurf hat sich seit der Vorschau geändert (Vorbedingung V-28). */
  entwurf_veraltet: 409,
  /** Ein Name des Entwurfs ist schon vergeben (Vorbedingung V-29). */
  entwurf_name_vergeben: 409,
  /** Ein Modell des Entwurfs gibt es nicht (Vorbedingung V-30). */
  entwurf_modell_fehlt: 409,
  /** Der Ansprechpartner gehört nicht zum Entwurf (Vorbedingung V-31). */
  entwurf_ansprechpartner_fehlt: 409,
  /** Der Entwurf ist nicht mehr unbenutzt oder unverändert (Vorbedingung V-43). */
  entwurf_benutzt: 409,
  /** Der Standard-Bot lässt sich nicht löschen (Vorbedingung V-37). */
  standard_bot_bleibt: 409,
  /** Die neue Leitung gehört nicht zum Team (Vorbedingung V-44). */
  leitung_nicht_im_team: 409,
  /** Der Entwurf hat zu viele Bots (Grenze G-32). */
  entwurf_zu_gross: 400,
} as const satisfies Record<string, number>;
export type ErrorCode4 = keyof typeof ERROR_STATUS_4;
export const ERROR_CODES_4 = Object.keys(ERROR_STATUS_4) as [ErrorCode4, ...ErrorCode4[]];
