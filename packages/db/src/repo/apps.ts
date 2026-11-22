/**
 * PaiBot – Zugriff auf Apps, ihre Werkzeuge und den Zugriff der Bots. Das Zugangs-Token liegt nur
 * als bereits verschlüsselter Text vor (`appTokenBinding`); verschlüsselt wird hier nicht, und
 * keine Rückgabe außer `tokenEnc` enthält es.
 *
 * Die Werkzeuge einer App werden nur angehängt: Der Worker kennt nur „neu“, „geändert“ und
 * „entfernt“ (`sehen`); „bestätigt“ und „gesperrt“ gibt es nur über `einstufen` mit der Kennung
 * der Entscheidung des Besitzers, die der Trigger der Datenbank prüft.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import {
  type ActionId,
  type AppId,
  type AppToolId,
  type BotId,
  newId,
  normalizedAppUrl,
  PaiBotError,
  type Sha256Digest,
  type ToolKey,
} from "@paibot/shared";
import type { AppAccessLevel, AppAuthKind, AppToolClass } from "@paibot/shared/tor-fassung-3";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import { type AppRow, type AppToolRow, apps, appTools, botAppGrants } from "../schema";
import { feldFehler, SQLSTATE, standardFehler, uebersetzen } from "./fehler";
import { withTransaction } from "./transaktion";

/** Eine verbundene App, ohne Token (nur, ob eines hinterlegt ist). */
export interface App {
  id: AppId;
  shortName: string;
  name: string;
  /** Volle Adresse in der Form von `normalizedAppUrl`. */
  url: string;
  authKind: AppAuthKind;
  tokenSet: boolean;
  state: "verbunden" | "getrennt";
  connectionNo: number;
  serverVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
  disconnectedAt: Date | null;
}

/** Eine Fassung eines Werkzeugs einer App. */
export interface AppTool {
  toolId: AppToolId;
  version: number;
  appId: AppId;
  originalName: string;
  /** Einmal vergeben, nie neu berechnet, eindeutig je Installation. */
  modelName: string;
  toolKey: ToolKey;
  toolDigest: Sha256Digest;
  description: string;
  inputSchema: unknown;
  hintReadOnly: boolean | null;
  hintDestructive: boolean | null;
  status: AppToolRow["status"];
  toolClass: AppToolClass;
  actionId: ActionId | null;
  seenDigest: Sha256Digest | null;
  targetDigest: Sha256Digest | null;
  createdAt: Date;
}

function toApp(row: AppRow): App {
  return {
    id: row.id,
    shortName: row.shortName,
    name: row.name,
    url: row.url,
    authKind: row.authKind,
    tokenSet: row.tokenEnc !== null,
    state: row.state,
    connectionNo: row.connectionNo,
    serverVersion: row.serverVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    disconnectedAt: row.disconnectedAt,
  };
}

function toTool(row: AppToolRow): AppTool {
  return { ...row };
}

function adresse(url: string): string {
  try {
    return normalizedAppUrl(url);
  } catch {
    throw feldFehler("url");
  }
}

function fehler(f: Parameters<typeof standardFehler>[0]) {
  if (f.code === SQLSTATE.eindeutig) {
    if (f.constraint === "apps_short_name_eindeutig") return feldFehler("shortName");
    return undefined;
  }
  if (f.code === SQLSTATE.pruefbedingung) return standardFehler(f);
  return standardFehler(f);
}

// ---------------------------------------------------------------------------------------------
// Apps

export interface AppCreate {
  id?: AppId;
  shortName: string;
  name: string;
  /** Volle https-Adresse; wird in die Form von `normalizedAppUrl` gebracht. */
  url: string;
  authKind: AppAuthKind;
  /** Bereits verschlüsselter Token (`v2`, gebunden mit `appTokenBinding(id, url)`). */
  tokenEnc?: string;
  serverVersion?: string;
}

/** Legt eine App an. Ein Token gibt es genau bei `authKind: "token"`. */
export async function create(db: Database, input: AppCreate): Promise<App> {
  const [row] = await uebersetzen(
    () =>
      db
        .insert(apps)
        .values({
          id: input.id ?? newId("app"),
          shortName: input.shortName,
          name: input.name,
          url: adresse(input.url),
          authKind: input.authKind,
          tokenEnc: input.tokenEnc ?? null,
          serverVersion: input.serverVersion ?? null,
        })
        .returning(),
    fehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toApp(row);
}

export async function get(db: Database, id: AppId): Promise<App | undefined> {
  const [row] = await db.select().from(apps).where(eq(apps.id, id));
  return row === undefined ? undefined : toApp(row);
}

export async function list(db: Database): Promise<App[]> {
  const rows = await db.select().from(apps).orderBy(asc(apps.createdAt), asc(apps.id));
  return rows.map(toApp);
}

/**
 * Der verschlüsselte Token einer verbundenen App für die Hülle, die ihn entschlüsselt; sonst
 * `undefined` (App unbekannt, getrennt oder ohne Anmeldung). Nur dieser Weg gibt ihn heraus.
 */
export async function getTokenEnc(db: Database, id: AppId): Promise<string | undefined> {
  const [row] = await db
    .select({ tokenEnc: apps.tokenEnc })
    .from(apps)
    .where(and(eq(apps.id, id), eq(apps.state, "verbunden")));
  return row?.tokenEnc ?? undefined;
}

/** Neue Zeit der gemeldeten Fassung (nur zur Anzeige) und des Namens. */
export async function update(
  db: Database,
  id: AppId,
  patch: { name?: string; serverVersion?: string | null },
): Promise<App | undefined> {
  const [row] = await uebersetzen(
    () =>
      db
        .update(apps)
        .set({ ...patch, updatedAt: sql`pg_catalog.now()` })
        .where(eq(apps.id, id))
        .returning(),
    fehler,
  );
  return row === undefined ? undefined : toApp(row);
}

export interface AppAccessChange {
  /** Neue Adresse; ohne Angabe bleibt sie. */
  url?: string;
  /** Neuer, bereits verschlüsselter Token (gebunden an die Adresse nach der Änderung). */
  tokenEnc: string;
}

/**
 * Wechselt Adresse und/oder Token einer verbundenen App. Danach sind alle Werkzeuge der App
 * wieder „neu“ (Trigger `apps_aenderung`): Eine frühere Einstufung gilt nur für die frühere
 * Adresse und den früheren Zugang.
 */
export async function changeAccess(
  db: Database,
  id: AppId,
  change: AppAccessChange,
): Promise<App | undefined> {
  const [row] = await uebersetzen(
    () =>
      db
        .update(apps)
        .set({
          tokenEnc: change.tokenEnc,
          ...(change.url === undefined ? {} : { url: adresse(change.url) }),
          updatedAt: sql`pg_catalog.now()`,
        })
        .where(and(eq(apps.id, id), eq(apps.state, "verbunden")))
        .returning(),
    fehler,
  );
  return row === undefined ? undefined : toApp(row);
}

/** Trennt eine App: Der Zugang wird gelöscht, der Zugriff aller Bots ist sofort „keiner“. */
export async function disconnect(db: Database, id: AppId): Promise<App | undefined> {
  const [row] = await uebersetzen(
    () =>
      db
        .update(apps)
        .set({
          state: "getrennt",
          tokenEnc: null,
          disconnectedAt: sql`pg_catalog.now()`,
          updatedAt: sql`pg_catalog.now()`,
        })
        .where(and(eq(apps.id, id), eq(apps.state, "verbunden")))
        .returning(),
    fehler,
  );
  return row === undefined ? undefined : toApp(row);
}

export interface AppReconnect {
  url?: string;
  authKind: AppAuthKind;
  tokenEnc?: string;
}

/**
 * Verbindet eine getrennte App erneut. Die Verbindungsnummer steigt um eins: Frühere Zugriffe
 * der Bots gelten nicht mehr, und alle Werkzeuge sind wieder „neu“.
 */
export async function reconnect(
  db: Database,
  id: AppId,
  input: AppReconnect,
): Promise<App | undefined> {
  const [row] = await uebersetzen(
    () =>
      db
        .update(apps)
        .set({
          state: "verbunden",
          disconnectedAt: null,
          connectionNo: sql`${apps.connectionNo} + 1`,
          authKind: input.authKind,
          tokenEnc: input.tokenEnc ?? null,
          ...(input.url === undefined ? {} : { url: adresse(input.url) }),
          updatedAt: sql`pg_catalog.now()`,
        })
        .where(and(eq(apps.id, id), eq(apps.state, "getrennt")))
        .returning(),
    fehler,
  );
  return row === undefined ? undefined : toApp(row);
}

// ---------------------------------------------------------------------------------------------
// Namen

/** Teil eines Namens aus dem Original-Namen: nur `[A-Za-z0-9_-]`, höchstens `laenge` Zeichen. */
function bereinigt(original: string, laenge: number): string {
  const text = original.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return (text === "" ? "werkzeug" : text).slice(0, laenge);
}

/** Wie `bereinigt`, klein geschrieben, ohne führendes `_` oder `-`, Punkte erlaubt. */
function kennungsTeil(original: string, laenge: number): string {
  const text = bereinigt(original, laenge)
    .toLowerCase()
    .replace(/^[_-]+/, "");
  return (text === "" ? "werkzeug" : text).slice(0, laenge);
}

/**
 * Vergibt Modell-Name und Kennung für ein Werkzeug, das zum ersten Mal gesehen wird:
 * `<kurzname>__<name>` und `mcp/<kurzname>/<name>`, bei Kollision mit einem Zähler. Beide sind
 * danach fest; sie hängen nie von den anderen Werkzeugen der Liste ab.
 */
async function vergebeNamen(
  tx: Database,
  app: App,
  originalName: string,
): Promise<{ modelName: string; toolKey: ToolKey }> {
  const modellVorsatz = `${app.shortName}__`;
  for (let zaehler = 1; zaehler < 10_000; zaehler++) {
    const endung = zaehler === 1 ? "" : `_${zaehler}`;
    const modelName = `${modellVorsatz}${bereinigt(originalName, 64 - modellVorsatz.length - endung.length)}${endung}`;
    const kennung = `mcp/${app.shortName}/${kennungsTeil(originalName, 64 - endung.length)}${endung}`;
    const [belegt] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(appTools)
      .where(
        sql`${appTools.version} = 1 and (${appTools.modelName} = ${modelName} or (${appTools.appId} = ${app.id} and ${appTools.toolKey} = ${kennung}))`,
      );
    if ((belegt?.n ?? 0) === 0) return { modelName, toolKey: kennung as ToolKey };
  }
  throw new PaiBotError("intern");
}

// ---------------------------------------------------------------------------------------------
// Werkzeuge

/** Ein Werkzeug, wie die MCP-Schicht es aus der Liste einer App liefert (schon bereinigt). */
export interface SeenTool {
  originalName: string;
  /** Abdruck der Rohform in voller Länge. */
  toolDigest: Sha256Digest;
  description: string;
  inputSchema: unknown;
  hintReadOnly?: boolean | null;
  hintDestructive?: boolean | null;
}

/** Neueste Fassung je Werkzeug einer App (alle Stände), nach Anlage geordnet. */
export async function currentTools(db: Database, appId: AppId): Promise<AppTool[]> {
  const rows = await db
    .selectDistinctOn([appTools.toolId])
    .from(appTools)
    .where(eq(appTools.appId, appId))
    .orderBy(asc(appTools.toolId), desc(appTools.version));
  return rows.map(toTool).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** Neueste Fassung eines Werkzeugs. */
export async function currentTool(db: Database, toolId: AppToolId): Promise<AppTool | undefined> {
  const [row] = await db
    .select()
    .from(appTools)
    .where(eq(appTools.toolId, toolId))
    .orderBy(desc(appTools.version))
    .limit(1);
  return row === undefined ? undefined : toTool(row);
}

/** Alle Fassungen eines Werkzeugs, älteste zuerst. */
export async function toolHistory(db: Database, toolId: AppToolId): Promise<AppTool[]> {
  const rows = await db
    .select()
    .from(appTools)
    .where(eq(appTools.toolId, toolId))
    .orderBy(asc(appTools.version));
  return rows.map(toTool);
}

/**
 * Das Werkzeug zu einem Modell-Namen (neueste Fassung). Die Zuordnung kommt nur aus der
 * Datenbank, nie aus einer frisch berechneten Liste.
 */
export async function toolByModelName(
  db: Database,
  modelName: string,
): Promise<AppTool | undefined> {
  const [erste] = await db
    .select({ toolId: appTools.toolId })
    .from(appTools)
    .where(and(eq(appTools.modelName, modelName), eq(appTools.version, 1)));
  return erste === undefined ? undefined : currentTool(db, erste.toolId);
}

/**
 * Ergebnis von `sehen`: je Werkzeug die neueste Fassung nach dem Abgleich und was sich geändert
 * hat.
 */
export interface SeenResult {
  tool: AppTool;
  change: "unveraendert" | "neu" | "geaendert" | "entfernt" | "wieder_da";
}

/**
 * Gleicht die vollständige Liste der Werkzeuge einer App (vom Server abgerufen) mit der
 * Datenbank ab und hängt an, was sich geändert hat:
 * - unbekanntes Werkzeug: Fassung 1, „neu“, schreibt, mit einmal vergebenem Namen;
 * - anderer Abdruck bei einem eingestuften oder geänderten Werkzeug: „geändert“;
 * - anderer Abdruck bei einem „neuen“ oder entfernten: „neu“ mit dem neuen Inhalt;
 * - fehlt in der Liste: „entfernt“;
 * - ein entferntes Werkzeug, das wieder in der Liste steht: wieder „neu“.
 * Ein gleicher Abdruck ändert nichts. Bestätigen oder Sperren geht hier nicht.
 */
export async function sehen(
  db: Database,
  appId: AppId,
  seen: readonly SeenTool[],
): Promise<SeenResult[]> {
  return withTransaction(db, async (tx) => {
    const app = await get(tx, appId);
    if (app === undefined || app.state !== "verbunden") {
      throw new PaiBotError("nicht_gefunden");
    }
    const ergebnisse: SeenResult[] = [];
    const bekannt = await currentTools(tx, appId);
    const nachName = new Map(bekannt.map((t) => [t.originalName, t]));
    const gesehen = new Set<string>();
    for (const tool of seen) {
      if (gesehen.has(tool.originalName)) throw feldFehler("originalName");
      gesehen.add(tool.originalName);
      const vorher = nachName.get(tool.originalName);
      const inhalt = {
        toolDigest: tool.toolDigest,
        description: tool.description,
        inputSchema: tool.inputSchema,
        hintReadOnly: tool.hintReadOnly ?? null,
        hintDestructive: tool.hintDestructive ?? null,
      };
      if (vorher === undefined) {
        const namen = await vergebeNamen(tx, app, tool.originalName);
        const [row] = await tx
          .insert(appTools)
          .values({
            toolId: newId("tool"),
            version: 1,
            appId,
            originalName: tool.originalName,
            modelName: namen.modelName,
            toolKey: namen.toolKey,
            ...inhalt,
            status: "neu",
            toolClass: "schreiben",
          })
          .returning();
        if (row === undefined) throw new PaiBotError("intern");
        ergebnisse.push({ tool: toTool(row), change: "neu" });
        continue;
      }
      if (vorher.toolDigest === tool.toolDigest && vorher.status !== "entfernt") {
        ergebnisse.push({ tool: vorher, change: "unveraendert" });
        continue;
      }
      const gleich = vorher.toolDigest === tool.toolDigest;
      const status: AppToolRow["status"] = gleich
        ? "neu"
        : ["bestaetigt", "gesperrt", "geaendert"].includes(vorher.status)
          ? "geaendert"
          : "neu";
      const [row] = await tx
        .insert(appTools)
        .values({
          toolId: vorher.toolId,
          version: vorher.version + 1,
          appId,
          originalName: vorher.originalName,
          modelName: vorher.modelName,
          toolKey: vorher.toolKey,
          ...(gleich
            ? {
                toolDigest: vorher.toolDigest,
                description: vorher.description,
                inputSchema: vorher.inputSchema,
                hintReadOnly: vorher.hintReadOnly,
                hintDestructive: vorher.hintDestructive,
              }
            : inhalt),
          status,
          toolClass: "schreiben",
        })
        .returning();
      if (row === undefined) throw new PaiBotError("intern");
      ergebnisse.push({
        tool: toTool(row),
        change: vorher.status === "entfernt" ? "wieder_da" : "geaendert",
      });
    }
    for (const vorher of bekannt) {
      if (gesehen.has(vorher.originalName) || vorher.status === "entfernt") continue;
      const [row] = await tx
        .insert(appTools)
        .values({
          toolId: vorher.toolId,
          version: vorher.version + 1,
          appId,
          originalName: vorher.originalName,
          modelName: vorher.modelName,
          toolKey: vorher.toolKey,
          toolDigest: vorher.toolDigest,
          description: vorher.description,
          inputSchema: vorher.inputSchema,
          hintReadOnly: vorher.hintReadOnly,
          hintDestructive: vorher.hintDestructive,
          status: "entfernt",
          toolClass: "schreiben",
        })
        .returning();
      if (row === undefined) throw new PaiBotError("intern");
      ergebnisse.push({ tool: toTool(row), change: "entfernt" });
    }
    return ergebnisse;
  });
}

export interface ToolClassify {
  toolId: AppToolId;
  /** `lesen` oder `schreiben` bestätigt das Werkzeug, `gesperrt` sperrt es. */
  toolClass: AppToolClass;
  /** Kennung der Entscheidung des Besitzers (`app.werkzeuge_bestaetigen`, erlaubt). */
  actionId: ActionId;
  /** Abdruck, den der Besitzer gesehen hat (aus seiner Anfrage). */
  seenDigest: Sha256Digest;
  /** Abdruck des Ziels (App und Adresse), an den die Einstufung gebunden ist. */
  targetDigest: Sha256Digest;
}

/**
 * Stuft die gespeicherte neueste Fassung eines Werkzeugs ein (bestätigt als „liest“ oder
 * „schreibt“, oder gesperrt). Die Datenbank lehnt ab, wenn es keine passende Entscheidung des
 * Besitzers im Beleg-Protokoll gibt, wenn der gesehene Abdruck nicht der gespeicherte ist oder
 * wenn das Ziel nicht zur jetzigen Adresse der App passt.
 */
export async function einstufen(db: Database, input: ToolClassify): Promise<AppTool> {
  return withTransaction(db, async (tx) => {
    const vorher = await currentTool(tx, input.toolId);
    if (vorher === undefined) throw new PaiBotError("nicht_gefunden");
    const [row] = await uebersetzen(
      () =>
        tx
          .insert(appTools)
          .values({
            toolId: vorher.toolId,
            version: vorher.version + 1,
            appId: vorher.appId,
            originalName: vorher.originalName,
            modelName: vorher.modelName,
            toolKey: vorher.toolKey,
            toolDigest: vorher.toolDigest,
            description: vorher.description,
            inputSchema: vorher.inputSchema,
            hintReadOnly: vorher.hintReadOnly,
            hintDestructive: vorher.hintDestructive,
            status: input.toolClass === "gesperrt" ? "gesperrt" : "bestaetigt",
            toolClass: input.toolClass,
            actionId: input.actionId,
            seenDigest: input.seenDigest,
            targetDigest: input.targetDigest,
          })
          .returning(),
      standardFehler,
    );
    if (row === undefined) throw new PaiBotError("intern");
    return toTool(row);
  });
}

/** Ein bestätigtes Werkzeug mit unverändertem Abdruck, mit dem Abdruck seiner Bestätigung. */
export interface ConfirmedTool {
  tool: AppTool;
  /** Abdruck der bestätigten Fassung (Fakt `confirmedToolDigest`). */
  confirmedToolDigest: Sha256Digest;
  /** Abdruck des Ziels der Bestätigung (Fakt `confirmedTargetDigest`). */
  confirmedTargetDigest: Sha256Digest;
}

/**
 * Das Werkzeug mit diesem Modell-Namen, aber nur, wenn seine neueste Fassung „bestätigt“ ist,
 * ihr Abdruck dem übergebenen entspricht (dem der beim Start abgerufenen Liste) und die App
 * verbunden ist. Sonst `undefined`.
 */
export async function confirmedTool(
  db: Database,
  input: { modelName: string; toolDigest: Sha256Digest },
): Promise<ConfirmedTool | undefined> {
  const tool = await toolByModelName(db, input.modelName);
  if (
    tool === undefined ||
    tool.status !== "bestaetigt" ||
    tool.toolDigest !== input.toolDigest ||
    tool.targetDigest === null
  ) {
    return undefined;
  }
  const app = await get(db, tool.appId);
  if (app === undefined || app.state !== "verbunden") return undefined;
  return {
    tool,
    confirmedToolDigest: tool.toolDigest,
    confirmedTargetDigest: tool.targetDigest,
  };
}

// ---------------------------------------------------------------------------------------------
// Zugriff der Bots

export interface AccessSet {
  appId: AppId;
  botId: BotId;
  access: AppAccessLevel;
  /** Kennung der Entscheidung des Besitzers (`app.zugriff_setzen`, erlaubt). */
  actionId: ActionId;
}

/** Setzt den Zugriff eines Bots auf eine verbundene App (hängt eine Zeile an). */
export async function setAccess(db: Database, input: AccessSet): Promise<void> {
  await withTransaction(db, async (tx) => {
    // Die Zeile der App wird gesperrt (`for share`), bis die Transaktion endet: Trennt eine andere
    // Verbindung die App gleichzeitig, wartet sie, und die neue Zeile gehört sicher zu einer
    // Verbindung, die noch galt. Ohne die Sperre könnte sie nach dem Lesen trennen (und neu
    // verbinden), und die Zugriffs-Zeile entstünde für eine schon beendete Verbindung.
    const [zeile] = await tx.select().from(apps).where(eq(apps.id, input.appId)).for("share");
    const app = zeile === undefined ? undefined : toApp(zeile);
    if (app === undefined || app.state !== "verbunden") throw new PaiBotError("nicht_gefunden");
    await uebersetzen(
      () =>
        tx.insert(botAppGrants).values({
          appId: input.appId,
          botId: input.botId,
          access: input.access,
          connectionNo: app.connectionNo,
          actionId: input.actionId,
        }),
      standardFehler,
    );
  });
}

/**
 * Der Zugriff, der jetzt gilt: die letzte Zeile des Bots für die jetzige Verbindung der App.
 * `keiner`, wenn es keine gibt, die App getrennt ist oder ihr der Zugang fehlt (Anmeldung mit
 * Token ohne Token).
 */
export async function currentAccess(
  db: Database,
  appId: AppId,
  botId: BotId,
): Promise<AppAccessLevel> {
  const [app] = await db.select().from(apps).where(eq(apps.id, appId));
  if (
    app === undefined ||
    app.state !== "verbunden" ||
    (app.authKind === "token" && app.tokenEnc === null)
  ) {
    return "keiner";
  }
  const [zeile] = await db
    .select({ access: botAppGrants.access })
    .from(botAppGrants)
    .where(
      and(
        eq(botAppGrants.appId, appId),
        eq(botAppGrants.botId, botId),
        eq(botAppGrants.connectionNo, app.connectionNo),
      ),
    )
    .orderBy(desc(botAppGrants.seq))
    .limit(1);
  return zeile?.access ?? "keiner";
}

/** Die Apps, auf die der Bot jetzt lesen darf. */
export async function readableApps(db: Database, botId: BotId): Promise<AppId[]> {
  const verbundene = await db.select().from(apps).where(eq(apps.state, "verbunden"));
  const ergebnis: AppId[] = [];
  for (const app of verbundene) {
    if ((await currentAccess(db, app.id, botId)) === "lesen") ergebnis.push(app.id);
  }
  return ergebnis;
}

/** Kennungen der Apps aus einer Liste, die noch verbunden sind. */
export async function connectedIds(db: Database, ids: readonly AppId[]): Promise<AppId[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: apps.id })
    .from(apps)
    .where(and(inArray(apps.id, [...ids]), eq(apps.state, "verbunden")));
  return rows.map((r) => r.id);
}
