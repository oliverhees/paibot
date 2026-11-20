/**
 * PaiBot – Konstanten, die mehrere Teile teilen: Grenzen, Namen von Cookies, Kopfzeilen,
 * Speicher-Schlüsseln, Rate-Limit-Schlüsseln und des Ereignis-Kanals.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
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
  conversationTitleChars: 200,
  providerNameChars: 100,
  apiKeyChars: 1000,
  baseUrlChars: 2048,
  modelSlugChars: 200,
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
  nachricht: (ownerId: OwnerId) => `nachricht:${ownerId}`,
  verbindungstest: (ownerId: OwnerId) => `verbindungstest:${ownerId}`,
} as const;

/** Erlaubte Anzahl pro Zeitfenster. */
export const RATE_LIMITS = {
  anmeldenIp: { max: 5, windowSeconds: 900 },
  anmeldenGesamt: { max: 20, windowSeconds: 900 },
  einrichtungIp: { max: 5, windowSeconds: 900 },
  nachricht: { max: 30, windowSeconds: 60 },
  verbindungstest: { max: 10, windowSeconds: 60 },
} as const;

/** Postgres-Kanal, über den neue Ereignisse einer Unterhaltung gemeldet werden. */
export const EVENT_NOTIFY_CHANNEL = "paibot_ereignis";
