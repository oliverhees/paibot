/**
 * PaiBot – Zugriff auf Regeln: nur lesen und neue Fassungen anhängen. Bestehende Zeilen lassen
 * sich weder ändern noch löschen (Trigger); jede Änderung ist eine neue Fassung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { PaiBotError, type Rule, type RuleDefinition } from "@paibot/shared";
import { and, asc, desc, eq, lte, max } from "drizzle-orm";
import type { Database } from "../client";
import { rules } from "../schema";
import { toRule } from "./abbildung";
import { standardFehler, uebersetzen } from "./fehler";

/** Gespeicherte Regel mit ihrer Nummer im Regel-Protokoll. */
export type StoredRule = Rule & { seq: number };

/** Gültige Regeln zu einem Stand des Regel-Protokolls. */
export interface StoredRuleSnapshot {
  /** Höchste Nummer aller Regel-Zeilen, die zu diesem Stand gehören. */
  stand: number;
  rules: StoredRule[];
}

function gueltig(rows: (typeof rules.$inferSelect)[]): StoredRule[] {
  return rows
    .filter((row) => row.enabled)
    .map((row) => toRule(row) as StoredRule)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

/**
 * Die gültigen Regeln: je Regel die höchste Fassung, nur wenn sie eingeschaltet ist, geordnet
 * nach Priorität (kleinste zuerst), bei gleicher Priorität nach ID.
 */
export async function listActive(db: Database): Promise<StoredRule[]> {
  const neueste = await db
    .selectDistinctOn([rules.id])
    .from(rules)
    .orderBy(rules.id, desc(rules.version));
  return gueltig(neueste);
}

/**
 * Die gültigen Regeln zum Stand `stand`: nur Zeilen mit `seq <= stand`, davon je Regel die
 * höchste Fassung. So bekommt das Nachrechnen eines Belegs genau den damaligen Regelstand.
 */
export async function listActiveAsOf(db: Database, stand: number): Promise<StoredRule[]> {
  const neueste = await db
    .selectDistinctOn([rules.id])
    .from(rules)
    .where(lte(rules.seq, stand))
    .orderBy(rules.id, desc(rules.version));
  return gueltig(neueste);
}

/** Aktueller Stand des Regel-Protokolls: die höchste Nummer, 0 ohne Regeln. */
export async function currentStand(db: Database): Promise<number> {
  const [row] = await db.select({ stand: max(rules.seq) }).from(rules);
  return row?.stand ?? 0;
}

/**
 * Stand und die gültigen Regeln zu genau diesem Stand, wie das Tor sie zum Entscheiden braucht.
 * Erst wird der Stand gelesen, dann nur Zeilen bis zu ihm; spätere Regeln gehören nicht dazu.
 */
export async function loadSnapshot(db: Database): Promise<StoredRuleSnapshot> {
  const stand = await currentStand(db);
  return { stand, rules: await listActiveAsOf(db, stand) };
}

/** Eine bestimmte Fassung einer Regel, etwa um alte Belege nachzurechnen. */
export async function get(
  db: Database,
  id: string,
  version: number,
): Promise<StoredRule | undefined> {
  const [row] = await db
    .select()
    .from(rules)
    .where(and(eq(rules.id, id), eq(rules.version, version)));
  return row === undefined ? undefined : (toRule(row) as StoredRule);
}

/** Alle Fassungen einer Regel, älteste zuerst. */
export async function listVersions(db: Database, id: string): Promise<StoredRule[]> {
  const rows = await db.select().from(rules).where(eq(rules.id, id)).orderBy(asc(rules.version));
  return rows.map((row) => toRule(row) as StoredRule);
}

/**
 * Hängt eine neue Fassung an. Die Fassung muss genau eins höher sein als die bisher höchste
 * (bzw. 1 für eine neue Regel), sonst `eingabe_ungueltig`; eine vorhandene Fassung wird nie
 * überschrieben. Regeln mit Quelle `standard` legen nur die Migrationen an.
 */
export async function appendVersion(db: Database, rule: RuleDefinition): Promise<StoredRule> {
  if (rule.source === "standard") throw new PaiBotError("eingabe_ungueltig");
  const [hoechste] = await db
    .select({ version: max(rules.version) })
    .from(rules)
    .where(eq(rules.id, rule.id));
  if (rule.version !== (hoechste?.version ?? 0) + 1) throw new PaiBotError("eingabe_ungueltig");
  const [row] = await uebersetzen(
    () =>
      db
        .insert(rules)
        .values({
          id: rule.id,
          version: rule.version,
          action: rule.action,
          effect: rule.effect,
          stage: rule.stage,
          conditions: rule.conditions,
          priority: rule.priority,
          source: rule.source,
          enabled: rule.enabled,
          title: rule.title,
          reason: rule.reason,
        })
        .returning(),
    standardFehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toRule(row) as StoredRule;
}
