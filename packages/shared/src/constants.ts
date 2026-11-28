/**
 * PaiBot – Konstanten, die mehrere Teile teilen: Grenzen, Namen von Cookies, Kopfzeilen,
 * Speicher-Schlüsseln, Rate-Limit-Schlüsseln und des Ereignis-Kanals.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ConversationId, OwnerId } from "./id";

/** Grenzen für Eingaben. */
export const LIMITS = {
  /** Längste Nachricht in Zeichen. */
  messageChars: 32000,
  /** Kürzestes Passwort beim Setzen. */
  passwordMinChars: 12,
  /** Längstes Passwort; schützt die Passwort-Ableitung vor riesigen Eingaben. */
  passwordMaxChars: 1024,
  botNameChars: 60,
  botInstructionsChars: 8000,
  /** Längste Aufgabe eines Bots in seinem Team (`bots.role`). */
  botRoleChars: 200,
  /** Höchstens so viele Bots darf eine Installation haben (Grenze „Bots insgesamt“ im Tor). */
  bots: 50,
  teamNameChars: 60,
  conversationTitleChars: 200,
  providerNameChars: 100,
  apiKeyChars: 1000,
  baseUrlChars: 2048,
  modelSlugChars: 200,
  /** Längster Name einer Routing-Regel (EUrouter). */
  routingRuleNameChars: 100,
  /** Höchstens so viele Regeln je Prüfung bzw. Einrichtung (jede kostet eine kleine Anfrage). */
  routingRulesPerCheck: 5,
  /** Höchste Ausgabegrenze pro Antwort, die ein Bot einstellen kann. */
  maxOutputTokens: 200000,
  /** Größte Verlaufsgrenze in Token. */
  historyTokens: 2000000,
  /** Größtes Tagesbudget in Token. */
  dailyTokenBudget: 1000000000,
} as const;

/** Dauer von Sitzungen. */
export const SESSION = {
  /** Gleitende Gültigkeit auf dem Server in Tagen. */
  slidingDays: 30,
  /** Längste Gültigkeit auf dem Server in Tagen. */
  maxDays: 90,
  /** `Max-Age` des Cookies bei „angemeldet bleiben“, in Sekunden. */
  cookieMaxAgeSeconds: 2592000,
} as const;

/** Namen der Cookies, abhängig davon, ob PaiBot über https läuft. */
export const COOKIE = {
  sitzung: { https: "__Host-pb_sitzung", http: "pb_sitzung" },
  vorab: { https: "__Host-pb_vorab", http: "pb_vorab" },
} as const;

/** Name eines Cookies für die eingestellte Adresse der App (`APP_URL`). */
export function cookieName(kind: keyof typeof COOKIE, appUrl: string | undefined): string {
  return appUrl?.startsWith("https://") ? COOKIE[kind].https : COOKIE[kind].http;
}

/** Prüfzeichen gegen untergeschobene Anfragen (CSRF). */
export const CSRF = {
  header: "X-Pb-Pruefzeichen",
  formField: "_pruefzeichen",
  metaName: "pb-pruefzeichen",
} as const;

/** Kopfzeile mit dem Stand der Software an jeder Antwort. */
export const STAND_HEADER = "X-Pb-Stand";

/** Schlüssel im Browser-Speicher. */
export const STORAGE_KEYS = {
  /** `sessionStorage`: Entwurf der Eingabe einer Unterhaltung. */
  entwurf: (conversationId: ConversationId) => `pb:entwurf:${conversationId}`,
  /** `localStorage`: Seitenleiste `offen` oder `zu`. */
  seitenleiste: "pb:seitenleiste",
  /** `localStorage`: zuletzt geöffnete Unterhaltung. */
  zuletzt: "pb:zuletzt",
} as const;

/** Schlüssel für Rate-Limits in der Form `<zweck>:<teil>[:<teil>]`. */
export const RATE_LIMIT_KEYS = {
  anmeldenIp: (ip: string) => `anmelden:ip:${ip}`,
  anmeldenGesamt: "anmelden:gesamt",
  einrichtungIp: (ip: string) => `einrichtung:ip:${ip}`,
  /** Verbindungstest während der Einrichtung, je Adresse (noch ohne Besitzer). */
  verbindungstestIp: (ip: string) => `verbindungstest:ip:${ip}`,
  nachricht: (ownerId: OwnerId) => `nachricht:${ownerId}`,
  verbindungstest: (ownerId: OwnerId) => `verbindungstest:${ownerId}`,
} as const;

/**
 * Was beim Überschreiten eines Limits geschieht: `sperren` antwortet mit `zu_viele_versuche`
 * (429, `Retry-After`) bis zum Ende des Fensters; `verzoegern` lässt die Anfrage weiter zu, hält
 * sie aber `delayMs` lang an, bevor sie bearbeitet wird.
 */
export type RateLimitEffect = "sperren" | "verzoegern";

export interface RateLimitDefinition {
  max: number;
  windowSeconds: number;
  effect: RateLimitEffect;
  /** Nur bei `verzoegern`: Wartezeit je Anfrage über dem Limit. */
  delayMs?: number;
}

/**
 * Erlaubte Anzahl pro Zeitfenster.
 *
 * Anmelden: Das Limit je Adresse sperrt streng. Das Gesamt-Limit sperrt nie, sondern verzögert
 * nur; sonst könnte jemand von vielen Adressen aus den Besitzer dauerhaft aussperren. Das Limit
 * wird vor der Passwort-Prüfung gezählt; höchstens `PASSWORD_HASH_CONCURRENCY` Prüfungen laufen
 * gleichzeitig, weitere warten.
 *
 * Einrichtung: falsche Einrichtungs-Codes zählen je Adresse auf `einrichtungIp`, beim Abschließen
 * und beim Verbindungstest der Einrichtung gleich. Jeder Verbindungstest der Einrichtung zählt
 * zusätzlich auf `verbindungstestIp`.
 */
export const RATE_LIMITS = {
  anmeldenIp: { max: 5, windowSeconds: 900, effect: "sperren" },
  anmeldenGesamt: { max: 20, windowSeconds: 900, effect: "verzoegern", delayMs: 2000 },
  einrichtungIp: { max: 5, windowSeconds: 900, effect: "sperren" },
  verbindungstestIp: { max: 10, windowSeconds: 900, effect: "sperren" },
  nachricht: { max: 30, windowSeconds: 60, effect: "sperren" },
  verbindungstest: { max: 10, windowSeconds: 60, effect: "sperren" },
} as const satisfies Record<keyof typeof RATE_LIMIT_KEYS, RateLimitDefinition>;
export type RateLimitName = keyof typeof RATE_LIMITS;

/** Höchstens so viele Passwort-Prüfungen (scrypt, je etwa 32 MiB) laufen gleichzeitig. */
export const PASSWORD_HASH_CONCURRENCY = 2;

/** Postgres-Kanal, über den neue Ereignisse einer Unterhaltung gemeldet werden. */
export const EVENT_NOTIFY_CHANNEL = "paibot_ereignis";
