/**
 * PaiBot – Startseite der App: eine neue Unterhaltung mit dem Bot. Die erste Nachricht legt sie an.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { ladeBereitschaft } from "../../lib/chat/laden";
import { datenbank } from "../../lib/datenbank";
import { schleuseEingerichtet } from "../../lib/schleuse/schleuse";
import { prozessDienste } from "../../lib/zugang/dienste";
import { besitzerSeite } from "../../lib/zugang/seite";
import { ChatSeite } from "./chat/ChatSeite";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("seite.chat")} · PaiBot` };

export default async function StartSeite() {
  await besitzerSeite();
  const db = datenbank();
  const bereitschaft = await ladeBereitschaft(
    db,
    await schleuseEingerichtet(db, prozessDienste()),
    (anbieter) => prozessDienste().unterAnbieter(anbieter),
  );
  return <ChatSeite key="neu" bereitschaft={bereitschaft} />;
}
