/**
 * PaiBot – reine Hilfen für die Ansicht „Bekannte Geräte“ und den Hinweis auf neue Anmeldungen
 * (ohne Zod, für den Browser).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import { grobesGeraet, zeitpunkt } from "./anzeige";
import type { GeraetZeile } from "./typen";

/** Dieses Gerät zuerst, danach zuletzt gesehene zuerst. */
export function geraeteSortiert(liste: readonly GeraetZeile[]): GeraetZeile[] {
  return [...liste].sort((a, b) => {
    if (a.aktuell !== b.aktuell) return a.aktuell ? -1 : 1;
    return a.zuletzt < b.zuletzt ? 1 : a.zuletzt > b.zuletzt ? -1 : a.id < b.id ? -1 : 1;
  });
}

/** Ein neues Gerät im Hinweis (vom Server, ohne Adresse). */
export interface NeueAnmeldungZeile {
  id: string;
  name?: string;
  angelegt: string;
}

/** Überschrift und Zeilen des Hinweises, z. B. „Safari auf iPhone, am 21.11.2026, 14:05“. */
export function hinweisTexte(
  liste: readonly NeueAnmeldungZeile[],
  zeitzone: string,
): { titel: string; zeilen: string[] } {
  const titel =
    liste.length === 1
      ? t("hinweis.neu.titel")
      : t("hinweis.neu.titel_mehrere", { anzahl: liste.length });
  const zeilen = liste.map((g) =>
    t("hinweis.neu.zeile", { geraet: grobesGeraet(g.name), zeit: zeitpunkt(g.angelegt, zeitzone) }),
  );
  return { titel, zeilen };
}
