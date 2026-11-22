/**
 * PaiBot – Fehler der MCP-Schicht: feste Codes mit festen deutschen Texten. Nie ein Text des
 * fremden Servers, nie ein Zugangsdatum, nie die Ursache der Bibliothek.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

/** Alle Fehlercodes der Schicht. */
export const MCP_FEHLERCODES = [
  "app_nicht_erreichbar",
  "app_zugang_ungueltig",
  "app_adresse_unzulaessig",
  "app_kein_mcp",
  "app_version_unbekannt",
  "app_braucht_eingabe",
  "app_antwort_ungueltig",
  "app_zu_viele_anfragen",
  "werkzeug_ergebnis_zu_gross",
  "werkzeug_schema_nicht_pruefbar",
  "werkzeug_argumente_ungueltig",
  "werkzeug_fehler",
  "zeit_ueberschritten",
  "abgebrochen",
  "verbindung_geschlossen",
] as const;

export type McpFehlerCode = (typeof MCP_FEHLERCODES)[number];

/** Fester Text je Code. Er geht an Besitzer und Modell, nie ein Satz vom Server. */
export const MCP_FEHLERTEXTE: Readonly<Record<McpFehlerCode, string>> = Object.freeze({
  app_nicht_erreichbar: "Die App ist nicht erreichbar.",
  app_zugang_ungueltig: "Die App hat den Zugang nicht angenommen.",
  app_adresse_unzulaessig: "Diese Adresse ist für eine App nicht zulässig.",
  app_kein_mcp: "Unter dieser Adresse antwortet kein MCP-Server.",
  app_version_unbekannt: "Die App spricht eine Protokoll-Version, die PaiBot nicht kennt.",
  app_braucht_eingabe: "Die App braucht eine Eingabe, die PaiBot nicht liefern kann.",
  app_antwort_ungueltig: "Die Antwort der App ist nicht lesbar.",
  app_zu_viele_anfragen: "Die App hat zu viele Anfragen gestellt.",
  werkzeug_ergebnis_zu_gross: "Das Ergebnis des Werkzeugs ist zu groß.",
  werkzeug_schema_nicht_pruefbar: "PaiBot kann die Eingaben dieses Werkzeugs nicht sicher prüfen.",
  werkzeug_argumente_ungueltig: "Die Eingaben passen nicht zum Werkzeug.",
  werkzeug_fehler: "Das Werkzeug hat einen Fehler gemeldet.",
  zeit_ueberschritten: "Die App hat nicht rechtzeitig geantwortet.",
  abgebrochen: "Der Aufruf wurde abgebrochen.",
  verbindung_geschlossen: "Die Verbindung zur App ist geschlossen.",
});

/**
 * Fehler der Schicht. `message` ist immer der feste Text zum Code. `technisch` nennt höchstens die
 * Art der Ursache (z. B. `TypeError`), nie deren Text.
 */
export class McpSchichtFehler extends Error {
  readonly code: McpFehlerCode;
  readonly technisch: string | undefined;

  constructor(code: McpFehlerCode, technisch?: string) {
    super(MCP_FEHLERTEXTE[code]);
    this.name = "McpSchichtFehler";
    this.code = code;
    this.technisch = technisch;
  }
}

const MAX_URSACHEN = 6;

/**
 * Code zu einem Statuscode der HTTP-Antwort, soweit der Status allein ihn bestimmt: Zugang abgelehnt,
 * kein MCP-Server oder (Zeit, Last, Fehler im Server) nicht erreichbar. Sonst `undefined`.
 */
export function ordneStatusZu(status: number): McpFehlerCode | undefined {
  if (status === 401 || status === 403) return "app_zugang_ungueltig";
  if (status === 404 || status === 405 || status === 406 || status === 415) return "app_kein_mcp";
  if (status === 408 || status === 429 || status >= 500) return "app_nicht_erreichbar";
  return undefined;
}

interface KettenGlied {
  name: string;
  /** Wortlaut des Fehlers; leer, wenn er vom Server stammt (Fehler-Antwort des Servers). */
  message: string;
  /** Statuscode der HTTP-Antwort (nur als Zahl, nie aus dem Text gelesen). */
  status?: number;
  /** Textcode der Laufzeit (z. B. `ECONNRESET`). */
  textCode?: string;
  /** Zahlencode einer Fehler-Antwort des Servers (JSON-RPC). */
  rpcCode?: number;
}

/**
 * Glieder der Kette von `cause` (flach, höchstens sechs). Bei einer Fehler-Antwort des Servers
 * (Zahlencode, Text vom Server) endet die Kette dort und ihr Wortlaut wird nicht übernommen.
 */
function ursachenKette(fehler: unknown): KettenGlied[] {
  const kette: KettenGlied[] = [];
  const gesehen = new Set<unknown>();
  let aktuell: unknown = fehler;
  while (aktuell !== undefined && aktuell !== null && kette.length < MAX_URSACHEN) {
    if (gesehen.has(aktuell)) break;
    gesehen.add(aktuell);
    if (typeof aktuell !== "object") break;
    const eintrag = aktuell as {
      name?: unknown;
      message?: unknown;
      status?: unknown;
      statusCode?: unknown;
      code?: unknown;
      cause?: unknown;
    };
    const rpcCode = typeof eintrag.code === "number" ? eintrag.code : undefined;
    const status =
      typeof eintrag.statusCode === "number"
        ? eintrag.statusCode
        : typeof eintrag.status === "number"
          ? eintrag.status
          : undefined;
    kette.push({
      name: typeof eintrag.name === "string" ? eintrag.name.slice(0, 64) : "Error",
      message:
        rpcCode !== undefined || typeof eintrag.message !== "string"
          ? ""
          : eintrag.message.slice(0, 2_000),
      ...(status === undefined ? {} : { status }),
      ...(typeof eintrag.code === "string" ? { textCode: eintrag.code.slice(0, 32) } : {}),
      ...(rpcCode === undefined ? {} : { rpcCode }),
    });
    if (rpcCode !== undefined) break;
    aktuell = eintrag.cause;
  }
  return kette;
}

/** Feste Anfänge von Meldungen der Bibliothek und der Laufzeit; der Rest der Meldung zählt nie. */
const MELDUNG_ZEIT =
  /^(?:Request timed out after \d+ms|MCP client initialization timed out after \d+ms)/;
const MELDUNG_ABBRUCH =
  /^(?:Request was aborted|MCP client initialization was aborted|This operation was aborted)/;
const MELDUNG_EINGABE =
  /^(?:Input-required results are not supported|Request still requires input|Server requested input, but no handler|Unsupported input request)/;
const MELDUNG_VERSION =
  /^(?:MCP server rejected protocol version|Server does not support the requested protocol version|Server's protocol version is not supported)/;
const MELDUNG_NETZ =
  /^(?:fetch failed|terminated|other side closed|read ECONNRESET|connect ECONNREFUSED|getaddrinfo ENOTFOUND|socket hang up)/i;
const MELDUNG_ANTWORT =
  /^(?:Failed to (?:process|parse) server response|MCP HTTP Transport Error: Failed to parse message|Server sent invalid initialize result|Modern MCP result is missing resultType)/;
const CODE_NETZ =
  /^(?:ECONN\w+|ENOTFOUND|EPIPE|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|UND_ERR_(?:SOCKET|CONNECT\w*|CLOSED))$/;
const NAMEN_ANTWORT: ReadonlySet<string> = new Set(["SyntaxError", "ZodError", "$ZodError"]);

/**
 * Ordnet einen beliebigen Fehler (aus der Bibliothek, dem Netz oder der Ausgangs-Hülle) einem Code
 * zu. Maßgeblich sind Fehlerart, Statuscode, Zahlencode und die festen Anfänge der Meldungen der
 * Bibliothek; was der Server in einen Text schreibt, steuert den Code nicht. Was sich so nicht
 * sicher einordnen lässt, wird zu einem allgemeinen Code.
 */
export function ordneFehlerZu(fehler: unknown): McpSchichtFehler {
  if (fehler instanceof McpSchichtFehler) return fehler;
  // Hat die Schicht selbst den Fehler ausgelöst (z. B. Größen-Grenze), gilt dieser Code.
  let ursache: unknown = (fehler as { cause?: unknown } | null)?.cause;
  for (let stufe = 0; stufe < MAX_URSACHEN && ursache !== undefined && ursache !== null; stufe++) {
    if (ursache instanceof McpSchichtFehler) return ursache;
    ursache = (ursache as { cause?: unknown }).cause;
  }
  const kette = ursachenKette(fehler);
  const technisch = kette[0]?.name;
  const hat = (muster: RegExp) => kette.some((glied) => muster.test(glied.message));
  const hatName = (name: string) => kette.some((glied) => glied.name === name);

  if (hatName("EgressBlockedError"))
    return new McpSchichtFehler("app_adresse_unzulaessig", technisch);
  if (hatName("ResponseTooLargeError")) {
    return new McpSchichtFehler("werkzeug_ergebnis_zu_gross", technisch);
  }
  if (hatName("TimeoutError") || hat(MELDUNG_ZEIT)) {
    return new McpSchichtFehler("zeit_ueberschritten", technisch);
  }
  if (hatName("AbortError") || hat(MELDUNG_ABBRUCH))
    return new McpSchichtFehler("abgebrochen", technisch);
  if (hat(MELDUNG_EINGABE)) return new McpSchichtFehler("app_braucht_eingabe", technisch);
  // Statuscode der Antwort (als Zahl am Fehler, nie aus dem Text gelesen).
  const status = kette.map((glied) => glied.status).find((s) => s !== undefined);
  const nachStatus = status === undefined ? undefined : ordneStatusZu(status);
  if (nachStatus !== undefined) return new McpSchichtFehler(nachStatus, technisch);
  // Fehler-Antwort des Servers im Protokoll: nur der Zahlencode zählt, nie sein Text.
  const rpc = kette.find((glied) => glied.rpcCode !== undefined);
  if (rpc?.rpcCode === -32022) return new McpSchichtFehler("app_version_unbekannt", technisch);
  if (hat(MELDUNG_VERSION)) return new McpSchichtFehler("app_version_unbekannt", technisch);
  if (kette.some((glied) => glied.textCode !== undefined && CODE_NETZ.test(glied.textCode))) {
    return new McpSchichtFehler("app_nicht_erreichbar", technisch);
  }
  if (hat(MELDUNG_NETZ)) return new McpSchichtFehler("app_nicht_erreichbar", technisch);
  if (rpc !== undefined) return new McpSchichtFehler("werkzeug_fehler", technisch);
  if (kette.some((glied) => NAMEN_ANTWORT.has(glied.name)) || hat(MELDUNG_ANTWORT)) {
    return new McpSchichtFehler("app_antwort_ungueltig", technisch);
  }
  return new McpSchichtFehler("app_nicht_erreichbar", technisch);
}
