/**
 * PaiBot – Die Unterhaltungen der Seitenleiste: Reihenfolge (neueste zuerst), ein Eintrag nach
 * einer Änderung im Browser übernehmen und die Unterhaltungen eines Bots heraussuchen. Reine
 * Funktionen ohne React, damit die Zuordnung zum Bot prüfbar ist: Die Seitenleiste gruppiert nach
 * `botId`, und ein Update darf diese Zuordnung nie verlieren.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import type { UnterhaltungKurz, UnterhaltungUpdate } from "./typen";

/** Neueste zuerst, nach dem Zeitpunkt der letzten Nachricht. */
export function neuesteZuerst(liste: readonly UnterhaltungKurz[]): UnterhaltungKurz[] {
  return [...liste].sort((a, b) => (a.zuletzt < b.zuletzt ? 1 : a.zuletzt > b.zuletzt ? -1 : 0));
}

/**
 * Übernimmt eine geänderte oder neue Unterhaltung in die Liste und sortiert neu. Bringt das Update
 * keinen Bot mit, bleibt der Bot des bisherigen Eintrags erhalten: Sonst fiele die Unterhaltung aus
 * ihrer Gruppe in der Seitenleiste und verschwände nach dem Senden oder Umbenennen aus der Ansicht.
 */
export function merken(
  liste: readonly UnterhaltungKurz[],
  u: UnterhaltungUpdate,
): UnterhaltungKurz[] {
  const alt = liste.find((x) => x.id === u.id);
  const botId = u.botId ?? alt?.botId;
  const eintrag = botId === undefined ? u : { ...u, botId };
  return neuesteZuerst([eintrag, ...liste.filter((x) => x.id !== u.id)]);
}

/**
 * Die Unterhaltungen eines Bots, in der Reihenfolge der Liste. Ohne Bot (Fäden eines Teams) oder
 * ohne gefragten Bot bleibt die Auswahl leer – die Seitenleiste zeigt sie unter keinem Bot.
 */
export function unterhaltungenVon(
  liste: readonly UnterhaltungKurz[],
  botId: string | undefined,
): UnterhaltungKurz[] {
  if (botId === undefined) return [];
  return liste.filter((u) => u.botId === botId);
}
