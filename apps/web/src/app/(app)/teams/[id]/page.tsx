/**
 * PaiBot – Seite eines Teams: Name, Leitung, Zusammenarbeit, Abnahme-Standard und Mitglieder
 * ändern, oder das Team löschen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { isId } from "@paibot/shared/ids";
import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { datenbank } from "../../../../lib/datenbank";
import { teamSeite } from "../../../../lib/teams/seite";
import { besitzerSeite } from "../../../../lib/zugang/seite";
import { TeamSeite } from "./TeamSeite";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("teams.seite.titel")} · PaiBot` };

export default async function TeamVerwaltungSeite({ params }: { params: Promise<{ id: string }> }) {
  await besitzerSeite();
  const { id } = await params;
  if (!isId("team", id)) notFound();
  const daten = await teamSeite(datenbank(), id);
  if (daten === undefined) notFound();
  return <TeamSeite daten={daten} />;
}
