/**
 * PaiBot – Logik der Eingabe für einen eigenen oder lokalen Anbieter (ohne DOM, auch im Browser):
 * Werte prüfen, Körper für die Anfrage bauen, Fehler des Servers den Feldern zuordnen, Auswahl des
 * angezeigten Anbieters.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ApiErrorDetail } from "@paibot/shared/api";
import type { Provider, Region } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";

/** Regionen in der Reihenfolge der Auswahl; „lokal“ muss man ausdrücklich wählen. */
export const EIGENE_REGIONEN: readonly Region[] = ["eu", "non_eu", "local"];

/** Was im Formular steht. Der Schlüssel bleibt nur im Formular und geht nur in die Anfrage. */
export interface EigenWerte {
  name: string;
  baseUrl: string;
  region: Region;
  apiKey: string;
  schluesselEntfernen: boolean;
}

export type EigenFeld = "name" | "baseUrl" | "apiKey";
export type EigenFehler = Partial<Record<EigenFeld, string>>;

/** Leere Werte für einen neuen Anbieter. */
export function neueWerte(): EigenWerte {
  return { name: "", baseUrl: "", region: "eu", apiKey: "", schluesselEntfernen: false };
}

/** Werte eines gespeicherten Anbieters (ohne Schlüssel, den kennt der Browser nie). */
export function werteVon(a: Pick<Provider, "name" | "baseUrl" | "region">): EigenWerte {
  return {
    name: a.name,
    baseUrl: a.baseUrl,
    region: a.region,
    apiKey: "",
    schluesselEntfernen: false,
  };
}

/** Prüft, was der Browser schon sicher sagen kann; alles andere prüft der Server. */
export function eigenPruefen(w: EigenWerte): EigenFehler {
  const fehler: EigenFehler = {};
  if (w.name.trim() === "") fehler.name = t("modelle.eigen.name.leer");
  if (w.baseUrl.trim() === "") fehler.baseUrl = t("modelle.eigen.adresse.leer");
  return fehler;
}

/** Kann der Schlüssel entfernt werden? Nur, wenn einer da ist und der Dienst lokal läuft. */
export function schluesselEntfernbar(
  alt: Pick<Provider, "keySet"> | undefined,
  region: Region,
): boolean {
  return alt?.keySet === true && region === "local";
}

/** Körper für `POST /api/anbieter` bzw. `PUT /api/anbieter/:id` (immer Vorlage „eigener“). */
export function eigenKoerper(
  w: EigenWerte,
  alt?: Pick<Provider, "keySet">,
): Record<string, unknown> {
  const koerper: Record<string, unknown> = {
    templateKey: "eigener",
    name: w.name.trim(),
    baseUrl: w.baseUrl.trim(),
    region: w.region,
  };
  const schluessel = w.apiKey.trim();
  if (schluessel !== "") koerper.apiKey = schluessel;
  else if (w.schluesselEntfernen && schluesselEntfernbar(alt, w.region)) {
    koerper.removeApiKey = true;
  }
  return koerper;
}

/** Hinweis bei unverschlüsselter Adresse (http://), nur bei „lokal“ überhaupt erlaubt. */
export function unverschluesselt(baseUrl: string, region: Region): boolean {
  return region === "local" && /^http:\/\//i.test(baseUrl.trim());
}

/**
 * Ordnet einen Fehler des Servers den Feldern zu. Was zu keinem Feld gehört, bleibt als Meldung
 * unter dem Formular (Rückgabe `rest`).
 */
export function eigenFehlerAus(fehler: ApiErrorDetail): { felder: EigenFehler; rest: boolean } {
  const felder: EigenFehler = {};
  for (const f of fehler.felder ?? []) {
    const feld: EigenFeld | undefined =
      f.feld === "name" || f.feld === "baseUrl" || f.feld === "apiKey" ? f.feld : undefined;
    if (feld !== undefined && felder[feld] === undefined) felder[feld] = fehler.text;
  }
  return { felder, rest: Object.keys(felder).length === 0 };
}

/**
 * Welcher Anbieter ist angezeigt? Der gewünschte, sonst der des gewählten Modells, sonst der
 * zuerst angelegte.
 */
export function gezeigterAnbieter<T extends { id: string }>(
  liste: readonly T[],
  wunsch: string | undefined,
  modellAnbieter: string | undefined,
): T | undefined {
  return (
    liste.find((a) => a.id === wunsch) ?? liste.find((a) => a.id === modellAnbieter) ?? liste[0]
  );
}
