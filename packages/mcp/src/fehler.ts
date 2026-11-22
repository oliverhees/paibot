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

/** Namen aller Fehler in der Kette von `cause` (flach, höchstens sechs). */
function ursachenKette(fehler: unknown): { name: string; message: string; status?: number }[] {
  const kette: { name: string; message: string; status?: number }[] = [];
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
      cause?: unknown;
    };
    kette.push({
      name: typeof eintrag.name === "string" ? eintrag.name.slice(0, 64) : "Error",
      message: typeof eintrag.message === "string" ? eintrag.message.slice(0, 2_000) : "",
      ...(typeof eintrag.status === "number" ? { status: eintrag.status } : {}),
    });
    aktuell = eintrag.cause;
  }
  return kette;
}

/**
 * Ordnet einen beliebigen Fehler (aus der Bibliothek, dem Netz oder der Ausgangs-Hülle) einem Code
 * zu. Erkennt nur an Namen und festen Wortlauten; der Text des Fehlers wird nie weitergegeben.
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
  const namen = kette.map((eintrag) => eintrag.name);
  const technisch = namen[0];
  const hat = (muster: RegExp) => kette.some((eintrag) => muster.test(eintrag.message));
  const hatName = (name: string) => namen.includes(name);

  if (hatName("EgressBlockedError"))
    return new McpSchichtFehler("app_adresse_unzulaessig", technisch);
  if (hatName("ResponseTooLargeError")) {
    return new McpSchichtFehler("werkzeug_ergebnis_zu_gross", technisch);
  }
  if (hatName("TimeoutError") || hat(/timed out|timeout/i)) {
    return new McpSchichtFehler("zeit_ueberschritten", technisch);
  }
  if (hatName("AbortError") || hat(/aborted/i))
    return new McpSchichtFehler("abgebrochen", technisch);
  if (hat(/requested input|requires input|input[-_ ]required/i)) {
    return new McpSchichtFehler("app_braucht_eingabe", technisch);
  }
  const status = kette.map((eintrag) => eintrag.status).find((s) => s !== undefined);
  const statusAusText = /\bHTTP\s+(\d{3})\b|\bstatus(?:\s+code)?[:\s]+(\d{3})\b/i.exec(
    kette.map((eintrag) => eintrag.message).join(" "),
  );
  const httpStatus =
    status ?? (statusAusText ? Number(statusAusText[1] ?? statusAusText[2]) : undefined);
  if (httpStatus === 401 || httpStatus === 403) {
    return new McpSchichtFehler("app_zugang_ungueltig", technisch);
  }
  if (httpStatus === 404 || httpStatus === 405 || httpStatus === 406 || httpStatus === 415) {
    return new McpSchichtFehler("app_kein_mcp", technisch);
  }
  if (hat(/unsupported protocol|protocol version/i)) {
    return new McpSchichtFehler("app_version_unbekannt", technisch);
  }
  if (
    hat(
      /terminated|fetch failed|econnreset|econnrefused|enotfound|socket|other side closed|network/i,
    )
  ) {
    return new McpSchichtFehler("app_nicht_erreichbar", technisch);
  }
  if (hat(/failed to process|invalid|parse|unexpected token|json/i)) {
    return new McpSchichtFehler("app_antwort_ungueltig", technisch);
  }
  return new McpSchichtFehler("app_nicht_erreichbar", technisch);
}
