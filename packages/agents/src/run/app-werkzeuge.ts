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
import type { AppAnschluss, AppInfo, AppLauf } from "./app-anschluss";

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

/**
 * Bietet einem Bot die Werkzeuge seiner Apps an: nur Apps, auf die dieser Bot gerade lesen darf,
 * nur Werkzeuge, die der Besitzer als „lesen“ bestätigt hat und die sich seit der Bestätigung nicht
 * geändert haben. Die Liste jeder App wird dafür frisch abgerufen und mit der Datenbank
 * abgeglichen (neu, geändert und entfernte Werkzeuge gehen nie an das Modell). Eine App, deren
 * Liste sich nicht abrufen lässt, trägt nichts bei.
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
}): Promise<AppWerkzeugeFuerLauf> {
  const { db, anschluss, basis } = input;
  if (anschluss === undefined || input.killSwitch) return { registry: basis, lauf: undefined };
  const appIds = await repo.apps.readableApps(db, input.botId);
  if (appIds.length === 0) return { registry: basis, lauf: undefined };
  const lauf = anschluss.neuerLauf();
  const alleApps = await repo.apps.list(db);
  const eintraege: AppWerkzeugEintrag[] = [];
  for (const appId of appIds) {
    const app = alleApps.find((a) => a.id === appId);
    if (app === undefined) continue;
    const info = appInfo(app);
    const bekannte = await repo.apps.currentTools(db, app.id);
    const bekannteNamen = new Map(bekannte.map((t) => [t.originalName, t.modelName]));
    const bereitsVergeben = new Set<string>();
    for (const andere of alleApps) {
      if (andere.id === app.id) continue;
      for (const t of await repo.apps.currentTools(db, andere.id)) bereitsVergeben.add(t.modelName);
    }
    let liste: Awaited<ReturnType<AppLauf["holeListe"]>>;
    try {
      liste = await lauf.holeListe({
        app: info,
        bekannteNamen,
        bereitsVergeben,
        signal: input.signal,
      });
    } catch {
      // Die Meldung der App oder der Bibliothek geht nirgends hin; diese App trägt nichts bei.
      continue;
    }
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
      );
    } catch {
      continue;
    }
    for (const ergebnis of ergebnisse) {
      if (ergebnis.change !== "unveraendert") continue;
      const roh = liste.find((e) => e.originalName === ergebnis.tool.originalName);
      if (roh === undefined || !roh.bestaetigbar || roh.schemaFuerModell === null) continue;
      const bestaetigt = await repo.apps.confirmedTool(db, {
        modelName: ergebnis.tool.modelName,
        toolDigest: ergebnis.tool.toolDigest,
      });
      if (bestaetigt === undefined || bestaetigt.tool.toolClass !== "lesen") continue;
      const tool = bestaetigt.tool;
      eintraege.push({
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
  }
  const { registry, ausgeschlossen } = await erweitereRegister(basis, eintraege);
  for (const a of ausgeschlossen) {
    try {
      anschluss.meldeAusgeschlossen({ appId: a.appId, kennung: a.key, grund: a.fehler.message });
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
  readonly toolDigest: Sha256Digest;
  readonly targetDigest: Sha256Digest;
  readonly confirmedToolDigest: Sha256Digest;
  readonly confirmedTargetDigest: Sha256Digest;
}

/**
 * Liest die Fakten für einen Aufruf direkt vor dem Aufruf aus der Datenbank. `angebotenDigest` ist
 * der Abdruck, den das Modell beim Start des Laufs angeboten bekam. Alles, was das Tor über das
 * Werkzeug erfährt, kommt aus derselben Zeile (`toolByModelName`): Stand, Einstufung, Fassung und
 * Abdruck der Bestätigung. `toolKind` kommt allein aus der Einstufung des Besitzers, nie aus
 * Hinweisen des Servers. Ist das Werkzeug nicht mehr bestätigt, steht das in `toolStatus`; das
 * Tor lehnt dann ab. Gibt es das Werkzeug oder seine App nicht mehr, ist das Ergebnis `undefined`.
 */
export async function leseAufrufFakten(input: {
  db: Database;
  botId: BotId;
  modelName: string;
  angebotenDigest: Sha256Digest;
}): Promise<AppAufrufFakten | undefined> {
  const { db } = input;
  const tool = await repo.apps.toolByModelName(db, input.modelName);
  if (tool === undefined) return undefined;
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
    toolDigest: input.angebotenDigest,
    targetDigest: ziel,
    confirmedToolDigest: tool.toolDigest,
    // Ohne gespeichertes Ziel der Bestätigung gibt es nichts, was passen könnte.
    confirmedTargetDigest: tool.targetDigest ?? (`sha256:${"0".repeat(64)}` as Sha256Digest),
  };
}

export type { RegisteredTool };
