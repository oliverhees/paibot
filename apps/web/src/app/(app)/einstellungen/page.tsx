/**
 * PaiBot – Seite `/einstellungen`, Reiter „Zugang“: Passwort und Sitzungen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { LIMITS } from "@paibot/shared/konstanten";
import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { datenbank } from "../../../lib/datenbank";
import { besitzerSeite } from "../../../lib/zugang/seite";
import { EinstellungenRahmen } from "./EinstellungenRahmen";
import { Zugang } from "./Zugang";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("seite.einstellungen")} · PaiBot` };

export default async function ZugangSeite({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await besitzerSeite();
  const settings = await repo.settings.get(datenbank());
  const { passwort } = await searchParams;
  return (
    <EinstellungenRahmen aktiv="zugang">
      <Zugang
        zeitzone={settings?.timezone ?? "UTC"}
        passwortMin={LIMITS.passwordMinChars}
        passwortGeaendert={passwort === "geaendert"}
      />
    </EinstellungenRahmen>
  );
}
