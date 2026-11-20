/**
 * PaiBot – Zugriff auf Regeln (nur lesen). Jede Änderung einer Regel wäre eine neue Fassung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Rule } from "@paibot/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { rules } from "../schema";
import { toRule } from "./abbildung";

/**
 * Die gültigen Regeln: je Regel die höchste Fassung, nur wenn sie eingeschaltet ist, geordnet
 * nach Priorität (kleinste zuerst), bei gleicher Priorität nach ID.
 */
export async function listActive(db: Database): Promise<Rule[]> {
  const neueste = await db
    .selectDistinctOn([rules.id])
    .from(rules)
    .orderBy(rules.id, desc(rules.version));
  return neueste
    .filter((row) => row.enabled)
    .map(toRule)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

/** Eine bestimmte Fassung einer Regel, etwa um alte Belege nachzurechnen. */
export async function get(db: Database, id: string, version: number): Promise<Rule | undefined> {
  const [row] = await db
    .select()
    .from(rules)
    .where(and(eq(rules.id, id), eq(rules.version, version)));
  return row === undefined ? undefined : toRule(row);
}

/** Alle Fassungen einer Regel, älteste zuerst. */
export async function listVersions(db: Database, id: string): Promise<Rule[]> {
  const rows = await db.select().from(rules).where(eq(rules.id, id)).orderBy(asc(rules.version));
  return rows.map(toRule);
}
