/**
 * PaiBot – Testdaten: Apps mit bestätigten Werkzeugen und eine Attrappe des Anschlusses
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { AppId } from "@paibot/shared/ids";
import type { AppToolClass } from "@paibot/shared/tor-fassung-3";
import type {
  AppAnschluss,
  AppAufrufErgebnis,
  AppInfo,
  AppLauf,
  AppListeEintrag,
  AusgeschlossenMeldung,
} from "../app-anschluss";

export const TEST_APP_TOKEN = `v2:${"a".repeat(16)}:${"b".repeat(22)}:${"c".repeat(40)}`;

/** Ein Werkzeug, wie die Attrappe einer App es liefert. */
export interface TestAppWerkzeug {
  name: string;
  /** Wie der Besitzer es einstuft; `null` = nie bestätigt (bleibt „neu“). */
  klasse: AppToolClass | null;
  /** Beschreibung, wie sie in der Datenbank steht (Standard „Beschreibung <name>“). */
  beschreibung?: string;
  /** Text, den der Aufruf liefert (Standard „Treffer“). */
  antwort?: string;
  /** Wird beim Aufruf der App ausgeführt, noch bevor die Antwort zurückgeht. */
  beimAufruf?: () => Promise<void> | void;
}

export interface TestApp {
  id: AppId;
  info: AppInfo;
  werkzeuge: TestAppWerkzeug[];
  /** Zeichen im Abdruck der Rohform; ändern lässt die Attrappe das Werkzeug „geändert“ erscheinen. */
  version: Map<string, string>;
}

/** Gespielte Anfragen an die Attrappe: sie zählt, was hinausgegangen wäre. */
export interface AnschlussProtokoll {
  listen: string[];
  aufrufe: { app: string; name: string; argumente: unknown }[];
  ausgeschlossen: AusgeschlossenMeldung[];
}

export interface TestAnschluss {
  anschluss: AppAnschluss;
  protokoll: AnschlussProtokoll;
  /** Text, den die Attrappe statt des Standards als Antwort liefert, je Werkzeug. */
  setzeAntwort(app: TestApp, name: string, text: string): void;
  /** Der Server der App ändert eine Beschreibung (neuer Abdruck der Rohform). */
  aendereWerkzeug(app: TestApp, name: string, zeichen: string): void;
}

export function abdruck(zeichen: string): string {
  return `sha256:${zeichen.repeat(64).slice(0, 64)}`;
}

/** Eine Attrappe für `RunDeps.apps`. Alle Apps in `apps` werden von ihr bedient. */
export function erzeugeTestAnschluss(
  apps: readonly TestApp[],
  optionen: {
    /** Läuft in `holeListe` einer App, bevor die Liste zurückgeht. */
    beimListe?: (app: AppInfo) => Promise<void> | void;
    /** `holeListe` wirft diesen Fehler (statt eine Liste zu liefern). */
    listeFehler?: Error;
  } = {},
): TestAnschluss {
  const protokoll: AnschlussProtokoll = { listen: [], aufrufe: [], ausgeschlossen: [] };
  const antworten = new Map<string, string>();
  const key = (app: TestApp, name: string) => `${app.id}/${name}`;
  const anschluss: AppAnschluss = {
    neuerLauf(): AppLauf {
      return {
        async holeListe({ app }) {
          protokoll.listen.push(app.kurzname);
          await optionen.beimListe?.(app);
          if (optionen.listeFehler !== undefined) throw optionen.listeFehler;
          const test = apps.find((a) => a.id === app.id);
          if (test === undefined) throw new Error("App unbekannt");
          return test.werkzeuge.map(
            (w): AppListeEintrag => ({
              originalName: w.name,
              abdruck: abdruck(test.version.get(w.name) ?? "1"),
              beschreibung: `Beschreibung ${w.name}`,
              schemaFuerModell: {
                type: "object",
                properties: { q: { type: "string" } },
                additionalProperties: false,
              },
              bestaetigbar: true,
              hinweisNurLesen: null,
              hinweisZerstoerend: null,
            }),
          );
        },
        pruefeArgumente(_appId, _name, argumente) {
          return (
            typeof argumente === "object" &&
            argumente !== null &&
            typeof (argumente as { q?: unknown }).q === "string"
          );
        },
        async rufeAuf({ app, originalName, argumente }): Promise<AppAufrufErgebnis> {
          protokoll.aufrufe.push({ app: app.kurzname, name: originalName, argumente });
          const test = apps.find((a) => a.id === app.id);
          const werkzeug = test?.werkzeuge.find((w) => w.name === originalName);
          await werkzeug?.beimAufruf?.();
          return {
            status: "ok",
            text: antworten.get(`${app.id}/${originalName}`) ?? werkzeug?.antwort ?? "Treffer",
            gekuerzt: false,
            fehlercode: null,
          };
        },
      };
    },
    meldeAusgeschlossen(meldung) {
      protokoll.ausgeschlossen.push(meldung);
    },
  };
  return {
    anschluss,
    protokoll,
    setzeAntwort: (app, name, text) => antworten.set(key(app, name), text),
    aendereWerkzeug: (app, name, zeichen) => app.version.set(name, zeichen),
  };
}
