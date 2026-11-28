/**
 * PaiBot – Startseite der App: eine neue Unterhaltung mit dem Bot. Die erste Nachricht legt sie an.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type BotId, isId } from "@paibot/shared/ids";
import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ladeBereitschaft } from "../../lib/chat/laden";
import { FASSUNG_COOKIE, fassungAus } from "../../lib/chat/startbereich";
import { datenbank } from "../../lib/datenbank";
import { schleuseEingerichtet } from "../../lib/schleuse/schleuse";
import { prozessDienste } from "../../lib/zugang/dienste";
import { besitzerSeite } from "../../lib/zugang/seite";
import { ChatSeite } from "./chat/ChatSeite";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("seite.chat")} · PaiBot` };

/**
 * Neue Unterhaltung mit einem **gewählten** Bot: `?bot=<Kennung>` kommt aus der Seitenleiste
 * („Neue Unterhaltung mit …“, `navigation.ts#neueUnterhaltungAdresse`). Ohne Angabe – und bei
 * einer Kennung, die keine ist – bleibt der Standard-Bot die Vorgabe.
 */
export function gewaehlterBot(bot: string | string[] | undefined): BotId | undefined {
  const wert = Array.isArray(bot) ? bot[0] : bot;
  return isId("bot", wert) ? (wert as BotId) : undefined;
}

export default async function StartSeite({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await besitzerSeite();
  const db = datenbank();
  const bereitschaft = await ladeBereitschaft(
    db,
    await schleuseEingerichtet(db, prozessDienste()),
    (anbieter) => prozessDienste().unterAnbieter(anbieter),
    gewaehlterBot((await searchParams)?.bot),
  );
  const fassung = fassungAus((await cookies()).get(FASSUNG_COOKIE)?.value);
  return <ChatSeite key="neu" bereitschaft={bereitschaft} fassung={fassung} />;
}
