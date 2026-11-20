/**
 * PaiBot – Test-Hilfe: eine App-Rolle mit zufälligem Namen und Passwort für Tests gegen echtes
 * Postgres, die sich danach wieder löschen lässt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import postgres from "postgres";

/** Eine Adresse mit einer neuen, noch nicht angelegten Rolle. */
export interface PostgresTestRole {
  /** Name der Rolle. */
  role: string;
  /** `databaseUrl` mit Benutzer und Passwort der Rolle. */
  url: string;
  /** Löscht die Rolle (über `adminUrl`); vorher müssen ihre Datenbanken gelöscht sein. */
  drop(adminUrl: string): Promise<void>;
}

/** Erzeugt Name und Passwort einer Test-Rolle; angelegt wird sie von `runMigrations`. */
export function newPostgresTestRole(databaseUrl: string): PostgresTestRole {
  const role = `paibot_app_test_${randomBytes(4).toString("hex")}`;
  const url = new URL(databaseUrl);
  url.username = role;
  url.password = randomBytes(24).toString("hex");
  return {
    role,
    url: url.toString(),
    async drop(adminUrl) {
      const sql = postgres(adminUrl, { max: 1, onnotice: () => undefined });
      try {
        await sql`drop role if exists ${sql(role)}`;
      } finally {
        await sql.end({ timeout: 2 });
      }
    },
  };
}
