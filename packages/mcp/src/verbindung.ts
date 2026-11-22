/**
 * PaiBot – Verbindung zu einem fremden MCP-Server, nur lesend angesprochen (Liste holen, ein
 * Werkzeug aufrufen). Hier und nur hier wird die MCP-Bibliothek benutzt. Jede Anfrage geht über
 * das hineingereichte `fetch` (die Ausgangs-Hülle), nie am Netz-Zugriff der Laufzeit vorbei; die
 * Schicht erzwingt selbst: nur die eine Adresse der App, `redirect: "error"`, kein eigener
 * Ereignis-Strom, Zeitgrenzen, Größengrenze, Abbruch, nach `schliesse()` keine Anfrage mehr.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { bereinigeText } from "./bereinigen";
import { ergebnisZuText, type McpErgebnis } from "./ergebnis";
import { McpSchichtFehler, ordneFehlerZu, ordneStatusZu } from "./fehler";
import { type McpGrenzen, mitStandardGrenzen } from "./grenzen";
import { bereiteWerkzeugeAuf, type McpWerkzeugBereinigt, type McpWerkzeugRoh } from "./werkzeug";

/** Eine Anfrage nach draußen. Die Ausgangs-Hülle des Systems hat diese Form. */
export type McpFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface McpVerbindungOptionen {
  /** Adresse des MCP-Endpunkts (`https://…`, ohne Benutzer-, Abfrage- und Fragment-Teil). */
  adresse: string;
  /** Alle Anfragen gehen hierüber; je App eine eigene Hülle mit genau einem erlaubten Ziel. */
  fetch: McpFetch;
  /** Persönlicher Zugang; geht nur als `Authorization: Bearer …` hinaus. */
  token?: string;
  grenzen?: Partial<McpGrenzen>;
  /** Bricht die ganze Verbindung ab (z. B. Not-Aus des Laufs). */
  signal?: AbortSignal;
  /**
   * Nur für Tests der Schicht: lässt `http`, IP-Adressen und beliebige Ports zu. Wird außerhalb von
   * Tests nie gesetzt und nie aus einer Eingabe gelesen (ein Test der Lint-Regeln prüft das).
   * Standard: nein.
   */
  erlaubeHttp?: boolean;
}

/** Ergebnis von `pruefeAdresse`. */
export type AdressePruefung =
  | { ok: true; url: URL }
  | {
      ok: false;
      grund:
        | "ungueltig"
        | "protokoll"
        | "zugangsdaten"
        | "abfrage"
        | "zu_lang"
        | "ip_adresse"
        | "interner_name"
        | "port";
    };

const MAX_ADRESSE = 2_048;
const MAX_TOKEN = 4_096;
const CLIENT_NAME = "paibot";

/**
 * Prüft die Adresse einer App: nur `https` auf dem Standard-Port 443, ein Name mit Punkt (kein
 * IP-Literal, kein `localhost`, kein Name ohne Punkt), kein Benutzer-, Abfrage- und Fragment-Teil.
 *
 * Mit `erlaubeHttp` entfallen die Regeln zu Protokoll, Port und Namen (`http`, `127.0.0.1`, jeder
 * Port); der Schalter ist nur für Tests der Schicht da und wird außerhalb von Tests nie gesetzt.
 *
 * Das ist nur ein erster, grober Filter für die Eingabe. Ob das Ziel öffentlich ist (private,
 * Link-lokale und Loopback-Adressen, Namen, die dorthin auflösen, DNS-Rebinding), prüft allein die
 * Ausgangs-Hülle beim Verbinden.
 */
export function pruefeAdresse(adresse: string, erlaubeHttp = false): AdressePruefung {
  if (adresse.length > MAX_ADRESSE) return { ok: false, grund: "zu_lang" };
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    return { ok: false, grund: "ungueltig" };
  }
  if (url.protocol !== "https:" && !(erlaubeHttp && url.protocol === "http:")) {
    return { ok: false, grund: "protokoll" };
  }
  if (url.hostname === "") return { ok: false, grund: "ungueltig" };
  if (url.username !== "" || url.password !== "") return { ok: false, grund: "zugangsdaten" };
  if (url.search !== "" || url.hash !== "") return { ok: false, grund: "abfrage" };
  if (!erlaubeHttp) {
    // Der Standard-Port (443) steht in `url.port` als leere Zeichenkette.
    if (url.port !== "") return { ok: false, grund: "port" };
    // Die Adress-Klasse prüft die Hülle; hier fallen nur die offensichtlichen Formen heraus.
    // `URL` schreibt Zahlen-Formen (`0x7f.1`, `2130706433`) schon als `127.0.0.1` um.
    const name = url.hostname.endsWith(".") ? url.hostname.slice(0, -1) : url.hostname;
    if (name.startsWith("[") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(name)) {
      return { ok: false, grund: "ip_adresse" };
    }
    if (name === "localhost" || name.endsWith(".localhost") || !name.includes(".")) {
      return { ok: false, grund: "interner_name" };
    }
  }
  return { ok: true, url };
}

/** Eine Seite oder alle Seiten der rohen Liste eines Servers. */
export interface McpRohListe {
  werkzeuge: McpWerkzeugRoh[];
  seiten: number;
  /** Es gab mehr Werkzeuge oder Seiten als erlaubt; der Rest wurde nicht geholt. */
  abgeschnitten: boolean;
}

export interface McpVerbindung {
  /** Origin der App (`https://host`), für Anzeige und Vergleich. */
  readonly origin: string;
  /** Bereinigter Name des Servers (nur Anzeige). */
  readonly serverName: string;
  /** Holt die rohe Werkzeug-Liste (höchstens `maxSeiten` Seiten und `maxWerkzeuge` Werkzeuge). */
  listeRoh(optionen?: { signal?: AbortSignal }): Promise<McpRohListe>;
  /** Ruft ein Werkzeug auf. Wirft `McpSchichtFehler` bei Netz-, Zeit- und Protokollfehlern. */
  rufeAuf(
    originalName: string,
    argumente: Record<string, unknown>,
    optionen?: { signal?: AbortSignal },
  ): Promise<McpErgebnis>;
  /** Schließt; danach geht keine Anfrage mehr hinaus. Mehrfacher Aufruf ist harmlos. */
  schliesse(): Promise<void>;
}

type Phase = "offen" | "schliesst" | "zu";

/** Führt `werk` mit einer Frist und einem Abbruch aus; beides wird an `werk` als Signal gegeben. */
async function mitFrist<T>(
  ms: number,
  aussen: AbortSignal | undefined,
  werk: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const abbruch = new AbortController();
  const timer = setTimeout(() => abbruch.abort(new McpSchichtFehler("zeit_ueberschritten")), ms);
  const vonAussen = () => abbruch.abort(new McpSchichtFehler("abgebrochen"));
  if (aussen?.aborted === true) vonAussen();
  else aussen?.addEventListener("abort", vonAussen, { once: true });
  const abgebrochen = new Promise<never>((_, ablehnen) => {
    const grund = () => ablehnen(abbruch.signal.reason);
    if (abbruch.signal.aborted) grund();
    else abbruch.signal.addEventListener("abort", grund, { once: true });
  });
  const lauf = werk(abbruch.signal);
  lauf.catch(() => undefined);
  try {
    return await Promise.race([lauf, abgebrochen]);
  } catch (fehler) {
    // Hat die Frist oder der Abbruch zugeschlagen, gilt deren Grund, nicht der Folgefehler.
    if (abbruch.signal.aborted && abbruch.signal.reason instanceof McpSchichtFehler) {
      throw abbruch.signal.reason;
    }
    throw fehler;
  } finally {
    clearTimeout(timer);
    aussen?.removeEventListener("abort", vonAussen);
  }
}

/**
 * Die einzigen Methoden, die die Schicht selbst nach draußen schickt: Aufbau (`initialize`,
 * `notifications/initialized` bzw. `server/discover`), Liste und Aufruf. Das Beenden der Sitzung
 * geht als `DELETE` ohne Körper. Alles andere, auch jede Antwort auf eine Anfrage des Servers,
 * bleibt lokal.
 */
export const ERLAUBTE_AUSGEHENDE_METHODEN: ReadonlySet<string> = new Set([
  "initialize",
  "notifications/initialized",
  "server/discover",
  "tools/list",
  "tools/call",
]);

const MAX_ANFRAGE_KOERPER = 1_048_576;

type AusgehendeArt = "erlaubt" | "antwort" | "verboten";

/** Ordnet den Körper eines ausgehenden POST ein: eigene Anfrage, Antwort auf den Server, verboten. */
function ordneAusgehendeAnfrageEin(koerper: unknown): AusgehendeArt {
  if (typeof koerper !== "string" || koerper.length > MAX_ANFRAGE_KOERPER) return "verboten";
  let json: unknown;
  try {
    json = JSON.parse(koerper);
  } catch {
    return "verboten";
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) return "verboten";
  const eintrag = json as { method?: unknown; result?: unknown; error?: unknown };
  if (typeof eintrag.method === "string") {
    return ERLAUBTE_AUSGEHENDE_METHODEN.has(eintrag.method) ? "erlaubt" : "verboten";
  }
  // Antwort der Bibliothek auf eine Anfrage des Servers: nie nach draußen.
  if ("result" in eintrag || "error" in eintrag) return "antwort";
  return "verboten";
}

/** Zählt die Ereignisse (Leerzeilen) eines Ereignis-Stroms; darüber endet der Strom mit einem Fehler. */
function begrenzeEreignisse(
  antwort: Response,
  maxEreignisse: number,
  melde: (fehler: McpSchichtFehler) => void,
): Response {
  const art = antwort.headers.get("content-type") ?? "";
  if (antwort.body === null || !/text\/event-stream/i.test(art)) return antwort;
  let ereignisse = 0;
  let vorherNeueZeile = false;
  const zaehler = new TransformStream<Uint8Array, Uint8Array>({
    transform(stueck, steuerung) {
      for (const byte of stueck) {
        if (byte === 0x0d) continue;
        if (byte === 0x0a) {
          if (vorherNeueZeile) {
            ereignisse += 1;
            vorherNeueZeile = false;
            continue;
          }
          vorherNeueZeile = true;
        } else {
          vorherNeueZeile = false;
        }
      }
      if (ereignisse > maxEreignisse) {
        const fehler = new McpSchichtFehler("app_zu_viele_anfragen");
        melde(fehler);
        steuerung.error(fehler);
        return;
      }
      steuerung.enqueue(stueck);
    },
  });
  return new Response(antwort.body.pipeThrough(zaehler), {
    status: antwort.status,
    statusText: antwort.statusText,
    headers: antwort.headers,
  });
}

/** Begrenzt die Bytes einer Antwort; darüber wird der Strom mit einem Fehler beendet. */
function begrenzeAntwort(
  antwort: Response,
  maxBytes: number,
  melde: (fehler: McpSchichtFehler) => void,
): Response {
  const laenge = Number(antwort.headers.get("content-length"));
  if (Number.isFinite(laenge) && laenge > maxBytes) {
    void antwort.body?.cancel().catch(() => undefined);
    const fehler = new McpSchichtFehler("werkzeug_ergebnis_zu_gross");
    melde(fehler);
    throw fehler;
  }
  if (antwort.body === null) return antwort;
  let gelesen = 0;
  const zaehler = new TransformStream<Uint8Array, Uint8Array>({
    transform(stueck, steuerung) {
      gelesen += stueck.byteLength;
      if (gelesen > maxBytes) {
        const fehler = new McpSchichtFehler("werkzeug_ergebnis_zu_gross");
        melde(fehler);
        steuerung.error(fehler);
        return;
      }
      steuerung.enqueue(stueck);
    },
  });
  return new Response(antwort.body.pipeThrough(zaehler), {
    status: antwort.status,
    statusText: antwort.statusText,
    headers: antwort.headers,
  });
}

/**
 * Das `fetch`, das die Bibliothek bekommt: alles Nötige wird hier erzwungen. Nur für die Schicht und
 * ihre Tests; außerhalb gibt es `oeffneVerbindung`.
 */
export function baueSicheresFetch(
  basis: McpFetch,
  endpunkt: URL,
  phase: () => Phase,
  verbindungSignal: AbortSignal,
  grenzen: McpGrenzen,
  /** Wird gerufen, wenn die Schicht selbst die Verbindung wegen einer Grenze abbricht. */
  melde: (fehler: McpSchichtFehler) => void = () => undefined,
  /** Wird mit dem Statuscode der ersten Fehler-Antwort (ab 400) gerufen. */
  meldeStatus: (status: number) => void = () => undefined,
): McpFetch {
  let ausgehend = 0;
  return async (eingabe, init) => {
    if (phase() === "zu") throw new McpSchichtFehler("verbindung_geschlossen");
    const ziel =
      typeof eingabe === "string" ? eingabe : eingabe instanceof URL ? eingabe.href : undefined;
    if (ziel === undefined) throw new McpSchichtFehler("app_adresse_unzulaessig");
    let url: URL;
    try {
      url = new URL(ziel);
    } catch {
      throw new McpSchichtFehler("app_adresse_unzulaessig");
    }
    // Nur genau der Endpunkt der App; weder eine andere Adresse noch ein anderer Pfad.
    if (
      url.origin !== endpunkt.origin ||
      url.pathname !== endpunkt.pathname ||
      url.search !== "" ||
      url.username !== "" ||
      url.password !== ""
    ) {
      throw new McpSchichtFehler("app_adresse_unzulaessig");
    }
    const methode = (init?.method ?? "GET").toUpperCase();
    // Kein eigener Ereignis-Strom: Der Server bekommt keine Gelegenheit, dauerhaft zu senden.
    if (methode === "GET") return new Response(null, { status: 405 });
    if (methode !== "POST" && methode !== "DELETE") {
      throw new McpSchichtFehler("app_adresse_unzulaessig");
    }
    if (phase() === "schliesst" && methode !== "DELETE") {
      throw new McpSchichtFehler("verbindung_geschlossen");
    }
    if (methode === "POST") {
      // Nur die Anfragen, die die Schicht selbst braucht. Ein Server, der im Strom tausende
      // Anfragen stellt, bekommt auf keine eine Antwort nach draußen (und kein Zugangsdatum).
      const art = ordneAusgehendeAnfrageEin(init?.body);
      if (art === "antwort") return new Response(null, { status: 202 });
      if (art === "verboten") throw new McpSchichtFehler("app_antwort_ungueltig");
    }
    ausgehend += 1;
    if (ausgehend > grenzen.maxAnfragen) {
      const fehler = new McpSchichtFehler("app_zu_viele_anfragen");
      melde(fehler);
      throw fehler;
    }
    const signale = [verbindungSignal];
    if (init?.signal) signale.push(init.signal);
    const antwort = await basis(url.href, {
      ...init,
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.any(signale),
    });
    if (antwort.status >= 400) meldeStatus(antwort.status);
    return begrenzeAntwort(
      begrenzeEreignisse(antwort, grenzen.maxEreignisse, melde),
      grenzen.maxAntwortBytes,
      melde,
    );
  };
}

/** Prüft das Zugangsdatum: sichtbare ASCII-Zeichen ohne Leerzeichen, nicht zu lang. */
function pruefeToken(token: string): void {
  if (token.length === 0 || token.length > MAX_TOKEN || !/^[\x21-\x7E]+$/.test(token)) {
    throw new McpSchichtFehler("app_zugang_ungueltig");
  }
}

/**
 * Öffnet eine Verbindung. Wirft `McpSchichtFehler` (feste Texte, nie ein Text des Servers und nie
 * das Zugangsdatum).
 */
export async function oeffneVerbindung(optionen: McpVerbindungOptionen): Promise<McpVerbindung> {
  const grenzen = mitStandardGrenzen(optionen.grenzen);
  const adresse = pruefeAdresse(optionen.adresse, optionen.erlaubeHttp === true);
  if (!adresse.ok) throw new McpSchichtFehler("app_adresse_unzulaessig");
  if (optionen.token !== undefined) pruefeToken(optionen.token);

  let phase: Phase = "offen";
  const verbindungAbbruch = new AbortController();
  if (optionen.signal?.aborted === true) throw new McpSchichtFehler("abgebrochen");
  const vonAussen = () => verbindungAbbruch.abort(new McpSchichtFehler("abgebrochen"));
  optionen.signal?.addEventListener("abort", vonAussen, { once: true });
  const loeseAussen = () => optionen.signal?.removeEventListener("abort", vonAussen);
  // Hat die Schicht die Verbindung selbst wegen einer Grenze abgebrochen, gilt dieser Grund und
  // nicht der Folgefehler der Bibliothek.
  let eigenerGrund: McpSchichtFehler | undefined;
  let ersterStatus: number | undefined;
  const zuordnen = (fehler: unknown): McpSchichtFehler =>
    fehler instanceof McpSchichtFehler ? fehler : (eigenerGrund ?? ordneFehlerZu(fehler));
  const sicheresFetch = baueSicheresFetch(
    optionen.fetch,
    adresse.url,
    () => phase,
    verbindungAbbruch.signal,
    grenzen,
    (fehler) => {
      eigenerGrund ??= fehler;
    },
    (status) => {
      ersterStatus ??= status;
    },
  );

  let client: MCPClient;
  try {
    client = await mitFrist(grenzen.listeMs, verbindungAbbruch.signal, (signal) =>
      createMCPClient({
        transport: {
          type: "http",
          url: adresse.url.href,
          ...(optionen.token === undefined
            ? {}
            : { headers: { Authorization: `Bearer ${optionen.token}` } }),
          fetch: sicheresFetch,
        },
        clientName: CLIENT_NAME,
        maxRetries: 0,
        onUncaughtError: () => undefined,
        initializationOptions: {
          signal,
          timeout: grenzen.listeMs,
          maxTotalTimeout: grenzen.listeMs,
        },
      }),
    );
  } catch (fehler) {
    phase = "zu";
    loeseAussen();
    verbindungAbbruch.abort(new McpSchichtFehler("verbindung_geschlossen"));
    // Beim Verbinden gilt, wenn möglich, die erste Fehler-Antwort: Die Bibliothek versucht nach
    // einer gescheiterten Entdeckung noch den alten Weg, und dessen Fehler sagt weniger.
    const nachStatus = ersterStatus === undefined ? undefined : ordneStatusZu(ersterStatus);
    if (
      nachStatus !== undefined &&
      !(fehler instanceof McpSchichtFehler) &&
      eigenerGrund === undefined
    ) {
      throw new McpSchichtFehler(nachStatus, ordneFehlerZu(fehler).technisch);
    }
    throw zuordnen(fehler);
  }
  const serverName = bereinigeText(String(client.serverInfo?.name ?? ""), {
    maxZeichen: 100,
    zeilenumbrueche: false,
    kuerzungsMarke: "…",
  }).text;

  const pruefeOffen = () => {
    if (phase !== "offen") throw new McpSchichtFehler("verbindung_geschlossen");
  };

  return {
    origin: adresse.url.origin,
    serverName,

    async listeRoh(listenOptionen) {
      pruefeOffen();
      try {
        return await mitFrist(
          grenzen.listeMs,
          mischeSignale(listenOptionen?.signal, verbindungAbbruch.signal),
          async (signal) => {
            const werkzeuge: McpWerkzeugRoh[] = [];
            const gesehen = new Set<string>();
            let cursor: string | undefined;
            let seiten = 0;
            let abgeschnitten = false;
            while (seiten < grenzen.maxSeiten) {
              const antwort = await client.listTools({
                ...(cursor === undefined ? {} : { params: { cursor } }),
                options: { signal, timeout: grenzen.listeMs, maxTotalTimeout: grenzen.listeMs },
              });
              seiten += 1;
              const platz = grenzen.maxWerkzeuge - werkzeuge.length;
              if (antwort.tools.length > platz) abgeschnitten = true;
              for (const werkzeug of antwort.tools.slice(0, Math.max(0, platz))) {
                werkzeuge.push(werkzeug as McpWerkzeugRoh);
              }
              const weiter = antwort.nextCursor;
              if (weiter === undefined || weiter === "") break;
              if (abgeschnitten || weiter.length > 4_096 || gesehen.has(weiter)) {
                abgeschnitten = true;
                break;
              }
              gesehen.add(weiter);
              cursor = weiter;
              if (seiten >= grenzen.maxSeiten) abgeschnitten = true;
            }
            return { werkzeuge, seiten, abgeschnitten };
          },
        );
      } catch (fehler) {
        throw zuordnen(fehler);
      }
    },

    async rufeAuf(originalName, argumente, aufrufOptionen) {
      pruefeOffen();
      try {
        const roh = await mitFrist(
          grenzen.aufrufMs,
          mischeSignale(aufrufOptionen?.signal, verbindungAbbruch.signal),
          (signal) =>
            client.callTool({
              name: originalName,
              arguments: argumente,
              options: { signal, timeout: grenzen.aufrufMs, maxTotalTimeout: grenzen.aufrufMs },
            }),
        );
        return ergebnisZuText(roh, grenzen);
      } catch (fehler) {
        throw zuordnen(fehler);
      }
    },

    async schliesse() {
      if (phase === "zu") return;
      phase = "schliesst";
      try {
        await mitFrist(grenzen.schliessenMs, undefined, () => client.close());
      } catch {
        // Beim Schließen ist ein Fehler nicht mehr wichtig; danach geht ohnehin nichts mehr hinaus.
      } finally {
        phase = "zu";
        loeseAussen();
        verbindungAbbruch.abort(new McpSchichtFehler("verbindung_geschlossen"));
      }
    },
  };
}

/** Ein Signal, das auslöst, sobald eines der beiden auslöst. */
function mischeSignale(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
  return a === undefined ? b : AbortSignal.any([a, b]);
}

export interface WerkzeugAbrufOptionen extends McpVerbindungOptionen {
  /** Kurzname der App für die Namen der Modell-Werkzeuge. */
  appKurzname: string;
  /** Modell-Namen anderer Apps der Installation (für eindeutige Namen). */
  bereitsVergeben?: ReadonlySet<string>;
}

export interface WerkzeugAbruf {
  werkzeuge: McpWerkzeugBereinigt[];
  serverName: string;
  seiten: number;
  abgeschnitten: boolean;
}

/**
 * Verbindet, holt die ganze Liste, bereitet jedes Werkzeug auf und schließt wieder. Wirft
 * `McpSchichtFehler`, wenn das Verbinden oder Holen scheitert.
 */
export async function holeWerkzeuge(optionen: WerkzeugAbrufOptionen): Promise<WerkzeugAbruf> {
  const verbindung = await oeffneVerbindung(optionen);
  try {
    const liste = await verbindung.listeRoh();
    return {
      werkzeuge: bereiteWerkzeugeAuf(liste.werkzeuge, {
        appKurzname: optionen.appKurzname,
        ...(optionen.grenzen === undefined ? {} : { grenzen: optionen.grenzen }),
        ...(optionen.bereitsVergeben === undefined
          ? {}
          : { bereitsVergeben: optionen.bereitsVergeben }),
      }),
      serverName: verbindung.serverName,
      seiten: liste.seiten,
      abgeschnitten: liste.abgeschnitten,
    };
  } finally {
    await verbindung.schliesse();
  }
}

export interface WerkzeugAufrufOptionen extends McpVerbindungOptionen {
  /** Das Werkzeug aus `holeWerkzeuge` (frisch abgerufen und mit der Bestätigung abgeglichen). */
  werkzeug: McpWerkzeugBereinigt;
  /** Die Argumente, wie das Modell sie gewünscht hat; sie werden gegen das Prüf-Schema geprüft. */
  argumente: unknown;
}

/**
 * Prüft die Argumente, verbindet, ruft das Werkzeug auf und schließt wieder. Wirft nie: Jedes
 * Problem kommt als `McpErgebnis` mit `status: "fehler"` und festem Satz zurück. Wird kein Netz-
 * Zugriff gebraucht (nicht bestätigbares Werkzeug, ungültige Argumente), geht keine Anfrage hinaus.
 */
export async function rufeWerkzeugAuf(optionen: WerkzeugAufrufOptionen): Promise<McpErgebnis> {
  const fehlerErgebnis = (code: McpSchichtFehler["code"]): McpErgebnis => ({
    status: "fehler",
    text: new McpSchichtFehler(code).message,
    gekuerzt: false,
    enthaeltFremdenText: false,
    ausgelasseneTeile: 0,
    fehlercode: code,
  });
  const werkzeug = optionen.werkzeug;
  if (!werkzeug.bestaetigbar || werkzeug.pruefer === null) {
    return fehlerErgebnis("werkzeug_schema_nicht_pruefbar");
  }
  const grenzen = mitStandardGrenzen(optionen.grenzen);
  const geprueft = werkzeug.pruefer(optionen.argumente);
  if (!geprueft.ok) return fehlerErgebnis("werkzeug_argumente_ungueltig");
  let verbindung: McpVerbindung;
  try {
    verbindung = await oeffneVerbindung({ ...optionen, grenzen });
  } catch (fehler) {
    return fehlerErgebnis(ordneFehlerZu(fehler).code);
  }
  try {
    return await verbindung.rufeAuf(werkzeug.originalName, geprueft.wert, {
      ...(optionen.signal === undefined ? {} : { signal: optionen.signal }),
    });
  } catch (fehler) {
    return fehlerErgebnis(ordneFehlerZu(fehler).code);
  } finally {
    await verbindung.schliesse();
  }
}
