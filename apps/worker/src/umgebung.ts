/**
 * PaiBot – Einstellungen des Workers aus der Umgebung lesen und Pflichtwerte prüfen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { CryptoError, loadMasterSecret } from "@paibot/crypto";
import { schleuseFromEnv } from "@paibot/llm";

type Env = Readonly<Record<string, string | undefined>>;

/** Variablen des Workers mit ihren Standardwerten. */
export const WORKER_ENV = {
  concurrency: "PAIBOT_WORKER_CONCURRENCY",
  healthFile: "PAIBOT_WORKER_HEALTH_FILE",
  shutdownTimeoutMs: "PAIBOT_WORKER_SHUTDOWN_TIMEOUT_MS",
} as const;

export const WORKER_DEFAULTS = {
  concurrency: 2,
  healthFile: "/tmp/paibot-worker.herzschlag",
  shutdownTimeoutMs: 20_000,
} as const;

/** Mindestlänge für Datenbank-Passwörter in Produktion. */
const MIN_DB_PASSWORD_LENGTH = 24;

/** Bekannte Platzhalter, die nie als echtes Geheimnis gelten. */
const PLACEHOLDERS: readonly string[] = [
  "bitte-ein-langes-zufaelliges-passwort",
  "bitte-erzeugen",
  "changeme",
  "change-me",
  "password",
  "passwort",
  "paibot",
  "postgres",
  "secret",
];

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDERS.includes(normalized) || normalized.startsWith("<");
}

/**
 * Prüft die Pflichtwerte und liefert verständliche Meldungen, nie mit den Werten selbst.
 *
 * Immer: `PAIBOT_SECRET` vorhanden, kein Platzhalter, genau 32 Byte als Base64; `DATABASE_URL`
 * vorhanden und eine gültige Adresse; `SCHLEUSE_URL`/`SCHLEUSE_KEY` (falls gesetzt) gültig.
 * In Produktion zusätzlich: Passwort in `DATABASE_URL` ab 24 Zeichen und kein Platzhalter.
 */
export function checkWorkerEnv(env: Env, production: boolean): string[] {
  const errors: string[] = [];
  const secret = env.PAIBOT_SECRET;
  if (secret === undefined || secret.trim() === "") {
    errors.push("PAIBOT_SECRET fehlt. Erzeuge es mit: openssl rand -base64 32");
  } else if (isPlaceholder(secret)) {
    errors.push(
      "PAIBOT_SECRET ist noch der Platzhalter aus der Vorlage. Erzeuge einen echten Wert.",
    );
  } else {
    try {
      loadMasterSecret(env);
    } catch (error) {
      if (!(error instanceof CryptoError)) throw error;
      errors.push(
        "PAIBOT_SECRET hat die falsche Form: verlangt sind genau 32 Byte als Base64 (openssl rand -base64 32).",
      );
    }
  }

  const url = env.DATABASE_URL;
  if (url === undefined || url === "") {
    errors.push("DATABASE_URL fehlt.");
  } else {
    let password: string | undefined;
    try {
      password = decodeURIComponent(new URL(url).password);
    } catch {
      errors.push(
        "DATABASE_URL ist keine gültige Adresse (postgres://benutzer:passwort@host:5432/db).",
      );
    }
    if (production && password !== undefined) {
      if (password === "") errors.push("DATABASE_URL enthält kein Passwort.");
      else if (isPlaceholder(password)) {
        errors.push(
          "Das Passwort in DATABASE_URL ist ein Platzhalter. Setze ein zufälliges Passwort.",
        );
      } else if (password.length < MIN_DB_PASSWORD_LENGTH) {
        errors.push(
          `Das Passwort in DATABASE_URL ist zu kurz (mindestens ${MIN_DB_PASSWORD_LENGTH} Zeichen).`,
        );
      }
    }
  }

  try {
    schleuseFromEnv(env);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    errors.push(`${error.message}.`);
  }
  return errors;
}

/** Einstellungen des Workers (Form wie `WorkerConfig`). */
export interface ParsedWorkerConfig {
  databaseUrl: string;
  concurrency: number;
  healthFile?: string;
  shutdownTimeoutMs: number;
}

function integer(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new TypeError(`${name} muss eine ganze Zahl sein.`);
  const value = Number(raw);
  if (value < min || value > max) {
    throw new TypeError(`${name} muss zwischen ${min} und ${max} liegen.`);
  }
  return value;
}

/** Liest die Einstellungen; Fehler als `TypeError` mit dem Namen der Variable, nie mit dem Wert. */
export function parseWorkerConfig(env: Env): ParsedWorkerConfig {
  const databaseUrl = env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === "") throw new TypeError("DATABASE_URL fehlt.");
  try {
    new URL(databaseUrl);
  } catch {
    throw new TypeError("DATABASE_URL ist keine gültige Adresse.");
  }
  const concurrency = integer(env, WORKER_ENV.concurrency, WORKER_DEFAULTS.concurrency, 1, 32);
  const shutdownTimeoutMs = integer(
    env,
    WORKER_ENV.shutdownTimeoutMs,
    WORKER_DEFAULTS.shutdownTimeoutMs,
    1000,
    600_000,
  );
  const rawFile = env[WORKER_ENV.healthFile];
  const healthFile = rawFile === undefined ? WORKER_DEFAULTS.healthFile : rawFile.trim();
  if (healthFile !== "" && !healthFile.startsWith("/")) {
    throw new TypeError(
      `${WORKER_ENV.healthFile} muss ein absoluter Pfad sein (leer schaltet ihn ab).`,
    );
  }
  return {
    databaseUrl,
    concurrency,
    shutdownTimeoutMs,
    ...(healthFile === "" ? {} : { healthFile }),
  };
}
