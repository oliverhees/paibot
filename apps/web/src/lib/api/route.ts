/**
 * PaiBot – Rahmen für API-Routen: erzwingt die Reihenfolge Methode → Einrichtung → Sitzung →
 * CSRF → Limits → Eingabe → Tor und die Antwort-Hülle `{ ok, daten | fehler }`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type Database, repo } from "@paibot/db";
import type { Execute, GateRunResult } from "@paibot/gate";
import type { ReceiptKeys } from "@paibot/receipts";
import type {
  ActionTarget,
  ActionType,
  ActorKindOf,
  Credential,
  Facts,
} from "@paibot/shared/aktionen";
import { apiErrorFrom, errorBody, okBody } from "@paibot/shared/api";
import { invalidInput, isPaiBotError, PaiBotError } from "@paibot/shared/fehler";
import { newId } from "@paibot/shared/ids";
import { t } from "@paibot/shared/texte";
import type { z } from "zod";
import {
  istVeraendernd,
  pruefeHerkunft,
  pruefePruefzeichen,
  pruefzeichenSitzung,
  pruefzeichenVorab,
  pruefzeichenZuCookie,
} from "../csrf";
import { torAuf } from "../gate";
import { clientAdresse } from "../kopfzeilen";
import { type LimitBezug, type LimitName, setzeLimitZurueck, zaehleLimits } from "../rate-limit";
import {
  API_ROUTEN,
  GROESSTER_KOERPER_BYTES,
  koerperGrenze,
  type RoutenDefinition,
  type RoutenName,
} from "../routen";
import { prozessDienste, type ZugangsDienste } from "../zugang/dienste";
import { bekanntesGeraet, geraetCookieName } from "../zugang/geraet";
import {
  type GepruefteSitzung,
  istNachweis,
  type Nachweis,
  nachweisAusSitzung,
} from "../zugang/nachweis";
import {
  cookieLesen,
  cookieLoeschen,
  sitzungBeenden,
  sitzungPruefen,
  sitzungsCookieName,
  vorabCookieName,
} from "../zugang/sitzung";

/** Aktionen, die der Besitzer auslöst (nur diese gehen über Routen). */
export type BesitzerAktion = {
  [T in ActionType]: ActorKindOf<T> extends "besitzer" ? T : never;
}[ActionType];

type Def<N extends RoutenName> = (typeof API_ROUTEN)[N];

/** Geprüfte Eingabe einer Route (Körper bzw. bei GET die Abfrage); ohne Schema `undefined`. */
export type RoutenEingabe<N extends RoutenName> =
  Def<N> extends { eingabe: infer S } ? (S extends z.ZodType ? z.output<S> : undefined) : undefined;

/** Sitzung im Kontext: bei Zugang `besitzer` immer vorhanden. */
type KontextSitzung<N extends RoutenName> =
  Def<N> extends { zugang: "besitzer" } ? GepruefteSitzung : GepruefteSitzung | undefined;

export interface TorOptionen {
  /** Andere Datenbank bzw. Transaktion für Regeln und Belege (Standard: die des Prozesses). */
  db?: Database;
  /** Andere Signaturschlüssel (nur die Einrichtung, deren Schlüssel noch in der Transaktion liegt). */
  schluessel?: ReceiptKeys;
}

export interface RoutenKontext<N extends RoutenName> {
  name: N;
  request: Request;
  params: Readonly<Record<string, string>>;
  eingabe: RoutenEingabe<N>;
  db: Database;
  dienste: ZugangsDienste;
  /** Adresse des Clients (nur über `clientAdresse`, `TRUST_PROXY` beachtet). */
  adresse: string;
  sitzung: KontextSitzung<N>;
  /** Nachweis „Sitzung“ bei Zugang `besitzer`. */
  nachweis: Def<N> extends { zugang: "besitzer" } ? Nachweis : Nachweis | undefined;
  /** Hängt eine `Set-Cookie`-Zeile an die Antwort. */
  cookie(setCookie: string): void;
  /** Setzt ein Limit dieser Anfrage zurück (z. B. nach richtigem Passwort). */
  limitZuruecksetzen(name: LimitName): Promise<void>;
  /**
   * Führt eine Aktion über das Tor aus. Akteur ist der Besitzer, `credential` setzt der Rahmen aus
   * dem Nachweis (nie aus der Eingabe), ebenso `device` (das Gerät der Sitzung bzw. das bekannte
   * Gerät der Anmeldung, falls es eins gibt). Die Aktion der Route verlangt den Nachweis laut
   * Routen-Vertrag, jede weitere Aktion einen Nachweis „Sitzung“.
   */
  tor<T extends BesitzerAktion, R>(
    nachweis: Nachweis,
    aktion: { type: T; target: ActionTarget<T> },
    fakten: Omit<Facts<T>, "credential" | "device">,
    ausfuehren: Execute<T, R>,
    optionen?: TorOptionen,
  ): Promise<GateRunResult<R>>;
}

/**
 * Datei-Antwort einer Route mit `antwort: "download"`: Name (nur Buchstaben, Ziffern, `.`, `_`,
 * `-`), Inhaltstyp und Inhalt. `kopf` trägt zusätzliche Angaben, nur Kopfzeilen `X-Pb-…`.
 */
export interface RoutenDatei {
  name: string;
  typ: string;
  inhalt: string;
  kopf?: Record<`X-Pb-${string}`, string>;
}

/**
 * Was eine Route zurückgibt: der Inhalt von `daten` und optional ein anderer Status. Routen mit
 * `antwort: "download"` geben statt `daten` eine `datei` zurück.
 */
export type RoutenErgebnis =
  | { daten: unknown; status?: number; datei?: undefined }
  | { datei: RoutenDatei; daten?: undefined; status?: undefined };

const DATEINAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const INHALTSTYP = /^[a-z]+\/[a-z0-9.+-]+$/;
const ZUSATZ_KOPF = /^X-Pb-[A-Za-z0-9-]{1,40}$/;

/**
 * Antwort mit einer Datei: zum Speichern (`attachment`), nie zum Anzeigen; Typ fest und ohne
 * Raten durch den Browser, nicht im Speicher von Zwischenstationen, die Datei selbst darf nichts
 * laden oder ausführen.
 */
export function dateiAntwort(datei: RoutenDatei, cookies: readonly string[] = []): Response {
  if (!DATEINAME.test(datei.name) || !INHALTSTYP.test(datei.typ)) {
    throw new PaiBotError("intern");
  }
  const kopf = new Headers({
    ...OHNE_SPEICHERN,
    "Content-Type": datei.typ.startsWith("text/") ? `${datei.typ}; charset=utf-8` : datei.typ,
    "Content-Disposition": `attachment; filename="${datei.name}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  for (const [name, wert] of Object.entries(datei.kopf ?? {})) {
    if (!ZUSATZ_KOPF.test(name) || /[\r\n]/.test(wert)) throw new PaiBotError("intern");
    kopf.set(name, wert);
  }
  for (const zeile of cookies) kopf.append("Set-Cookie", zeile);
  return new Response(datei.inhalt, { status: 200, headers: kopf });
}

export type RoutenAktion<N extends RoutenName> = (
  kontext: RoutenKontext<N>,
) => Promise<RoutenErgebnis>;

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string | string[]>> },
) => Promise<Response>;

/** Markierung an jeder Handler-Funktion, die über den Rahmen läuft (für Tests). */
export const RAHMEN = Symbol.for("paibot.web.routen-rahmen");

/** Größter erlaubter JSON-Körper in Byte (die größte Grenze einer Route). */
export const MAX_KOERPER_BYTES = GROESSTER_KOERPER_BYTES;

const OHNE_SPEICHERN = { "Cache-Control": "no-store" } as const;

function nachweisDerRoute(def: RoutenDefinition): Credential | undefined {
  if (def.nachweis !== undefined) return def.nachweis;
  return def.zugang === "besitzer" ? "sitzung" : undefined;
}

function zuGross(): PaiBotError {
  return new PaiBotError("eingabe_ungueltig", { felder: [{ feld: "eingabe", code: "zu_gross" }] });
}

/** Höchstens so viele Körper liest der Rahmen gleichzeitig; weitere Anfragen warten nicht. */
export const GLEICHZEITIGE_KOERPER = 32;

const LESEND = Symbol.for("paibot.web.koerper-lesend");

function lesend(): { n: number } {
  const halter = globalThis as { [LESEND]?: { n: number } };
  halter[LESEND] ??= { n: 0 };
  return halter[LESEND];
}

/**
 * Liest den Körper höchstens bis `grenze` Byte. Lesen schon `GLEICHZEITIGE_KOERPER` andere
 * Anfragen ihren Körper, antwortet es sofort mit `zu_viele_versuche` (kurze Wartezeit). Eine angegebene Länge über der Grenze lehnt es ab,
 * bevor ein Byte gelesen ist; sonst bricht es ab, sobald mehr ankommt. So liegt nie mehr als die
 * Grenze im Speicher, auch wenn die Länge fehlt oder nicht stimmt.
 */
export async function koerperText(request: Request, grenze: number): Promise<string> {
  const laenge = request.headers.get("content-length");
  if (laenge !== null && (!/^\d{1,15}$/.test(laenge.trim()) || Number(laenge) > grenze)) {
    throw zuGross();
  }
  if (request.body === null) return "";
  const zaehler = lesend();
  if (zaehler.n >= GLEICHZEITIGE_KOERPER) {
    throw new PaiBotError("zu_viele_versuche", {
      text: t("anfrage.zu_viele_gleichzeitig"),
      retryAfterSeconds: 2,
    });
  }
  zaehler.n += 1;
  const leser = request.body.getReader();
  const teile: Uint8Array[] = [];
  let summe = 0;
  try {
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      summe += value.byteLength;
      if (summe > grenze) {
        await leser.cancel().catch(() => undefined);
        throw zuGross();
      }
      teile.push(value);
    }
  } finally {
    zaehler.n -= 1;
  }
  const alles = new Uint8Array(summe);
  let stelle = 0;
  for (const teil of teile) {
    alles.set(teil, stelle);
    stelle += teil.byteLength;
  }
  return new TextDecoder().decode(alles);
}

async function koerperLesen(request: Request, grenze: number): Promise<unknown> {
  const text = await koerperText(request, grenze);
  if (text.trim() === "") return undefined;
  const art = request.headers.get("content-type") ?? "";
  if (!art.toLowerCase().startsWith("application/json")) {
    throw new PaiBotError("eingabe_ungueltig", { felder: [{ feld: "eingabe", code: "format" }] });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new PaiBotError("eingabe_ungueltig", { felder: [{ feld: "eingabe", code: "format" }] });
  }
}

function antwortFehler(error: unknown, cookies: readonly string[] = []): Response {
  const { status, headers, body } = apiErrorFrom(error);
  const kopf = new Headers({ ...OHNE_SPEICHERN, ...headers });
  for (const zeile of cookies) kopf.append("Set-Cookie", zeile);
  return Response.json(body, { status, headers: kopf });
}

/**
 * Baut den Rahmen mit den angegebenen Diensten. `route` (unten) nutzt die Dienste des Prozesses;
 * Tests bauen sich einen eigenen Rahmen mit einer Test-Datenbank.
 */
export function erstelleRahmen(dienste: () => ZugangsDienste) {
  return function routeMitDiensten<N extends RoutenName>(
    name: N,
    aktion: RoutenAktion<N>,
  ): Handler {
    const def: RoutenDefinition = API_ROUTEN[name];
    const handler: Handler = async (request, context) => {
      const cookies: string[] = [];
      try {
        const d = dienste();
        // 1. Methode
        if (request.method.toUpperCase() !== def.methode) {
          return Response.json(errorBody("nicht_gefunden"), {
            status: 405,
            headers: { ...OHNE_SPEICHERN, Allow: def.methode },
          });
        }
        const db = d.db();
        const now = d.uhr.now();

        // 2. Nur bis zum Ende der Einrichtung
        if (def.nurVorEinrichtung && (await repo.settings.isSetupComplete(db))) {
          throw new PaiBotError("einrichtung_fertig");
        }

        // 3. Sitzung
        const kopf = request.headers;
        const appUrl = d.appOrigin();
        const cookieKopf = kopf.get("cookie");
        const sitzungsWert = cookieLesen(cookieKopf, sitzungsCookieName({ appUrl }));
        let sitzung: GepruefteSitzung | undefined;
        if (def.zugang === "besitzer") {
          sitzung = await sitzungPruefen(db, sitzungsWert, now);
          if (sitzung === undefined) throw new PaiBotError("nicht_angemeldet");
        }

        // 4. CSRF bei jeder verändernden Methode
        if (istVeraendernd(request.method)) {
          if (pruefeHerkunft(kopf, appUrl) !== "ok") throw new PaiBotError("herkunft_falsch");
          const schluessel = d.schluessel().sitzung;
          const erlaubt: (string | undefined)[] = [];
          if (sitzung !== undefined) {
            erlaubt.push(pruefzeichenSitzung(schluessel, sitzung.id));
          } else if (def.zugang === "vorab") {
            const vorab = cookieLesen(cookieKopf, vorabCookieName({ appUrl }));
            if (vorab !== undefined) erlaubt.push(pruefzeichenVorab(schluessel, vorab));
            if (sitzungsWert !== undefined) {
              erlaubt.push(pruefzeichenZuCookie(schluessel, sitzungsWert));
            }
          }
          if (pruefePruefzeichen(kopf, erlaubt) !== "ok") {
            throw new PaiBotError("pruefzeichen_fehlt");
          }
        }

        // 5. Limits, vor jeder weiteren Arbeit
        const adresse = clientAdresse({
          weiterleitung: kopf.get("x-forwarded-for"),
          vertrauteProxy: d.hinterProxy(),
        });
        // Ein bekanntes Gerät zählt nur beim Anmelden (eigene Limits statt Adresse und Bremse).
        const geraet = def.limits?.includes("anmeldenGesamt")
          ? await bekanntesGeraet(
              db,
              d.schluessel().sitzung,
              cookieLesen(cookieKopf, geraetCookieName({ appUrl })),
              now,
            )
          : undefined;
        const bezug: LimitBezug = {
          adresse,
          ...(sitzung === undefined ? {} : { ownerId: sitzung.ownerId, sitzungId: sitzung.id }),
          ...(geraet === undefined ? {} : { geraet: geraet.id }),
        };
        if (def.limits !== undefined && def.limits.length > 0) {
          try {
            await zaehleLimits(db, def.limits, bezug, { now, warten: d.warten });
          } catch (error) {
            if (
              def.beiLimitAbmelden === true &&
              sitzung !== undefined &&
              isPaiBotError(error) &&
              error.code === "zu_viele_versuche"
            ) {
              await sitzungBeenden(db, sitzung);
              cookies.push(cookieLoeschen(sitzungsCookieName({ appUrl }), { appUrl }, "Lax"));
            }
            throw error;
          }
        }

        // 6. Eingabe mit Zod
        let eingabe: unknown;
        if (def.eingabe !== undefined) {
          const roh =
            def.methode === "GET"
              ? Object.fromEntries(new URL(request.url).searchParams)
              : await koerperLesen(request, koerperGrenze(def));
          const geprueft = def.eingabe.safeParse(roh ?? {});
          if (!geprueft.success) throw invalidInput(geprueft.error, roh);
          eingabe = geprueft.data;
        }

        const rohParameter = await context.params;
        const params: Record<string, string> = {};
        for (const [schluessel, wert] of Object.entries(rohParameter ?? {})) {
          params[schluessel] = Array.isArray(wert) ? wert.join("/") : wert;
        }

        // 7. Aktion; jede verändernde Route mit Aktion muss durch das Tor
        const gelaufen = new Set<ActionType>();
        const routenNachweis = nachweisDerRoute(def);
        const kontext: RoutenKontext<RoutenName> = {
          name,
          request,
          params,
          eingabe: eingabe as never,
          db,
          dienste: d,
          adresse,
          sitzung: sitzung as never,
          nachweis: (sitzung === undefined ? undefined : nachweisAusSitzung(sitzung)) as never,
          cookie: (zeile) => {
            cookies.push(zeile);
          },
          limitZuruecksetzen: (limit) => setzeLimitZurueck(db, limit, bezug),
          tor: async (nachweis, anfrage, fakten, ausfuehren, optionen = {}) => {
            if (!istNachweis(nachweis)) throw new PaiBotError("intern");
            if (Object.hasOwn(fakten as object, "credential")) throw new PaiBotError("intern");
            if (Object.hasOwn(fakten as object, "device")) throw new PaiBotError("intern");
            const verlangt = anfrage.type === def.aktion ? routenNachweis : "sitzung";
            if (nachweis.art !== verlangt) throw new PaiBotError("intern");
            // Gerät, von dem die Aktion kommt: aus dem Nachweis bzw. aus der Sitzung, nie aus der Eingabe.
            const geraet =
              nachweis.geraet ??
              (nachweis.sitzung === undefined
                ? undefined
                : await repo.sessions.deviceOf(optionen.db ?? db, nachweis.sitzung.id));
            const tor = torAuf(
              optionen.db ?? db,
              optionen.schluessel ?? d.belegSchluessel(),
              d.uhr,
            );
            const ergebnis = await tor.run(
              {
                actionId: newId("action"),
                type: anfrage.type,
                actor: "besitzer",
                target: anfrage.target,
              } as never,
              {
                ...fakten,
                credential: nachweis.art,
                ...(geraet === undefined ? {} : { device: geraet }),
              } as never,
              ausfuehren as never,
            );
            gelaufen.add(anfrage.type);
            return ergebnis as never;
          },
        };
        const ergebnis = await (aktion as RoutenAktion<RoutenName>)(kontext);
        if (def.aktion !== undefined && !gelaufen.has(def.aktion)) {
          d.log.error(`Route ${name}: Aktion ${def.aktion} lief nicht durch das Tor.`);
          throw new PaiBotError("intern");
        }
        // Datei-Antwort genau dann, wenn der Vertrag sie vorsieht.
        if ((def.antwort === "download") !== (ergebnis.datei !== undefined)) {
          d.log.error(`Route ${name}: Antwort passt nicht zum Vertrag (${def.antwort}).`);
          throw new PaiBotError("intern");
        }
        if (ergebnis.datei !== undefined) return dateiAntwort(ergebnis.datei, cookies);
        const antwortKopf = new Headers(OHNE_SPEICHERN);
        for (const zeile of cookies) antwortKopf.append("Set-Cookie", zeile);
        return Response.json(okBody(ergebnis.daten), {
          status: ergebnis.status ?? 200,
          headers: antwortKopf,
        });
      } catch (error) {
        if (!isPaiBotError(error)) {
          const art = error instanceof Error ? error.name : typeof error;
          dienste().log.error(`Route ${name}: unerwarteter Fehler (${art}).`);
        }
        return antwortFehler(
          error,
          isPaiBotError(error) && error.code === "nicht_angemeldet" ? [] : cookies,
        );
      }
    };
    Object.defineProperty(handler, RAHMEN, { value: name });
    return handler;
  };
}

/** Rahmen mit den Diensten des laufenden Prozesses. So baut jede API-Route ihren Handler. */
export const route = erstelleRahmen(prozessDienste);

/** Läuft der Handler über den Rahmen? Liefert den Routen-Namen oder `undefined`. */
export function rahmenVon(handler: unknown): RoutenName | undefined {
  if (typeof handler !== "function") return undefined;
  return (handler as unknown as Record<symbol, RoutenName | undefined>)[RAHMEN];
}
