/**
 * PaiBot – Datenbankschema: zuletzt geprüfter Zustand der Datenschleuse. Der Worker hängt im Netz
 * der Datenschleuse, prüft sie und schreibt das Ergebnis hierher; die Web-App liest es nur.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { sql } from "drizzle-orm";
import { check, text, timestamp } from "drizzle-orm/pg-core";
import { inListCheck, pgTable } from "./helfer";

/**
 * Zustände der Datenschleuse aus Sicht des Workers: `aus` (nicht eingerichtet),
 * `nicht_erreichbar`, `schluessel_falsch` (sie läuft, nimmt den Schlüssel aber nicht an), `bereit`.
 */
export const SCHLEUSE_ZUSTAENDE = [
  "aus",
  "nicht_erreichbar",
  "schluessel_falsch",
  "bereit",
] as const;
export type SchleuseZustandWert = (typeof SCHLEUSE_ZUSTAENDE)[number];

/** Genau eine Zeile (id = "singleton"); keine Meldungstexte der Datenschleuse, nur der Zustand. */
export const schleuseZustand = pgTable(
  "schleuse_zustand",
  {
    id: text("id").primaryKey().default("singleton"),
    state: text("state").$type<SchleuseZustandWert>().notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check("schleuse_zustand_nur_eine_zeile", sql`${t.id} = 'singleton'`),
    inListCheck("schleuse_zustand_state_werte", t.state, SCHLEUSE_ZUSTAENDE),
  ],
);

export type SchleuseZustandZeile = typeof schleuseZustand.$inferSelect;
