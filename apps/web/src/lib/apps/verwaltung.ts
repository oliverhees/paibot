/**
 * PaiBot – Verwaltung der Apps in der Web-App: verbinden, Werkzeuge abrufen und bestätigen, Zugriff
 * der Bots setzen, trennen. Jede verändernde Route geht durch das Tor (Entscheidung und Ergebnis),
 * die Adresse wird vor jeder Verbindung geprüft, und ein Token steht in keiner Antwort, keinem
 * Beleg und keinem Fehlertext. Die Web-App ruft nur `tools/list`, nie ein Werkzeug auf.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { type Database, repo } from "@paibot/db";
import { PaiBotError } from "@paibot/shared/fehler";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import { type AppId, type AppToolId, type BotId, isId, newId } from "@paibot/shared/ids";
import type { RoutenKontext } from "../api/route";
import { type AbgleichErgebnis, abgleichen, listeAbrufen } from "./abgleich";
import { zielAus } from "./adresse";
import { appAnsicht, werkzeugAnsicht } from "./anzeige";
import { appDienste } from "./dienste";
import { fehlerOhneFremdtext, pruefbedingungAlsFeld } from "./fehler";
import { mitSperrzeit } from "./sperre";
import { tokenLesen, tokenPruefen, tokenVerschluesseln } from "./token";

type App = repo.apps.App;

function abgleichAnsicht(a: AbgleichErgebnis) {
  return {
    werkzeuge: a.werkzeuge.map(werkzeugAnsicht),
    nichtPruefbar: a.nichtPruefbar,
    abgeschnitten: a.abgeschnitten,
  };
}

/** Die App aus dem Pfad; unbekannte Kennung oder App → `nicht_gefunden`. */
async function appVon(db: Database, id: string | undefined): Promise<App> {
  if (!isId("app", id)) throw new PaiBotError("nicht_gefunden");
  const app = await repo.apps.get(db, id);
  if (app === undefined) throw new PaiBotError("nicht_gefunden");
  return app;
}

/** Eingabefehler für ein einzelnes Feld (etwa ein belegter Kurzname). */
function feldFehler(feld: string): PaiBotError {
  return new PaiBotError("eingabe_ungueltig", { felder: [{ feld, code: "ungueltig" }] });
}

function verbunden(app: App): App {
  if (app.state !== "verbunden") throw new PaiBotError("nicht_gefunden");
  return app;
}

/** Kurzname aus dem Namen des Hosts: nur `a-z`, `0-9` und `-`, höchstens 28 Zeichen. */
function kurznameAus(host: string): string {
  const text = host
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28)
    .replace(/-+$/g, "");
  return text === "" ? "app" : text;
}

async function freierKurzname(db: Database, wunsch: string | undefined, host: string) {
  const belegt = new Set((await repo.apps.list(db)).map((a) => a.shortName));
  if (wunsch !== undefined) {
    if (belegt.has(wunsch)) throw feldFehler("kurzname");
    return wunsch;
  }
  const basis = kurznameAus(host);
  if (!belegt.has(basis)) return basis;
  for (let zaehler = 2; zaehler < 1000; zaehler++) {
    const kandidat = `${basis.slice(0, 28)}-${zaehler}`;
    if (!belegt.has(kandidat)) return kandidat;
  }
  throw feldFehler("kurzname");
}

/** `GET /api/apps`: Apps ohne Token, mit dem Zugriff jedes Bots. */
export async function appsListe(k: RoutenKontext<"appsListe">) {
  const bots = await repo.bots.list(k.db);
  const apps = [];
  for (const app of await repo.apps.list(k.db)) {
    const zugriff = [];
    for (const bot of bots) {
      zugriff.push({
        botId: bot.id,
        name: bot.name,
        zugriff: await repo.apps.currentAccess(k.db, app.id, bot.id as BotId),
      });
    }
    apps.push({ ...appAnsicht(app), zugriff });
  }
  return { daten: { apps } };
}

/**
 * `POST /api/apps`: verbindet eine App. Die Adresse wird vor jeder Verbindung geprüft (das Tor
 * lehnt `http`, IP-Adressen, interne Namen, fremde Ports und Zusätze in der Adresse ab). Erst nach
 * der Erlaubnis geht die Anfrage `tools/list` hinaus; scheitert sie, bleibt nichts gespeichert.
 */
export async function appVerbinden(k: RoutenKontext<"appVerbinden">) {
  const eingabe = k.eingabe;
  const appId = newId("app") as AppId;
  const ziel = zielAus(eingabe.url, appId);
  const token = eingabe.token;
  if (token !== undefined) tokenPruefen(token);
  const host = new URL(ziel.origin).hostname;
  const kurzname = await freierKurzname(k.db, eingabe.kurzname, host);
  const name = eingabe.name ?? host;
  const anmeldung = token === undefined ? "keine" : "token";
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "app.verbinden", target: { appId } },
    {
      created: true,
      authKind: anmeldung,
      tokenSet: token !== undefined,
      targetOrigin: ziel.origin,
      targetDigest: ziel.digest,
      ...ziel.fakten,
    },
    async () => {
      try {
        const abruf = await appDienste().werkzeugeAbrufen({
          adresse: ziel.url,
          appKurzname: kurzname,
          bekannteNamen: new Map(),
          ...(token === undefined ? {} : { token }),
        });
        const gespeichert = await repo.withTransaction(k.db, async (tx) => {
          // Erst `apps`, dann `app_tools`, nie umgekehrt; die Anfrage nach draußen ist schon vorbei.
          const app = await repo.apps
            .create(tx, {
              id: appId,
              shortName: kurzname,
              name,
              url: ziel.url,
              authKind: anmeldung,
              ...(token === undefined
                ? {}
                : { tokenEnc: tokenVerschluesseln(k.dienste, appId, ziel.url, token) }),
            })
            .catch((fehler: unknown) => {
              throw pruefbedingungAlsFeld(fehler, "url");
            });
          return { app, abgleich: await abgleichen(tx, appId, abruf) };
        });
        return { value: gespeichert, result: { status: "ok" } };
      } catch (fehler) {
        throw fehlerOhneFremdtext(fehler);
      }
    },
  );
  const { app, abgleich } = ergebnis.value;
  return { daten: { app: appAnsicht(app), ...abgleichAnsicht(abgleich) }, status: 201 };
}

/** `GET /api/apps/:id/werkzeuge`: gespeicherte Werkzeuge mit dem Text, der ans Modell geht. */
export async function appWerkzeuge(k: RoutenKontext<"appWerkzeuge">) {
  const app = await appVon(k.db, k.params.id);
  const werkzeuge = await repo.apps.currentTools(k.db, app.id);
  return { daten: { app: appAnsicht(app), werkzeuge: werkzeuge.map(werkzeugAnsicht) } };
}

/**
 * `POST /api/apps/:id/werkzeuge`: erneut testen. Holt die Liste neu (nur `tools/list`) und gleicht
 * sie mit den gespeicherten Fassungen ab: neu, geändert, entfernt.
 */
export async function appWerkzeugeAbrufen(k: RoutenKontext<"appWerkzeugeAbrufen">) {
  const app = verbunden(await appVon(k.db, k.params.id));
  const ziel = zielAus(app.url, app.id);
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "app.verbinden", target: { appId: app.id } },
    {
      created: false,
      authKind: app.authKind,
      tokenSet: app.tokenSet,
      targetOrigin: ziel.origin,
      targetDigest: ziel.digest,
      ...ziel.fakten,
    },
    async () => {
      try {
        const enc = await repo.apps.getTokenEnc(k.db, app.id);
        const token =
          app.authKind === "token" && enc !== undefined
            ? tokenLesen(k.dienste, app.id, app.url, enc)
            : undefined;
        const abruf = await listeAbrufen(k.db, app, {
          adresse: app.url,
          ...(token === undefined ? {} : { token }),
        });
        return { value: await abgleichen(k.db, app.id, abruf), result: { status: "ok" } };
      } catch (fehler) {
        throw fehlerOhneFremdtext(fehler);
      }
    },
  );
  return { daten: { app: appAnsicht(app), ...abgleichAnsicht(ergebnis.value) } };
}

/**
 * `PUT /api/apps/:id/werkzeuge/:werkzeug`: stuft ein Werkzeug ein. Der Besitzer bestätigt den
 * Abdruck, den er gesehen hat (aus seiner Anfrage); das Tor lehnt ab, wenn er nicht der
 * gespeicherte ist.
 */
export async function appWerkzeugBestaetigen(k: RoutenKontext<"appWerkzeugBestaetigen">) {
  const app = verbunden(await appVon(k.db, k.params.id));
  if (!isId("tool", k.params.werkzeug)) throw new PaiBotError("nicht_gefunden");
  const toolId: AppToolId = k.params.werkzeug;
  const tool = await repo.apps.currentTool(k.db, toolId);
  if (tool === undefined || tool.appId !== app.id) throw new PaiBotError("nicht_gefunden");
  const ziel = zielAus(app.url, app.id);
  const gesehen = k.eingabe.gesehenerAbdruck as Sha256Digest;
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "app.werkzeuge_bestaetigen", target: { appId: app.id, toolId } },
    {
      toolClass: k.eingabe.klasse,
      toolVersion: tool.version,
      toolDigest: tool.toolDigest,
      seenToolDigest: gesehen,
      toolStatus: tool.status,
      targetDigest: ziel.digest,
    },
    async (permit) => {
      try {
        const neu = await repo.apps.einstufen(k.db, {
          toolId,
          toolClass: k.eingabe.klasse,
          actionId: permit.actionId,
          seenDigest: gesehen,
          targetDigest: ziel.digest,
        });
        return { value: neu, result: { status: "ok" } };
      } catch (fehler) {
        throw fehlerOhneFremdtext(fehler);
      }
    },
  );
  return { daten: { werkzeug: werkzeugAnsicht(ergebnis.value) } };
}

/**
 * `PUT /api/apps/:id/zugriff/:bot`: setzt den Zugriff eines Bots. Entscheidung und Zeile entstehen
 * in einer Transaktion: Eine Entscheidung ohne Zeile bleibt nicht übrig und gilt nach einem
 * erneuten Verbinden nie mehr.
 */
export async function appZugriffSetzen(k: RoutenKontext<"appZugriffSetzen">) {
  const app = verbunden(await appVon(k.db, k.params.id));
  if (!isId("bot", k.params.bot)) throw new PaiBotError("nicht_gefunden");
  const botId: BotId = k.params.bot;
  if ((await repo.bots.get(k.db, botId)) === undefined) throw new PaiBotError("nicht_gefunden");
  const vorher = await repo.apps.currentAccess(k.db, app.id, botId);
  const zugriff = k.eingabe.zugriff;
  await repo.withTransaction(k.db, (tx) =>
    k.tor(
      k.nachweis,
      { type: "app.zugriff_setzen", target: { appId: app.id, botId } },
      { access: zugriff, previousAccess: vorher },
      async (permit) => {
        try {
          await repo.apps.setAccess(tx, {
            appId: app.id,
            botId,
            access: zugriff,
            actionId: permit.actionId,
          });
          return { value: undefined, result: { status: "ok" } };
        } catch (fehler) {
          throw fehlerOhneFremdtext(fehler);
        }
      },
      { db: tx },
    ),
  );
  return { daten: { appId: app.id, botId, zugriff } };
}

/** `DELETE /api/apps/:id`: trennt die App; der Token wird gelöscht. */
export async function appTrennen(k: RoutenKontext<"appTrennen">) {
  const app = verbunden(await appVon(k.db, k.params.id));
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "app.trennen", target: { appId: app.id } },
    { tokenSet: app.tokenSet },
    async () => {
      try {
        // Höchstens `SPERR_WARTEZEIT_MS` auf einen laufenden Abgleich warten, nicht ohne Ende.
        const getrennt = await mitSperrzeit(k.db, (tx) => repo.apps.disconnect(tx, app.id));
        if (getrennt === undefined) throw new PaiBotError("nicht_gefunden");
        return { value: getrennt, result: { status: "ok" } };
      } catch (fehler) {
        throw fehlerOhneFremdtext(fehler);
      }
    },
  );
  return { daten: { app: appAnsicht(ergebnis.value) } };
}
