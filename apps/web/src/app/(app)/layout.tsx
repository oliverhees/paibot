/**
 * PaiBot – Grundgerüst der angemeldeten App: prüft die Sitzung auf dem Server und zeigt die
 * Navigation mit dem Bot aus der Datenbank.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { repo } from "@paibot/db";
import { t } from "@paibot/shared/texte";
import type { ReactNode } from "react";
import { datenbank } from "../../lib/datenbank";
import { besitzerSeite } from "../../lib/zugang/seite";
import { AppRahmen } from "./AppRahmen";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await besitzerSeite();
  const bot = await repo.bots.getDefault(datenbank());
  return (
    <AppRahmen
      bot={{
        name: bot?.name ?? t("einrichtung.bot.vorschlag"),
        farbe: bot?.color ?? "limette",
      }}
    >
      {children}
    </AppRahmen>
  );
}
