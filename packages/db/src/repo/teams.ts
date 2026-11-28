/**
 * PaiBot – Zugriff auf Teams: anlegen, lesen, ändern, löschen, Mitglieder, und die Stände eines
 * Entwurfs. Nur der Besitzer-Weg der Web-App ruft die schreibenden Funktionen auf (Quelltext-Test
 * `teams-nur-besitzer-weg.test.ts`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import {
  type ActionId,
  type BotId,
  type EntwurfId,
  newId,
  PaiBotError,
  type TeamId,
} from "@paibot/shared";
import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { bots, teamEntwuerfe, teams } from "../schema";
import type { ENTWURF_STATUS, FADEN_ABNAHMEN, TEAM_ZUSAMMENARBEIT } from "../schema/werte";
import { toTeam } from "./abbildung";
import { feldFehler, SQLSTATE, standardFehler, uebersetzen } from "./fehler";

export type Zusammenarbeit = (typeof TEAM_ZUSAMMENARBEIT)[number];
export type AbnahmeStandard = (typeof FADEN_ABNAHMEN)[number];
export type EntwurfStand = (typeof ENTWURF_STATUS)[number];

/** Ein Team, wie die Oberfläche es bekommt: Zeiten als ISO-Text, leere Felder weggelassen. */
export interface Team {
  id: TeamId;
  name: string;
  leadBotId?: BotId;
  collaboration: Zusammenarbeit;
  acceptanceDefault: AbnahmeStandard;
  createdAt: string;
  updatedAt: string;
}

export interface TeamCreate {
  id?: TeamId;
  name: string;
  leadBotId?: BotId;
  collaboration?: Zusammenarbeit;
  acceptanceDefault?: AbnahmeStandard;
}

export interface TeamPatch {
  name?: string;
  /** `null` nimmt die Leitung weg; `undefined` lässt sie, wie sie ist. */
  leadBotId?: BotId | null;
  collaboration?: Zusammenarbeit;
  acceptanceDefault?: AbnahmeStandard;
}

function fehler(f: Parameters<typeof standardFehler>[0]) {
  if (f.code === SQLSTATE.eindeutig) return feldFehler("name");
  return standardFehler(f);
}

/** Legt ein Team an. Ein doppelter Name ist eine ungültige Eingabe. */
export async function create(db: Database, input: TeamCreate): Promise<Team> {
  const [row] = await uebersetzen(
    () =>
      db
        .insert(teams)
        .values({
          id: input.id ?? newId("team"),
          name: input.name,
          ...(input.leadBotId === undefined ? {} : { leadBotId: input.leadBotId }),
          ...(input.collaboration === undefined ? {} : { collaboration: input.collaboration }),
          ...(input.acceptanceDefault === undefined
            ? {}
            : { acceptanceDefault: input.acceptanceDefault }),
        })
        .returning(),
    fehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toTeam(row);
}

export async function get(db: Database, id: TeamId): Promise<Team | undefined> {
  const [row] = await db.select().from(teams).where(eq(teams.id, id));
  return row === undefined ? undefined : toTeam(row);
}

export async function list(db: Database): Promise<Team[]> {
  const rows = await db.select().from(teams).orderBy(asc(teams.createdAt), asc(teams.id));
  return rows.map(toTeam);
}

/** Ändert ein Team. `undefined`, wenn es es nicht gibt. */
export async function update(
  db: Database,
  id: TeamId,
  patch: TeamPatch,
): Promise<Team | undefined> {
  const [row] = await uebersetzen(
    () =>
      db
        .update(teams)
        .set({ ...patch, updatedAt: sql`pg_catalog.now()` })
        .where(eq(teams.id, id))
        .returning(),
    fehler,
  );
  return row === undefined ? undefined : toTeam(row);
}

/**
 * Löscht ein Team. `true`, wenn es es gab. Ein Team mit Fäden lässt sich nicht löschen
 * (`conversations.team_id` ohne Kaskade); das meldet ein Fehler mit festem Satz, nichts wird
 * verändert. Die Bots des Teams bleiben und stehen danach ohne Team da.
 */
export async function remove(db: Database, id: TeamId): Promise<boolean> {
  const geloescht = await uebersetzen(
    () => db.delete(teams).where(eq(teams.id, id)).returning({ id: teams.id }),
    (f) => {
      if (f.code !== SQLSTATE.fremdschluessel && f.code !== SQLSTATE.verhindert) return undefined;
      return new PaiBotError("abgelehnt", {
        text: "Dieses Team hat Fäden und lässt sich nicht löschen.",
        ausweg: "Lösche zuerst die Fäden des Teams.",
      });
    },
  );
  return geloescht.length > 0;
}

/** Die Bots eines Teams, älteste zuerst. */
export async function mitglieder(db: Database, id: TeamId): Promise<BotId[]> {
  const rows = await db
    .select({ id: bots.id })
    .from(bots)
    .where(eq(bots.teamId, id))
    .orderBy(asc(bots.createdAt), asc(bots.id));
  return rows.map((r) => r.id);
}

/** Gehört der Bot zu diesem Team? Fakt `leadInTeam` der Aktion `team.aendern` (Vorbedingung). */
export async function istMitglied(db: Database, id: TeamId, botId: BotId): Promise<boolean> {
  const [row] = await db
    .select({ team: bots.teamId })
    .from(bots)
    .where(eq(bots.id, botId))
    .limit(1);
  return row?.team === id;
}

/**
 * Erlaubte Wechsel der Stände eines Entwurfs. Ein Entwurf geht nur vorwärts: aus `offen` wird er
 * angelegt, verworfen oder verfällt; ein angelegter Entwurf lässt sich zurücknehmen. Danach ist
 * der Stand endgültig – aus `angelegt` wird nie wieder `offen`.
 */
export const ENTWURF_WECHSEL = {
  offen: ["angelegt", "verworfen", "verfallen"],
  angelegt: ["zurueckgenommen"],
  zurueckgenommen: [],
  verworfen: [],
  verfallen: [],
} as const satisfies Record<EntwurfStand, readonly EntwurfStand[]>;

/** Ist der Wechsel von `von` nach `nach` erlaubt? Rein, ohne Datenbank. */
export function wechselErlaubt(von: EntwurfStand, nach: EntwurfStand): boolean {
  return (ENTWURF_WECHSEL[von] as readonly EntwurfStand[]).includes(nach);
}

/**
 * Setzt den Stand eines Entwurfs, aber nur in der erlaubten Reihenfolge (`ENTWURF_WECHSEL`). Ein
 * verbotener Wechsel meldet `abgelehnt` und ändert nichts; den Entwurf gibt es nicht: `undefined`.
 * `actionId` wird je Stand in die passende Spalte geschrieben (angelegt bzw. zurückgenommen).
 */
export async function entwurfStandSetzen(
  db: Database,
  id: EntwurfId,
  nach: EntwurfStand,
  actionId?: ActionId,
): Promise<EntwurfStand | undefined> {
  const [vorher] = await db
    .select({ status: teamEntwuerfe.status })
    .from(teamEntwuerfe)
    .where(eq(teamEntwuerfe.id, id))
    .limit(1);
  if (vorher === undefined) return undefined;
  if (!wechselErlaubt(vorher.status, nach)) {
    throw new PaiBotError("abgelehnt", {
      text: "Dieser Entwurf ist nicht mehr offen.",
      ausweg: "Lade die Seite neu; der Entwurf hat seinen Stand schon geändert.",
    });
  }
  const [row] = await uebersetzen(
    () =>
      db
        .update(teamEntwuerfe)
        .set({
          status: nach,
          ...(actionId === undefined
            ? {}
            : nach === "angelegt"
              ? { createdActionId: actionId }
              : nach === "zurueckgenommen"
                ? { revertedActionId: actionId }
                : {}),
          updatedAt: sql`pg_catalog.now()`,
        })
        .where(eq(teamEntwuerfe.id, id))
        .returning({ status: teamEntwuerfe.status }),
    standardFehler,
  );
  return row?.status;
}
