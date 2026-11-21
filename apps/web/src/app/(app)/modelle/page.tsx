/**
 * PaiBot – Seite „Modell und Anbieter“: lädt Anbieter, Vorlage und Modell des Bots auf dem Server
 * (ohne Schlüssel) und zeigt die Ansicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { datenbank } from "../../../lib/datenbank";
import { modelleSeitenDaten } from "../../../lib/modelle/seite";
import { prozessDienste } from "../../../lib/zugang/dienste";
import { besitzerSeite } from "../../../lib/zugang/seite";
import { ModelleAnsicht } from "./ModelleAnsicht";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("seite.modelle")} · PaiBot` };

export default async function ModelleSeite() {
  await besitzerSeite();
  const daten = await modelleSeitenDaten(datenbank(), prozessDienste());
  return <ModelleAnsicht {...daten} />;
}
