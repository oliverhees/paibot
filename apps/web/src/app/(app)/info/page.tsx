/**
 * PaiBot – Seite `/info`: Stand der Installation, Lizenz, Entwickler, Bestandteile Dritter, Hilfe
 * und wie man eine Sicherheitslücke meldet.
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
import { datenbank } from "../../../lib/datenbank";
import { stand } from "../../../lib/stand";
import { besitzerSeite } from "../../../lib/zugang/seite";
import { EinstellungenRahmen } from "../einstellungen/EinstellungenRahmen";
import { InfoInhalt } from "../einstellungen/InfoInhalt";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("seite.info")} · PaiBot` };

export default async function InfoSeite() {
  await besitzerSeite();
  const settings = await repo.settings.get(datenbank());
  return (
    <EinstellungenRahmen aktiv="info">
      <InfoInhalt
        stand={stand()}
        {...(settings?.installationId ? { installation: settings.installationId } : {})}
      />
    </EinstellungenRahmen>
  );
}
