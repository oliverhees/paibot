/**
 * PaiBot – ehrliche Herkunfts-Angabe ohne DOM: wer laut Antwort geantwortet hat und dessen Sitz
 * laut der öffentlichen Anbieter-Liste von EUrouter, bzw. die Angabe des Besitzers bei eigenen
 * Anbietern. Nie ein pauschales „EU“ aus einer Vorlage. Läuft im Browser; lädt kein Zod.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { anzeigeText } from "@paibot/shared/anzeigetext";
import type { ServedBy } from "@paibot/shared/grundtypen";
import type { ProviderTemplateKey, Region } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";

/** Ein Eintrag der Anbieter-Liste von EUrouter, bereinigt. */
export interface UnterAnbieter {
  name: string;
  /** Sitz als ISO-3166-Code (Feld `headquarters`), fehlt, wenn die Liste keinen nennt. */
  sitz?: string;
}

/** Anbieter-Liste von EUrouter, wie PaiBot sie zwischenspeichert (nur Namen und Sitz). */
export interface UnterAnbieterListe {
  /** Zeitpunkt des Abrufs (ISO 8601). */
  abgerufen: string;
  eintraege: Record<string, UnterAnbieter>;
}

/** Was die Herkunfts-Angabe vom gespeicherten Anbieter wissen muss. */
export interface AnbieterKurz {
  name: string;
  templateKey: ProviderTemplateKey;
  region: Region;
}

/** Land zum ISO-Code auf Deutsch, z. B. „IE“ → „Irland“; unbekannt: der Code selbst. */
export function landName(code: string): string {
  try {
    return new Intl.DisplayNames(["de"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Liest die rohe Antwort von `/api/v1/providers` in die bereinigte Liste. Unpassendes fällt weg. */
export function unterAnbieterAus(roh: unknown, abgerufen: Date): UnterAnbieterListe | undefined {
  if (typeof roh !== "object" || roh === null) return undefined;
  const daten = (roh as { data?: unknown }).data;
  if (!Array.isArray(daten)) return undefined;
  const eintraege: Record<string, UnterAnbieter> = {};
  for (const e of daten.slice(0, 500)) {
    if (typeof e !== "object" || e === null) continue;
    const r = e as Record<string, unknown>;
    if (typeof r.slug !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(r.slug)) continue;
    const name = anzeigeText(r.name, 80) ?? r.slug;
    const sitz =
      typeof r.headquarters === "string" && /^[A-Z]{2}$/.test(r.headquarters)
        ? r.headquarters
        : undefined;
    eintraege[r.slug] = { name, ...(sitz === undefined ? {} : { sitz }) };
  }
  return { abgerufen: abgerufen.toISOString(), eintraege };
}

/**
 * Herkunft eines Anbieter-Eintrags ohne Antwort (Kopf des Chats, Seitenleiste, Auswahl):
 * - EUrouter: „über EUrouter“ (welcher Anbieter antwortet, steht erst an der Antwort)
 * - Mistral und andere Vorlagen: der Name
 * - eigener Anbieter: Name und Ort mit „laut deiner Einstellung“
 */
export function anbieterHerkunft(anbieter: AnbieterKurz): string {
  if (anbieter.templateKey === "eurouter") {
    return t("herkunft.ueber", { anbieter: anbieter.name });
  }
  if (anbieter.templateKey === "eigener") {
    return t("herkunft.eigen", {
      anbieter: anbieter.name,
      ort: t(`modelle.region.${anbieter.region}`),
    });
  }
  return anbieter.name;
}

/**
 * Herkunft einer Antwort für die Zeile darunter: bei EUrouter der Anbieter laut Antwort und dessen
 * Sitz laut der Liste von EUrouter; ohne Angabe in der Antwort wie `anbieterHerkunft`.
 */
export function antwortHerkunft(
  anbieter: AnbieterKurz | undefined,
  servedBy: ServedBy | undefined,
  liste: UnterAnbieterListe | undefined,
): string | undefined {
  if (anbieter === undefined) return undefined;
  const slug = servedBy?.provider;
  if (anbieter.templateKey !== "eurouter" || slug === undefined) return anbieterHerkunft(anbieter);
  const eintrag = liste?.eintraege[slug];
  const name = eintrag?.name ?? slug;
  if (eintrag?.sitz === undefined) {
    return t("herkunft.antwort", { unter: name, anbieter: anbieter.name });
  }
  return t("herkunft.antwort_sitz", {
    unter: name,
    land: landName(eintrag.sitz),
    anbieter: anbieter.name,
  });
}
