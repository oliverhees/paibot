/**
 * PaiBot – die eine Stelle für Links „Noch kein Konto? Hier anlegen“ je Anbieter und die Reihenfolge
 * der Auswahl. Läuft im Browser und auf dem Server; lädt kein Zod.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/** Tag, an dem die Angaben der Anbieter (Aussagen, Bedingungen, Konto-Seiten) gelesen wurden. */
export const ANGABEN_STAND = "21.11.2026";

/** Anbieter, die die Auswahl in Einrichtung und auf „Modell und Anbieter“ anbietet. */
export type AnbieterWahl = "eurouter" | "mistral" | "eigener";

interface KontoSeite {
  /** Normale Seite des Anbieters zum Anlegen eines Kontos. */
  seite: string;
  /** Bedingungen des Anbieters (wird nur auf Klick in einem neuen Tab geöffnet). */
  bedingungen: string;
  /**
   * Empfehlungs-Link des Entwicklers. Nur eintragen, wenn es ihn wirklich gibt; solange er fehlt,
   * zeigt PaiBot die normale Seite ohne Hinweis auf eine Provision.
   */
  empfehlung?: string;
}

/**
 * Konto-Seiten der Anbieter. Hier, und nur hier, kommt später ein Empfehlungs-Link hinein
 * (`empfehlung`). Die Reihenfolge der Auswahl hängt davon nicht ab.
 */
export const KONTO_SEITEN: Readonly<Record<Exclude<AnbieterWahl, "eigener">, KontoSeite>> = {
  eurouter: {
    seite: "https://www.eurouter.ai/sign-up",
    bedingungen: "https://www.eurouter.ai/terms",
  },
  mistral: { seite: "https://console.mistral.ai/", bedingungen: "https://legal.mistral.ai/terms" },
};

/**
 * Reihenfolge der Auswahl: die Dienste nach Namen (EUrouter, Mistral AI), danach der eigene oder
 * lokale Anbieter. Nicht nach Provision.
 */
export const ANBIETER_REIHENFOLGE: readonly AnbieterWahl[] = ["eurouter", "mistral", "eigener"];

/** Adresse der Bedingungen des Anbieters; beim eigenen Anbieter keine. */
export function bedingungenLink(wahl: AnbieterWahl): string | undefined {
  return wahl === "eigener" ? undefined : KONTO_SEITEN[wahl].bedingungen;
}

/** Link zum Konto-Anlegen: Adresse und ob es ein Empfehlungs-Link ist (dann mit Hinweis). */
export function kontoLink(
  wahl: AnbieterWahl,
  seiten: Readonly<Record<Exclude<AnbieterWahl, "eigener">, KontoSeite>> = KONTO_SEITEN,
): { href: string; empfehlung: boolean } | undefined {
  if (wahl === "eigener") return undefined;
  const eintrag = seiten[wahl];
  const empfehlung = eintrag.empfehlung?.trim();
  if (empfehlung !== undefined && /^https:\/\//.test(empfehlung)) {
    return { href: empfehlung, empfehlung: true };
  }
  return { href: eintrag.seite, empfehlung: false };
}
