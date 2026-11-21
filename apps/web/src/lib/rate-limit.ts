/**
 * PaiBot – Rate-Limits der API-Routen zählen: sperren mit `Retry-After` oder nur verzögern.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type Database, repo } from "@paibot/db";
import { PaiBotError } from "@paibot/shared/fehler";
import type { OwnerId } from "@paibot/shared/ids";
import {
  RATE_LIMIT_KEYS,
  RATE_LIMITS,
  type RateLimitDefinition,
  type RateLimitName,
} from "@paibot/shared/konstanten";
import { t } from "@paibot/shared/texte";
import { adressGruppe, UNBEKANNTE_ADRESSE } from "./kopfzeilen";

/**
 * Limits der Web-App zusätzlich zu `RATE_LIMITS`:
 *
 * - `anmeldenIpTag`: zweite Stufe je Adresse. Wer an einem Tag 20 Fehlversuche hat, wartet bis zum
 *   Ende des Tages (die Sperrzeit wächst von 15 Minuten auf bis zu 24 Stunden).
 * - `passwortAendern`: Versuche beim Ändern des Passworts je Besitzer. Darüber endet die Sitzung
 *   der Anfrage.
 */
export const ZUSATZ_LIMITS = {
  anmeldenIpTag: { max: 20, windowSeconds: 86_400, effect: "sperren" },
  passwortAendern: { max: 5, windowSeconds: 900, effect: "sperren" },
} as const satisfies Record<string, RateLimitDefinition>;

/** Name eines Limits, das eine Route zählen kann. */
export type LimitName = RateLimitName | keyof typeof ZUSATZ_LIMITS;

/** Alle Limits mit ihrer Definition. */
export const LIMIT_DEFINITIONEN: Readonly<Record<LimitName, RateLimitDefinition>> = {
  ...RATE_LIMITS,
  ...ZUSATZ_LIMITS,
};

/**
 * Gemeinsame Bremse beim Anmelden. Über `RATE_LIMITS.anmeldenGesamt.max` Versuchen im Fenster wird
 * für alle zusammen höchstens ein Passwort je Takt geprüft, egal wie viele Anfragen gleichzeitig
 * kommen; die anderen bekommen `zu_viele_versuche` mit `Retry-After`. Der Takt beginnt bei
 * `startSekunden` und verdoppelt sich je `verdoppelnNach` weiteren Versuchen bis `maxSekunden`.
 * Bekannte Geräte (siehe `zugang/geraet.ts`) gehen an der Bremse vorbei.
 */
export const BREMSE = { startSekunden: 2, maxSekunden: 60, verdoppelnNach: 20 } as const;

/** Wem eine Anfrage zugerechnet wird: Adresse des Clients und – mit Sitzung – der Besitzer. */
export interface LimitBezug {
  adresse: string;
  ownerId?: OwnerId;
  /** Hat sich dieser Browser hier schon einmal angemeldet (gültiges Geräte-Cookie)? */
  bekanntesGeraet?: boolean;
}

/** Schlüssel eines Limits für eine Anfrage (`RATE_LIMIT_KEYS`); IPv6 zählt je /64. */
export function limitSchluessel(name: LimitName, bezug: LimitBezug): string {
  const gruppe = adressGruppe(bezug.adresse);
  switch (name) {
    case "anmeldenIp":
      return RATE_LIMIT_KEYS.anmeldenIp(gruppe);
    case "anmeldenIpTag":
      return `anmelden:tag:${gruppe}`;
    case "anmeldenGesamt":
      return RATE_LIMIT_KEYS.anmeldenGesamt;
    case "einrichtungIp":
      return RATE_LIMIT_KEYS.einrichtungIp(gruppe);
    case "verbindungstestIp":
      return RATE_LIMIT_KEYS.verbindungstestIp(gruppe);
    case "nachricht":
    case "verbindungstest": {
      if (bezug.ownerId === undefined) throw new PaiBotError("nicht_angemeldet");
      return RATE_LIMIT_KEYS[name](bezug.ownerId);
    }
    case "passwortAendern": {
      if (bezug.ownerId === undefined) throw new PaiBotError("nicht_angemeldet");
      return `passwort:${bezug.ownerId}`;
    }
  }
}

/** Limits, deren Schlüssel die Adresse des Clients enthält. */
export const LIMITS_JE_ADRESSE: readonly LimitName[] = [
  "anmeldenIp",
  "anmeldenIpTag",
  "einrichtungIp",
  "verbindungstestIp",
];

/** Wartezeit, wenn ein sperrendes Limit je Adresse ohne bekannte Adresse nur verzögert. */
export const ERSATZ_VERZOEGERUNG_MS = RATE_LIMITS.anmeldenGesamt.delayMs;

/**
 * Wirkung eines Limits für eine Anfrage. Ist die Adresse unbekannt (ohne `TRUST_PROXY=1` liefert
 * die Laufzeit keine verlässliche Gegenstelle), teilen sich alle Clients einen Zähler; ein
 * sperrendes Limit je Adresse würde dann jeden aussperren, auch den Besitzer. Es verzögert dann nur.
 */
export function wirkung(
  name: LimitName,
  definition: { effect: string },
  bezug: LimitBezug,
): "sperren" | "verzoegern" {
  if (definition.effect === "verzoegern") return "verzoegern";
  if (bezug.adresse === UNBEKANNTE_ADRESSE && LIMITS_JE_ADRESSE.includes(name)) return "verzoegern";
  return "sperren";
}

export interface LimitOptionen {
  now: Date;
  /** Wartet `ms` Millisekunden (bei `verzoegern`); in Tests ersetzbar. */
  warten: (ms: number) => Promise<void>;
}

function zuViele(retryAfterSeconds: number): PaiBotError {
  return new PaiBotError("zu_viele_versuche", {
    text: t("anmelden.warten", { sekunden: retryAfterSeconds }),
    retryAfterSeconds,
  });
}

/** Takt der Bremse in Sekunden bei `ueber` Versuchen über der Schwelle. */
export function bremsTakt(ueber: number): number {
  const stufe = Math.floor(Math.max(0, ueber - 1) / BREMSE.verdoppelnNach);
  return Math.min(BREMSE.startSekunden * 2 ** Math.min(stufe, 16), BREMSE.maxSekunden);
}

/**
 * Ein Platz in der gemeinsamen Bremse: je Takt-Fenster gewinnt genau ein Versuch (atomares
 * Hochzählen in der Datenbank), alle anderen bekommen `zu_viele_versuche`. Jede Stufe hat ihr
 * eigenes Fenster; beim Wechsel der Stufe kann so ein Versuch mehr durchkommen (höchstens einer je
 * Stufe).
 */
async function bremsen(db: Database, ueber: number, now: Date): Promise<void> {
  const takt = bremsTakt(ueber);
  const platz = await repo.rateLimit.hit(db, {
    key: `anmelden:takt:${takt}`,
    max: 1,
    windowSeconds: takt,
    now,
  });
  if (!platz.allowed) throw zuViele(platz.retryAfterSeconds);
}

/**
 * Zählt die Limits einer Route in der angegebenen Reihenfolge, bevor irgendetwas anderes passiert.
 * `sperren` über dem Limit: `zu_viele_versuche` (429) mit `Retry-After`, weitere Limits werden nicht
 * mehr gezählt. `verzoegern` über dem Limit: die Anfrage wartet `delayMs` und läuft dann weiter.
 * `anmeldenGesamt` über dem Limit: gemeinsame Bremse (`BREMSE`); ein bekanntes Gerät zählt dort nicht.
 */
export async function zaehleLimits(
  db: Database,
  namen: readonly LimitName[],
  bezug: LimitBezug,
  optionen: LimitOptionen,
): Promise<void> {
  for (const name of namen) {
    if (name === "anmeldenGesamt" && bezug.bekanntesGeraet === true) continue;
    const definition = LIMIT_DEFINITIONEN[name];
    const ergebnis = await repo.rateLimit.hit(db, {
      key: limitSchluessel(name, bezug),
      max: definition.max,
      windowSeconds: definition.windowSeconds,
      now: optionen.now,
    });
    if (ergebnis.allowed) continue;
    if (name === "anmeldenGesamt") {
      await bremsen(db, ergebnis.count - definition.max, optionen.now);
      continue;
    }
    if (wirkung(name, definition, bezug) === "verzoegern") {
      await optionen.warten(definition.delayMs ?? ERSATZ_VERZOEGERUNG_MS);
      continue;
    }
    throw zuViele(ergebnis.retryAfterSeconds);
  }
}

/** Setzt ein Limit für eine Anfrage zurück (z. B. nach richtigem Passwort oder Code). */
export async function setzeLimitZurueck(
  db: Database,
  name: LimitName,
  bezug: LimitBezug,
): Promise<void> {
  await repo.rateLimit.reset(db, limitSchluessel(name, bezug));
}

/**
 * Hebt alle Sperren und Bremsen der Anmeldung auf (Ausweg, wenn der Besitzer ausgesperrt ist; läuft
 * im Migrations-Schritt). Gibt die Zahl gelöschter Zähler zurück.
 */
export async function anmeldeSperrenAufheben(db: Database): Promise<number> {
  return repo.rateLimit.deleteByPrefix(db, "anmelden:");
}
