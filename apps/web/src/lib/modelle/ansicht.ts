/**
 * PaiBot – Logik der Seite „Modell und Anbieter“ ohne DOM: Zustand des Anbieters in Worten,
 * Suche in der Modell-Liste und welche Modelle passen. Läuft im Browser, lädt kein Zod.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { Provider } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import type { StatusArt } from "@paibot/ui";

/** Ab so vielen Modellen erscheint die Suche. */
export const SUCHE_AB = 8;

export interface ModellZeile {
  id: string;
  slug: string;
  displayName: string;
  contextWindow?: number;
}

/** Zustand des Anbieters als Marke mit Wort. */
export function anbieterStatus(anbieter: Pick<Provider, "keySet" | "region" | "lastCheckOk">): {
  art: StatusArt;
  text: string;
} {
  if (!anbieter.keySet && anbieter.region !== "local") {
    return { art: "warn", text: t("modelle.anbieter.status.ohne_schluessel") };
  }
  if (anbieter.lastCheckOk === true) {
    return { art: "ok", text: t("modelle.anbieter.status.verbunden") };
  }
  if (anbieter.lastCheckOk === false) {
    return { art: "fehler", text: t("modelle.anbieter.status.fehlgeschlagen") };
  }
  return { art: "neutral", text: t("modelle.anbieter.status.ungetestet") };
}

/** Kann die Seite die Modell-Liste holen? Mit Schlüssel oder bei einem lokalen Anbieter. */
export function listeMoeglich(anbieter: Pick<Provider, "keySet" | "region"> | undefined): boolean {
  return anbieter !== undefined && (anbieter.keySet || anbieter.region === "local");
}

/** Ist die Liste so lang, dass eine Suche hilft? */
export function sucheZeigen(liste: readonly ModellZeile[]): boolean {
  return liste.length > SUCHE_AB;
}

/** Modelle, deren Name oder Kennung die Suche enthalten (ohne Groß/klein). */
export function modelleFiltern<T extends ModellZeile>(liste: readonly T[], suche: string): T[] {
  const q = suche.trim().toLocaleLowerCase("de");
  if (q === "") return [...liste];
  return liste.filter(
    (m) =>
      m.displayName.toLocaleLowerCase("de").includes(q) ||
      m.slug.toLocaleLowerCase("de").includes(q),
  );
}

/** Text zur Region als Marke: „EU“, „außerhalb der EU“, „lokal“. */
export function regionText(region: Provider["region"]): string {
  return t(`modelle.region.${region}`);
}
