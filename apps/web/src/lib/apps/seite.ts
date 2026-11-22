/**
 * PaiBot – Daten der Seite „Apps“: die Apps mit dem Zugriff jedes Bots und ihren Werkzeugen, so wie
 * die Routen sie liefern (ohne Token, Werkzeuge mit dem Text, der ans Modell geht), dazu der Stand
 * des Not-Aus.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { type Database, repo } from "@paibot/db";
import type { BotId } from "@paibot/shared/ids";
import { notAusAn } from "../notaus/notaus";
import type { WerkzeugAntwort, ZugriffAntwort } from "./ansicht";
import { appAnsicht } from "./anzeige";
import { werkzeugeMitVergleich } from "./verlauf";

export interface AppSeitenEintrag extends ReturnType<typeof appAnsicht> {
  zugriff: ZugriffAntwort[];
  werkzeuge: WerkzeugAntwort[];
}

export interface AppsSeitenDaten {
  apps: AppSeitenEintrag[];
  notAus: boolean;
}

/** Alles, was die Seite „Apps“ beim Öffnen zeigt. Getrennte Apps haben keine Werkzeuge mehr zu zeigen. */
export async function appsSeitenDaten(db: Database): Promise<AppsSeitenDaten> {
  const bots = await repo.bots.list(db);
  const apps: AppSeitenEintrag[] = [];
  for (const app of await repo.apps.list(db)) {
    const zugriff: ZugriffAntwort[] = [];
    for (const bot of bots) {
      zugriff.push({
        botId: bot.id,
        name: bot.name,
        zugriff: await repo.apps.currentAccess(db, app.id, bot.id as BotId),
      });
    }
    const werkzeuge =
      app.state === "verbunden"
        ? await werkzeugeMitVergleich(db, await repo.apps.currentTools(db, app.id))
        : [];
    apps.push({ ...appAnsicht(app), zugriff, werkzeuge });
  }
  return { apps, notAus: await notAusAn(db) };
}
