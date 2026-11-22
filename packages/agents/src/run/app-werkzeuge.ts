/**
 * PaiBot – Werkzeuge aus Apps für einen Lauf: Abgleich beim Start und frische Fakten je Aufruf
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { type Database, repo } from "@paibot/db";
import { appTargetDigestInput } from "@paibot/shared/bindung";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import type { AppId, AppToolId, BotId } from "@paibot/shared/ids";
import type { JsonValue } from "@paibot/shared/motor";
import type { AppAccessLevel, AppToolStatus } from "@paibot/shared/tor-fassung-3";
import { type AppWerkzeugEintrag, erweitereRegister } from "../werkzeuge/app-register";
import type { RegisteredTool, ToolRegistry } from "../werkzeuge/register";
import {
  type AppAnschluss,
  type AppInfo,
  type AppLauf,
  AppListeFehler,
  type AusgeschlossenMeldung,
} from "./app-anschluss";

/** Was beim Lauf-Start aus den Apps dieses Bots wird. */
export interface AppWerkzeugeFuerLauf {
  /** Register mit den eingebauten und den bestätigten App-Werkzeugen. */
  readonly registry: ToolRegistry;
  /** Die Verbindung des Laufs zu den Apps; `undefined`, wenn nichts abgerufen wurde. */
  readonly lauf: AppLauf | undefined;
}

/** Abdruck von App-Kennung und Adresse, wie das Tor ihn rechnet (`sha256:` + Hex). */
export async function zielAbdruck(appId: AppId, url: string): Promise<Sha256Digest> {
  const bytes = new TextEncoder().encode(appTargetDigestInput(appId, url));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"));
  return `sha256:${hex.join("")}` as Sha256Digest;
}

function appInfo(app: { id: AppId; shortName: string; url: string }): AppInfo {
  return { id: app.id, kurzname: app.shortName, url: app.url };
}

/** Höchstzahl der Apps, deren Listen gleichzeitig abgerufen werden. */
export const APP_ABRUF_GLEICHZEITIG = 4;
/** Standard der Gesamtfrist für den Abruf aller Listen beim Lauf-Start (Millisekunden). */
export const APP_ABRUF_GESAMTFRIST_MS = 15_000;

/** Ergebnis der Arbeit an einer App. */
interface AppErgebnis {
  eintraege: AppWerkzeugEintrag[];
  meldungen: AusgeschlossenMeldung[];
}

/**
 * Wartet auf `arbeit`, aber höchstens bis `signal` auslöst. Ein Fehler der Arbeit und eine
 * verpasste Frist ergeben beide `undefined`; der Text eines Fehlers geht nirgends hin.
 */
function mitFrist<T>(signal: AbortSignal, arbeit: Promise<T>): Promise<T | undefined> {
  return new Promise((fertig) => {
    if (signal.aborted) {
      arbeit.catch(() => undefined);
      fertig(undefined);
      return;
    }
    const abbruch = () => fertig(undefined);
    signal.addEventListener("abort", abbruch, { once: true });
    arbeit.then(
      (wert) => fertig(wert),
      () => fertig(undefined),
    );
  });
}

/** Führt `f` für alle Einträge mit höchstens `grenze` gleichzeitigen Aufgaben aus; Ergebnisse in der Reihenfolge der Einträge. */
async function gleichzeitig<T, R>(
  eintraege: readonly T[],
  grenze: number,
  f: (eintrag: T) => Promise<R>,
): Promise<R[]> {
  const ergebnisse = new Array<R>(eintraege.length);
  let naechster = 0;
  const arbeiter = Array.from({ length: Math.min(grenze, eintraege.length) }, async () => {
    for (let i = naechster++; i < eintraege.length; i = naechster++) {
      ergebnisse[i] = await f(eintraege[i] as T);
    }
  });
  await Promise.all(arbeiter);
  return ergebnisse;
}

/**
 * Bietet einem Bot die Werkzeuge seiner Apps an: nur Apps, auf die dieser Bot gerade lesen darf und
 * in denen der Besitzer mindestens ein Werkzeug als „lesen“ bestätigt hat, nur Werkzeuge, die sich
 * seit der Bestätigung nicht geändert haben. Die Liste jeder dieser Apps wird frisch abgerufen und
 * mit der Datenbank abgeglichen: ein geändertes oder entferntes Werkzeug geht nie an das Modell.
 * Ein Werkzeug, das die Datenbank noch nicht kennt, wird beim Lauf-Start nicht angelegt (angeboten
 * würde es ohnehin nie); der Besitzer sieht neue Werkzeuge erst bei „Neu abrufen“.
 *
 * Die Apps werden gleichzeitig abgerufen (höchstens `APP_ABRUF_GLEICHZEITIG`), alle zusammen mit
 * einer Gesamtfrist: Eine App, die bis dahin nicht geantwortet hat, trägt zu diesem Lauf nichts
 * bei. Die Datenbank wird je App einmal nach den Werkzeugen gefragt, nie je Paar von Apps. Eine App,
 * deren Liste sich nicht abrufen lässt, trägt ebenfalls nichts bei.
 *
 * Ist der Not-Aus gesetzt (`killSwitch`, der Wert, der auch als Fakt an das Tor geht), geht keine
 * Anfrage hinaus, und es gibt nur die eingebauten Werkzeuge.
 */
export async function ladeAppWerkzeuge(input: {
  db: Database;
  anschluss: AppAnschluss | undefined;
  basis: ToolRegistry;
  botId: BotId;
  killSwitch: boolean;
  signal: AbortSignal;
  /** Gesamtfrist des Abrufs in Millisekunden (Standard `APP_ABRUF_GESAMTFRIST_MS`). */
  gesamtfristMs?: number;
}): Promise<AppWerkzeugeFuerLauf> {
  const { db, anschluss, basis } = input;
  if (anschluss === undefined || input.killSwitch) return { registry: basis, lauf: undefined };
  const appIds = await repo.apps.readableApps(db, input.botId);
  if (appIds.length === 0) return { registry: basis, lauf: undefined };
  const alleApps = await repo.apps.list(db);
  // Je App genau eine Abfrage; alles Weitere rechnet im Speicher.
  const werkzeugeJeApp = new Map<AppId, Awaited<ReturnType<typeof repo.apps.currentTools>>>();
  for (const app of alleApps) werkzeugeJeApp.set(app.id, await repo.apps.currentTools(db, app.id));
  const namenJeApp = (ausser: AppId): Set<string> => {
    const namen = new Set<string>();
    for (const [id, werkzeuge] of werkzeugeJeApp) {
      if (id !== ausser) for (const t of werkzeuge) namen.add(t.modelName);
    }
    return namen;
  };
  // Nur Apps, in denen etwas bestätigt ist: Sonst gäbe es nichts anzubieten, und ein Abruf wäre
  // eine Anfrage an die App ohne Nutzen.
  const kandidaten = appIds
    .map((id) => alleApps.find((a) => a.id === id))
    .filter((app): app is (typeof alleApps)[number] => {
      if (app === undefined) return false;
      return (werkzeugeJeApp.get(app.id) ?? []).some(
        (t) => t.status === "bestaetigt" && t.toolClass === "lesen",
      );
    });
  if (kandidaten.length === 0) return { registry: basis, lauf: undefined };

  const lauf = anschluss.neuerLauf();
  const frist = AbortSignal.any([
    input.signal,
    AbortSignal.timeout(input.gesamtfristMs ?? APP_ABRUF_GESAMTFRIST_MS),
  ]);

  const ladeApp = async (app: (typeof alleApps)[number]): Promise<AppErgebnis> => {
    const info = appInfo(app);
    const ergebnis: AppErgebnis = { eintraege: [], meldungen: [] };
    const bekannte = werkzeugeJeApp.get(app.id) ?? [];
    // Entfernte Werkzeuge zählen nicht mit: So wächst die Zuordnung bei einem Server, der ständig
    // neue Namen nennt, nicht ohne Ende.
    const bekannteNamen = new Map(
      bekannte.filter((t) => t.status !== "entfernt").map((t) => [t.originalName, t.modelName]),
    );
    let liste: Awaited<ReturnType<AppLauf["holeListe"]>>;
    try {
      liste = await lauf.holeListe({
        app: info,
        bekannteNamen,
        bereitsVergeben: namenJeApp(app.id),
        signal: frist,
      });
    } catch (fehler) {
      // Die Meldung der App oder der Bibliothek geht nirgends hin; diese App trägt nichts bei.
      // Sind die gespeicherten Namen ungültig, bleibt die App gesperrt und der Besitzer erfährt es.
      if (fehler instanceof AppListeFehler && fehler.grund === "namen_ungueltig") {
        ergebnis.meldungen.push({
          appId: app.id,
          kennung: `mcp/${app.shortName}`,
          grund: "Die gespeicherten Namen der Werkzeuge dieser App sind ungültig.",
        });
      }
      return ergebnis;
    }
    // Zu spät angekommen: nichts mehr schreiben, der Lauf geht ohne diese App weiter.
    if (frist.aborted) return ergebnis;
    // Nur Werkzeuge, die die Datenbank in derselben Transaktion schon kennt (`nurBekannte`); ein
    // neues schreibt erst „Neu abrufen“. Der Stand wird dort gelesen, nicht schon vor dem Abruf:
    // Ein Werkzeug, das im Fenster des Abrufs neu angelegt und bestätigt wurde, wird so nie
    // fälschlich als „entfernt“ gekennzeichnet.
    let ergebnisse: Awaited<ReturnType<typeof repo.apps.sehen>>;
    try {
      ergebnisse = await repo.apps.sehen(
        db,
        app.id,
        liste.map((e) => ({
          originalName: e.originalName,
          toolDigest: e.abdruck as Sha256Digest,
          description: e.beschreibung,
          inputSchema: e.schemaFuerModell ?? {},
          hintReadOnly: e.hinweisNurLesen,
          hintDestructive: e.hinweisZerstoerend,
        })),
        { nurBekannte: true },
      );
    } catch {
      return ergebnis;
    }
    for (const gesehen of ergebnisse) {
      if (gesehen.change !== "unveraendert") continue;
      const roh = liste.find((e) => e.originalName === gesehen.tool.originalName);
      if (roh === undefined || !roh.bestaetigbar || roh.schemaFuerModell === null) continue;
      const bestaetigt = await repo.apps.confirmedTool(db, {
        modelName: gesehen.tool.modelName,
        toolDigest: gesehen.tool.toolDigest,
      });
      if (bestaetigt === undefined || bestaetigt.tool.toolClass !== "lesen") continue;
      const tool = bestaetigt.tool;
      ergebnis.eintraege.push({
        appId: app.id,
        appToolId: tool.toolId,
        originalName: tool.originalName,
        kurzname: app.shortName,
        toolKey: tool.toolKey,
        modelName: tool.modelName,
        version: tool.version,
        toolDigest: tool.toolDigest,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, JsonValue>,
        pruefeArgumente: (argumente) => lauf.pruefeArgumente(app.id, tool.originalName, argumente),
        rufeAuf: (argumente, signal) =>
          lauf.rufeAuf({ app: info, originalName: tool.originalName, argumente, signal }),
      });
    }
    return ergebnis;
  };

  const ergebnisse = await gleichzeitig(kandidaten, APP_ABRUF_GLEICHZEITIG, async (app) => {
    // Nach Fristende fängt keine App mehr an: keine Datenbank-Lesung, keine Entschlüsselung des Zugangs.
    if (frist.aborted) return { eintraege: [], meldungen: [] };
    const gelungen = await mitFrist(frist, ladeApp(app));
    return gelungen ?? { eintraege: [], meldungen: [] };
  });
  const eintraege = ergebnisse.flatMap((e) => e.eintraege);
  const meldungen = ergebnisse.flatMap((e) => e.meldungen);
  const { registry, ausgeschlossen } = await erweitereRegister(basis, eintraege);
  for (const a of ausgeschlossen) {
    meldungen.push({ appId: a.appId, kennung: a.key, grund: a.fehler.message });
  }
  for (const meldung of meldungen) {
    try {
      anschluss.meldeAusgeschlossen(meldung);
    } catch {
      // Eine Meldung, die scheitert, hält den Lauf nicht an.
    }
  }
  return { registry, lauf };
}

/** Die Fakten eines Aufrufs an eine App, frisch aus einer Zeile von `confirmedTool` und der Datenbank. */
export interface AppAufrufFakten {
  readonly appId: AppId;
  readonly appToolId: AppToolId;
  readonly toolVersion: number;
  readonly toolStatus: AppToolStatus;
  readonly toolKind: "lesen" | "schreiben";
  readonly appAccess: AppAccessLevel;
  readonly targetDigest: Sha256Digest;
  readonly confirmedToolDigest: Sha256Digest;
  readonly confirmedTargetDigest: Sha256Digest;
}

/**
 * Liest die Fakten für einen Aufruf direkt vor dem Aufruf aus der Datenbank. Alles, was das Tor über das
 * Werkzeug erfährt, kommt aus derselben Zeile (`toolByModelName`): Stand, Einstufung, Fassung und
 * Abdruck der Bestätigung. `toolKind` kommt allein aus der Einstufung des Besitzers, nie aus
 * Hinweisen des Servers. Ist das Werkzeug nicht mehr bestätigt, steht das in `toolStatus`; das
 * Tor lehnt dann ab. Gibt es das Werkzeug oder seine App nicht mehr, ist das Ergebnis `undefined`.
 *
 * `erwartet` ist die App und das Werkzeug, die der Lauf angeboten hat. Gehört die frische Zeile zu
 * einer anderen App oder einem anderen Werkzeug (etwa weil ein Modell-Name neu vergeben wurde),
 * ist das Ergebnis ebenfalls `undefined`: Es wird nie mit den Fakten eines anderen Werkzeugs
 * entschieden.
 */
export async function leseAufrufFakten(input: {
  db: Database;
  botId: BotId;
  modelName: string;
  erwartet: { appId: AppId; appToolId: AppToolId };
}): Promise<AppAufrufFakten | undefined> {
  const { db } = input;
  const tool = await repo.apps.toolByModelName(db, input.modelName);
  if (tool === undefined) return undefined;
  if (tool.appId !== input.erwartet.appId || tool.toolId !== input.erwartet.appToolId) {
    return undefined;
  }
  const app = await repo.apps.get(db, tool.appId);
  if (app === undefined) return undefined;
  const appAccess = await repo.apps.currentAccess(db, app.id, input.botId);
  const ziel = await zielAbdruck(app.id, app.url);
  return {
    appId: app.id,
    appToolId: tool.toolId,
    toolVersion: tool.version,
    toolStatus: tool.status,
    toolKind: tool.toolClass === "lesen" ? "lesen" : "schreiben",
    appAccess,
    targetDigest: ziel,
    confirmedToolDigest: tool.toolDigest,
    // Ohne gespeichertes Ziel der Bestätigung gibt es nichts, was passen könnte.
    confirmedTargetDigest: tool.targetDigest ?? (`sha256:${"0".repeat(64)}` as Sha256Digest),
  };
}

export type { RegisteredTool };
