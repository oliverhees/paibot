/**
 * PaiBot – Zugriff auf Teams: anlegen, lesen, ändern, löschen, Mitglieder, und die Stände eines
 * Entwurfs. Nur der Besitzer-Weg der Web-App ruft die schreibenden Funktionen auf (Quelltext-Test
 * `teams-nur-besitzer-weg.test.ts`); die Rolle des Workers darf diese Tabellen nur lesen.
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
  t,
} from "@paibot/shared";
import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { bots, teamEntwuerfe, teams } from "../schema";
import type { ENTWURF_STATUS, FADEN_ABNAHMEN, TEAM_ZUSAMMENARBEIT } from "../schema/werte";
import { TEAMS_LOCK_KEY } from "../sperren";
import { toTeam } from "./abbildung";
import { feldFehler, SQLSTATE, standardFehler, uebersetzen } from "./fehler";
import { withTransaction } from "./transaktion";

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
        text: t("teams.fehler.hat_faeden"),
        ausweg: t("teams.fehler.hat_faeden.ausweg"),
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
 * Ändert ein Team und sichert dabei die Festlegung „die Leitung ist ein Mitglied ihres Teams“.
 * Kommt mit dem Patch eine **neue** Leitung, liegen das Prüfen der Mitgliedschaft und das
 * Schreiben in einer Transaktion unter der Sperre `TEAMS_LOCK_KEY`. Dieselbe Sperre nimmt
 * `bots.setTeam`: Ein gleichzeitiges Versetzen oder Herausnehmen des Bots kann sich deshalb nicht
 * zwischen Prüfung und Schreiben drängen, auch nicht aus einem zweiten Prozess. Gehört der Bot
 * dann nicht (mehr) zum Team, meldet die Funktion `abgelehnt` und ändert **nichts**.
 *
 * Das Tor prüft dieselbe Bedingung vorher über den Fakt `leadInTeam`; hier liegt die harte Grenze
 * in der Datenbank – genau wie die Grenze „Bots insgesamt“ in `bots.anlegenUnterGrenze`.
 */
export async function aendernUnterLeitungspruefung(
  db: Database,
  id: TeamId,
  patch: TeamPatch,
): Promise<Team | undefined> {
  const lead = patch.leadBotId;
  if (lead === undefined || lead === null) return update(db, id, patch);
  return withTransaction(db, async (tx) => {
    await tx.execute(`select pg_catalog.pg_advisory_xact_lock(${TEAMS_LOCK_KEY})`);
    if (!(await istMitglied(tx, id, lead))) {
      throw new PaiBotError("abgelehnt", {
        text: t("teams.fehler.leitung_fremd"),
        ausweg: t("teams.fehler.leitung_fremd.ausweg"),
      });
    }
    return update(tx, id, patch);
  });
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
      text: t("teams.fehler.entwurf_nicht_offen"),
      ausweg: t("teams.fehler.entwurf_nicht_offen.ausweg"),
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
