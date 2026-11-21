/**
 * PaiBot – Vorgaben einer Routing-Regel in Worten, ohne DOM und ohne Zod: wann die Kennzeichnung
 * „EU“ gilt (nur bei belegter Vorgabe der Regel selbst), wie alt eine Angabe ist und wann eine
 * Regel auf Ausweichen hinweist. Läuft im Browser.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { RulePolicy } from "@paibot/shared/grundtypen";
import { t } from "@paibot/shared/texte";

/**
 * Nach so vielen Tagen gilt eine gelesene Vorgabe als länger nicht geprüft. Die Kennzeichnung
 * bleibt dann sichtbar, aber mit dem Hinweis „zuletzt geprüft am …“. Vorschlag; die Zahl ist nicht
 * aus einer Vorgabe des Anbieters abgeleitet.
 */
export const VORGABE_ALT_TAGE = 14;

/** Gelesene Vorgaben einer Regel, wie die Oberfläche sie bekommt (nie mit Kennungen des Kontos). */
export interface RegelVorgabe {
  policy: RulePolicy;
  /** Zeitpunkt der Prüfung (ISO 8601). */
  geprueftAm: string;
  /** Der Tag der Prüfung als Text, z. B. „21.11.2026“. */
  geprueftText: string;
  /** Älter als `VORGABE_ALT_TAGE` zum Zeitpunkt, an dem die Seite geladen wurde. */
  veraltet: boolean;
}

/**
 * Trägt die Regel die Kennzeichnung „EU“? Nur wenn die Regel in der Liste des Kontos genau
 * `data_residency: "EU"` meldet. Freitext (`description`), Namen und Vorlage zählen nie.
 */
export function istEuBelegt(vorgabe: Pick<RegelVorgabe, "policy"> | undefined): boolean {
  return vorgabe?.policy.data_residency === "EU";
}

/** Text zum Tag einer Prüfung („21.11.2026“) in der Zeitzone des Besitzers. */
export function tagText(zeit: Date, zeitzone: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeZone: zeitzone,
    }).format(zeit);
  } catch {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "UTC" }).format(zeit);
  }
}

/** Baut die Vorgaben für die Oberfläche aus dem gespeicherten Stand. */
export function vorgabeAus(
  policy: RulePolicy,
  geprueftAm: Date,
  jetzt: Date,
  zeitzone: string,
): RegelVorgabe {
  const alter = jetzt.getTime() - geprueftAm.getTime();
  return {
    policy,
    geprueftAm: geprueftAm.toISOString(),
    geprueftText: tagText(geprueftAm, zeitzone),
    veraltet: alter > VORGABE_ALT_TAGE * 24 * 60 * 60 * 1000,
  };
}

/** Kurze Marke für Kopf und Listen: nur mit Beleg, sonst `undefined`. */
export function euMarke(vorgabe: RegelVorgabe | undefined): string | undefined {
  return istEuBelegt(vorgabe) ? t("vorgabe.eu.marke") : undefined;
}

/**
 * Satz zur Kennzeichnung mit Herkunft und Zeitpunkt, z. B. „EU laut Regel in deinem
 * EUrouter-Konto, geprüft am 21.11.2026.“ Bei älteren Angaben „zuletzt geprüft am …“. Ohne Beleg
 * `undefined`.
 */
export function euSatz(vorgabe: RegelVorgabe | undefined, anbieter: string): string | undefined {
  if (vorgabe === undefined || !istEuBelegt(vorgabe)) return undefined;
  return vorgabe.veraltet
    ? t("vorgabe.eu.satz_alt", { anbieter, datum: vorgabe.geprueftText })
    : t("vorgabe.eu.satz", { anbieter, datum: vorgabe.geprueftText });
}

/**
 * Satz, wenn die Regel auf Ausweichen hinweist („kann auf … ausweichen“), sonst `undefined`.
 * Das sind die Angaben der Regel (Felder `models`, `allow_fallbacks`); wer wirklich antwortet,
 * steht an jeder Antwort.
 */
export function ausweichSatz(vorgabe: RegelVorgabe | undefined): string | undefined {
  const modelle = vorgabe?.policy.models ?? [];
  if (modelle.length > 0) {
    return t("vorgabe.ausweichen.modelle", { modelle: modelle.join(", ") });
  }
  if (vorgabe?.policy.allow_fallbacks === true) return t("vorgabe.ausweichen.erlaubt");
  return undefined;
}

/**
 * Was die Regel zur Datenresidenz sagt, wenn sie nicht „EU“ sagt: ihr Wert in Worten oder, dass
 * sie nichts nennt. Ohne gelesene Vorgaben `undefined`.
 */
export function residenzSatz(vorgabe: RegelVorgabe | undefined): string | undefined {
  if (vorgabe === undefined || istEuBelegt(vorgabe)) return undefined;
  const wert = vorgabe.policy.data_residency;
  return wert === undefined
    ? t("vorgabe.residenz.keine")
    : t("vorgabe.residenz.anders", { wert, datum: vorgabe.geprueftText });
}

/** Zusatz für die Zeile unter einer Antwort: Kennzeichnung (nur mit Beleg) und Ausweichen. */
export function antwortZusatz(vorgabe: RegelVorgabe | undefined, anbieter: string): string[] {
  const teile: string[] = [];
  const eu = euSatz(vorgabe, anbieter);
  if (eu !== undefined) teile.push(eu);
  const ausweichen = ausweichSatz(vorgabe);
  if (ausweichen !== undefined) teile.push(ausweichen);
  return teile;
}

/**
 * Kurze Teile für die Zeile unter einer Antwort und die Kopfzeile: Kennzeichnung mit Datum (nur
 * mit Beleg) und der Hinweis aufs Ausweichen. Keine Rechtsaussage.
 */
export function antwortKurz(vorgabe: RegelVorgabe | undefined): string[] {
  const teile: string[] = [];
  if (vorgabe !== undefined && istEuBelegt(vorgabe)) {
    teile.push(
      t(vorgabe.veraltet ? "vorgabe.eu.kurz_alt" : "vorgabe.eu.kurz", {
        datum: vorgabe.geprueftText,
      }),
    );
  }
  const modelle = vorgabe?.policy.models ?? [];
  if (modelle.length > 0) {
    teile.push(t("vorgabe.ausweichen.kurz_modelle", { modelle: modelle.join(", ") }));
  } else if (vorgabe?.policy.allow_fallbacks === true) {
    teile.push(t("vorgabe.ausweichen.kurz_erlaubt"));
  }
  return teile;
}
