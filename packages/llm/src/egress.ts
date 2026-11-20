/**
 * PaiBot – Ausgangs-Liste: `fetch`, das nur erlaubte Ziele erreicht, und die Prüfung von Basis-URLs.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Region } from "@paibot/shared/objekte";
import { notImplemented } from "@paibot/stub";

/** Namen der Dienste im Compose-Stack. Sie sind als Anbieter-Ziel nie erlaubt. */
export const INTERNAL_SERVICE_HOSTS = ["postgres", "datenschleuse", "web", "worker"] as const;

/** Erlaubtes Ziel: Protokoll, Host und Port (ohne Port gilt der Standard des Protokolls). */
export interface EgressTarget {
  protocol: "https:" | "http:";
  host: string;
  port?: number;
}

/** Ein Aufruf hat ein Ziel außerhalb der Ausgangs-Liste angesprochen. Es wurde nichts gesendet. */
export class EgressBlockedError extends Error {
  /** Ziel als `protokoll//host:port`, ohne Pfad und ohne Abfrage. */
  readonly target: string;

  constructor(target: string) {
    super(`Ziel nicht erlaubt: ${target}`);
    this.name = "EgressBlockedError";
    this.target = target;
  }
}

/**
 * Baut ein `fetch`, das nur die genannten Ziele erreicht (Vergleich von Protokoll, Host und Port
 * nach Normalisierung; Weiterleitungen werden nicht automatisch verfolgt, sondern ebenfalls
 * geprüft). Jedes andere Ziel wird mit `EgressBlockedError` abgelehnt, bevor eine Verbindung
 * entsteht. `baseFetch` ist das eigentliche `fetch` (Standard: `globalThis.fetch`).
 */
export function createEgressFetch(
  allowed: readonly EgressTarget[],
  baseFetch?: typeof fetch,
): typeof fetch {
  return notImplemented("llm.createEgressFetch", allowed, baseFetch);
}

/** Erlaubtes Ziel aus einer Basis-URL. */
export function egressTargetOf(baseUrl: string): EgressTarget {
  return notImplemented("llm.egressTargetOf", baseUrl);
}

/** Gründe, aus denen eine Basis-URL abgelehnt wird. */
export type BaseUrlProblem =
  | "keine_url"
  | "protokoll"
  | "interner_dienst"
  | "link_local"
  | "private_adresse"
  | "zugangsdaten_in_url";

export type BaseUrlCheck = { ok: true; url: URL } | { ok: false; problem: BaseUrlProblem };

/**
 * Prüft die Basis-URL eines Anbieters:
 * - nur `https`; `http` nur bei Region `local`
 * - keine internen Dienstnamen (`INTERNAL_SERVICE_HOSTS`), keine Link-Local-Adressen
 *   (z. B. `169.254.169.254`, `fe80::/10`)
 * - private Adressen und `localhost` nur bei Region `local`
 * - keine Zugangsdaten in der URL (`user:pass@`)
 *
 * Rein: löst keine Namen auf und baut keine Verbindung auf.
 */
export function checkProviderBaseUrl(baseUrl: string, region: Region): BaseUrlCheck {
  return notImplemented("llm.checkProviderBaseUrl", baseUrl, region);
}
