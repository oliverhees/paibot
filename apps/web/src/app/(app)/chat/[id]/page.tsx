/**
 * PaiBot – eine Unterhaltung mit dem Bot: Verlauf aus der Datenbank, danach live.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { isId } from "@paibot/shared/ids";
import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ladeBereitschaft, ladeVerlauf } from "../../../../lib/chat/laden";
import { FASSUNG_COOKIE, fassungAus } from "../../../../lib/chat/startbereich";
import { datenbank } from "../../../../lib/datenbank";
import { schleuseEingerichtet } from "../../../../lib/schleuse/schleuse";
import { prozessDienste } from "../../../../lib/zugang/dienste";
import { besitzerSeite } from "../../../../lib/zugang/seite";
import { ChatSeite } from "../ChatSeite";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("seite.chat")} · PaiBot` };

export default async function UnterhaltungSeite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await besitzerSeite();
  const { id } = await params;
  const roh = (await searchParams).stelle;
  const stelle = typeof roh === "string" && isId("message", roh) ? roh : undefined;
  if (!isId("conversation", id)) notFound();
  const db = datenbank();
  const verlauf = await ladeVerlauf(db, id, { mitSchritten: true });
  if (verlauf === undefined) notFound();
  const bereitschaft = await ladeBereitschaft(
    db,
    await schleuseEingerichtet(db, prozessDienste()),
    (anbieter) => prozessDienste().unterAnbieter(anbieter),
  );
  const fassung = fassungAus((await cookies()).get(FASSUNG_COOKIE)?.value);
  return (
    <ChatSeite
      key={id}
      bereitschaft={bereitschaft}
      fassung={fassung}
      verlauf={verlauf}
      {...(stelle === undefined ? {} : { stelle })}
    />
  );
}
