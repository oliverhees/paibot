/**
 * PaiBot – Daten der Seite „Modell und Anbieter“ auf dem Server: Anbieter (nur „Schlüssel
 * gesetzt“), Vorlage für einen neuen Anbieter, Bot und sein Modell. Nie ein Schlüssel.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type Database, repo } from "@paibot/db";
import type { Provider } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import { type BotModell, modellVon } from "../bot/bot";
import type { ZugangsDienste } from "../zugang/dienste";
import type { AnbieterVorlage } from "./anbieter";

export interface ModelleSeitenDaten {
  botName: string;
  /** Alle gespeicherten Anbieter (zuerst angelegter vorn), ohne Schlüssel. */
  anbieterListe: Provider[];
  vorlage: AnbieterVorlage;
  modell?: BotModell;
}

export async function modelleSeitenDaten(
  db: Database,
  d: ZugangsDienste,
): Promise<ModelleSeitenDaten> {
  const anbieterListe = await repo.providers.list(db);
  const bot = await repo.bots.getDefault(db);
  const modell = bot === undefined ? undefined : await modellVon(db, bot);
  return {
    botName: bot?.name ?? t("einrichtung.bot.vorschlag"),
    anbieterListe,
    vorlage: d.einrichtungsAnbieter(),
    ...(modell === undefined ? {} : { modell }),
  };
}
