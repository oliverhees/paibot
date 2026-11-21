/**
 * PaiBot – Zugriff auf Regeln: nur lesen. Neue Fassungen kommen allein aus Migrationen; bestehende
 * Zeilen lassen sich weder ändern noch löschen (Trigger).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  ACTIVE_STANDARD_RULES,
  PaiBotError,
  priorityFitsSource,
  type Rule,
  type RuleDefinition,
  ruleContent,
  STANDARD_RULE_ID_PATTERN,
} from "@paibot/shared";
import { and, asc, eq, lte, max, ne, type SQL, sql } from "drizzle-orm";
import type { Database } from "../client";
import { rules } from "../schema";
import { toRule } from "./abbildung";

/** Gespeicherte Regel mit ihrer Nummer im Regel-Protokoll. */
export type StoredRule = Rule & { seq: number };

/** Gültige Regeln zu einem Stand des Regel-Protokolls. */
export interface StoredRuleSnapshot {
  /** Höchste Nummer aller Regel-Zeilen, die zu diesem Stand gehören. */
  stand: number;
  rules: StoredRule[];
}

/**
 * Welche Zeilen überhaupt als Fassung einer Regel zählen: nie Vorschläge, und eine lesbare
 * Kennung (`R-…`) nur mit Quelle `standard`, eine erzeugte (`reg_…`) nur mit einer anderen Quelle.
 * Die Datenbank lässt andere Zeilen nicht zu (CHECK); das Lesen schließt sie zusätzlich aus, damit
 * eine solche Zeile nie die Fassung einer Standard-Regel verdeckt.
 */
const ZAEHLT: SQL = and(
  ne(rules.source, "proposal"),
  sql`(${rules.id} ~ '^R-[0-9]{3}$') = (${rules.source} = 'standard')`,
) as SQL;

async function neuesteFassungen(db: Database, bis?: number): Promise<StoredRule[]> {
  const rows = await db
    .selectDistinctOn([rules.id])
    .from(rules)
    .where(bis === undefined ? ZAEHLT : and(ZAEHLT, lte(rules.seq, bis)))
    .orderBy(rules.id, sql`${rules.version} desc`);
  return rows
    .filter((row) => row.enabled)
    .map((row) => toRule(row) as StoredRule)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

/**
 * Die gültigen Regeln: je Regel die höchste Fassung, nur wenn sie eingeschaltet ist, geordnet
 * nach Priorität (kleinste zuerst), bei gleicher Priorität nach ID. Vorschläge und Zeilen, deren
 * Kennung nicht zur Quelle passt, zählen nie.
 */
export function listActive(db: Database): Promise<StoredRule[]> {
  return neuesteFassungen(db);
}

/**
 * Die gültigen Regeln zum Stand `stand`: nur Zeilen mit `seq <= stand`, davon je Regel die
 * höchste Fassung. So bekommt das Nachrechnen eines Belegs genau den damaligen Regelstand.
 */
export function listActiveAsOf(db: Database, stand: number): Promise<StoredRule[]> {
  return neuesteFassungen(db, stand);
}

/** Aktueller Stand des Regel-Protokolls: die höchste Nummer, 0 ohne Regeln. */
export async function currentStand(db: Database): Promise<number> {
  const [row] = await db.select({ stand: max(rules.seq) }).from(rules);
  return row?.stand ?? 0;
}

/** Kanonisches JSON (Schlüssel sortiert), um den Inhalt zweier Regeln zu vergleichen. */
function kanonisch(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(kanonisch).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${kanonisch(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function gleicherInhalt(a: RuleDefinition, b: RuleDefinition): boolean {
  return kanonisch(ruleContent(a)) === kanonisch(ruleContent(b));
}

/**
 * Prüft den Regelstand gegen die Standard-Regeln im Code (sonst `PaiBotError("intern")`, das Tor
 * entscheidet dann nicht):
 * - jede Regel aus `ACTIVE_STANDARD_RULES` steht genau in dieser Fassung darin;
 * - es gibt keine weitere Regel mit einer Standard-Kennung oder Quelle `standard`;
 * - es gibt keine eingeschaltete Regel einer anderen Quelle (eigene Regeln und Vorschläge sind in
 *   dieser Fassung immer aus), und jede Regel liegt im Prioritäten-Band ihrer Quelle.
 * Ein leerer Regelstand ist deshalb ein Fehler, nie „alles fragen“.
 */
export function verifyStandardRules(snapshot: StoredRuleSnapshot): StoredRuleSnapshot {
  if (snapshot.stand < 1) throw new PaiBotError("intern");
  const byId = new Map<string, StoredRule>();
  for (const rule of snapshot.rules) {
    if (byId.has(rule.id)) throw new PaiBotError("intern");
    byId.set(rule.id, rule);
  }
  for (const expected of ACTIVE_STANDARD_RULES) {
    const found = byId.get(expected.id);
    if (found === undefined || !gleicherInhalt(found, expected)) throw new PaiBotError("intern");
  }
  const known = new Set<string>(ACTIVE_STANDARD_RULES.map((rule) => rule.id));
  for (const rule of snapshot.rules) {
    const standardId = STANDARD_RULE_ID_PATTERN.test(rule.id);
    if (standardId !== (rule.source === "standard")) throw new PaiBotError("intern");
    if (standardId && !known.has(rule.id)) throw new PaiBotError("intern");
    // In dieser Fassung gibt es keine eingeschalteten eigenen Regeln und nie eingeschaltete
    // Vorschläge (die Datenbank lässt sie nicht zu).
    if (rule.source !== "standard") throw new PaiBotError("intern");
    if (!priorityFitsSource(rule.source, rule.priority)) throw new PaiBotError("intern");
  }
  return snapshot;
}

/**
 * Stand und die gültigen Regeln zu genau diesem Stand, wie das Tor sie zum Entscheiden braucht.
 * Erst wird der Stand gelesen, dann nur Zeilen bis zu ihm; spätere Regeln gehören nicht dazu.
 * Der Stand wird gegen die Standard-Regeln im Code geprüft (`verifyStandardRules`).
 */
export async function loadSnapshot(db: Database): Promise<StoredRuleSnapshot> {
  const stand = await currentStand(db);
  return verifyStandardRules({ stand, rules: await listActiveAsOf(db, stand) });
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

/*
 * Regeln anlegen: In dieser Fassung gibt es keinen Weg dafür. Die App darf in `rules` nur lesen;
 * die Standard-Regeln legen die Migrationen an. Kommen eigene Regeln dazu, wird das Anlegen eine
 * eigene Aktion durch das Tor mit Beleg, und die Zeile verweist auf diesen Beleg.
 */
