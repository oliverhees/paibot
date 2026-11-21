/**
 * PaiBot – Seite eines Belegs: der Beleg als lesbare Karte, Prüfen im Browser und die technische
 * Ansicht zum Kopieren.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { isPaiBotError } from "@paibot/shared/fehler";
import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { belegKarte, geraetImBeleg } from "../../../../lib/belege/karte";
import { type BelegUmfeld, belegMitUmfeld } from "../../../../lib/belege/lesen";
import { datenbank } from "../../../../lib/datenbank";
import { grobesGeraet } from "../../../../lib/einstellungen/anzeige";
import { besitzerSeite } from "../../../../lib/zugang/seite";
import { BelegDetail } from "./BelegDetail";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `${t("belege.detail.seitentitel")} · PaiBot` };

export default async function BelegSeite({ params }: { params: Promise<{ id: string }> }) {
  const sitzung = await besitzerSeite();
  const { id } = await params;
  const db = datenbank();
  let umfeld: BelegUmfeld;
  try {
    umfeld = await belegMitUmfeld(db, decodeURIComponent(id));
  } catch (fehler) {
    if (isPaiBotError(fehler) && fehler.code === "nicht_gefunden") notFound();
    throw fehler;
  }
  const geraet = geraetImBeleg(umfeld.beleg);
  const [settings, bots, schluessel, geraete] = await Promise.all([
    repo.settings.get(db),
    repo.bots.list(db),
    repo.installationKeys.listPublic(db),
    repo.geraete.namen(db, sitzung.ownerId, geraet === undefined ? [] : [geraet]),
  ]);
  const karte = belegKarte(umfeld, {
    zeitzone: settings?.timezone ?? "Europe/Berlin",
    botNamen: Object.fromEntries(bots.map((b) => [b.id, b.name])),
    schluessel,
    geraete: Object.fromEntries([...geraete].map(([g, e]) => [g, grobesGeraet(e.name)])),
  });
  return <BelegDetail karte={karte} />;
}
