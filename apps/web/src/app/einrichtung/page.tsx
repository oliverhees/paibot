/**
 * PaiBot – Seite `/einrichtung`: nur solange PaiBot nicht eingerichtet ist.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { datenbank } from "../../lib/datenbank";
import { prozessDienste } from "../../lib/zugang/dienste";
import { einrichtungsStatus } from "../../lib/zugang/einrichtung";
import { einrichtungsSeite } from "../../lib/zugang/seite";
import { DatenbankFehlt } from "../DatenbankFehlt";
import { Einrichtung } from "./Einrichtung";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("seite.einrichtung")} · PaiBot` };

export default async function EinrichtungSeite() {
  const zustand = await einrichtungsSeite();
  if (zustand.eingerichtet === undefined) return <DatenbankFehlt />;
  const status = await einrichtungsStatus(datenbank(), prozessDienste());
  return (
    <Einrichtung
      anbieter={status.anbieter}
      passwortMin={status.passwortMin}
      botVorschlag={status.botVorschlag}
      schleuseInstalliert={status.schleuseInstalliert}
      ohneProxy={status.ohneProxy}
    />
  );
}
