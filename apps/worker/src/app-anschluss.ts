/**
 * PaiBot – Anschluss an Apps (MCP) im Worker: Hülle, Zugang und Zuordnung der Fehler
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import {
  type AppAnschluss,
  type AppAufrufErgebnis,
  type AppInfo,
  type AppLauf,
  type AppListeEintrag,
  AppListeFehler,
} from "@paibot/agents";
import { type DerivedKey, decryptSecret } from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import {
  createEgressFetch,
  egressTargetOf,
  type HostLookup,
  INTERNAL_SERVICE_HOSTS,
} from "@paibot/llm";
import {
  holeWerkzeuge,
  MCP_EMPFOHLENE_ANTWORT_BYTES,
  MCP_EMPFOHLENES_LEERLAUF_MS,
  type McpFetch,
  McpSchichtFehler,
  type McpWerkzeugBereinigt,
  rufeWerkzeugAuf,
} from "@paibot/mcp";
import { appTokenBinding, secretAad } from "@paibot/shared/bindung";
import type { AppId } from "@paibot/shared/ids";
import { consoleLog, type WorkerLog } from "./protokoll";

/** Die Adresse hat keinen oder den Standard-Port 443. */
function standardPort(adresse: string): boolean {
  try {
    const port = new URL(adresse).port;
    return port === "" || port === "443";
  } catch {
    return false;
  }
}

export interface AppAnschlussOptionen {
  db: Database;
  /** Schlüssel, mit dem die Zugangsdaten der Apps verschlüsselt sind (`secrets-v1`). */
  secretsKey: DerivedKey<"secrets-v1">;
  log?: WorkerLog;
  /**
   * Das `fetch` unter der Hülle. Nur für Tests; im Betrieb fehlt es, und die Hülle verbindet sich
   * selbst mit den geprüften Adressen.
   */
  basisFetch?: typeof fetch;
  /** Namensauflösung der Hülle. Nur für Tests; im Betrieb löst das System auf. */
  lookup?: HostLookup;
}

/**
 * Setzt den Anschluss des Laufs mit `@paibot/mcp` um. Jede Anfrage an eine App geht durch eine
 * eigene Ausgangs-Hülle mit genau einem erlaubten Ziel, dem Origin dieser App (`createEgressFetch`,
 * ohne private Adressen). Den Zugang entschlüsselt der Anschluss erst beim Abruf bzw. Aufruf, hält
 * ihn nur in dieser Funktion und gibt ihn nie weiter als an `@paibot/mcp`.
 */
export function baueAppAnschluss(optionen: AppAnschlussOptionen): AppAnschluss {
  const log = optionen.log ?? consoleLog;

  /** Die Hülle und, wenn die App einen Zugang hat, der entschlüsselte Token. */
  async function verbindungsdaten(
    app: AppInfo,
  ): Promise<{ fetch: McpFetch; token?: string } | undefined> {
    const gespeichert = await repo.apps.get(optionen.db, app.id);
    // Nur eine verbundene App mit der Adresse, die auch dem Tor bekannt ist.
    if (
      gespeichert === undefined ||
      gespeichert.state !== "verbunden" ||
      gespeichert.url !== app.url
    ) {
      return undefined;
    }
    // Nur der Standard-Port: Eine Adresse mit anderem Port wird nicht verwendet.
    if (!standardPort(gespeichert.url)) return undefined;
    // Genau ein Ziel, nie öffentlich erreichbar gemachte eigene Dienste (Datenbank, Web, Worker).
    const ziel = { ...egressTargetOf(gespeichert.url), denyAddressesOf: INTERNAL_SERVICE_HOSTS };
    // Die empfohlenen Grenzen der Schicht gelten auch in der Hülle: Antwort und Leerlauf.
    const huelle = createEgressFetch([ziel], optionen.basisFetch, {
      limits: { maxBodyBytes: MCP_EMPFOHLENE_ANTWORT_BYTES },
      idleTimeoutMs: MCP_EMPFOHLENES_LEERLAUF_MS,
      ...(optionen.lookup === undefined ? {} : { lookup: optionen.lookup }),
    }) as McpFetch;
    if (gespeichert.authKind !== "token") return { fetch: huelle };
    const tokenEnc = await repo.apps.getTokenEnc(optionen.db, app.id);
    if (tokenEnc === undefined) return undefined;
    const token = decryptSecret(tokenEnc, optionen.secretsKey, {
      aad: secretAad(appTokenBinding(app.id, gespeichert.url)),
    });
    return { fetch: huelle, token };
  }

  return {
    neuerLauf(): AppLauf {
      /** Die Werkzeuge aus der Liste dieses Laufs, je App und Name beim Server. */
      const gehalten = new Map<AppId, Map<string, McpWerkzeugBereinigt>>();
      return {
        async holeListe({ app, bekannteNamen, bereitsVergeben, signal }) {
          let daten: Awaited<ReturnType<typeof verbindungsdaten>>;
          try {
            daten = await verbindungsdaten(app);
          } catch {
            throw new AppListeFehler("nicht_erreichbar");
          }
          if (daten === undefined) throw new AppListeFehler("nicht_erreichbar");
          try {
            const abruf = await holeWerkzeuge({
              adresse: app.url,
              fetch: daten.fetch,
              ...(daten.token === undefined ? {} : { token: daten.token }),
              appKurzname: app.kurzname,
              bekannteNamen,
              bereitsVergeben,
              signal,
            });
            gehalten.set(app.id, new Map(abruf.werkzeuge.map((w) => [w.originalName, w])));
            return abruf.werkzeuge.map(
              (w): AppListeEintrag => ({
                originalName: w.originalName,
                abdruck: w.abdruck,
                beschreibung: w.beschreibung,
                schemaFuerModell: w.schemaFuerModell,
                bestaetigbar: w.bestaetigbar,
                hinweisNurLesen: w.hinweise.nurLesend,
                hinweisZerstoerend: w.hinweise.destruktiv,
              }),
            );
          } catch (fehler) {
            // Der Text der App oder der Bibliothek geht nie weiter; nur der feste Grund.
            if (fehler instanceof McpSchichtFehler && fehler.code === "namen_ungueltig") {
              throw new AppListeFehler("namen_ungueltig");
            }
            throw new AppListeFehler("nicht_erreichbar");
          }
        },

        pruefeArgumente(appId, originalName, argumente) {
          const pruefer = gehalten.get(appId)?.get(originalName)?.pruefer;
          if (pruefer === null || pruefer === undefined) return false;
          try {
            return pruefer(argumente).ok;
          } catch {
            return false;
          }
        },

        async rufeAuf({ app, originalName, argumente, signal }): Promise<AppAufrufErgebnis> {
          const fehler = (fehlercode: string): AppAufrufErgebnis => ({
            status: "fehler",
            text: "Die App hat nicht geantwortet.",
            gekuerzt: false,
            fehlercode,
          });
          const werkzeug = gehalten.get(app.id)?.get(originalName);
          if (werkzeug === undefined) return fehler("werkzeug_unbekannt");
          try {
            const daten = await verbindungsdaten(app);
            if (daten === undefined) return fehler("app_nicht_erreichbar");
            const ergebnis = await rufeWerkzeugAuf({
              adresse: app.url,
              fetch: daten.fetch,
              ...(daten.token === undefined ? {} : { token: daten.token }),
              werkzeug,
              argumente,
              signal,
            });
            return {
              status: ergebnis.status,
              text: ergebnis.text,
              gekuerzt: ergebnis.gekuerzt,
              fehlercode: ergebnis.fehlercode,
            };
          } catch {
            return fehler("app_nicht_erreichbar");
          }
        },
      };
    },

    meldeAusgeschlossen() {
      // Bis die Oberfläche das zeigt, steht nur ein fester Satz im Log: nie Kennung, nie Grund.
      log.warn("Ein Werkzeug einer App wurde nicht angeboten.");
    },
  };
}

export type { AppInfo };
