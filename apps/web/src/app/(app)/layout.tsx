/**
 * PaiBot – Grundgerüst der angemeldeten App: prüft die Sitzung auf dem Server und zeigt die
 * Navigation mit dem Bot und seinen Unterhaltungen aus der Datenbank, dazu den Hinweis auf neue
 * Anmeldungen von anderen Geräten.
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
import { modellVon } from "../../lib/bot/bot";
import { ladeUnterhaltungen } from "../../lib/chat/laden";
import { datenbank } from "../../lib/datenbank";
import { notAusAn } from "../../lib/notaus/notaus";
import { prozessDienste } from "../../lib/zugang/dienste";
import { neueAnmeldungen } from "../../lib/zugang/hinweis";
import { besitzerSeite } from "../../lib/zugang/seite";
import { AppRahmen } from "./AppRahmen";
import { NeueAnmeldung } from "./NeueAnmeldung";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const sitzung = await besitzerSeite();
  const db = datenbank();
  // Neue Geräte seit dem Stand dieses Geräts (Hinweis bis „Das war ich“).
  const neue = await neueAnmeldungen(db, sitzung, prozessDienste().uhr.now());
  const zeitzone = (await repo.settings.get(db))?.timezone ?? "Europe/Berlin";
  const bot = await repo.bots.getDefault(db);
  const unterhaltungen = await ladeUnterhaltungen(db);
  // Herkunft der Modelle in der Seitenleiste: belegbare Angabe zum Anbieter des gewählten Modells.
  const herkunft = bot === undefined ? undefined : (await modellVon(db, bot))?.herkunft;
  const notAus = await notAusAn(db);
  return (
    <AppRahmen
      unterhaltungen={unterhaltungen}
      notAus={notAus}
      hinweise={<NeueAnmeldung neue={neue} zeitzone={zeitzone} />}
      zeitzone={zeitzone}
      {...(herkunft === undefined ? {} : { herkunft })}
      bot={{
        name: bot?.name ?? t("einrichtung.bot.vorschlag"),
        farbe: bot?.color ?? "limette",
      }}
    >
      {children}
    </AppRahmen>
  );
}
