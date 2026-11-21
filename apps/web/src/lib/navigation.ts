/**
 * PaiBot – Navigation der angemeldeten App: Einträge der Werkzeuge, Titel der Kopfzeile nach Pfad,
 * aktive Zeilen und die Herkunft der Modelle in der Seitenleiste. Rein, ohne DOM, im Browser und
 * auf dem Server benutzbar.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import type { IconName } from "@paibot/ui";

/** Ein Eintrag der Werkzeuge unten in der Seitenleiste. */
export interface NavigationsEintrag {
  id: string;
  text: string;
  href: string;
  icon: IconName;
}

/** Steckbrief des Bots; erreichbar über den Namen des Bots in der Seitenleiste. */
export const BOT_ADRESSE = "/bot";

/**
 * Werkzeuge in der Reihenfolge der Oberfläche: Belege, Regeln, Datenschleuse, danach Modell und
 * Anbieter, Einstellungen und Info.
 */
export const NAVIGATION: readonly NavigationsEintrag[] = [
  { id: "belege", text: t("seite.belege"), href: "/belege", icon: "beleg" },
  { id: "regeln", text: t("seite.regeln"), href: "/regeln", icon: "regeln" },
  { id: "datenschleuse", text: t("seite.datenschleuse"), href: "/datenschleuse", icon: "schleuse" },
  { id: "modelle", text: t("seite.modelle"), href: "/modelle", icon: "server" },
  {
    id: "einstellungen",
    text: t("seite.einstellungen"),
    href: "/einstellungen",
    icon: "zahnrad",
  },
  { id: "info", text: t("seite.info"), href: "/info", icon: "info" },
];

/** Liegt `pfad` auf `href` oder darunter (`/belege/blg_…` gehört zu `/belege`)? */
export function liegtUnter(pfad: string, href: string): boolean {
  return pfad === href || pfad.startsWith(`${href}/`);
}

/** Seiten ohne eigenen Eintrag in den Werkzeugen, die trotzdem einen Titel brauchen. */
const WEITERE_SEITEN: readonly { href: string; text: string }[] = [
  { href: BOT_ADRESSE, text: t("seite.bot") },
];

/**
 * Titel der Standard-Kopfzeile nach Pfad: Name der Seite aus den Werkzeugen oder dem Steckbrief,
 * sonst „Chat“ (die neue Unterhaltung unter `/`; Unterhaltungen setzen ihre eigene Kopfzeile).
 */
export function kopfTitel(pfad: string): string {
  const eintrag = [...NAVIGATION, ...WEITERE_SEITEN].find((e) => liegtUnter(pfad, e.href));
  return eintrag?.text ?? t("seite.chat");
}

/** Ist die Zeile des Bots aktiv? Auf dem Steckbrief und in einer seiner Unterhaltungen. */
export function botAktiv(pfad: string, inUnterhaltung: boolean): boolean {
  return inUnterhaltung || liegtUnter(pfad, BOT_ADRESSE);
}

/**
 * Herkunft der Modelle für die Seitenleiste („Modelle: …“): die belegbare Angabe zum Anbieter des
 * gewählten Modells (`anbieterHerkunft`, z. B. „über EUrouter“ oder „… laut deiner Einstellung“).
 * Ohne Anbieter steht dort, dass noch keiner verbunden ist – nie eine angenommene Region.
 */
export function modelleHerkunft(herkunft: string | undefined): string {
  return herkunft ?? t("navigation.modelle.keine");
}
