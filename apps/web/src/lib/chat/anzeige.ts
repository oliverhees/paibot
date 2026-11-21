/**
 * PaiBot – kleine Regeln der Chat-Oberfläche ohne Zustand: Titel aus der ersten Nachricht,
 * Zeiten, Kennung eines Belegs, Weg der Anfrage, passende Seite zu einem Fehlercode, Länge.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ErrorCode } from "@paibot/shared/fehler";
import type { Region, Route } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";

/** Längster Titel, der aus der ersten Nachricht entsteht. */
export const TITEL_ZEICHEN = 60;

/**
 * Titel einer neuen Unterhaltung aus ihrer ersten Nachricht: erste nicht leere Zeile, Leerraum
 * zusammengefasst, höchstens `TITEL_ZEICHEN` Zeichen, an einer Wortgrenze gekürzt mit „…“.
 * Ohne verwertbaren Text: „Neue Unterhaltung“.
 */
export function titelAusNachricht(text: string, max = TITEL_ZEICHEN): string {
  const zeile =
    text
      .split(/\r?\n/)
      .map((z) => z.replace(/\s+/g, " ").trim())
      .find((z) => z !== "") ?? "";
  if (zeile === "") return t("chat.titel.neu");
  const zeichen = Array.from(zeile);
  if (zeichen.length <= max) return zeile;
  const kurz = zeichen.slice(0, max - 1).join("");
  const grenze = kurz.lastIndexOf(" ");
  const schnitt = grenze >= max / 2 ? kurz.slice(0, grenze) : kurz;
  return `${schnitt.replace(/[\s,.;:!?–-]+$/u, "")}…`;
}

/** Uhrzeit „14:32“ in der Zeitzone der Einstellungen. */
export function uhrzeit(iso: string, zeitzone: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zeitzone,
  }).format(new Date(iso));
}

/** Datum in der Zeitzone als `JJJJ-MM-TT` (zum Vergleichen von Tagen). */
export function tagSchluessel(iso: string | Date, zeitzone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: zeitzone,
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Trenner über den Nachrichten eines Tages: „Heute“, „Gestern“ oder das Datum. */
export function tagText(iso: string, zeitzone: string, jetzt: Date): string {
  const tag = tagSchluessel(iso, zeitzone);
  if (tag === tagSchluessel(jetzt, zeitzone)) return t("chat.tag.heute");
  const gestern = new Date(jetzt.getTime() - 24 * 60 * 60 * 1000);
  if (tag === tagSchluessel(gestern, zeitzone)) return t("chat.tag.gestern");
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: zeitzone,
  }).format(new Date(iso));
}

/** Datum und Uhrzeit „21.11.2026 · 14:32:08“ für die Belege. */
export function zeitpunkt(iso: string, zeitzone: string): string {
  const d = new Date(iso);
  const datum = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: zeitzone,
  }).format(d);
  const zeit = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: zeitzone,
  }).format(d);
  return `${datum} · ${zeit}`;
}

/** Kurze Kennung eines Belegs aus seiner Nummer in der Kette, z. B. „B-0142“. */
export function belegKennung(seq: number): string {
  return `B-${String(seq).padStart(4, "0")}`;
}

/** Adresse der Seite eines Belegs. */
export function belegAdresse(id: string): string {
  return `/belege/${encodeURIComponent(id)}`;
}

/** Weg der Anfrage für die Zeile unter der Antwort. */
export function wegAngabe(
  route: Route,
  region: Region,
): { modus: "direkt" | "schleuse"; text: string; kurz: string } {
  if (route === "schleuse") {
    return {
      modus: "schleuse",
      text: t("schleuse.hinweis.schleuse"),
      kurz: t("chat.weg.kurz.schleuse"),
    };
  }
  return {
    modus: "direkt",
    text:
      region === "eu"
        ? t("schleuse.hinweis.direkt")
        : t("chat.weg.direkt", { region: t(`modelle.region.${region}`) }),
    kurz: t("chat.weg.kurz.direkt"),
  };
}

/** Seite, die bei einem Fehlercode weiterhilft, mit Beschriftung des Links. */
export function zielZuCode(code: ErrorCode): { href: string; text: string } | undefined {
  switch (code) {
    case "kein_modell":
    case "schluessel_ungueltig":
      return { href: "/modelle", text: t("chat.ziel.modelle") };
    case "schleuse_blockiert":
    case "schleuse_nicht_installiert":
      return { href: "/datenschleuse", text: t("chat.ziel.datenschleuse") };
    case "limit_erreicht":
      return { href: "/einstellungen", text: t("chat.ziel.einstellungen") };
    default:
      return undefined;
  }
}

/** Ab diesem Anteil der Höchstlänge zeigt die Eingabe, wie viel noch geht. */
const LAENGE_WARNUNG = 0.9;

/**
 * Hinweis zur Länge der Eingabe: nichts, solange viel Platz ist; „Noch … Zeichen“ kurz vor der
 * Grenze; „… Zeichen zu viel“ darüber (dann wird nicht gesendet).
 */
export function laengenHinweis(
  text: string,
  max: number,
): { art: "ok" } | { art: "knapp"; text: string } | { art: "zu_lang"; text: string } {
  const laenge = text.length;
  if (laenge > max) {
    return { art: "zu_lang", text: t("chat.laenge.zu_lang", { anzahl: zahl(laenge - max) }) };
  }
  if (laenge >= max * LAENGE_WARNUNG) {
    return { art: "knapp", text: t("chat.laenge.noch", { anzahl: zahl(max - laenge) }) };
  }
  return { art: "ok" };
}

function zahl(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n);
}
