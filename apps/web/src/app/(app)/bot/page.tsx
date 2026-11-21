/**
 * PaiBot – Seite „Bot“: lädt Bot, Modell und die geltenden Regeln auf dem Server.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { botSeitenDaten } from "../../../lib/bot/bot";
import { datenbank } from "../../../lib/datenbank";
import { besitzerSeite } from "../../../lib/zugang/seite";
import { BotSeite } from "./BotSeite";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("seite.bot")} · PaiBot` };

export default async function BotSeitePage() {
  await besitzerSeite();
  const daten = await botSeitenDaten(datenbank());
  if (daten === undefined) notFound();
  return <BotSeite daten={daten} />;
}
