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

/** Seite des Haupt-Assistenten; erreichbar über seinen Namen in der Seitenleiste. */
export const BOT_ADRESSE = "/bot";

/** Übersicht aller Teams. */
export const TEAMS_ADRESSE = "/teams";

/**
 * Seite eines Bots. Der Haupt-Assistent hat seine eigene Seite (`/bot`, mit Name, Anweisung und
 * Modell); jeder weitere Bot hat seinen Steckbrief unter `/bot/<Kennung>`.
 */
export function botAdresse(botId: string, haupt = false): string {
  return haupt ? BOT_ADRESSE : `${BOT_ADRESSE}/${encodeURIComponent(botId)}`;
}

/** Seite der Verwaltung eines Teams. */
export function teamAdresse(teamId: string): string {
  return `${TEAMS_ADRESSE}/${encodeURIComponent(teamId)}`;
}

/**
 * Neue Unterhaltung mit einem bestimmten Bot. Ohne Kennung bleibt es die Startseite – dort
 * antwortet der Standard-Bot, die Vorgabe für eine neue Unterhaltung.
 */
export function neueUnterhaltungAdresse(botId?: string): string {
  return botId === undefined ? "/" : `/?bot=${encodeURIComponent(botId)}`;
}

/**
 * Arbeits-Seiten in der Reihenfolge der Oberfläche: Bots und Teams, Belege, Regeln,
 * Datenschleuse, Modell und Anbieter, Apps. Persönliches (Zugang, Einstellungen, Hilfe, Info,
 * Abmelden) steht im Menü „Du“.
 */
export const NAVIGATION: readonly NavigationsEintrag[] = [
  { id: "teams", text: t("teams.seite.titel"), href: TEAMS_ADRESSE, icon: "person" },
  { id: "belege", text: t("seite.belege"), href: "/belege", icon: "beleg" },
  { id: "regeln", text: t("seite.regeln"), href: "/regeln", icon: "regeln" },
  { id: "datenschleuse", text: t("seite.datenschleuse"), href: "/datenschleuse", icon: "schleuse" },
  { id: "modelle", text: t("seite.modelle"), href: "/modelle", icon: "server" },
  { id: "apps", text: t("seite.apps"), href: "/apps", icon: "web" },
];

/** Ziele im Menü „Du“ innerhalb der App. */
export const DU_ADRESSEN = {
  zugang: "/einstellungen",
  einstellungen: "/einstellungen/grenzen",
  selbsttest: "/einstellungen/selbsttest",
  info: "/info",
} as const;

/** Ein Eintrag im Menü „Du“: Ziel in der App oder nach außen (neuer Tab), oder Abmelden. */
export interface DuEintrag {
  id: string;
  text: string;
  hinweis?: string;
  icon: IconName;
  /** Kleine Überschrift über dem Eintrag (beginnt eine Gruppe, mit Trennlinie). */
  gruppe?: string;
  ziel: { intern: string } | { extern: string } | "abmelden";
}

/**
 * Einträge des Menüs „Du“ in ihrer Reihenfolge; „Abmelden“ zuletzt und abgesetzt. Weitere
 * Einträge kommen hier dazu. Ziele nach außen öffnen nur nach Klick in einem neuen Tab.
 */
export function duEintraege(
  stand: string,
  links: { aenderungen: string; doku: string; roadmap: string },
): DuEintrag[] {
  return [
    {
      id: "zugang",
      text: t("nav.du.zugang"),
      hinweis: t("nav.du.zugang.hinweis"),
      icon: "schloss",
      ziel: { intern: DU_ADRESSEN.zugang },
    },
    {
      id: "einstellungen",
      text: t("seite.einstellungen"),
      hinweis: t("nav.du.einstellungen.hinweis"),
      icon: "zahnrad",
      ziel: { intern: DU_ADRESSEN.einstellungen },
    },
    {
      id: "neuigkeiten",
      text: t("nav.du.neuigkeiten"),
      hinweis: t("nav.du.neuigkeiten.hinweis", { stand }),
      icon: "funke",
      ziel: { extern: links.aenderungen },
    },
    {
      id: "doku",
      gruppe: t("nav.du.hilfe"),
      text: t("nav.du.doku"),
      hinweis: t("nav.du.doku.hinweis"),
      icon: "hilfe",
      ziel: { extern: links.doku },
    },
    {
      id: "roadmap",
      text: t("nav.du.roadmap"),
      hinweis: t("nav.du.roadmap.hinweis"),
      icon: "extern",
      ziel: { extern: links.roadmap },
    },
    {
      id: "selbsttest",
      text: t("nav.du.selbsttest"),
      hinweis: t("nav.du.selbsttest.hinweis"),
      icon: "check",
      ziel: { intern: DU_ADRESSEN.selbsttest },
    },
    { id: "info", text: t("seite.info"), icon: "info", ziel: { intern: DU_ADRESSEN.info } },
    {
      id: "abmelden",
      gruppe: "",
      text: t("navigation.abmelden"),
      icon: "abmelden",
      ziel: "abmelden",
    },
  ];
}

/** Liegt `pfad` auf `href` oder darunter (`/belege/blg_…` gehört zu `/belege`)? */
export function liegtUnter(pfad: string, href: string): boolean {
  return pfad === href || pfad.startsWith(`${href}/`);
}

/** Seiten ohne eigenen Eintrag in den Werkzeugen, die trotzdem einen Titel brauchen. */
const WEITERE_SEITEN: readonly { href: string; text: string }[] = [
  { href: BOT_ADRESSE, text: t("seite.bot") },
  { href: "/einstellungen", text: t("seite.einstellungen") },
  { href: DU_ADRESSEN.info, text: t("seite.info") },
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
