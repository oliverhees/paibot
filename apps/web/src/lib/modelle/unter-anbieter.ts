/**
 * PaiBot – öffentliche Anbieter-Liste von EUrouter (`/api/v1/providers`) auf dem Server holen und
 * mit Abrufzeitpunkt zwischenspeichern. Nur Namen und Sitz (`headquarters`) werden behalten; andere
 * Felder der Liste (etwa Einstufungen zum Datenschutz) zeigt PaiBot nicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { checkProviderBaseUrl, createEgressFetch, providerEgressTarget } from "@paibot/llm";
import type { Provider } from "@paibot/shared/objekte";
import { type UnterAnbieterListe, unterAnbieterAus } from "./herkunft";

/** So lange gilt die gespeicherte Liste, bevor sie neu geholt wird. */
export const LISTE_GUELTIG_MS = 24 * 60 * 60 * 1000;
/** Nach einem Fehlschlag so lange keinen neuen Versuch. */
const PAUSE_NACH_FEHLER_MS = 10 * 60 * 1000;

interface Speicher {
  basis: string;
  liste?: UnterAnbieterListe;
  versuchtUm: number;
}

const SPEICHER = Symbol.for("paibot.web.unter-anbieter");
type Halter = { [SPEICHER]?: Speicher };

/** Adresse der Liste zur Basis-URL des Anbieters: `<Origin>/api/v1/providers`. */
export function listenAdresse(baseUrl: string): URL {
  const url = new URL(baseUrl);
  return new URL("/api/v1/providers", url.origin);
}

/**
 * Liste der Unter-Anbieter für einen EUrouter-Eintrag. Holt sie höchstens einmal am Tag (bei Fehler
 * frühestens nach zehn Minuten wieder), ohne Schlüssel und nur vom Host des Anbieters. Gelingt der
 * Abruf nicht, gibt es die zuletzt geholte Liste oder `undefined`; die Anzeige nennt dann nur die
 * Kennung des Anbieters ohne Sitz.
 */
export async function unterAnbieterListe(
  anbieter: Pick<Provider, "templateKey" | "baseUrl" | "region"> | undefined,
  optionen: { jetzt?: Date; fetch?: typeof fetch } = {},
): Promise<UnterAnbieterListe | undefined> {
  if (anbieter?.templateKey !== "eurouter") return undefined;
  const pruefung = checkProviderBaseUrl(anbieter.baseUrl, anbieter.region);
  if (!pruefung.ok) return undefined;
  const halter = globalThis as Halter;
  const jetzt = (optionen.jetzt ?? new Date()).getTime();
  const basis = pruefung.url.origin;
  let speicher = halter[SPEICHER];
  if (speicher === undefined || speicher.basis !== basis) {
    speicher = { basis, versuchtUm: 0 };
    halter[SPEICHER] = speicher;
  }
  const alter = speicher.liste ? jetzt - Date.parse(speicher.liste.abgerufen) : Infinity;
  if (alter < LISTE_GUELTIG_MS || jetzt - speicher.versuchtUm < PAUSE_NACH_FEHLER_MS) {
    return speicher.liste;
  }
  speicher.versuchtUm = jetzt;
  const adresse = listenAdresse(pruefung.url.href);
  const holen =
    optionen.fetch ??
    createEgressFetch([providerEgressTarget(adresse.origin, anbieter.region)], undefined, {
      limits: { maxBodyBytes: 512 * 1024, maxErrorBodyBytes: 4 * 1024 },
    });
  try {
    const antwort = await holen(adresse, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!antwort.ok) {
      await antwort.body?.cancel().catch(() => undefined);
      return speicher.liste;
    }
    const liste = unterAnbieterAus(await antwort.json(), new Date(jetzt));
    if (liste !== undefined) speicher.liste = liste;
    return speicher.liste;
  } catch {
    return speicher.liste;
  }
}

/** Nur für Tests: gespeicherte Liste vergessen. */
export function _unterAnbieterVergessen(): void {
  delete (globalThis as Halter)[SPEICHER];
}
