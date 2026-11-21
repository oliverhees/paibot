/**
 * PaiBot – Seite `/anmelden`: nur nach der Einrichtung und ohne gültige Sitzung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { anmeldeSeite } from "../../lib/zugang/seite";
import { DatenbankFehlt } from "../DatenbankFehlt";
import { Anmelden } from "./Anmelden";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("seite.anmelden")} · PaiBot` };

export default async function AnmeldenSeite() {
  const zustand = await anmeldeSeite();
  if (zustand.eingerichtet === undefined) return <DatenbankFehlt />;
  return <Anmelden />;
}
