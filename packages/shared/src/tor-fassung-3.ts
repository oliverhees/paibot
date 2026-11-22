/**
 * PaiBot – Vertrag der Tor-Fassung 3 „Apps lesen“: was Fassung 3 gegenüber Fassung 2 neu kennt
 * (Aktionen für Apps, Fakten eines Aufrufs eines App-Werkzeugs, Grenzen, Vorbedingungen,
 * Fehlercodes, Standard-Regel R-014). Der Vertrag steht fest, ist aber noch nicht in Kraft: Das
 * Tor entscheidet weiter mit `GATE_FORMAT` aus `./gate`, und die heutigen Listen dort
 * (`ACTIONS`, `LIMITS_BY_ID`, `PRECONDITIONS`, `ERROR_CODES`, Standard-Regeln) bleiben, wie sie
 * sind. Erst wenn die Datenbank Apps, Werkzeuge, Zugriffe und die Regel R-014 speichern kann,
 * kommen diese Teile dort hinein, und das Tor entscheidet mit Fassung 3.
 *
 * Die eingefrorene Auswertung steht in `packages/gate/src/fassungen/fassung-3.ts`; ein Test dort
 * prüft, dass sie genau diesen Vertrag umsetzt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { z } from "zod";
import type { RuleDefinition } from "./gate";
import { positiveIntSchema, sha256DigestSchema } from "./grundtypen";
import { idSchema } from "./id";

/** Nummer der Fassung, die dieser Vertrag beschreibt. */
export const FORMAT_3 = 3;

/** Wie sich PaiBot bei einer App anmeldet. In Fassung 3: gar nicht oder mit persönlichem Token. */
export const APP_AUTH_KINDS = ["keine", "token"] as const;
export type AppAuthKind = (typeof APP_AUTH_KINDS)[number];

/** Zugriff eines Bots auf eine App. In Fassung 3 gibt es nur „kein Zugriff“ und „darf lesen“. */
export const APP_ACCESS_LEVELS = ["keiner", "lesen"] as const;
export type AppAccessLevel = (typeof APP_ACCESS_LEVELS)[number];

/**
 * Einstufung eines App-Werkzeugs durch den Besitzer. Vorbelegt ist immer „schreiben“; „lesen“
 * wählt nur der Besitzer. Ein Hinweis des Servers („nur lesend“) ist nie eine Einstufung.
 */
export const APP_TOOL_CLASSES = ["lesen", "schreiben", "gesperrt"] as const;
export type AppToolClass = (typeof APP_TOOL_CLASSES)[number];

/**
 * Stand eines App-Werkzeugs: neu (noch nie bestätigt), bestätigt, geändert (Abdruck weicht von
 * der bestätigten Fassung ab), entfernt (fehlt in der Liste des Servers) oder gesperrt (vom
 * Besitzer so eingestuft).
 */
export const APP_TOOL_STATUSES = [
  "neu",
  "bestaetigt",
  "geaendert",
  "entfernt",
  "gesperrt",
] as const;
export type AppToolStatus = (typeof APP_TOOL_STATUSES)[number];

/** Neue Aktionen der Fassung 3 (alle vom Besitzer). */
export const APP_ACTION_TYPES = [
  "app.verbinden",
  "app.werkzeuge_bestaetigen",
  "app.zugriff_setzen",
  "app.trennen",
] as const;
export type AppActionType = (typeof APP_ACTION_TYPES)[number];

/** Origin einer App: nur `https`, ohne Pfad, Anfrage-Teil, Anker und Zugangsdaten. */
export const appOriginSchema = z
  .string()
  .max(200)
  .regex(/^https:\/\/[^/?#@\s]+$/);

const appId = idSchema("app");
const appToolId = idSchema("tool");
const botId = idSchema("bot");
const deviceId = idSchema("device");
// Gleich `credentialSchema` in `./actions`; eine eigene Kopie, weil `./actions` diesen Vertrag
// einbindet (ein Test hält beide gleich).
const credentialSchema = z.enum(["sitzung", "passwort", "einrichtungs_code"]);
const ownerFacts = { credential: credentialSchema, device: deviceId.optional() };

/**
 * Prüfungen der Adresse beim Verbinden, gerechnet vom Server aus der eingegebenen Adresse
 * (Vorbedingung V-19). Die Adresse selbst steht nie in den Fakten, nur ihr Origin und ein Abdruck.
 */
const addressFacts = {
  /** Schema ist `https`. */
  addressHttps: z.boolean(),
  /** Der Host ist öffentlich (keine Adresse im eigenen Netz, kein interner Dienst-Name). */
  addressPublic: z.boolean(),
  /** Port ist 443 (Standard von `https`). */
  addressPort443: z.boolean(),
  /** Die Adresse enthält einen Benutzer-Teil (`name:passwort@`). */
  addressUserinfo: z.boolean(),
  /** Die Adresse enthält einen Anfrage-Teil (`?…`). */
  addressQuery: z.boolean(),
  /** Die Adresse enthält einen Anker (`#…`). */
  addressFragment: z.boolean(),
};

/** Ziel und Fakten je neuer Aktion der Fassung 3 (Rohform; streng in der Auswertung). */
export const APP_ACTION_SHAPES = {
  /** Der Besitzer verbindet eine App oder testet sie erneut (`created: false`). */
  "app.verbinden": {
    actorKind: "besitzer",
    target: { appId },
    facts: {
      ...ownerFacts,
      created: z.boolean(),
      authKind: z.enum(APP_AUTH_KINDS),
      /** Ein Token ist hinterlegt (genau bei `authKind: "token"`); nie der Token selbst. */
      tokenSet: z.boolean(),
      targetOrigin: appOriginSchema,
      /** Abdruck von App-Kennung und voller Adresse. */
      targetDigest: sha256DigestSchema,
      ...addressFacts,
    },
  },
  /**
   * Der Besitzer stuft genau ein Werkzeug einer App ein. Er bestätigt genau den Abdruck, den er
   * gesehen hat (Vorbedingung V-38).
   */
  "app.werkzeuge_bestaetigen": {
    actorKind: "besitzer",
    target: { appId, toolId: appToolId },
    facts: {
      ...ownerFacts,
      toolClass: z.enum(APP_TOOL_CLASSES),
      toolVersion: positiveIntSchema,
      /** Abdruck der gespeicherten aktuellen Fassung des Werkzeugs. */
      toolDigest: sha256DigestSchema,
      /** Abdruck, den der Besitzer beim Bestätigen gesehen hat (aus seiner Anfrage). */
      seenToolDigest: sha256DigestSchema,
      toolStatus: z.enum(APP_TOOL_STATUSES),
      /** Abdruck von App-Kennung und voller Adresse, an den die Bestätigung gebunden wird. */
      targetDigest: sha256DigestSchema,
    },
  },
  /** Der Besitzer setzt den Zugriff eines Bots auf eine App. */
  "app.zugriff_setzen": {
    actorKind: "besitzer",
    target: { appId, botId },
    facts: {
      ...ownerFacts,
      access: z.enum(APP_ACCESS_LEVELS),
      previousAccess: z.enum(APP_ACCESS_LEVELS),
    },
  },
  /** Der Besitzer trennt eine App; ein hinterlegter Token wird gelöscht. */
  "app.trennen": {
    actorKind: "besitzer",
    target: { appId },
    facts: { ...ownerFacts, tokenSet: z.boolean() },
  },
} as const satisfies Record<
  AppActionType,
  { actorKind: "besitzer"; target: z.ZodRawShape; facts: z.ZodRawShape }
>;

/**
 * Neue Fakten von `werkzeug.aufrufen` in Fassung 3, genau bei Quelle `mcp` alle gesetzt, sonst
 * keiner. Sie kommen immer aus der Datenbank bzw. der Steuerung des Laufs, nie vom Server der App
 * und nie vom Modell. Bei Quelle `mcp` gilt außerdem fest: `toolReach` ist `nach_aussen`,
 * `toolForeign` ist `true`, `toolKey` beginnt mit `mcp/<toolServer>/`.
 */
export const MCP_TOOL_CALL_FACTS = {
  appId,
  /** Kennung des Werkzeugs der App in der Datenbank (`wzg_…`), wie beim Bestätigen. */
  appToolId,
  /** Fassung des Werkzeugs in der Datenbank. */
  toolVersion: positiveIntSchema,
  /** Stand des Werkzeugs (Grenze G-07). */
  toolStatus: z.enum(APP_TOOL_STATUSES),
  /**
   * Zugriff dieses Bots auf die App (Grenze G-06). Ist die App getrennt oder hat sie keine gültige
   * Anmeldung, liefert der Aufrufer `keiner`, auch wenn ein früher gesetzter Zugriff noch
   * gespeichert ist; das Tor lehnt den Aufruf dann ab (G-06, Fehlercode `werkzeug_kein_zugriff`).
   */
  appAccess: z.enum(APP_ACCESS_LEVELS),
  /** Abdruck von App-Kennung und voller Adresse, an die der Aufruf geht (Grenze G-08). */
  targetDigest: sha256DigestSchema,
  /** Abdruck der Fassung, die der Besitzer bestätigt hat (Grenze G-07). */
  confirmedToolDigest: sha256DigestSchema,
  /** Abdruck der Adresse, an die die Bestätigung gebunden ist (Grenze G-08). */
  confirmedTargetDigest: sha256DigestSchema,
  /** App des ersten App-Aufrufs in diesem Schritt (Grenze G-40), aus der Steuerung. */
  stepAppId: appId,
} as const;

/** Neue Grenzen der Fassung 3; sie stehen in jeder Entscheidung hinter G-18. */
export const LIMITS_BY_ID_3 = {
  /** `appAccess = lesen` und `toolKind = lesen`. */
  "G-06": "app_zugriff",
  /** `toolStatus = bestaetigt` und `toolDigest = confirmedToolDigest`. */
  "G-07": "werkzeug_bestaetigt",
  /** `targetDigest = confirmedTargetDigest`. */
  "G-08": "app_ziel",
  /** `stepAppId = appId`. */
  "G-40": "eine_app_je_schritt",
} as const;

/** Neue Vorbedingungen der Fassung 3. */
export const PRECONDITIONS_3 = {
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
    errorCode: "app_adresse_unzulaessig",
  },
  "V-38": {
    name: "abdruck_gesehen",
    actions: ["app.werkzeuge_bestaetigen"],
    require: [
      { fact: "seenToolDigest", op: "eq", value: { fact: "toolDigest" } },
      {
        fact: "toolStatus",
        op: "in",
        value: ["neu", "bestaetigt", "geaendert", "gesperrt"] as string[],
      },
    ],
    errorCode: "werkzeug_abdruck_ungesehen",
  },
} as const;

/** Neue Fehlercodes der Fassung 3 mit ihrem HTTP-Status. */
export const ERROR_STATUS_3 = {
  /** Netzfehler, Zeitgrenze oder Fehler auf der Seite der App. */
  app_nicht_erreichbar: 502,
  /** Die App lehnt den Zugang ab (401/403). */
  app_zugang_ungueltig: 502,
  /** Die Adresse ist nicht erlaubt (Vorbedingung V-19). */
  app_adresse_unzulaessig: 400,
  /** Unter der Adresse antwortet kein MCP-Server. */
  app_kein_mcp: 502,
  /** Eingefügt wurde ein Befehl statt einer Adresse. */
  app_befehl_nicht_erlaubt: 400,
  /** Keine gemeinsame Fassung des Protokolls. */
  app_version_unbekannt: 502,
  /** Das Werkzeug ist nicht (mehr) bestätigt oder sein Abdruck weicht ab (Grenze G-07). */
  werkzeug_geaendert: 409,
  /** Der Bot hat keinen passenden Zugriff auf die App (Grenze G-06). */
  werkzeug_kein_zugriff: 403,
  /** Nur Kennzeichnung: Das Ergebnis wurde gekürzt. */
  werkzeug_ergebnis_zu_gross: 502,
  /** Das Schema des Werkzeugs lässt sich nicht sicher prüfen; es ist nicht bestätigbar. */
  werkzeug_schema_nicht_pruefbar: 409,
  /** Die App verlangt eine Rückfrage; PaiBot beantwortet keine. */
  app_braucht_eingabe: 502,
  /** Mit eingeschalteter Datenschleuse enthielten die Argumente einen Platzhalter. */
  werkzeug_platzhalter: 409,
  /** Im selben Schritt wurde schon eine andere App aufgerufen (Grenze G-40). */
  werkzeug_zweite_app: 409,
  /** Der bestätigte Abdruck ist nicht der gespeicherte (Vorbedingung V-38). */
  werkzeug_abdruck_ungesehen: 409,
} as const satisfies Record<string, number>;
export type ErrorCode3 = keyof typeof ERROR_STATUS_3;
export const ERROR_CODES_3 = Object.keys(ERROR_STATUS_3) as [ErrorCode3, ...ErrorCode3[]];

/**
 * Standard-Regel R-014: Der Bot der Unterhaltung darf ein App-Werkzeug aufrufen, das der Besitzer
 * als „lesen“ bestätigt hat, wenn der Besitzer dem Bot Lese-Zugriff auf die App gegeben hat.
 * Priorität 90 wie R-010, also vor R-005. Wegen `botOfConversation eq true` und `trigger eq chat`
 * gilt sie nur in einem Lauf, den der Besitzer im Chat mit dem Bot selbst angestoßen hat; ein Lauf
 * mit anderem Auslöser (etwa einer Automation) liest so nie in Apps. Die Grenzen G-06 bis G-08 und G-40 gelten zusätzlich; keine Regel hebt sie
 * auf. Die Regel steht in keiner Datenbank, bis Fassung 3 in Kraft ist.
 */
export const R014_V1 = {
  id: "R-014",
  version: 1,
  action: "werkzeug.aufrufen",
  effect: "allow",
  stage: "execute",
  conditions: [
    { fact: "akteur", op: "eq", value: "bot" },
    { fact: "botOfConversation", op: "eq", value: true },
    { fact: "trigger", op: "eq", value: "chat" },
    { fact: "toolSource", op: "eq", value: "mcp" },
    { fact: "toolKind", op: "eq", value: "lesen" },
    { fact: "appAccess", op: "eq", value: "lesen" },
    { fact: "toolStatus", op: "eq", value: "bestaetigt" },
  ],
  priority: 90,
  source: "standard",
  enabled: true,
  title: "Bot liest in Apps mit Lese-Zugriff",
  reason:
    "Du hast dieses Werkzeug als lesend bestätigt und dem Bot Lese-Zugriff auf die App gegeben.",
} as const satisfies RuleDefinition;

/** Standard-Regeln, die mit Fassung 3 dazukommen. */
export const STANDARD_RULE_VERSIONS_3 = [R014_V1] as const;
