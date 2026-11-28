/**
 * PaiBot – Vertrag der Tor-Fassung 5 „Zusammenarbeit“: was Fassung 5 gegenüber Fassung 4 neu kennt.
 * Bots geben sich Arbeit (`auftrag.uebergeben`), melden den Stand ihres Auftrags
 * (`auftrag.melden`), und der Besitzer bricht Aufträge ab, nimmt sie ab, gibt sie zurück, ändert
 * einen wartenden Zettel und erhöht das Budget eines Auftragsbaums. Dazu kommen Fakten an
 * `modell.anfragen`, `werkzeug.aufrufen`, `nachricht.senden` und `team.entwurf_erstellen`, die
 * Standard-Regeln R-009 und R-015 bis R-019, die Vorbedingungen V-39 bis V-41, die Grenzen G-09
 * bis G-13, G-38, G-39 und G-41 bis G-46, der Deckel D-02 und neue Fehlercodes.
 *
 * In Kraft; Grundsätze und Stand stehen im Kommentar unter den Importen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import { z } from "zod";
import type { RuleDefinition } from "./gate";
import { countSchema, positiveIntSchema, sha256DigestSchema } from "./grundtypen";
import { ID_BODY_PATTERN, idSchema } from "./id";

/*
 * Der Vertrag ist in Kraft (`GATE_FORMAT = 5`): Die Auswertung steht eingefroren in
 * `packages/gate/src/fassungen/fassung-5.ts`, die festen Fälle in
 * `packages/gate/src/fassungen/fassung-5.korpus.json`; die Datenbank kennt Aktionen und
 * Standard-Regeln ab Migration 0019.
 *
 * Grundsätze, die hier festgeschrieben sind:
 * - Alle Fakten kommen vom Server aus der Datenbank, nie vom Modell und nie vom Browser. Zettel,
 *   Ziele, Namen und Texte stehen nie in den Fakten, nur Abdrücke (`zettelDigest`) und Längen.
 * - Wer wem Arbeit geben darf, entscheidet allein die Vorbedingung V-40 aus festen Rollen. Jeder
 *   Weg, der dort nicht steht, ist `deny`, nie `ask`, auch wenn eine Regel alles erlaubt.
 * - Die Standard-Regeln erlauben einen erlaubten Weg nur, wenn der Besitzer es am Team
 *   (Zusammenarbeit) bzw. für Pai (Stabschef) eingeschaltet hat; sonst fragt R-009, und Fragen
 *   heißt in dieser Stufe: abgelehnt. R-009 liegt vor jeder eigenen Regel: Eigene Regeln
 *   lockern und verschärfen `auftrag.uebergeben` für Bots nicht.
 * - Nach fremden Inhalten gibt es keine Übergabe (Deckel D-02 macht aus `allow` und `ask` ein
 *   `deny`).
 * - Ein Bot mit Auftrag ruft keine Werkzeuge (G-42 gilt bei jeder Art außer `keiner`).
 */

/** Nummer der Fassung, die dieser Vertrag beschreibt. */
export const FORMAT_5 = 5;

/** Kennung eines Auftrags (`auf_…`). */
export const auftragIdSchema = z.string().regex(new RegExp(`^auf_${ID_BODY_PATTERN}$`));
const teamIdSchema = z.string().regex(new RegExp(`^tea_${ID_BODY_PATTERN}$`));

/** Neue Aktionen der Fassung 5: zwei für Bots, fünf für den Besitzer. */
export const AUFTRAG_ACTION_TYPES = [
  "auftrag.uebergeben",
  "auftrag.melden",
  "auftrag.abbrechen",
  "auftrag.abnehmen",
  "auftrag.zurueckgeben",
  "auftrag.zettel_aendern",
  "auftrag.budget_erhoehen",
] as const;
export type AuftragActionType = (typeof AUFTRAG_ACTION_TYPES)[number];

/**
 * Art des Auftrags, unter dem ein Lauf steht. `keiner`: kein Auftrag (Direkt-Chat, Lauf auf deine
 * Nachricht). Die übrigen Arten setzt nur der Server.
 */
export const AUFTRAG_ARTEN = [
  "keiner",
  "wurzel",
  "uebergabe",
  "bitte",
  "rueckkehr",
  "faecher",
  "sammeln",
  "rueckmeldung",
  "rueckgabe",
] as const;
export type AuftragArt = (typeof AUFTRAG_ARTEN)[number];

/** Art der Unterhaltung, in der der Lauf steht: Direkt-Chat mit einem Bot oder Faden eines Teams. */
export const CONVERSATION_KINDS_5 = ["direkt", "faden"] as const;

/** Rolle des gebenden Bots: Pai als Stabschef, Leitung eines Teams, Mitglied, ohne Rolle. */
export const GEBER_ROLLEN = ["stabschef", "leitung", "mitglied", "keine"] as const;

/**
 * Rolle des Empfängers aus Sicht des Gebers. `selbst`: der Geber selbst. `ohne_team`: ein Bot, der
 * zu keinem Team gehört. Ein Bot eines anderen Teams hat seine Rolle dort (`leitung`/`mitglied`)
 * und `sameTeam = false`.
 */
export const ZIEL_ROLLEN = ["stabschef", "leitung", "mitglied", "selbst", "ohne_team"] as const;

/**
 * Art der Übergabe, aus der festen Zeile der Antwort: `team` (`@Team …:`, nur Pai an eine
 * Leitung), `uebergabe` (Leitung an Mitglied), `bitte` (Mitglied an Kollegen), `rueckgabe`
 * (`Zurück an @Name:`, Leitung an Mitglied).
 */
export const UEBERGABE_ARTEN = ["team", "uebergabe", "bitte", "rueckgabe"] as const;

/** Schalter „Zusammenarbeit“ am Team. */
export const ZUSAMMENARBEIT_5 = ["aus", "leitung_fuehrt"] as const;

/** Meldung eines Bots zu seinem Auftrag: fertig (nur Leitung) oder Frage an dich. */
export const MELDUNGEN = ["fertig", "frage"] as const;

/** Zweck einer Anfrage an ein Modell: Antwort im Chat oder Team-Entwurf durch Pai. */
export const ZWECKE = ["chat", "team_entwurf"] as const;

/** Herkunft eines Entwurfs: Vorlage aus dem Image oder von Pai geschrieben. */
export const ENTWURF_HERKUENFTE_5 = ["vorlage", "pai"] as const;

/** Zuschlag, den `auftrag.budget_erhoehen` einem Auftragsbaum gibt (Token). */
export const ZUSCHLAG_TOKENS = 10000;

/** Höchstzahl der Zuschläge je Auftragsbaum (G-46). */
export const MAX_ZUSCHLAEGE = 5;

/**
 * Höchste Summe der Zuschläge je Auftragsbaum (`MAX_ZUSCHLAEGE` × `ZUSCHLAG_TOKENS`). Ein größerer
 * Wert für `baumZuschlagTokens` ist ungültig: Das Tor verlässt sich für G-11 nicht allein auf die
 * Datenbank.
 */
export const MAX_BAUM_ZUSCHLAG_TOKENS = MAX_ZUSCHLAEGE * ZUSCHLAG_TOKENS;

/**
 * Sind die Fakten stimmig (an `modell.anfragen` und `auftrag.melden`)? Ungültig ist:
 * - `botHatAuftrag = true` mit `auftragArt = keiner`: Ein gültiger Auftrag hat immer eine Art
 *   (sonst entfielen G-11 und G-12, während R-016 bzw. R-018 erlaubt);
 * - `conversationKind = faden` mit `auftragArt = keiner`: Jeder Lauf in einem Faden gehört zu
 *   dessen Auftragsbaum;
 * - `conversationKind = faden` mit `botOfConversation = true`: Ein Faden hat keinen eigenen Bot,
 *   dort antwortet nur, wer einen Auftrag hat (R-016).
 * Umgekehrt ist `botHatAuftrag = false` mit einer Art möglich (Pais Rückmeldungs-Lauf in seinem
 * Direkt-Chat zählt im Baum, ohne eigenen Auftrag).
 */
export function anfrageStimmig(facts: {
  botHatAuftrag?: unknown;
  auftragArt?: unknown;
  conversationKind?: unknown;
  botOfConversation?: unknown;
}): boolean {
  if (facts.botHatAuftrag === true && facts.auftragArt === "keiner") return false;
  if (facts.conversationKind === "faden" && facts.auftragArt === "keiner") return false;
  if (facts.conversationKind === "faden" && facts.botOfConversation === true) return false;
  return true;
}

const botId = idSchema("bot");
const runId = idSchema("run");
const conversationId = idSchema("conversation");
const deviceId = idSchema("device");
const credentialSchema = z.enum(["sitzung", "passwort", "einrichtungs_code"]);
const ownerFacts = { credential: credentialSchema, device: deviceId.optional() };
const triggerSchema = z.enum(["chat", "automation"]);
/** Summe der Zuschläge eines Baums: Ganzzahl von 0 bis `MAX_BAUM_ZUSCHLAG_TOKENS`. */
const zuschlagSummeSchema = countSchema.max(MAX_BAUM_ZUSCHLAG_TOKENS);

/** Fakten des Auftragsbaums an `modell.anfragen`. Fehlen sie bei einem Lauf mit Auftrag: verletzt. */
export const BAUM_FACTS = {
  /** Token aller Läufe des Baums bisher. */
  baumTokens: countSchema.optional(),
  /** Grenze der Token je Baum (ohne Zuschläge). */
  maxBaumTokens: positiveIntSchema.optional(),
  /** Summe der Zuschläge des Besitzers (`auftrag.budget_erhoehen`), höchstens 50 000. */
  baumZuschlagTokens: zuschlagSummeSchema.optional(),
  /** Sekunden seit der Wurzel. */
  baumSekunden: countSchema.optional(),
  maxBaumSekunden: positiveIntSchema.optional(),
} as const;

/**
 * Neue Fakten an Aktionen, die es schon gibt. Pflicht, wo nicht `optional`. Füllwerte für den
 * Obermengen-Test stehen in `FUELLWERTE_5`.
 */
export const NEW_FACTS_5 = {
  "modell.anfragen": {
    conversationKind: z.enum(CONVERSATION_KINDS_5),
    /**
     * Der Bot hat in **dieser** Unterhaltung einen gültigen, laufenden Auftrag. Ein Auftrag aus
     * einem anderen Faden zählt nicht.
     */
    botHatAuftrag: z.boolean(),
    auftragArt: z.enum(AUFTRAG_ARTEN),
    zweck: z.enum(ZWECKE),
    ...BAUM_FACTS,
  },
  "werkzeug.aufrufen": {
    /** Art des Auftrags des Laufs; G-42 erlaubt Werkzeuge nur bei `keiner`. */
    auftragArt: z.enum(AUFTRAG_ARTEN),
  },
  "nachricht.senden": {
    conversationKind: z.enum(CONVERSATION_KINDS_5),
    /** Zahl der Erwähnungen in der Nachricht (G-38); im Direkt-Chat darf sie fehlen. */
    erwaehnungen: countSchema.optional(),
    maxErwaehnungen: positiveIntSchema.optional(),
  },
} as const;

/** `team.entwurf_erstellen`: Herkunft jetzt auch `pai`; sonst wie Fassung 4. */
export const ENTWURF_ERSTELLEN_HERKUNFT_5 = z.enum(ENTWURF_HERKUENFTE_5);

/** Füllwerte der neuen Pflicht-Fakten: damit verhalten sich alle Fälle der Fassungen 1 bis 4 gleich. */
export const FUELLWERTE_5 = {
  "modell.anfragen": {
    conversationKind: "direkt",
    botHatAuftrag: false,
    auftragArt: "keiner",
    zweck: "chat",
  },
  "werkzeug.aufrufen": { auftragArt: "keiner" },
  "nachricht.senden": { conversationKind: "direkt" },
} as const;

/**
 * Ziel und Fakten je neuer Aktion der Fassung 5 (Rohform; streng in der Auswertung). Alle Fakten
 * kommen vom Server. Der Zettel steht nie darin, nur sein Abdruck im Ziel und seine Länge.
 */
export const AUFTRAG_ACTION_SHAPES = {
  /**
   * Ein Bot gibt einem anderen Arbeit. Erlaubt sind nur die Wege aus V-40; Rollen und Art kommen
   * aus der Datenbank und der festen Zeile der Antwort, nie aus dem Text des Modells.
   */
  "auftrag.uebergeben": {
    actorKind: "bot",
    target: {
      conversationId,
      runId,
      botId,
      toBotId: botId,
      auftragId: auftragIdSchema,
      zettelDigest: sha256DigestSchema,
      teamId: teamIdSchema.optional(),
    },
    facts: {
      geberRolle: z.enum(GEBER_ROLLEN),
      zielRolle: z.enum(ZIEL_ROLLEN),
      art: z.enum(UEBERGABE_ARTEN),
      /** Art des Auftrags, unter dem der gebende Lauf steht. */
      auftragArt: z.enum(AUFTRAG_ARTEN),
      /** Geber und Empfänger gehören zum selben Team. */
      sameTeam: z.boolean(),
      conversationKind: z.enum(CONVERSATION_KINDS_5),
      /** Schalter „Zusammenarbeit“ des Teams des Fadens. */
      zusammenarbeit: z.enum(ZUSAMMENARBEIT_5),
      /** Einstellung „Pai darf Teams Aufträge geben“. */
      stabschefErlaubt: z.boolean(),
      /** Auslöser des gebenden Laufs: deine Nachricht (`chat`) oder eine Automation. */
      trigger: triggerSchema,
      untrustedInput: z.boolean(),
      killSwitch: z.boolean(),
      /** Der Empfänger ist pausiert (G-15). */
      toBotPaused: z.boolean(),
      /** Der Auftrag des Gebers ist offen (V-39). */
      auftragOffen: z.boolean(),
      /** Der Empfänger hat in dieser Wurzel schon einen Auftrag; nur bei Rückgabe nicht immer wahr. */
      zielHatAuftrag: z.boolean(),
      /** Der Empfänger ist der Geber oder ein Vorfahre im Baum (G-13). */
      zielImPfad: z.boolean(),
      tiefe: countSchema,
      maxTiefe: positiveIntSchema,
      baumAuftraege: countSchema,
      maxBaumAuftraege: positiveIntSchema,
      baumSekunden: countSchema,
      maxBaumSekunden: positiveIntSchema,
      /** Frühere Antworten dieses Laufs mit Übergaben (G-39). */
      uebergabeAntworten: countSchema,
      maxUebergabeAntworten: positiveIntSchema,
      offeneUnterauftraege: countSchema,
      maxBreite: positiveIntSchema,
      /** Aufträge der Leitung an diesen Empfänger in dieser Wurzel (G-43). */
      auftraegeAnZiel: countSchema,
      maxAuftraegeJeMitglied: positiveIntSchema,
      bittenImAuftrag: countSchema,
      maxBitten: positiveIntSchema,
      zettelChars: countSchema,
      maxZettelChars: positiveIntSchema,
    },
  },
  /**
   * Ein Bot meldet den Stand seines Auftrags. `meldungPasstZurRolle` muss zu Meldung und Rolle
   * passen (`fertig` nur Leitung, `frage` Leitung oder Mitglied); sonst ist die Eingabe ungültig.
   */
  "auftrag.melden": {
    actorKind: "bot",
    target: { conversationId, runId, botId, auftragId: auftragIdSchema },
    facts: {
      meldung: z.enum(MELDUNGEN),
      botRolle: z.enum(GEBER_ROLLEN),
      meldungPasstZurRolle: z.boolean(),
      botHatAuftrag: z.boolean(),
      conversationKind: z.enum(CONVERSATION_KINDS_5),
      auftragArt: z.enum(AUFTRAG_ARTEN),
      auftragOffen: z.boolean(),
      untrustedInput: z.boolean(),
      killSwitch: z.boolean(),
      rueckfragenImFaden: countSchema,
      maxRueckfragen: positiveIntSchema,
    },
  },
  /** Der Besitzer bricht einen offenen Auftrag ab. */
  "auftrag.abbrechen": {
    actorKind: "besitzer",
    target: { conversationId, auftragId: auftragIdSchema },
    facts: { ...ownerFacts, auftragOffen: z.boolean() },
  },
  /** Der Besitzer nimmt einen offenen Auftrag ab. */
  "auftrag.abnehmen": {
    actorKind: "besitzer",
    target: { conversationId, auftragId: auftragIdSchema },
    facts: { ...ownerFacts, auftragOffen: z.boolean() },
  },
  /** Der Besitzer gibt einen Auftrag zurück, auch eine schon fertige Wurzel (ohne V-39). */
  "auftrag.zurueckgeben": {
    actorKind: "besitzer",
    target: {
      conversationId,
      auftragId: auftragIdSchema,
      toBotId: botId,
      zettelDigest: sha256DigestSchema,
    },
    facts: {
      ...ownerFacts,
      zettelChars: countSchema,
      maxZettelChars: positiveIntSchema,
      killSwitch: z.boolean(),
    },
  },
  /** Der Besitzer ändert den Zettel eines offenen, noch nicht gestarteten Auftrags. */
  "auftrag.zettel_aendern": {
    actorKind: "besitzer",
    target: { conversationId, auftragId: auftragIdSchema, zettelDigest: sha256DigestSchema },
    facts: {
      ...ownerFacts,
      auftragOffen: z.boolean(),
      auftragGestartet: z.boolean(),
      zettelChars: countSchema,
      maxZettelChars: positiveIntSchema,
    },
  },
  /**
   * Der Besitzer gibt einem Auftragsbaum 10 000 Token mehr: nur bei ausgeschöpftem Budget (V-41),
   * höchstens `maxZuschlaege` Mal je Baum (G-46).
   */
  "auftrag.budget_erhoehen": {
    actorKind: "besitzer",
    target: { conversationId, auftragId: auftragIdSchema },
    facts: {
      ...ownerFacts,
      auftragOffen: z.boolean(),
      baumTokens: countSchema,
      maxBaumTokens: positiveIntSchema,
      baumZuschlagTokens: zuschlagSummeSchema,
      zuschlagTokens: z.literal(ZUSCHLAG_TOKENS),
      zuschlaege: countSchema,
      /** Höchstzahl der Zuschläge je Baum: fest 5 (G-46); ein anderer Wert ist ungültig. */
      maxZuschlaege: z.literal(MAX_ZUSCHLAEGE),
    },
  },
} as const satisfies Record<
  AuftragActionType,
  { actorKind: "besitzer" | "bot"; target: z.ZodRawShape; facts: z.ZodRawShape }
>;

/** Passt die Meldung zur Rolle? `fertig` nur die Leitung, `frage` Leitung oder Mitglied. */
export function meldungPasstZurRolle(meldung: string, botRolle: string): boolean {
  if (meldung === "fertig") return botRolle === "leitung";
  return botRolle === "leitung" || botRolle === "mitglied";
}

/** Neue Grenzen der Fassung 5; sie stehen in jeder Entscheidung hinter G-34, in dieser Reihenfolge. */
export const LIMITS_BY_ID_5 = {
  /** `tiefe <= maxTiefe` (an `auftrag.uebergeben`). */
  "G-09": "auftrag_tiefe",
  /** `baumAuftraege < maxBaumAuftraege` (an `auftrag.uebergeben`). */
  "G-10": "auftrag_anzahl",
  /**
   * `baumTokens < maxBaumTokens + baumZuschlagTokens` (an `modell.anfragen`, sobald ein Auftrag
   * da ist oder ein Fakt des Baums mitkommt; fehlt einer: verletzt).
   */
  "G-11": "auftrag_budget",
  /** `baumSekunden < maxBaumSekunden` (an `auftrag.uebergeben` und wie G-11 an `modell.anfragen`). */
  "G-12": "auftrag_zeit",
  /** `zielImPfad = false` (an `auftrag.uebergeben`). */
  "G-13": "kein_kreis",
  /** `erwaehnungen <= maxErwaehnungen` (an `nachricht.senden`; entfällt im Direkt-Chat ohne Zahl). */
  "G-38": "erwaehnungen_je_nachricht",
  /** `uebergabeAntworten < maxUebergabeAntworten` (an `auftrag.uebergeben`). */
  "G-39": "uebergaben_je_lauf",
  /** `offeneUnterauftraege < maxBreite` (an `auftrag.uebergeben`). */
  "G-41": "auftrag_breite",
  /** `auftragArt = keiner` (an `werkzeug.aufrufen`); jede andere Art und ein fehlender Fakt: verletzt. */
  "G-42": "werkzeug_im_auftrag",
  /** `auftraegeAnZiel < maxAuftraegeJeMitglied` (an `auftrag.uebergeben`, außer Art `team` und `bitte`). */
  "G-43": "auftraege_je_mitglied",
  /** `rueckfragenImFaden < maxRueckfragen` (an `auftrag.melden`, außer Meldung `fertig`). */
  "G-44": "rueckfragen_je_faden",
  /** `bittenImAuftrag < maxBitten` (an `auftrag.uebergeben`, nur bei Art `bitte` oder unbekannter Art). */
  "G-45": "bitten_je_auftrag",
  /** `zuschlaege < maxZuschlaege` (an `auftrag.budget_erhoehen`). */
  "G-46": "zuschlaege_je_baum",
} as const;

/** Aktionen, an denen G-15 `bot_bereit` prüft; an `auftrag.uebergeben` über `toBotPaused`. */
export const BOT_READY_ACTIONS_5 = [
  "modell.anfragen",
  "nachricht.senden",
  "werkzeug.aufrufen",
  "auftrag.uebergeben",
] as const;

/** Aktionen, an denen G-03 `laenge` den Zettel prüft (`zettelChars <= maxZettelChars`). */
export const ZETTEL_ACTIONS_5 = [
  "faden.anlegen",
  "auftrag.uebergeben",
  "auftrag.zettel_aendern",
  "auftrag.zurueckgeben",
] as const;

/** Bedingung wie in einer Regel (`fact op value`). */
type Bedingung = {
  readonly fact: string;
  readonly op: "eq" | "in" | "gte";
  readonly value: string | boolean | readonly string[];
};

/** Auftragsarten, aus denen eine Leitung weitergeben oder zurückgeben darf. */
const LEITUNG_DARF_AUS = ["wurzel", "uebergabe", "rueckkehr", "sammeln"] as const;

/**
 * Die erlaubten Wege einer Übergabe (V-40). Ein Weg gilt, wenn alle seine Bedingungen gelten;
 * eine Übergabe ist erlaubt, wenn mindestens ein Weg gilt. Alles andere ist `deny`.
 */
export const UEBERGABE_WEGE: Readonly<Record<string, readonly Bedingung[]>> = {
  /** Pai → Leitung eines Teams: nur aus deinem Direkt-Chat, nur in Läufen auf deine Nachricht. */
  pai_an_leitung: [
    { fact: "geberRolle", op: "eq", value: "stabschef" },
    { fact: "art", op: "eq", value: "team" },
    { fact: "zielRolle", op: "eq", value: "leitung" },
    { fact: "conversationKind", op: "eq", value: "direkt" },
    { fact: "auftragArt", op: "eq", value: "keiner" },
    { fact: "trigger", op: "eq", value: "chat" },
  ],
  /** Leitung → Mitglied ihres Teams (Übergabe) im Faden. */
  leitung_an_mitglied: [
    { fact: "geberRolle", op: "eq", value: "leitung" },
    { fact: "art", op: "eq", value: "uebergabe" },
    { fact: "zielRolle", op: "eq", value: "mitglied" },
    { fact: "sameTeam", op: "eq", value: true },
    { fact: "conversationKind", op: "eq", value: "faden" },
    { fact: "auftragArt", op: "in", value: LEITUNG_DARF_AUS },
  ],
  /** Leitung → Mitglied ihres Teams (Rückgabe) im Faden. */
  leitung_gibt_zurueck: [
    { fact: "geberRolle", op: "eq", value: "leitung" },
    { fact: "art", op: "eq", value: "rueckgabe" },
    { fact: "zielRolle", op: "eq", value: "mitglied" },
    { fact: "sameTeam", op: "eq", value: true },
    { fact: "conversationKind", op: "eq", value: "faden" },
    { fact: "auftragArt", op: "in", value: LEITUNG_DARF_AUS },
  ],
  /** Mitglied mit Auftrag der Leitung → Kollege im selben Team (Bitte) im Faden. */
  mitglied_bittet_kollegen: [
    { fact: "geberRolle", op: "eq", value: "mitglied" },
    { fact: "art", op: "eq", value: "bitte" },
    { fact: "zielRolle", op: "eq", value: "mitglied" },
    { fact: "sameTeam", op: "eq", value: true },
    { fact: "conversationKind", op: "eq", value: "faden" },
    { fact: "auftragArt", op: "eq", value: "uebergabe" },
  ],
};

/**
 * Neue Vorbedingungen der Fassung 5. Über die Form der Fassungen 1 bis 4 hinaus:
 * `requireFor` (zusätzliche Bedingungen je Aktion), `requireOneOfFor` (je Aktion Gruppen, aus
 * jeder Gruppe muss mindestens eine Bedingung gelten), `requireAnyOf` (mindestens ein Weg muss ganz
 * gelten) und `requireAtLeastSum` (`fact >= Summe zweier Fakten`; Summe außerhalb der sicheren
 * Ganzzahlen oder ein fehlender Fakt: verletzt).
 */
export const PRECONDITIONS_5 = {
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
      /** Ein Zettel lässt sich nur ändern, solange der Auftrag noch nicht gestartet ist. */
      "auftrag.zettel_aendern": [
        { fact: "auftragOffen", op: "eq", value: true },
        { fact: "auftragGestartet", op: "eq", value: false },
      ],
      "auftrag.budget_erhoehen": [{ fact: "auftragOffen", op: "eq", value: true }],
    },
    requireOneOfFor: {
      "auftrag.uebergeben": [
        /**
         * Der Auftrag des Gebers ist offen. Ohne Auftrag (`auftragArt = keiner`) gibt es nichts zu
         * prüfen: Diesen Fall lässt V-40 nur für Pai aus deinem Direkt-Chat zu.
         */
        [
          { fact: "auftragArt", op: "eq", value: "keiner" },
          { fact: "auftragOffen", op: "eq", value: true },
        ],
        /** Bei einer Rückgabe hat der Empfänger in dieser Wurzel einen Auftrag. */
        [
          { fact: "art", op: "ne", value: "rueckgabe" },
          { fact: "zielHatAuftrag", op: "eq", value: true },
        ],
      ],
    },
    errorCode: "auftrag_nicht_offen",
  },
  "V-40": {
    name: "uebergabe_weg_erlaubt",
    actions: ["auftrag.uebergeben"],
    require: [],
    requireAnyOf: Object.values(UEBERGABE_WEGE),
    errorCode: "weg_nicht_erlaubt",
  },
  "V-41": {
    name: "budget_ausgeschoepft",
    actions: ["auftrag.budget_erhoehen"],
    require: [],
    requireAtLeastSum: { fact: "baumTokens", sumOf: ["maxBaumTokens", "baumZuschlagTokens"] },
    errorCode: "budget_nicht_ausgeschoepft",
  },
} as const;

/**
 * Fehlercode, wenn V-40 einen Weg ablehnt, dessen Ziel in einem anderen Team ist: Geber Leitung
 * oder Mitglied, Ziel Leitung oder Mitglied, `sameTeam = false`. Ein Bot ohne Team (`ohne_team`)
 * und alle übrigen Wege bekommen `weg_nicht_erlaubt`.
 */
export const ANDERES_TEAM_CODE = "ziel_in_anderem_team";

/**
 * Neuer Deckel der Fassung 5 in Endform ohne Wirkungs-Bedingung: Nach fremden Inhalten wird aus
 * `allow` und aus `ask` an `auftrag.uebergeben` ein `deny`; `deny` bleibt. Leeres `anyOf`
 * heißt: keine weitere Bedingung. Bewusst strenger als D-01 (dort bleibt `ask`): Nach fremden
 * Inhalten gibt es keine Übergabe, auch nicht auf Nachfrage – sonst würde R-009 nach fremden
 * Inhalten fragen statt ablehnen.
 */
export const CAPS_5 = [
  {
    id: "D-02",
    name: "fremd_dann_verboten",
    actions: ["auftrag.uebergeben"],
    // biome-ignore lint/suspicious/noThenProperty: Feld des Vertrags (ein Text, keine Funktion)
    then: "deny",
    when: [{ fact: "untrustedInput", op: "eq", value: true }],
    anyOf: [],
  },
] as const;

/** Fehlercode einer Übergabe, die D-02 abgelehnt hat. */
export const DECKEL_CODE_5 = "nach_fremden_inhalten";

/** Grenzen eines Auftrags; eine verletzte ergibt den Fehlercode `auftrag_grenze`. */
export const AUFTRAG_LIMITS_5 = [
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
] as const;

/** Neue Fehlercodes der Fassung 5 mit ihrem HTTP-Status. */
export const ERROR_STATUS_5 = {
  /** Der Auftrag ist nicht mehr offen (Vorbedingung V-39). */
  auftrag_nicht_offen: 409,
  /** Diesen Weg einer Übergabe gibt es nicht (Vorbedingung V-40). */
  weg_nicht_erlaubt: 403,
  /** Das Ziel der Übergabe gehört zu einem anderen Team (Vorbedingung V-40). */
  ziel_in_anderem_team: 403,
  /** Das Budget des Auftragsbaums ist noch nicht ausgeschöpft (Vorbedingung V-41). */
  budget_nicht_ausgeschoepft: 409,
  /** Eine Grenze des Auftrags ist erreicht (G-09 bis G-13, G-39, G-41, G-43 bis G-46). */
  auftrag_grenze: 429,
  /** Ein Bot mit Auftrag ruft keine Werkzeuge (G-42). */
  werkzeug_im_auftrag: 403,
  /** Nach fremden Inhalten gibt es keine Übergabe (Deckel D-02). */
  nach_fremden_inhalten: 403,
  /**
   * Der Weg ist erlaubt, aber der Schalter „Zusammenarbeit“ bzw. „Pai darf Teams Aufträge geben“
   * ist aus (R-009 fragt; in Stufe 1 abgelehnt).
   */
  zusammenarbeit_aus: 403,
} as const satisfies Record<string, number>;
export type ErrorCode5 = keyof typeof ERROR_STATUS_5;
export const ERROR_CODES_5 = Object.keys(ERROR_STATUS_5) as [ErrorCode5, ...ErrorCode5[]];

/**
 * Priorität von R-009: im Band der Standard-Regeln (0 bis 999), nach R-015, R-017 und R-019
 * (100), aber vor jeder eigenen Regel (ab 1000). Folge: Eine eigene Regel kann
 * `auftrag.uebergeben` für Bots weder lockern noch verschärfen. Steuern lässt sich das nur über
 * die beiden Schalter (Zusammenarbeit, Stabschef) und die festen Grenzen. Eine ältere Regel `*`
 * für Bots schaltet das Delegieren also nie still ein.
 */
export const R009_PRIORITY = 900;

/** Name des Fakts mit der Art des Akteurs (wie `ACTOR_FACT` in `./gate`). */
const ACTOR_FACT = "akteur";

const R009_V1 = {
  id: "R-009",
  version: 1,
  action: "auftrag.uebergeben",
  effect: "ask",
  stage: "ask",
  conditions: [{ fact: ACTOR_FACT, op: "eq", value: "bot" }],
  priority: R009_PRIORITY,
  source: "standard",
  enabled: true,
  title: "Bot fragt vor Übergaben",
  reason: "Der Weg ist erlaubt, aber dein Schalter für die Zusammenarbeit ist aus.",
} as const satisfies RuleDefinition;

const R015_V1 = {
  id: "R-015",
  version: 1,
  action: "auftrag.uebergeben",
  effect: "allow",
  stage: "execute",
  conditions: [
    { fact: ACTOR_FACT, op: "eq", value: "bot" },
    { fact: "geberRolle", op: "eq", value: "leitung" },
    { fact: "art", op: "in", value: ["uebergabe", "rueckgabe"] },
    { fact: "zielRolle", op: "eq", value: "mitglied" },
    { fact: "sameTeam", op: "eq", value: true },
    { fact: "conversationKind", op: "eq", value: "faden" },
    { fact: "auftragArt", op: "in", value: ["wurzel", "uebergabe", "rueckkehr", "sammeln"] },
    { fact: "zusammenarbeit", op: "eq", value: "leitung_fuehrt" },
    { fact: "untrustedInput", op: "eq", value: false },
  ],
  priority: 100,
  source: "standard",
  enabled: true,
  title: "Leitung gibt Arbeit im Team weiter",
  reason:
    "Die Leitung gibt einem Mitglied ihres Teams Arbeit; du hast die Zusammenarbeit eingeschaltet.",
} as const satisfies RuleDefinition;

const R016_V1 = {
  id: "R-016",
  version: 1,
  action: "modell.anfragen",
  effect: "allow",
  stage: "execute",
  conditions: [
    { fact: ACTOR_FACT, op: "eq", value: "bot" },
    { fact: "botHatAuftrag", op: "eq", value: true },
  ],
  priority: 100,
  source: "standard",
  enabled: true,
  title: "Bot mit gültigem Auftrag darf antworten",
  reason: "Der Bot hat in dieser Unterhaltung einen gültigen, laufenden Auftrag.",
} as const satisfies RuleDefinition;

const R017_V1 = {
  id: "R-017",
  version: 1,
  action: "auftrag.uebergeben",
  effect: "allow",
  stage: "execute",
  conditions: [
    { fact: ACTOR_FACT, op: "eq", value: "bot" },
    { fact: "geberRolle", op: "eq", value: "stabschef" },
    { fact: "art", op: "eq", value: "team" },
    { fact: "zielRolle", op: "eq", value: "leitung" },
    { fact: "conversationKind", op: "eq", value: "direkt" },
    { fact: "auftragArt", op: "eq", value: "keiner" },
    { fact: "trigger", op: "eq", value: "chat" },
    { fact: "stabschefErlaubt", op: "eq", value: true },
    { fact: "untrustedInput", op: "eq", value: false },
  ],
  priority: 100,
  source: "standard",
  enabled: true,
  title: "Pai gibt als Stabschef einem Team einen Auftrag",
  reason: "Pai gibt der Leitung eines Teams einen Auftrag aus deinem Chat; du hast es erlaubt.",
} as const satisfies RuleDefinition;

const R018_V1 = {
  id: "R-018",
  version: 1,
  action: "auftrag.melden",
  effect: "allow",
  stage: "execute",
  conditions: [
    { fact: ACTOR_FACT, op: "eq", value: "bot" },
    { fact: "botHatAuftrag", op: "eq", value: true },
    { fact: "conversationKind", op: "eq", value: "faden" },
    { fact: "meldungPasstZurRolle", op: "eq", value: true },
  ],
  priority: 100,
  source: "standard",
  enabled: true,
  title: "Bot meldet den Stand seines Auftrags",
  reason: "Der Bot meldet den Stand seines eigenen Auftrags in seinem Faden.",
} as const satisfies RuleDefinition;

const R019_V1 = {
  id: "R-019",
  version: 1,
  action: "auftrag.uebergeben",
  effect: "allow",
  stage: "execute",
  conditions: [
    { fact: ACTOR_FACT, op: "eq", value: "bot" },
    { fact: "geberRolle", op: "eq", value: "mitglied" },
    { fact: "art", op: "eq", value: "bitte" },
    { fact: "zielRolle", op: "eq", value: "mitglied" },
    { fact: "sameTeam", op: "eq", value: true },
    { fact: "conversationKind", op: "eq", value: "faden" },
    { fact: "auftragArt", op: "eq", value: "uebergabe" },
    { fact: "zusammenarbeit", op: "eq", value: "leitung_fuehrt" },
    { fact: "untrustedInput", op: "eq", value: false },
  ],
  priority: 100,
  source: "standard",
  enabled: true,
  title: "Mitglied bittet einen Kollegen um eine Zulieferung",
  reason:
    "Ein Mitglied mit Auftrag der Leitung bittet einen Kollegen im selben Faden um eine Zulieferung.",
} as const satisfies RuleDefinition;

/**
 * Neue Standard-Regeln der Fassung 5. R-015, R-017 und R-019 erlauben nur bei eingeschaltetem
 * Schalter und ohne fremde Inhalte; R-009 fängt danach jede Übergabe eines Bots auf (fragen =
 * in dieser Stufe abgelehnt). Weil V-40 jeden anderen Weg vorher ablehnt, fragt R-009 nur bei
 * „Weg erlaubt, Schalter aus“. R-016 lässt einen Bot mit Auftrag in seiner Unterhaltung antworten,
 * R-018 ihn den Stand seines Auftrags melden.
 */
export const STANDARD_RULES_5 = [
  R009_V1,
  R015_V1,
  R016_V1,
  R017_V1,
  R018_V1,
  R019_V1,
] as const satisfies readonly RuleDefinition[];
