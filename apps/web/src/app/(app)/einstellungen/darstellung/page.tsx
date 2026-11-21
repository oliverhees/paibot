/**
 * PaiBot – Seite `/einstellungen/darstellung`, Reiter „Darstellung“: Fassung des Startbereichs
 * einer leeren Unterhaltung. Die Wahl liegt im Cookie dieses Browsers.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { FASSUNG_COOKIE, fassungAus } from "../../../../lib/chat/startbereich";
import { besitzerSeite } from "../../../../lib/zugang/seite";
import { Darstellung } from "../Darstellung";
import { EinstellungenRahmen } from "../EinstellungenRahmen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${t("einstellungen.reiter.darstellung")} · ${t("seite.einstellungen")} · PaiBot`,
};

export default async function DarstellungSeite() {
  await besitzerSeite();
  const fassung = fassungAus((await cookies()).get(FASSUNG_COOKIE)?.value);
  return (
    <EinstellungenRahmen aktiv="darstellung">
      <Darstellung anfang={fassung} />
    </EinstellungenRahmen>
  );
}
