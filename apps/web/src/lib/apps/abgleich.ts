/**
 * PaiBot – Werkzeuge einer App abrufen und mit den gespeicherten Fassungen abgleichen. Die Liste
 * kommt über die Schicht (nur `tools/list`), bereinigt und gekürzt; nur Werkzeuge mit sicher
 * prüfbarem Schema werden gespeichert. Die Namen vergibt und hält die Datenbank, die Schicht
 * bekommt die gespeicherte Zuordnung immer mit (`bekannteNamen`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { type Database, repo } from "@paibot/db";
import type { McpWerkzeugBereinigt, WerkzeugAbruf } from "@paibot/mcp";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import { type AppAbruf, appDienste } from "./dienste";

type App = repo.apps.App;

/** Ein Werkzeug, das die Schicht nicht sicher prüfen kann und das deshalb nie bestätigt wird. */
export interface NichtPruefbar {
  /** Bereinigter Name zur Anzeige (nie der rohe Name des Servers). */
  name: string;
  /** Fester Grund; immer `werkzeug_schema_nicht_pruefbar`. */
  grund: "werkzeug_schema_nicht_pruefbar";
  /** Art des Problems aus der Schicht (feste Kennung, nie ein Text des Servers). */
  art: string;
  /** Es war schon gespeichert und gilt jetzt als entfernt (wird nicht angeboten). */
  warGespeichert: boolean;
}

export interface AbgleichErgebnis {
  /** Neueste Fassung jedes gespeicherten Werkzeugs nach dem Abgleich. */
  werkzeuge: repo.apps.AppTool[];
  nichtPruefbar: NichtPruefbar[];
  /** Die Liste war größer als erlaubt und wurde abgeschnitten. */
  abgeschnitten: boolean;
}

/**
 * Höchstens so viele gespeicherte Namen einer App gehen an die Schicht. Sie nimmt nur eine begrenzte
 * Zahl an (2 000) und lehnt mehr als Fehler der Daten ab; die Grenze hier liegt darunter.
 */
export const MAX_BEKANNTE_NAMEN = 1500;

/**
 * Gespeicherte Zuordnung Original-Name → Modell-Name einer App, immer frisch aus der Datenbank.
 * Werkzeuge, die der Server nicht mehr meldet (`entfernt`), sammeln sich über die Zeit an. Zuerst
 * kommen deshalb alle Namen der übrigen Werkzeuge, dann die der entfernten, die zuletzt angelegten
 * zuerst, solange Platz bleibt. Die Namen vergibt am Ende die Datenbank; ein weggelassener Name eines
 * entfernten Werkzeugs ändert nichts an den gespeicherten.
 */
export async function bekannteNamenVon(db: Database, appId: App["id"]) {
  const gespeichert = await repo.apps.currentTools(db, appId);
  const aktuelle = gespeichert.filter((tool) => tool.status !== "entfernt");
  const entfernte = gespeichert
    .filter((tool) => tool.status === "entfernt")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const platz = Math.max(0, MAX_BEKANNTE_NAMEN - aktuelle.length);
  return new Map(
    [...aktuelle, ...entfernte.slice(0, platz)].map((tool) => [tool.originalName, tool.modelName]),
  );
}

/** Holt die Liste über die Schicht (mit den gespeicherten Namen) und trennt sie nach Prüfbarkeit. */
export async function listeAbrufen(
  db: Database,
  app: Pick<App, "id" | "shortName">,
  abruf: Omit<AppAbruf, "appKurzname" | "bekannteNamen">,
): Promise<WerkzeugAbruf> {
  return appDienste().werkzeugeAbrufen({
    ...abruf,
    appKurzname: app.shortName,
    bekannteNamen: await bekannteNamenVon(db, app.id),
  });
}

function seenVon(tool: McpWerkzeugBereinigt): repo.apps.SeenTool {
  return {
    originalName: tool.originalName,
    toolDigest: tool.abdruck as Sha256Digest,
    description: tool.beschreibung,
    inputSchema: tool.schemaFuerModell,
    hintReadOnly: tool.hinweise.nurLesend,
    hintDestructive: tool.hinweise.destruktiv,
  };
}

/**
 * Gleicht die abgerufene Liste mit der Datenbank ab: prüfbare Werkzeuge werden gespeichert
 * (neu, geändert, unverändert), alles, was in der Liste fehlt oder nicht prüfbar ist, gilt als
 * entfernt und wird nicht angeboten. Ein Werkzeug, das nicht prüfbar ist, steht mit festem Grund
 * in `nichtPruefbar`, auch wenn es vorher gespeichert war.
 */
export async function abgleichen(
  db: Database,
  appId: App["id"],
  abruf: WerkzeugAbruf,
): Promise<AbgleichErgebnis> {
  const vorher = new Set((await repo.apps.currentTools(db, appId)).map((t) => t.originalName));
  const pruefbar = abruf.werkzeuge.filter(
    (w) => w.bestaetigbar && w.schemaFuerModell !== null && w.originalName !== "",
  );
  const nichtPruefbar: NichtPruefbar[] = abruf.werkzeuge
    .filter((w) => !pruefbar.includes(w))
    .map((w) => ({
      name: w.anzeigeName === "" ? "(ohne Namen)" : w.anzeigeName,
      grund: "werkzeug_schema_nicht_pruefbar" as const,
      art: w.problem ?? "unbekannt",
      warGespeichert: vorher.has(w.originalName),
    }));
  await repo.apps.sehen(db, appId, pruefbar.map(seenVon));
  return {
    werkzeuge: await repo.apps.currentTools(db, appId),
    nichtPruefbar,
    abgeschnitten: abruf.abgeschnitten,
  };
}
