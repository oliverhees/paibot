/**
 * PaiBot – Seite `/einstellungen/grenzen`, Reiter „Grenzen“: Tagesgrenze, Verlaufsgrenze, Zeitzone.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { datenbank } from "../../../../lib/datenbank";
import { einstellungenAnzeige } from "../../../../lib/einstellungen/grenzen";
import { besitzerSeite } from "../../../../lib/zugang/seite";
import { EinstellungenRahmen } from "../EinstellungenRahmen";
import { Grenzen } from "../Grenzen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${t("einstellungen.reiter.grenzen")} · ${t("seite.einstellungen")} · PaiBot`,
};

export default async function GrenzenSeite() {
  await besitzerSeite();
  const anfang = await einstellungenAnzeige(datenbank(), new Date());
  return (
    <EinstellungenRahmen aktiv="grenzen">
      <Grenzen anfang={anfang} zeitzonen={Intl.supportedValuesOf("timeZone")} />
    </EinstellungenRahmen>
  );
}
