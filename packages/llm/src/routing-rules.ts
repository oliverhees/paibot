/**
 * PaiBot – Routing-Regeln bei EUrouter: Regel als wählbarer Eintrag, Prüfung eines Namens mit einer
 * sehr kleinen echten Anfrage und die Angabe, wer laut Antwort geantwortet hat.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { anzeigeText } from "@paibot/shared/anzeigetext";
import {
  SERVED_MODEL_PATTERN,
  SERVED_PROVIDER_PATTERN,
  type ServedBy,
} from "@paibot/shared/grundtypen";
import type { ProviderTemplateKey } from "@paibot/shared/objekte";
import { checkProviderBaseUrl, createEgressFetch, providerEgressTarget } from "./egress";
import { mapProviderError } from "./errors";
import type { ResponseLimits } from "./pinned-fetch";
import type { ProviderEndpoint } from "./templates";

/**
 * Vorsilbe, unter der eine Routing-Regel als Eintrag in der Modell-Tabelle steht
 * (`rule:<Name der Regel>`). Modelle aus der Liste eines Anbieters mit dieser Vorsilbe nimmt
 * PaiBot nicht an (`fetchModels`), so kann es keine Verwechslung geben.
 */
export const ROUTING_RULE_SLUG_PREFIX = "rule:";

/** Längster Name einer Regel, den PaiBot annimmt (in Zeichen). */
export const ROUTING_RULE_NAME_MAX_CHARS = 100;

/** Höchstzahl Ausgabe-Token der Prüf-Anfrage. */
export const ROUTING_RULE_CHECK_MAX_TOKENS = 4;

/** Kann dieser Anbieter Routing-Regeln (nur EUrouter)? */
export function supportsRoutingRules(templateKey: ProviderTemplateKey): boolean {
  return templateKey === "eurouter";
}

/**
 * Ist das ein brauchbarer Name einer Regel? Sichtbarer Text ohne Steuer- und Formatzeichen, ohne
 * Leerraum an den Enden, 1 bis 100 Zeichen. Groß- und Kleinschreibung zählt (EUrouter vergleicht
 * genau).
 */
export function isRoutingRuleName(name: string): boolean {
  return (
    anzeigeText(name, ROUTING_RULE_NAME_MAX_CHARS) === name &&
    !/\s{2,}/.test(name) &&
    Array.from(name).length <= ROUTING_RULE_NAME_MAX_CHARS
  );
}

/** Slug des Eintrags für eine Regel. Wirft `TypeError` bei einem unbrauchbaren Namen. */
export function routingRuleSlug(name: string): string {
  if (!isRoutingRuleName(name)) throw new TypeError("Ungültiger Name einer Routing-Regel");
  return `${ROUTING_RULE_SLUG_PREFIX}${name}`;
}

/**
 * Name der Regel, wenn der Eintrag eine Regel ist (nur bei einem Anbieter mit Regeln), sonst
 * `undefined`.
 */
export function routingRuleNameOf(
  templateKey: ProviderTemplateKey,
  slug: string,
): string | undefined {
  if (!supportsRoutingRules(templateKey) || !slug.startsWith(ROUTING_RULE_SLUG_PREFIX)) {
    return undefined;
  }
  const name = slug.slice(ROUTING_RULE_SLUG_PREFIX.length);
  return isRoutingRuleName(name) ? name : undefined;
}

/**
 * Wer laut einer Antwort (ganzes JSON oder ein Stück des Stroms) geantwortet hat: Felder
 * `provider` und `model`, nur in erlaubter Form, sonst weggelassen. Ohne beides: `undefined`.
 */
export function servedByOf(value: unknown): ServedBy | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const result: ServedBy = {};
  if (typeof record.provider === "string" && SERVED_PROVIDER_PATTERN.test(record.provider)) {
    result.provider = record.provider;
  }
  if (typeof record.model === "string" && SERVED_MODEL_PATTERN.test(record.model)) {
    result.model = record.model;
  }
  return result.provider === undefined && result.model === undefined ? undefined : result;
}

/** Ergebnis der Prüfung einer Regel. Wirft nicht. */
export type RoutingRuleCheck =
  | { ok: true; servedBy?: ServedBy }
  | {
      ok: false;
      /**
       * `regel_unbekannt`: der Anbieter kennt keine (eingeschaltete) Regel mit genau diesem Namen
       * (HTTP 400); `abgelehnt`: HTTP 403; sonst wie beim Verbindungstest.
       */
      code:
        | "regel_unbekannt"
        | "abgelehnt"
        | "schluessel_ungueltig"
        | "limit_erreicht"
        | "anbieter_nicht_erreichbar";
    };

/** Grenzen der Prüf-Anfrage: die Antwort ist winzig. */
const CHECK_LIMITS: Readonly<ResponseLimits> = Object.freeze({
  maxBodyBytes: 64 * 1024,
  maxErrorBodyBytes: 16 * 1024,
});
const CHECK_TIMEOUT_MS = 20_000;
const API_KEY_PATTERN = /^[\x21-\x7e]{1,4096}$/;

export interface RoutingRuleCheckOptions {
  /** `fetch` mit Ausgangs-Liste; ohne Angabe eines nur für die Basis-URL. */
  fetch?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Prüft, ob es eine Regel mit genau diesem Namen gibt: `POST <baseUrl>/chat/completions` mit
 * `rule_name`, ohne `model`, einer Nachricht „ok“, `max_tokens` 4 und ohne Strom. Das ist eine
 * echte Anfrage an ein Modell und kostet beim Anbieter wenige Token.
 *
 * - 200: `ok` und, wenn gemeldet, wer geantwortet hat (`provider`, `model` der Antwort)
 * - 400: `regel_unbekannt`; 401: `schluessel_ungueltig`; 402/429: `limit_erreicht`;
 *   403: `abgelehnt`; sonst `anbieter_nicht_erreichbar`
 *
 * Der Schlüssel geht nur als `Authorization: Bearer` mit und erscheint nie im Ergebnis.
 */
export async function checkRoutingRule(
  provider: ProviderEndpoint & { templateKey: ProviderTemplateKey },
  apiKey: string,
  name: string,
  options: RoutingRuleCheckOptions = {},
): Promise<RoutingRuleCheck> {
  if (!supportsRoutingRules(provider.templateKey) || !isRoutingRuleName(name)) {
    return { ok: false, code: "regel_unbekannt" };
  }
  const key = apiKey.trim();
  if (!API_KEY_PATTERN.test(key)) return { ok: false, code: "schluessel_ungueltig" };
  const check = checkProviderBaseUrl(provider.baseUrl, provider.region);
  if (!check.ok) return { ok: false, code: "anbieter_nicht_erreichbar" };

  const doFetch =
    options.fetch ??
    createEgressFetch([providerEgressTarget(check.url.href, provider.region)], undefined, {
      limits: CHECK_LIMITS,
    });
  const url = new URL(check.url.href);
  url.search = "";
  url.hash = "";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/chat/completions`;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? CHECK_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;

  try {
    const response = await doFetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        rule_name: name,
        messages: [{ role: "user", content: "ok" }],
        max_tokens: ROUTING_RULE_CHECK_MAX_TOKENS,
        stream: false,
      }),
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, code: failureCode(response.status) };
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, code: "anbieter_nicht_erreichbar" };
    }
    const servedBy = servedByOf(payload);
    return servedBy === undefined ? { ok: true } : { ok: true, servedBy };
  } catch (error) {
    const code = mapProviderError(error);
    return {
      ok: false,
      code:
        code === "limit_erreicht" || code === "schluessel_ungueltig"
          ? code
          : "anbieter_nicht_erreichbar",
    };
  }
}

function failureCode(status: number): Exclude<RoutingRuleCheck, { ok: true }>["code"] {
  if (status === 400) return "regel_unbekannt";
  if (status === 401) return "schluessel_ungueltig";
  if (status === 403) return "abgelehnt";
  if (status === 402 || status === 429) return "limit_erreicht";
  return "anbieter_nicht_erreichbar";
}
