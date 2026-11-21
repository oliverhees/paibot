/**
 * PaiBot – Seite „Datenschleuse“: Zustand aus dem, was die Web-App sicher weiß (Umgebung und
 * Belege des Workers), und der Standard für neue Unterhaltungen.
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
import { zeitText } from "../../../lib/schleuse/ansicht";
import { DOKU_DATENSCHLEUSE, schleuseZustand } from "../../../lib/schleuse/schleuse";
import { prozessDienste } from "../../../lib/zugang/dienste";
import { besitzerSeite } from "../../../lib/zugang/seite";
import { SchleuseAnsicht } from "./SchleuseAnsicht";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("seite.datenschleuse")} · PaiBot` };

export default async function DatenschleuseSeite() {
  await besitzerSeite();
  const db = datenbank();
  const zustand = await schleuseZustand(db, prozessDienste());
  const zeitzone = (await repo.settings.get(db))?.timezone ?? "Europe/Berlin";
  return (
    <SchleuseAnsicht
      eingerichtet={zustand.eingerichtet}
      standard={zustand.standard}
      {...(zustand.letzterLauf === undefined
        ? {}
        : {
            letzterLauf: zustand.letzterLauf,
            letzterLaufZeit: zeitText(zustand.letzterLauf.zeit, zeitzone),
          })}
      dokuUrl={DOKU_DATENSCHLEUSE}
    />
  );
}
