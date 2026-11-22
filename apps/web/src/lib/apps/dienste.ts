/**
 * PaiBot – Naht zur MCP-Schicht: Wie die Web-App die Werkzeugliste einer App holt. Der Abruf läuft
 * über die Ausgangs-Hülle mit genau einem erlaubten Ziel (https, kein internes Ziel), nie über das
 * globale `fetch`. Tests ersetzen die Naht (`_ersetzeAppDienste`), die Schicht selbst bleibt echt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { createEgressFetch, egressTargetOf, INTERNAL_SERVICE_HOSTS } from "@paibot/llm";
import { holeWerkzeuge, type McpFetch, type WerkzeugAbruf } from "@paibot/mcp";

/** Was für den Abruf der Liste einer App gebraucht wird. */
export interface AppAbruf {
  /** Volle, gespeicherte Adresse der App. */
  adresse: string;
  /** Klartext des Tokens, nur für diesen Abruf; geht nur als `Authorization` hinaus. */
  token?: string;
  appKurzname: string;
  /** Gespeicherte Zuordnung Original-Name → Modell-Name dieser App, immer aus der Datenbank. */
  bekannteNamen: ReadonlyMap<string, string>;
  signal?: AbortSignal;
}

export interface AppDienste {
  /**
   * Holt die ganze Liste der Werkzeuge (nur `tools/list`, nie `tools/call`) und bereitet jedes
   * Werkzeug auf. Wirft `McpSchichtFehler`.
   */
  werkzeugeAbrufen(abruf: AppAbruf): Promise<WerkzeugAbruf>;
}

/**
 * Die echten Dienste: eine eigene Hülle je Abruf mit genau dem Origin der App, `https`, ohne
 * Ziele im eigenen Netz (`INTERNAL_SERVICE_HOSTS`); private und Link-lokale Adressen sperrt die
 * Hülle nach der Namensauflösung.
 */
export function echteAppDienste(): AppDienste {
  return {
    werkzeugeAbrufen(abruf) {
      const ziel = { ...egressTargetOf(abruf.adresse), denyAddressesOf: INTERNAL_SERVICE_HOSTS };
      const huelle = createEgressFetch([ziel]) as McpFetch;
      return holeWerkzeuge({
        adresse: abruf.adresse,
        fetch: huelle,
        appKurzname: abruf.appKurzname,
        bekannteNamen: abruf.bekannteNamen,
        ...(abruf.token === undefined ? {} : { token: abruf.token }),
        ...(abruf.signal === undefined ? {} : { signal: abruf.signal }),
      });
    },
  };
}

const ERSATZ = Symbol.for("paibot.web.app-dienste.ersatz");

/**
 * Nur für Tests: ersetzt die Dienste des Prozesses (z. B. durch einen Ersatz ohne Netz).
 * `undefined` setzt zurück.
 */
export function _ersetzeAppDienste(dienste: AppDienste | undefined): void {
  (globalThis as { [ERSATZ]?: AppDienste })[ERSATZ] = dienste;
}

/** Die Dienste des laufenden Prozesses. */
export function appDienste(): AppDienste {
  return (globalThis as { [ERSATZ]?: AppDienste })[ERSATZ] ?? echteAppDienste();
}
