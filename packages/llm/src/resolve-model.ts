/**
 * PaiBot – Modell-Zugang für einen Lauf bauen, nur gegen eine Berechtigung des Tors.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { inspect } from "node:util";
import { type DerivedKey, decryptSecret, secretFormatOf } from "@paibot/crypto";
import { type GatePermit, isGatePermit } from "@paibot/gate";
import { providerSecretBinding, secretAad, targetOrigin } from "@paibot/shared/bindung";
import { PaiBotError } from "@paibot/shared/fehler";
import type { ConversationId, ModelId, ProviderId } from "@paibot/shared/ids";
import type { ResolvedModel, ResolvedModelSummary } from "@paibot/shared/motor";
import type { Region } from "@paibot/shared/objekte";
import {
  checkProviderBaseUrl,
  createEgressFetch,
  type EgressTarget,
  egressTargetOf,
  type HostLookup,
  providerEgressTarget,
} from "./egress";
import { providerFailure } from "./errors";
import { SCHLEUSE_SESSION_HEADER, type SchleuseConnection, schleuseModelName } from "./schleuse";
import { providerTargetDigest } from "./target";

/** Gewählter Anbieter und gewähltes Modell, wie sie in der Datenbank stehen. */
export interface ModelChoice {
  provider: {
    id: ProviderId;
    /** Schlüssel der Vorlage, z. B. `eurouter`; für den Modellnamen in der Datenschleuse. */
    templateKey: string;
    baseUrl: string;
    region: Region;
    /**
     * Verschlüsselter Schlüssel, im Format `v2` gebunden an `providerSecretBinding(id, baseUrl)`;
     * fehlt, wenn keiner gesetzt ist. `v1` (ohne Bindung) wird nur bei Berechtigungen ohne
     * Ziel-Abdruck noch angenommen.
     */
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
  /** Grund-`fetch` unter der Ausgangs-Liste (nur für Tests; dann ohne festgenagelte Adresse). */
  baseFetch?: typeof fetch;
  /** Namensauflösung der Ausgangs-Liste (nur für Tests). */
  lookup?: HostLookup;
}

/** Alle Modell-Zugänge, die `resolveModel` gebaut hat. Nur sie sind echt. */
const issuedModels = new WeakSet<object>();

/**
 * Ist das Objekt ein Modell-Zugang, den `resolveModel` gebaut hat (keine Kopie, kein Nachbau)?
 * Der Motor kann damit prüfen, dass er ein echtes Objekt bekommt.
 */
export function isResolvedModel(value: unknown): value is ResolvedModel {
  return typeof value === "object" && value !== null && issuedModels.has(value);
}

/**
 * Baut den Zugang zu einem Modell für genau einen Lauf.
 *
 * - Route aus `permit.facts.route`: `direct` → Basis-URL und Schlüssel des Anbieters; `schleuse`
 *   → Basis-URL und Schlüssel der Datenschleuse, Modellname `schleuseModelName(...)` und
 *   Kopfzeile `SCHLEUSE_SESSION_HEADER` mit der ID der Unterhaltung.
 * - Ziel: Nennt die Berechtigung `targetDigest`, muss er zu Anbieter-ID und Basis-URL des
 *   übergebenen Datensatzes passen (`providerTargetDigest`), und `targetOrigin` (falls gesetzt) zum
 *   Origin. Wurde die Adresse zwischen Entscheidung und Abruf geändert, entsteht kein Zugang.
 * - Der Schlüssel wird mit der Bindung an genau dieses Ziel entschlüsselt
 *   (`providerSecretBinding(id, baseUrl)`); ein Schlüssel aus einem anderen Datensatz oder für einen
 *   anderen Host lässt sich nicht entschlüsseln.
 * - Der Schlüssel steht in keinem Feld: `apiKey` ist leer, `fetch` setzt `authorization` selbst und
 *   erreicht nur dieses eine Ziel (`createEgressFetch`, Adresse festgenagelt). `JSON.stringify`,
 *   `console.log` und `util.inspect` zeigen nur die `ResolvedModelSummary`.
 * - Mit Ziel-Abdruck gilt der Zugang nur, solange die Berechtigung gilt: Nach dem Ende von
 *   `execute` scheitert jeder Abruf mit `abgelehnt`, bevor etwas gesendet wird.
 *
 * Übergang: Berechtigungen ohne `targetDigest` (älterer Vertrag) werden noch angenommen; dann
 * entfällt der Ziel-Vergleich, `v1`-Schlüssel sind lesbar und der Zugang ist nicht an die Lebenszeit
 * der Berechtigung gebunden. Sobald `targetDigest` Pflicht ist, entfällt dieser Weg.
 *
 * Fehler: `PaiBotError("abgelehnt")`, wenn die Berechtigung fehlt oder nicht zu `choice` passt
 * (Unterhaltung, Modell, Anbieter, Region, Ziel); `schleuse_nicht_installiert` bei Route
 * `schleuse` ohne Verbindung; `anbieter_nicht_erreichbar` bei unzulässiger Basis-URL;
 * `schluessel_ungueltig`, wenn der Schlüssel fehlt oder sich mit dieser Bindung nicht
 * entschlüsseln lässt.
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

  // Ziel aus dem gelesenen Datensatz neu bilden und mit der Entscheidung vergleichen.
  const digest = providerTargetDigest(provider.id, provider.baseUrl);
  const bound = facts.targetDigest !== undefined;
  if (bound && facts.targetDigest !== digest) throw providerFailure("abgelehnt");
  if (facts.targetOrigin !== undefined) {
    const allowedOrigins = [originOf(provider.baseUrl)];
    if (facts.route === "schleuse" && deps.schleuse) {
      allowedOrigins.push(originOf(deps.schleuse.baseUrl));
    }
    if (!allowedOrigins.includes(facts.targetOrigin)) throw providerFailure("abgelehnt");
  }

  let baseUrl: string;
  let secret: string;
  let slug: string;
  let headers: Record<string, string>;
  let egressTarget: EgressTarget;

  if (facts.route === "schleuse") {
    if (!deps.schleuse) throw providerFailure("schleuse_nicht_installiert");
    baseUrl = deps.schleuse.baseUrl;
    secret = deps.schleuse.apiKey;
    slug = schleuseModelName(provider.templateKey, model.slug);
    headers = { [SCHLEUSE_SESSION_HEADER]: choice.conversationId };
    egressTarget = { ...egressTargetOf(baseUrl), allowPrivate: true };
  } else {
    const check = checkProviderBaseUrl(provider.baseUrl, provider.region);
    if (!check.ok) throw providerFailure("anbieter_nicht_erreichbar");
    baseUrl = provider.baseUrl;
    slug = model.slug;
    headers = {};
    secret = decryptProviderKey(provider, deps.secretsKey, {
      keyOptional: provider.region === "local",
      allowV1: !bound,
    });
    egressTarget = providerEgressTarget(baseUrl, provider.region);
  }

  const guarded = createEgressFetch(
    [egressTarget],
    deps.baseFetch,
    deps.lookup === undefined ? {} : { lookup: deps.lookup },
  );
  const stillPermitted = bound ? () => isGatePermit(permit, "modell.anfragen") : () => true;
  const authorizedFetch: typeof fetch = async (input, init) => {
    if (!stillPermitted()) throw providerFailure("abgelehnt");
    const headerSource = init?.headers ?? (input instanceof Request ? input.headers : undefined);
    const outgoing = new Headers(headerSource);
    if (secret !== "") outgoing.set("authorization", `Bearer ${secret}`);
    return guarded(input, { ...init, headers: outgoing });
  };

  const summary: ResolvedModelSummary = Object.freeze({
    providerId: provider.id,
    modelId: model.id,
    slug,
    label: model.displayName,
    route: facts.route,
    baseUrl,
    targetDigest: digest,
  });
  const resolved = {
    ...summary,
    apiKey: "",
    headers: Object.freeze(headers),
    fetch: authorizedFetch,
  };
  Object.defineProperty(resolved, "toJSON", { enumerable: false, value: () => summary });
  Object.defineProperty(resolved, inspect.custom, {
    enumerable: false,
    value: () => `ResolvedModel ${JSON.stringify(summary)}`,
  });
  Object.freeze(resolved);
  issuedModels.add(resolved);
  return resolved as unknown as ResolvedModel;
}

function originOf(baseUrl: string): string {
  try {
    return targetOrigin(baseUrl);
  } catch {
    throw providerFailure("anbieter_nicht_erreichbar");
  }
}

/**
 * Entschlüsselt den Anbieter-Schlüssel mit der Bindung an Datensatz und Host der Basis-URL.
 * Lokale Anbieter dürfen ohne Schlüssel arbeiten.
 */
function decryptProviderKey(
  provider: ModelChoice["provider"],
  key: DerivedKey<"secrets-v1">,
  options: { keyOptional: boolean; allowV1: boolean },
): string {
  const encrypted = provider.apiKeyEnc;
  if (encrypted === undefined || encrypted === "") {
    if (options.keyOptional) return "";
    throw providerFailure("schluessel_ungueltig");
  }
  if (secretFormatOf(encrypted) === "v1" && !options.allowV1) {
    throw providerFailure("schluessel_ungueltig");
  }
  try {
    const aad = secretAad(providerSecretBinding(provider.id, provider.baseUrl));
    return decryptSecret(encrypted, key, { aad, allowV1: options.allowV1 });
  } catch (error) {
    if (error instanceof PaiBotError) throw error;
    // Keine Ursache anhängen: sie könnte Teile des Geheimtexts enthalten.
    throw providerFailure("schluessel_ungueltig");
  }
}
