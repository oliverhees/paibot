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
import type { UnterAnbieterListe } from "./herkunft";
import { alteModelleVon, type RegelEintrag, regelnVon } from "./regeln";

/** Früherer Eintrag aus der Modell-Liste eines Anbieters mit Regeln. */
export interface AlterEintrag {
  id: string;
  slug: string;
  displayName: string;
}

export interface ModelleSeitenDaten {
  botName: string;
  /** Alle gespeicherten Anbieter (zuerst angelegter vorn), ohne Schlüssel. */
  anbieterListe: Provider[];
  vorlage: AnbieterVorlage;
  /** Vorlagen der Auswahl „Anbieter hinzufügen“. */
  vorlagen: { eurouter: AnbieterVorlage; mistral: AnbieterVorlage };
  /** Gespeicherte Routing-Regeln je Anbieter (nur EUrouter). */
  regeln: Record<string, RegelEintrag[]>;
  /** Frühere Einträge aus der Modell-Liste je Anbieter mit Regeln (bleiben benutzbar). */
  alteEintraege: Record<string, AlterEintrag[]>;
  /** Anbieter-Liste von EUrouter (Name, Sitz), wenn EUrouter eingerichtet ist und sie geholt wurde. */
  unterAnbieter?: UnterAnbieterListe;
  modell?: BotModell;
}

export async function modelleSeitenDaten(
  db: Database,
  d: ZugangsDienste,
): Promise<ModelleSeitenDaten> {
  const anbieterListe = await repo.providers.list(db);
  const bot = await repo.bots.getDefault(db);
  const modell = bot === undefined ? undefined : await modellVon(db, bot);
  const regeln: Record<string, RegelEintrag[]> = {};
  const alteEintraege: Record<string, AlterEintrag[]> = {};
  for (const a of anbieterListe) {
    if (a.templateKey !== "eurouter") continue;
    regeln[a.id] = await regelnVon(db, a);
    alteEintraege[a.id] = await alteModelleVon(db, a);
  }
  const eurouter = anbieterListe.find((a) => a.templateKey === "eurouter");
  const unterAnbieter = eurouter === undefined ? undefined : await d.unterAnbieter(eurouter);
  return {
    botName: bot?.name ?? t("einrichtung.bot.vorschlag"),
    anbieterListe,
    vorlage: d.einrichtungsAnbieter(),
    vorlagen: { eurouter: d.vorlage("eurouter"), mistral: d.vorlage("mistral") },
    regeln,
    alteEintraege,
    ...(unterAnbieter === undefined ? {} : { unterAnbieter }),
    ...(modell === undefined ? {} : { modell }),
  };
}
