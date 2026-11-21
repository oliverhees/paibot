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
import type { LetzterLauf, WorkerMeldung } from "./schleuse";

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

/** Was die Seite zur Meldung des Workers zeigt: Marke, Satz mit Ausweg und Zeit der Prüfung. */
export interface WorkerAnzeige {
  art: StatusArt;
  marke: string;
  text: string;
  ausweg?: string;
  geprueft: string;
}

/**
 * Anzeige zur letzten Meldung des Workers. Ist sie veraltet, steht das vorne: Dann weiß PaiBot
 * nicht, wie es der Datenschleuse gerade geht.
 */
export function workerAnzeige(worker: WorkerMeldung, zeit: string): WorkerAnzeige {
  const geprueft = t("datenschleuse.worker.geprueft", { zeit });
  if (worker.veraltet) {
    return {
      art: "warn",
      marke: t("datenschleuse.worker.chip.veraltet"),
      text: t("datenschleuse.worker.veraltet", { zeit }),
      ausweg: t("datenschleuse.worker.veraltet.ausweg"),
      geprueft,
    };
  }
  switch (worker.zustand) {
    case "bereit":
      return {
        art: "ok",
        marke: t("datenschleuse.worker.chip.bereit"),
        text: t("datenschleuse.zustand.bereit"),
        geprueft,
      };
    case "nicht_erreichbar":
      return {
        art: "fehler",
        marke: t("datenschleuse.worker.chip.nicht_erreichbar"),
        text: t("datenschleuse.zustand.nicht_erreichbar"),
        ausweg: t("datenschleuse.zustand.nicht_erreichbar.ausweg"),
        geprueft,
      };
    case "schluessel_falsch":
      return {
        art: "fehler",
        marke: t("datenschleuse.worker.chip.schluessel_falsch"),
        text: t("datenschleuse.zustand.schluessel_falsch"),
        ausweg: t("datenschleuse.zustand.schluessel_falsch.ausweg"),
        geprueft,
      };
    case "aus":
      return {
        art: "neutral",
        marke: t("datenschleuse.worker.chip.aus"),
        text: t("datenschleuse.zustand.aus"),
        geprueft,
      };
  }
}
