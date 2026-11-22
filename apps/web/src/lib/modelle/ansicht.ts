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

/**
 * Ist das ein eigener oder lokaler Anbieter (kein Konto bei einem bekannten Dienst)? Mit Vorlage
 * entscheidet sie; die Einrichtung kennt nur den Anzeigenamen, und ein eigener Anbieter heißt dort
 * immer „Lokaler Anbieter“ bzw. „Eigener Anbieter“.
 */
export function eigenerAnbieter(
  anbieter: { templateKey: Provider["templateKey"] } | string,
): boolean {
  if (typeof anbieter !== "string") return anbieter.templateKey === "eigener";
  return (
    anbieter === t("modelle.anbieter.name.lokal") || anbieter === t("modelle.anbieter.name.eigener")
  );
}

/**
 * Name des Anbieters mitten im Satz. Eigene und lokale Anbieter tragen frei gewählte Namen
 * („Lokaler Anbieter“, „Mein Ollama“), die nach „für“, „zu“ oder „von“ holprig klingen; in
 * Anführungszeichen lesen sie sich glatt. Bekannte Dienste wie EUrouter bleiben, wie sie sind.
 */
export function anbieterImSatz(anbieter: Pick<Provider, "name" | "templateKey">): string {
  return anbieter.templateKey === "eigener" ? `„${anbieter.name}“` : anbieter.name;
}

/** Ausweg, wenn die Modell-Liste leer ist; bei eigenen Anbietern ohne „Konto bei …“. */
export function listeLeerAusweg(anbieter: Pick<Provider, "name" | "templateKey">): string {
  return eigenerAnbieter(anbieter)
    ? t("modelle.liste.leer.ausweg_eigen", { anbieter: anbieterImSatz(anbieter) })
    : t("modelle.liste.leer.ausweg", { anbieter: anbieter.name });
}

/** Satz im Schritt „Modell-Anbieter verbinden“ der Einrichtung. */
export function einrichtungSchluesselText(anbieter: string): string {
  return eigenerAnbieter(anbieter)
    ? t("einrichtung.schluessel.text_eigen", { anbieter })
    : t("einrichtung.schluessel.text", { anbieter });
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
