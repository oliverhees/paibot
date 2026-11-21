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
import {
  normalizedBaseUrl,
  providerSecretBinding,
  secretAad,
  targetOrigin,
} from "@paibot/shared/bindung";
import { PaiBotError } from "@paibot/shared/fehler";
import type { ConversationId, ModelId, ProviderId } from "@paibot/shared/ids";
import type { ResolvedModel, ResolvedModelSummary } from "@paibot/shared/motor";
import type { ProviderTemplateKey, Region } from "@paibot/shared/objekte";
import {
  checkProviderBaseUrl,
  createEgressFetch,
  type EgressTarget,
  egressTargetOf,
  type HostLookup,
  providerEgressTarget,
} from "./egress";
import { providerFailure } from "./errors";
import type { ResponseLimits } from "./pinned-fetch";
import { routingRuleNameOf } from "./routing-rules";
import {
  SCHLEUSE_SESSION_HEADER,
  type SchleuseConnection,
  schleuseKeyPathOf,
  schleuseModelName,
} from "./schleuse";
import { createSchleuseFetch } from "./schleuse-zugang";
import { providerTargetDigest } from "./target";

/** Gewählter Anbieter und gewähltes Modell, wie sie in der Datenbank stehen. */
export interface ModelChoice {
  provider: {
    id: ProviderId;
    /** Schlüssel der Vorlage (`PROVIDER_TEMPLATE_KEYS`), z. B. `eurouter`; für den Modellnamen in der Datenschleuse. */
    templateKey: ProviderTemplateKey;
    baseUrl: string;
    region: Region;
    /**
     * Verschlüsselter Schlüssel, im Format `v2` gebunden an `providerSecretBinding(id, baseUrl)`;
     * fehlt, wenn keiner gesetzt ist. `v1` (ohne Bindung) wird nicht angenommen.
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

/**
 * Grenzen für Antworten im Gespräch (Strom des Modells, direkt oder über die Datenschleuse):
 * höchstens 64 MiB entpackt je Antwort, sonst die Standards (`PINNED_MAX_…`: Fehlerkörper 64 KiB,
 * Verhältnis 500, Zeile 1 MiB, Kopfzeilen 16 KiB).
 */
export const CHAT_RESPONSE_LIMITS: Readonly<ResponseLimits> = Object.freeze({
  maxBodyBytes: 64 * 1024 * 1024,
});

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
 *   Kopfzeile `SCHLEUSE_SESSION_HEADER` mit der ID der Unterhaltung. Auf dem Weg `anfrage`
 *   (Standard) geht der Schlüssel des Anbieters als `api_key` im Körper jeder Chat-Anfrage mit, nur
 *   an die Datenschleuse (`createSchleuseFetch`); auf dem Weg `umgebung` gar nicht. Fehlerantworten
 *   der Datenschleuse wirft `fetch` als `PaiBotError` mit festem Code (`schleuse_blockiert`,
 *   `schluessel_ungueltig`, …), ohne Text aus der Antwort.
 * - Ziel: `targetDigest` der Berechtigung muss zu Anbieter-ID und Basis-URL des übergebenen
 *   Datensatzes passen (`providerTargetDigest`), `targetOrigin` zum Origin (bei Route `schleuse`
 *   auch dem der Datenschleuse). Wurde die Adresse zwischen Entscheidung und Abruf geändert,
 *   entsteht kein Zugang.
 * - Der Schlüssel wird mit der Bindung an genau dieses Ziel entschlüsselt
 *   (`providerSecretBinding(id, baseUrl)`: Schema, Host, Port und Pfad); ein Schlüssel aus einem
 *   anderen Datensatz oder für eine andere Adresse lässt sich nicht entschlüsseln
 *   (`schluessel_ungueltig`); ein Schlüssel im Format `v1` gilt als ungültig. Auf der Route
 *   `direct` geht er nur an Pfade unter der Basis-URL, sonst `abgelehnt` ohne Anfrage.
 * - Der Schlüssel steht in keinem Feld: `fetch` setzt `authorization` selbst und
 *   erreicht nur dieses eine Ziel (`createEgressFetch`, Adresse festgenagelt). `JSON.stringify`,
 *   `console.log` und `util.inspect` zeigen nur die `ResolvedModelSummary`.
 * - Der Zugang gilt nur, solange die Berechtigung gilt: Nach dem Ende von `execute` scheitert
 *   jeder Abruf mit `abgelehnt`, bevor etwas gesendet wird.
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
  const digest = digestOf(provider.id, provider.baseUrl);
  if (facts.targetDigest !== digest) throw providerFailure("abgelehnt");
  const allowedOrigins = [originOf(provider.baseUrl)];
  if (facts.route === "schleuse" && deps.schleuse) {
    allowedOrigins.push(originOf(deps.schleuse.baseUrl));
  }
  if (!allowedOrigins.includes(facts.targetOrigin)) throw providerFailure("abgelehnt");

  let baseUrl: string;
  let secret: string;
  let slug: string;
  let headers: Record<string, string>;
  let egressTarget: EgressTarget;
  let providerKey = "";
  // Eine Routing-Regel (EUrouter) statt eines Modells: Die Anfrage nennt `rule_name` und kein
  // `model` (ein mitgeschicktes `model` würde der Anbieter statt der Regel auswerten).
  const ruleName = routingRuleNameOf(provider.templateKey, model.slug);

  if (facts.route === "schleuse") {
    if (!deps.schleuse) throw providerFailure("schleuse_nicht_installiert");
    // Ob die Datenschleuse ein zusätzliches Feld im Körper weitergibt, ist nicht geprüft: keine
    // Regel über diesen Weg, statt still ein anderes Modell zu treffen.
    if (ruleName !== undefined) throw providerFailure("abgelehnt");
    baseUrl = deps.schleuse.baseUrl;
    secret = deps.schleuse.apiKey;
    slug = schleuseModelName(provider.templateKey, model.slug);
    headers = { [SCHLEUSE_SESSION_HEADER]: choice.conversationId };
    egressTarget = { ...egressTargetOf(baseUrl), allowPrivate: true };
    if (schleuseKeyPathOf(deps.schleuse) === "anfrage") {
      providerKey = decryptProviderKey(provider, deps.secretsKey, provider.region === "local");
    }
  } else {
    const check = checkProviderBaseUrl(provider.baseUrl, provider.region);
    if (!check.ok) throw providerFailure("anbieter_nicht_erreichbar");
    baseUrl = provider.baseUrl;
    slug = model.slug;
    headers = {};
    secret = decryptProviderKey(provider, deps.secretsKey, provider.region === "local");
    egressTarget = providerEgressTarget(baseUrl, provider.region);
  }

  const guarded = createEgressFetch([egressTarget], deps.baseFetch, {
    limits: CHAT_RESPONSE_LIMITS,
    ...(deps.lookup === undefined ? {} : { lookup: deps.lookup }),
  });
  const stillAllowed = () => isGatePermit(permit, "modell.anfragen");
  const authorizedFetch: typeof fetch =
    facts.route === "schleuse"
      ? createSchleuseFetch({ guarded, baseUrl, schleuseKey: secret, providerKey, stillAllowed })
      : async (input, init) => {
          if (!stillAllowed()) throw providerFailure("abgelehnt");
          // Der Schlüssel ist an die ganze Basis-URL gebunden; auf ihrem Host geht er nur an Pfade
          // darunter. Andere Ziele lehnt die Ausgangs-Liste ab.
          if (outsideBasePath(requestUrlOf(input), baseUrl)) throw providerFailure("abgelehnt");
          const headerSource =
            init?.headers ?? (input instanceof Request ? input.headers : undefined);
          const outgoing = new Headers(headerSource);
          if (secret !== "") outgoing.set("authorization", `Bearer ${secret}`);
          const body =
            ruleName === undefined || init?.body === undefined || init.body === null
              ? init?.body
              : withRuleName(init.body, ruleName);
          if (ruleName !== undefined && input instanceof Request)
            throw providerFailure("abgelehnt");
          return guarded(input, {
            ...init,
            headers: outgoing,
            ...(body === undefined ? {} : { body }),
          });
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

/**
 * Körper einer Chat-Anfrage mit `rule_name` statt `model`. Nur ein JSON-Objekt als Text wird
 * angenommen; alles andere lehnt der Zugang ab, bevor etwas gesendet wird.
 */
function withRuleName(body: unknown, ruleName: string): string {
  if (typeof body !== "string") throw providerFailure("abgelehnt");
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw providerFailure("abgelehnt");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw providerFailure("abgelehnt");
  }
  const {
    model: _model,
    models: _models,
    rule_id: _id,
    ...rest
  } = parsed as Record<string, unknown>;
  return JSON.stringify({ ...rest, rule_name: ruleName });
}

function digestOf(
  providerId: ProviderId,
  baseUrl: string,
): ReturnType<typeof providerTargetDigest> {
  try {
    return providerTargetDigest(providerId, baseUrl);
  } catch {
    throw providerFailure("anbieter_nicht_erreichbar");
  }
}

function requestUrlOf(input: Parameters<typeof fetch>[0]): URL | undefined {
  try {
    return new URL(
      input instanceof Request ? input.url : typeof input === "string" ? input : input.href,
    );
  } catch {
    return undefined;
  }
}

/**
 * Zielt `url` auf den Host der Basis-URL, aber auf einen Pfad außerhalb von ihr? Eine URL, die sich
 * nicht lesen lässt, zählt als außerhalb.
 */
function outsideBasePath(url: URL | undefined, baseUrl: string): boolean {
  if (url === undefined) return true;
  const base = new URL(normalizedBaseUrl(baseUrl));
  if (url.origin !== base.origin) return false;
  const basePath = base.pathname.replace(/\/+$/, "");
  return !(basePath === "" || url.pathname === basePath || url.pathname.startsWith(`${basePath}/`));
}

function originOf(baseUrl: string): string {
  try {
    return targetOrigin(baseUrl);
  } catch {
    throw providerFailure("anbieter_nicht_erreichbar");
  }
}

/**
 * Entschlüsselt den Anbieter-Schlüssel mit der Bindung an Datensatz und ganze Basis-URL
 * (`providerSecretBinding`). Es gibt keinen zweiten Versuch mit einer anderen Bindung: Passt die
 * gespeicherte Adresse nicht mehr zum Schlüssel, ist das `schluessel_ungueltig` (neu eintragen
 * oder bewusst umbinden, `rebindProviderSecret`). Lokale Anbieter dürfen ohne Schlüssel arbeiten.
 */
function decryptProviderKey(
  provider: ModelChoice["provider"],
  key: DerivedKey<"secrets-v1">,
  keyOptional: boolean,
): string {
  const encrypted = provider.apiKeyEnc;
  if (encrypted === undefined || encrypted === "") {
    if (keyOptional) return "";
    throw providerFailure("schluessel_ungueltig");
  }
  if (secretFormatOf(encrypted) !== "v2") throw providerFailure("schluessel_ungueltig");
  try {
    const aad = secretAad(providerSecretBinding(provider.id, provider.baseUrl));
    return decryptSecret(encrypted, key, { aad });
  } catch (error) {
    if (error instanceof PaiBotError) throw error;
    // Keine Ursache anhängen: sie könnte Teile des Geheimtexts enthalten.
    throw providerFailure("schluessel_ungueltig");
  }
}
