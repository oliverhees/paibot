/**
 * PaiBot – Test: Migrationen legen die Einstellungen mit Standardwerten an.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { settings } from "./schema";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

describe("Migrationen", () => {
  it("legen die Einstellungen mit Standardwerten an", async () => {
    const db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder });

    await db.insert(settings).values({});
    const [row] = await db.select().from(settings).where(eq(settings.id, "singleton"));

    expect(row?.locale).toBe("de");
    expect(row?.schleuseModeDefault).toBe("auto");
    expect(row?.maxHops).toBe(8);
  });
});
