/**
 * PaiBot – Seite `/einstellungen/selbsttest`: Ist meine Installation richtig eingestellt?
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { datenbank } from "../../../../lib/datenbank";
import { besitzerSeite } from "../../../../lib/zugang/seite";
import { EinstellungenRahmen } from "../EinstellungenRahmen";
import { Selbsttest } from "./Selbsttest";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${t("seite.selbsttest")} · ${t("seite.einstellungen")} · PaiBot`,
};

export default async function SelbsttestSeite() {
  await besitzerSeite();
  const settings = await repo.settings.get(datenbank());
  return (
    <EinstellungenRahmen aktiv="selbsttest">
      <Selbsttest zeitzone={settings?.timezone ?? "UTC"} />
    </EinstellungenRahmen>
  );
}
