/**
 * PaiBot – Seite „Belege“: alle Belege, neueste zuerst, Prüfen der ganzen Kette im Browser,
 * Anker zum Aufbewahren und Export.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { encodeAnchor } from "@paibot/shared/belege";
import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { aktuellerAnker, belegeSeite } from "../../../lib/belege/lesen";
import { datenbank } from "../../../lib/datenbank";
import { besitzerSeite } from "../../../lib/zugang/seite";
import { BelegeAnsicht } from "./BelegeAnsicht";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `${t("seite.belege")} · PaiBot` };

/** Belege je Seite der Liste. */
const SEITE = 50;

export default async function BelegeSeite() {
  await besitzerSeite();
  const db = datenbank();
  const jetzt = new Date();
  const [seite, settings, bots, anker, kopf] = await Promise.all([
    belegeSeite(db, { limit: SEITE }),
    repo.settings.get(db),
    repo.bots.list(db),
    aktuellerAnker(db, jetzt),
    repo.belege.head(db),
  ]);
  return (
    <BelegeAnsicht
      start={seite}
      seiteGroesse={SEITE}
      gesamt={kopf?.seq ?? 0}
      zeitzone={settings?.timezone ?? "Europe/Berlin"}
      jetzt={jetzt.toISOString()}
      botNamen={Object.fromEntries(bots.map((b) => [b.id, b.name]))}
      {...(anker === undefined ? {} : { anker: encodeAnchor(anker) })}
    />
  );
}
