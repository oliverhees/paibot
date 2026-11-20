/**
 * PaiBot – Modell-Zugang für einen Lauf bauen, nur gegen eine Berechtigung des Tors.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type DerivedKey, decryptSecret } from "@paibot/crypto";
import { type GatePermit, isGatePermit } from "@paibot/gate";
import { PaiBotError } from "@paibot/shared/fehler";
import type { ConversationId, ModelId, ProviderId } from "@paibot/shared/ids";
import type { ResolvedModel } from "@paibot/shared/motor";
import type { Region } from "@paibot/shared/objekte";
import {
  checkProviderBaseUrl,
  createEgressFetch,
  type EgressTarget,
  egressTargetOf,
} from "./egress";
import { providerFailure } from "./errors";
import { SCHLEUSE_SESSION_HEADER, type SchleuseConnection, schleuseModelName } from "./schleuse";

/** Gewählter Anbieter und gewähltes Modell, wie sie in der Datenbank stehen. */
export interface ModelChoice {
  provider: {
    id: ProviderId;
    /** Schlüssel der Vorlage, z. B. `eurouter`; für den Modellnamen in der Datenschleuse. */
    templateKey: string;
    baseUrl: string;
    region: Region;
    /** Verschlüsselter Schlüssel (`v1:…`); fehlt, wenn keiner gesetzt ist. */
    apiKeyEnc?: string;
  };
  model: { id: ModelId; slug: string; displayName: string };
  conversationId: ConversationId;
}

export interface ResolveModelDeps {
  /** Schlüssel zum Entschlüsseln der Anbieter-Schlüssel. */
  secretsKey: DerivedKey<"secrets-v1">;
  /** Verbindung zur Datenschleuse; nötig, wenn die Berechtigung die Route `schleuse` nennt. */
  schleuse?: SchleuseConnection;
  /** Grund-`fetch` unter der Ausgangs-Liste (für Tests). */
  baseFetch?: typeof fetch;
}

/**
 * Baut den Zugang zu einem Modell für genau einen Lauf.
 *
 * - Route aus `permit.facts.route`: `direct` → Basis-URL und entschlüsselter Schlüssel des
 *   Anbieters; `schleuse` → Basis-URL und Schlüssel der Datenschleuse, Modellname
 *   `schleuseModelName(...)` und Kopfzeile `SCHLEUSE_SESSION_HEADER` mit der ID der Unterhaltung.
 * - `fetch` ist eine Ausgangs-Liste (`createEgressFetch`) nur für dieses eine Ziel.
 *
 * Zusagen: Ohne echte Berechtigung (`isGatePermit(permit, "modell.anfragen")`) entsteht nie ein
 * Zugang. Es entsteht nie eine Text-Kennung für ein Modell; der Motor bekommt ausschließlich
 * dieses Objekt.
 *
 * Fehler: `PaiBotError("abgelehnt")`, wenn die Berechtigung fehlt oder nicht zu `choice` passt
 * (Unterhaltung, Modell, Anbieter); `schleuse_nicht_installiert` bei Route `schleuse` ohne
 * Verbindung; `schluessel_ungueltig`, wenn der Schlüssel fehlt oder sich nicht entschlüsseln lässt.
 */
export function resolveModel(
  permit: GatePermit<"modell.anfragen">,
  choice: ModelChoice,
  deps: ResolveModelDeps,
): ResolvedModel {
  if (!isGatePermit(permit, "modell.anfragen")) throw providerFailure("abgelehnt");

  const { provider, model } = choice;
  const { facts, target } = permit;
  if (
    target.conversationId !== choice.conversationId ||
    target.modelId !== model.id ||
    facts.providerId !== provider.id ||
    facts.region !== provider.region
  ) {
    throw providerFailure("abgelehnt");
  }
  // Nie ein Rückfall auf direkt, wenn die Datenschleuse gefordert war.
  if (facts.requestedMode === "on" && facts.route !== "schleuse") {
    throw providerFailure("abgelehnt");
  }

  let baseUrl: string;
  let apiKey: string;
  let slug: string;
  let headers: Record<string, string>;
  let egressTarget: EgressTarget;

  if (facts.route === "schleuse") {
    if (!deps.schleuse) throw providerFailure("schleuse_nicht_installiert");
    baseUrl = deps.schleuse.baseUrl;
    apiKey = deps.schleuse.apiKey;
    slug = schleuseModelName(provider.templateKey, model.slug);
    headers = { [SCHLEUSE_SESSION_HEADER]: choice.conversationId };
    egressTarget = { ...egressTargetOf(baseUrl), allowPrivate: true };
  } else {
    const check = checkProviderBaseUrl(provider.baseUrl, provider.region);
    if (!check.ok) throw providerFailure("anbieter_nicht_erreichbar");
    baseUrl = provider.baseUrl;
    slug = model.slug;
    headers = {};
    apiKey = decryptKey(provider.apiKeyEnc, deps.secretsKey, provider.region === "local");
    egressTarget = { ...egressTargetOf(baseUrl), allowPrivate: provider.region === "local" };
  }

  const resolved = {
    providerId: provider.id,
    modelId: model.id,
    slug,
    label: model.displayName,
    route: facts.route,
    baseUrl,
    apiKey,
    headers: Object.freeze(headers),
    fetch: createEgressFetch([egressTarget], deps.baseFetch),
  };
  return Object.freeze(resolved) as unknown as ResolvedModel;
}

/** Entschlüsselt den Anbieter-Schlüssel. Lokale Anbieter dürfen ohne Schlüssel arbeiten. */
function decryptKey(
  encrypted: string | undefined,
  key: DerivedKey<"secrets-v1">,
  keyOptional: boolean,
): string {
  if (encrypted === undefined || encrypted === "") {
    if (keyOptional) return "";
    throw providerFailure("schluessel_ungueltig");
  }
  try {
    return decryptSecret(encrypted, key);
  } catch (error) {
    if (error instanceof PaiBotError) throw error;
    // Keine Ursache anhängen: sie könnte Teile des Geheimtexts enthalten.
    throw providerFailure("schluessel_ungueltig");
  }
}
