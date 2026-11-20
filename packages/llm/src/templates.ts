/**
 * PaiBot – Vorlagen für Anbieter, die PaiBot von Haus aus kennt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ProviderKind, ProviderTemplateKey, Region } from "@paibot/shared/objekte";

/** Vorlage für einen Anbieter: was beim Anlegen vorbelegt wird. */
export interface ProviderTemplate {
  kind: ProviderKind;
  name: string;
  /** OpenAI-kompatible Basis-URL, fest für diese Vorlage. */
  baseUrl: string;
  region: Region;
}

/**
 * Bekannte Anbieter. In der Basis nur EUrouter. Die Schlüssel sind Werte aus
 * `PROVIDER_TEMPLATE_KEYS`; zusammen mit `eigener` (`CUSTOM_PROVIDER_TEMPLATE`) sind es genau diese.
 */
export const PROVIDER_TEMPLATES = {
  eurouter: {
    kind: "openai_compatible",
    name: "EUrouter",
    baseUrl: "https://api.eurouter.ai/v1",
    region: "eu",
  },
} as const satisfies Partial<Record<ProviderTemplateKey, ProviderTemplate>>;

export type ProviderTemplateId = keyof typeof PROVIDER_TEMPLATES;

/** Wo ein Anbieter erreichbar ist; reicht für Modell-Liste und Verbindungstest. */
export interface ProviderEndpoint {
  baseUrl: string;
  region: Region;
}

/**
 * Vorlage für einen eigenen, OpenAI-kompatiblen Anbieter: Basis-URL und Region trägt der Nutzer
 * ein. `http` und private Adressen sind nur bei Region `local` erlaubt (siehe
 * `checkProviderBaseUrl`).
 */
export const CUSTOM_PROVIDER_TEMPLATE = {
  key: "eigener",
  kind: "openai_compatible",
  regions: ["eu", "non_eu", "local"],
} as const satisfies { key: ProviderTemplateKey; kind: ProviderKind; regions: readonly Region[] };
