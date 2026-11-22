/**
 * PaiBot – Regel-Liste eines EUrouter-Kontos holen (`GET /api/v1/routing-rules`) mit dem zweiten
 * Schlüssel. Nur zum Lesen; der Schlüssel geht nur als `Authorization: Bearer` mit, nie in ein
 * Ergebnis, einen Fehler oder ein Protokoll. Benutzt die Hülle für ausgehende Aufrufe.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ProviderTemplateKey } from "@paibot/shared/objekte";
import { type ParsedRules, parseRoutingRules } from "@paibot/shared/regelliste";
import { checkProviderBaseUrl, createEgressFetch, providerEgressTarget } from "./egress";
import type { ResponseLimits } from "./pinned-fetch";
import { supportsRoutingRules } from "./routing-rules";
import type { ProviderEndpoint } from "./templates";

/** Pfad der Regel-Liste auf dem Host des Anbieters. */
export const ROUTING_RULES_LIST_PATH = "/api/v1/routing-rules";

const LIST_LIMITS: Readonly<ResponseLimits> = Object.freeze({
  maxBodyBytes: 1024 * 1024,
  maxErrorBodyBytes: 16 * 1024,
});
const LIST_TIMEOUT_MS = 10_000;
const KEY_PATTERN = /^[\x21-\x7e]{1,4096}$/;

export type RoutingRulesReadFailure =
  /** HTTP 403: der Schlüssel darf die Regeln nicht lesen. */
  | "nicht_erlaubt"
  /** HTTP 401: der Schlüssel wird nicht angenommen. */
  | "schluessel_ungueltig"
  | "zeitueberschreitung"
  /** Die Antwort hat nicht die belegte Form. */
  | "form"
  | "limit_erreicht"
  | "anbieter_nicht_erreichbar";

export type RoutingRulesRead =
  | ({ ok: true } & ParsedRules)
  | { ok: false; code: RoutingRulesReadFailure };

export interface RoutingRulesReadOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function hasNextLink(headers: Headers): boolean {
  return /rel="?next"?/i.test(headers.get("link") ?? "");
}

/** Holt die Regeln des Kontos. Wirft nicht. */
export async function readRoutingRules(
  provider: ProviderEndpoint & { templateKey: ProviderTemplateKey },
  managementKey: string,
  options: RoutingRulesReadOptions = {},
): Promise<RoutingRulesRead> {
  if (!supportsRoutingRules(provider.templateKey)) {
    return { ok: false, code: "anbieter_nicht_erreichbar" };
  }
  const key = managementKey.trim();
  if (!KEY_PATTERN.test(key)) return { ok: false, code: "schluessel_ungueltig" };
  const check = checkProviderBaseUrl(provider.baseUrl, provider.region);
  if (!check.ok) return { ok: false, code: "anbieter_nicht_erreichbar" };
  const url = new URL(ROUTING_RULES_LIST_PATH, check.url.origin);
  const doFetch =
    options.fetch ??
    createEgressFetch([providerEgressTarget(url.origin, provider.region)], undefined, {
      limits: LIST_LIMITS,
    });
  const timeout = AbortSignal.timeout(options.timeoutMs ?? LIST_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  try {
    const response = await doFetch(url, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${key}` },
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 401) return { ok: false, code: "schluessel_ungueltig" };
      if (response.status === 403) return { ok: false, code: "nicht_erlaubt" };
      if (response.status === 402 || response.status === 429) {
        return { ok: false, code: "limit_erreicht" };
      }
      return { ok: false, code: "anbieter_nicht_erreichbar" };
    }
    let roh: unknown;
    try {
      roh = await response.json();
    } catch {
      return { ok: false, code: "form" };
    }
    const gelesen = parseRoutingRules(roh);
    if (gelesen === undefined) return { ok: false, code: "form" };
    return {
      ok: true,
      ...gelesen,
      unvollstaendig: gelesen.unvollstaendig || hasNextLink(response.headers),
    };
  } catch {
    return {
      ok: false,
      code: timeout.aborted ? "zeitueberschreitung" : "anbieter_nicht_erreichbar",
    };
  }
}
