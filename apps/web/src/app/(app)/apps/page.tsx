/**
 * PaiBot – Seite „Apps“: verbundene Apps, ihre Werkzeuge mit dem Text, der ans Modell geht, der
 * Zugriff jedes Bots und das Verbinden einer neuen App. Die Daten lädt der Server, Änderungen
 * laufen über die Routen unter `/api/apps`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { repo } from "@paibot/db";
import { t } from "@paibot/shared/texte";
import type { Metadata } from "next";
import { appsSeitenDaten } from "../../../lib/apps/seite";
import { datenbank } from "../../../lib/datenbank";
import { zeitText } from "../../../lib/schleuse/ansicht";
import { besitzerSeite } from "../../../lib/zugang/seite";
import { AppsAnsicht } from "./AppsAnsicht";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `${t("seite.apps")} · PaiBot` };

export default async function AppsSeite() {
  await besitzerSeite();
  const db = datenbank();
  const daten = await appsSeitenDaten(db);
  const zeitzone = (await repo.settings.get(db))?.timezone ?? "Europe/Berlin";
  // Die Zeit der Trennung steht schon in Worten da (Zeitzone der Installation).
  const apps = daten.apps.map((app) => ({
    ...app,
    getrenntText: app.getrenntAm === null ? undefined : zeitText(app.getrenntAm, zeitzone),
  }));
  return <AppsAnsicht apps={apps} notAus={daten.notAus} />;
}
