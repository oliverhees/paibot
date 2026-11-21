/**
 * PaiBot – ermittelt den Zustand der Datenbank für Startseite und Health-Endpunkt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-18
 */

import { createRoleProbe, type RoleProbe } from "@paibot/db/migrate";

export type DbState = "ok" | "down" | "not_configured";

/** Zustand der Datenbank und, wenn erreichbar, ob die App-Verbindung eingeschränkt ist. */
export interface DatabaseHealth {
  db: DbState;
  role?: "eingeschraenkt" | "zu_viele_rechte";
}

/** Wie lange ein Ergebnis gilt, in Millisekunden. */
export const HEALTH_CACHE_MS = 5000;
/** Zeitgrenze für eine Prüfung, in Millisekunden. */
export const HEALTH_TIMEOUT_MS = 3000;

/** Eine Prüfung gegen die Datenbank; liefert die Rolle oder wirft. */
export type Probe = () => Promise<NonNullable<DatabaseHealth["role"]>>;

/**
 * Baut eine zwischengespeicherte Prüfung: höchstens eine Prüfung gleichzeitig, das Ergebnis gilt
 * `cacheMs` lang, nach `timeoutMs` gilt die Datenbank als nicht erreichbar.
 */
export function cachedHealth(
  probe: Probe,
  options: { cacheMs?: number; timeoutMs?: number; now?: () => number } = {},
): () => Promise<DatabaseHealth> {
  const cacheMs = options.cacheMs ?? HEALTH_CACHE_MS;
  const timeoutMs = options.timeoutMs ?? HEALTH_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  let last: { at: number; value: DatabaseHealth } | undefined;
  let running: Promise<DatabaseHealth> | undefined;

  async function run(): Promise<DatabaseHealth> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Zeitgrenze")), timeoutMs);
    });
    try {
      const role = await Promise.race([probe(), timeout]);
      return { db: "ok", role };
    } catch {
      return { db: "down" };
    } finally {
      clearTimeout(timer);
    }
  }

  return async () => {
    if (last && now() - last.at < cacheMs) return last.value;
    running ??= run().then((value) => {
      last = { at: now(), value };
      running = undefined;
      return value;
    });
    return running;
  };
}

interface Shared {
  url: string;
  connection: RoleProbe;
  check: () => Promise<DatabaseHealth>;
}

const SHARED_KEY = Symbol.for("paibot.health");
type Holder = { [SHARED_KEY]?: Shared };

/** Gemeinsame Verbindung (eine, schließt sich nach Leerlauf) und Zwischenspeicher pro Prozess. */
function shared(url: string): Shared {
  const holder = globalThis as Holder;
  const current = holder[SHARED_KEY];
  if (current && current.url === url) return current;
  if (current) void current.connection.end();
  const connection = createRoleProbe(url, HEALTH_TIMEOUT_MS);
  const created: Shared = { url, connection, check: cachedHealth(connection.probe) };
  holder[SHARED_KEY] = created;
  return created;
}

/** Zustand der Datenbank mit Rolle, zwischengespeichert. */
export async function databaseHealth(): Promise<DatabaseHealth> {
  const url = process.env.DATABASE_URL;
  if (!url) return { db: "not_configured" };
  return shared(url).check();
}

/** Zustand der Datenbank: erreichbar, nicht erreichbar oder nicht eingerichtet. */
export async function databaseState(): Promise<DbState> {
  return (await databaseHealth()).db;
}
