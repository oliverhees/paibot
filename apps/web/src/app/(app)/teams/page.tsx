/**
 * PaiBot – Seite „Bots und Teams“: alle Teams mit ihren Bots, Bots ohne Team, dazu ein Team und
 * einen Bot anlegen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { datenbank } from "../../../lib/datenbank";
import { teamsSeite } from "../../../lib/teams/seite";
import { besitzerSeite } from "../../../lib/zugang/seite";
import { TeamsSeite } from "./TeamsSeite";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("teams.seite.titel")} · PaiBot` };

export default async function TeamsUebersichtSeite() {
  await besitzerSeite();
  return <TeamsSeite daten={await teamsSeite(datenbank())} />;
}
