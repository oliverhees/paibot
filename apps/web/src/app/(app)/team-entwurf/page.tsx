/**
 * PaiBot – Seite „Team aus Vorlage“: die Vorlagen aus dem Image, die Vorschau eines Entwurfs,
 * Anlegen mit einem Klick und Rückgängig als Ganzes.
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
import { entwurfSeite } from "../../../lib/team/entwurf/seite";
import { besitzerSeite } from "../../../lib/zugang/seite";
import { TeamEntwurfSeite } from "./TeamEntwurfSeite";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("teams.entwurf.seite_titel")} · PaiBot` };

export default async function TeamAusVorlageSeite() {
  await besitzerSeite();
  return <TeamEntwurfSeite daten={await entwurfSeite(datenbank())} />;
}
