/**
 * PaiBot – Seite eines Bots: Steckbrief mit Rolle, Team, Modell und Rechten, dazu pausieren,
 * Team zuordnen und löschen.
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
import { notAusAn } from "../../../../lib/notaus/notaus";
import { botSeite } from "../../../../lib/teams/seite";
import { besitzerSeite } from "../../../../lib/zugang/seite";
import { BotSteckbrief } from "./BotSteckbrief";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("seite.bot")} · PaiBot` };

export default async function BotSteckbriefSeite({ params }: { params: Promise<{ id: string }> }) {
  await besitzerSeite();
  const { id } = await params;
  if (!isId("bot", id)) notFound();
  const db = datenbank();
  const daten = await botSeite(db, id);
  if (daten === undefined) notFound();
  return <BotSteckbrief daten={daten} notAus={await notAusAn(db)} />;
}
