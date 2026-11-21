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
import { RATE_LIMIT_KEYS, RATE_LIMITS, type RateLimitName } from "@paibot/shared/konstanten";
import { t } from "@paibot/shared/texte";
import { UNBEKANNTE_ADRESSE } from "./kopfzeilen";

/** Wem eine Anfrage zugerechnet wird: Adresse des Clients und – mit Sitzung – der Besitzer. */
export interface LimitBezug {
  adresse: string;
  ownerId?: OwnerId;
}

/** Schlüssel eines Limits für eine Anfrage (`RATE_LIMIT_KEYS`). */
export function limitSchluessel(name: RateLimitName, bezug: LimitBezug): string {
  switch (name) {
    case "anmeldenIp":
      return RATE_LIMIT_KEYS.anmeldenIp(bezug.adresse);
    case "anmeldenGesamt":
      return RATE_LIMIT_KEYS.anmeldenGesamt;
    case "einrichtungIp":
      return RATE_LIMIT_KEYS.einrichtungIp(bezug.adresse);
    case "verbindungstestIp":
      return RATE_LIMIT_KEYS.verbindungstestIp(bezug.adresse);
    case "nachricht":
    case "verbindungstest": {
      if (bezug.ownerId === undefined) throw new PaiBotError("nicht_angemeldet");
      return RATE_LIMIT_KEYS[name](bezug.ownerId);
    }
  }
}

/** Limits, deren Schlüssel die Adresse des Clients enthält. */
export const LIMITS_JE_ADRESSE: readonly RateLimitName[] = [
  "anmeldenIp",
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
  name: RateLimitName,
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

/**
 * Zählt die Limits einer Route in der angegebenen Reihenfolge, bevor irgendetwas anderes passiert.
 * `sperren` über dem Limit: `zu_viele_versuche` (429) mit `Retry-After`, weitere Limits werden nicht
 * mehr gezählt. `verzoegern` über dem Limit: die Anfrage wartet `delayMs` und läuft dann weiter.
 */
export async function zaehleLimits(
  db: Database,
  namen: readonly RateLimitName[],
  bezug: LimitBezug,
  optionen: LimitOptionen,
): Promise<void> {
  for (const name of namen) {
    const definition: { max: number; windowSeconds: number; effect: string; delayMs?: number } =
      RATE_LIMITS[name];
    const ergebnis = await repo.rateLimit.hit(db, {
      key: limitSchluessel(name, bezug),
      max: definition.max,
      windowSeconds: definition.windowSeconds,
      now: optionen.now,
    });
    if (ergebnis.allowed) continue;
    if (wirkung(name, definition, bezug) === "verzoegern") {
      await optionen.warten(definition.delayMs ?? ERSATZ_VERZOEGERUNG_MS);
      continue;
    }
    throw new PaiBotError("zu_viele_versuche", {
      text: t("anmelden.warten", { sekunden: ergebnis.retryAfterSeconds }),
      retryAfterSeconds: ergebnis.retryAfterSeconds,
    });
  }
}

/** Setzt ein Limit für eine Anfrage zurück (z. B. nach richtigem Passwort oder Code). */
export async function setzeLimitZurueck(
  db: Database,
  name: RateLimitName,
  bezug: LimitBezug,
): Promise<void> {
  await repo.rateLimit.reset(db, limitSchluessel(name, bezug));
}
