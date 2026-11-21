/**
 * PaiBot – Logik der Seite „Datenschleuse“ ohne DOM: das Ergebnis der letzten geschützten Anfrage
 * in Worten und die Zeit in der Zeitzone der Installation. Läuft im Browser, lädt kein Zod.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { errorText, t } from "@paibot/shared/texte";
import type { StatusArt } from "@paibot/ui";
import type { LetzterLauf } from "./schleuse";

/** Zeit wie „21.11.2026, 10:42“ in der Zeitzone der Installation. */
export function zeitText(iso: string, zeitzone: string): string {
  const datum = new Date(iso);
  try {
    return datum.toLocaleString("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: zeitzone,
    });
  } catch {
    return datum.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  }
}

/** Satz und Marke zur letzten Anfrage über die Datenschleuse. */
export function letzterLaufText(
  lauf: LetzterLauf,
  zeit: string,
): { art: StatusArt; text: string; ausweg?: string } {
  switch (lauf.art) {
    case "bereit":
      return { art: "ok", text: t("datenschleuse.letzter_lauf.bereit", { zeit }) };
    case "blockiert":
      return {
        art: "warn",
        text: t("datenschleuse.letzter_lauf.blockiert", { zeit }),
        ausweg: t("fehler.schleuse_blockiert.ausweg"),
      };
    case "nicht_bereit":
      return {
        art: "fehler",
        text: t("datenschleuse.letzter_lauf.nicht_bereit", { zeit }),
        ausweg: `${t("datenschleuse.zustand.nicht_erreichbar.ausweg")} ${t("datenschleuse.zustand.schluessel_falsch.ausweg")}`,
      };
    case "anbieter":
      return {
        art: "warn",
        text: t("datenschleuse.letzter_lauf.anbieter", {
          zeit,
          fehler: errorText(lauf.code ?? "intern"),
        }),
      };
  }
}
