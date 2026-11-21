/**
 * PaiBot – reine Hilfen der Einstellungen für die Oberfläche: grobe Geräte-Angabe, Zeitpunkte,
 * Prüfliste fürs Passwort und Prüfung der Grenzen. Ohne Zod, damit die Seite unter der strengen
 * Content-Security-Policy läuft; was gilt, entscheidet der Server.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import type { EinstellungenAnzeige } from "./typen";

const BROWSER: readonly [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\b(OPR|Opera)\//, "Opera"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\b(Headless)?Chrome\/|\bCriOS\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

const SYSTEM: readonly [RegExp, string][] = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
];

function erster(liste: readonly [RegExp, string][], text: string): string | undefined {
  return liste.find(([muster]) => muster.test(text))?.[1];
}

/**
 * Grobe Geräte-Angabe aus der gespeicherten Browser-Kennung, z. B. „Firefox auf Linux“. Nur, was
 * sich sicher erkennen lässt; sonst „Gerät ohne Angabe“. Mehr (Adresse, Ort) speichert PaiBot nicht.
 */
export function grobesGeraet(kennung: string | undefined): string {
  if (kennung === undefined) return t("einstellungen.sitzung.geraet_unbekannt");
  const browser = erster(BROWSER, kennung);
  const system = erster(SYSTEM, kennung);
  if (browser === undefined || system === undefined) {
    return t("einstellungen.sitzung.geraet_unbekannt");
  }
  return t("einstellungen.sitzung.geraet", { browser, system });
}

/** Zeitpunkt wie „21.11.2026, 14:05“ in der Zeitzone der Installation. */
export function zeitpunkt(iso: string, zeitzone: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zeitzone,
  }).format(new Date(iso));
}

/** Uhrzeit wie „00:00“ in der Zeitzone der Installation. */
export function uhrzeit(iso: string, zeitzone: string): string {
  return new Intl.DateTimeFormat("de-DE", { timeStyle: "short", timeZone: zeitzone }).format(
    new Date(iso),
  );
}

/** Zahl mit Tausenderpunkten, z. B. „12.500“. */
export function zahl(wert: number): string {
  return new Intl.NumberFormat("de-DE").format(wert);
}

/** Prüfliste fürs neue Passwort, wie in der Einrichtung. */
export function passwortPruefliste(neu: string, wiederholt: string, min: number) {
  const laenge = neu.length >= min;
  const gleich = neu !== "" && neu === wiederholt;
  return { laenge, gleich, fertig: laenge && gleich };
}

/**
 * Liest ein Grenzen-Feld: leer heißt keine Grenze (`null`), sonst eine ganze Zahl von 1 bis `max`
 * (Leerzeichen und Tausenderpunkte erlaubt). Ungültig: `undefined`.
 */
export function grenzeLesen(eingabe: string, max: number): number | null | undefined {
  const text = eingabe.replace(/[\s.]/g, "");
  if (text === "") return null;
  if (!/^\d+$/.test(text)) return undefined;
  const wert = Number(text);
  return Number.isSafeInteger(wert) && wert >= 1 && wert <= max ? wert : undefined;
}

/** Formularwerte der Grenzen. */
export interface GrenzenFormular {
  tagesbudget: string;
  verlaufsgrenze: string;
  zeitzone: string;
}

/** Formularwerte aus den gespeicherten Einstellungen. */
export function formularAus(e: EinstellungenAnzeige): GrenzenFormular {
  return {
    tagesbudget: e.tagesbudget === null ? "" : String(e.tagesbudget),
    verlaufsgrenze: e.verlaufsgrenze === null ? "" : String(e.verlaufsgrenze),
    zeitzone: e.zeitzone,
  };
}

/** Körper für `PATCH /api/einstellungen` (Feldnamen wie im Vertrag). */
export interface GrenzenAenderung {
  timezone?: string;
  historyTokenLimit?: number | null;
  dailyTokenBudget?: number | null;
}

export type GrenzenPruefung =
  | { ok: true; aenderung: GrenzenAenderung; leer: boolean }
  | { ok: false; felder: Partial<Record<"tagesbudget" | "verlaufsgrenze", string>> };

/** Prüft das Formular und liefert nur die geänderten Felder. */
export function grenzenPruefen(
  formular: GrenzenFormular,
  gespeichert: EinstellungenAnzeige,
): GrenzenPruefung {
  const max = gespeichert.hoechstwerte;
  const tagesbudget = grenzeLesen(formular.tagesbudget, max.tagesbudget);
  const verlaufsgrenze = grenzeLesen(formular.verlaufsgrenze, max.verlaufsgrenze);
  const felder: Partial<Record<"tagesbudget" | "verlaufsgrenze", string>> = {};
  if (tagesbudget === undefined) {
    felder.tagesbudget = t("einstellungen.grenzen.zahl_ungueltig", {
      max: zahl(max.tagesbudget),
    });
  }
  if (verlaufsgrenze === undefined) {
    felder.verlaufsgrenze = t("einstellungen.grenzen.zahl_ungueltig", {
      max: zahl(max.verlaufsgrenze),
    });
  }
  if (tagesbudget === undefined || verlaufsgrenze === undefined) return { ok: false, felder };
  const aenderung: GrenzenAenderung = {
    ...(formular.zeitzone === gespeichert.zeitzone ? {} : { timezone: formular.zeitzone }),
    ...(verlaufsgrenze === gespeichert.verlaufsgrenze ? {} : { historyTokenLimit: verlaufsgrenze }),
    ...(tagesbudget === gespeichert.tagesbudget ? {} : { dailyTokenBudget: tagesbudget }),
  };
  return { ok: true, aenderung, leer: Object.keys(aenderung).length === 0 };
}

/** Satz zum Verbrauch von heute. */
export function verbrauchSatz(e: EinstellungenAnzeige): string {
  const uhr = uhrzeit(e.heute.seit, e.zeitzone);
  return e.tagesbudget === null
    ? t("einstellungen.heute.ohne_grenze", { token: zahl(e.heute.token), uhrzeit: uhr })
    : t("einstellungen.heute.mit_grenze", {
        token: zahl(e.heute.token),
        grenze: zahl(e.tagesbudget),
        uhrzeit: uhr,
      });
}

/** Ist die Tagesgrenze erreicht (wie Grenze G-04 des Tors: Verbrauch nicht kleiner als Grenze)? */
export function grenzeErreicht(e: EinstellungenAnzeige): boolean {
  return e.tagesbudget !== null && e.heute.token >= e.tagesbudget;
}

/** Adresse der Beleg-Ansicht. */
export function belegAdresse(id: string): string {
  return `/belege/${encodeURIComponent(id)}`;
}
