/**
 * PaiBot – Test: Jede Tabelle der App liegt ausdrücklich im Schema `public`, und Drizzle nennt das
 * Schema in jeder Abfrage. So hängt keine Abfrage vom Suchpfad der Verbindung ab.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { APP_TABLE_RIGHTS } from "./rollen";
import * as schema from "./schema";

const tables: PgTable[] = (Object.values(schema) as unknown[]).filter((value): value is PgTable =>
  is(value, PgTable),
);

describe("Tabellen mit ausdrücklichem Schema", () => {
  it("alle Tabellen der App sind erfasst", () => {
    expect(tables.map((t) => getTableConfig(t).name).sort()).toEqual(
      Object.keys(APP_TABLE_RIGHTS).sort(),
    );
  });

  it.each(tables.map((t) => [getTableConfig(t).name, t] as const))(
    "%s liegt im Schema public, und das erzeugte SQL nennt es",
    (name, table) => {
      expect(getTableConfig(table).schema).toBe("public");
      // Nur zum Erzeugen von SQL; es wird nichts ausgeführt.
      const db = drizzle.mock({ schema });
      const select = db.select().from(table).toSQL().sql;
      expect(select).toContain(`from "public"."${name}"`);
      const remove = db.delete(table).toSQL().sql;
      expect(remove).toContain(`delete from "public"."${name}"`);
    },
  );
});
