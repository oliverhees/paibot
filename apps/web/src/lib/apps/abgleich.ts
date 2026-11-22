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

/** Gespeicherte Zuordnung Original-Name → Modell-Name einer App, immer frisch aus der Datenbank. */
export async function bekannteNamenVon(db: Database, appId: App["id"]) {
  const gespeichert = await repo.apps.currentTools(db, appId);
  return new Map(gespeichert.map((tool) => [tool.originalName, tool.modelName]));
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
