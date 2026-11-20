/**
 * PaiBot – Ablauf der Route `GET /api/unterhaltungen/:id/ereignisse`: Sitzung prüfen, Eingaben
 * prüfen, Platz belegen, Strom öffnen. Alle Abhängigkeiten kommen von außen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Database } from "@paibot/db";
import { conversations, events } from "@paibot/db/repo";
import { errorBody } from "@paibot/shared/api";
import { ERROR_STATUS, type ErrorCode, type FieldError } from "@paibot/shared/fehler";
import { type ConversationId, isId } from "@paibot/shared/ids";
import { startNummer } from "./ereignis-start";
import { SSE_KOPFZEILEN } from "./format";
import { STROM_GRENZEN, type StromZaehler } from "./grenzen";
import type { SitzungPruefen, SitzungsErgebnis } from "./sitzung";
import { oeffneStrom, type StromEinstellungen, type StromEnde, type Uhr } from "./strom";
import type { Verteiler } from "./verteiler";

/** Was die Route zum Arbeiten braucht (pro Prozess einmal). */
export interface EreignisDienste {
  db: Database;
  verteiler: Verteiler;
  zaehler: StromZaehler;
}

export interface EreignisRouteDeps {
  /** Prüfung der Anmeldung; ohne gültige Sitzung wird nichts gelesen und kein LISTEN gestartet. */
  sitzungPruefen: SitzungPruefen;
  /** Liefert Datenbank, Verteiler und Zähler; wird erst nach erfolgreicher Sitzungsprüfung gerufen. */
  dienste: () => EreignisDienste | Promise<EreignisDienste>;
  /** Abweichende Zeiten und Größen (für Tests). */
  einstellungen?: Partial<StromEinstellungen>;
  uhr?: Uhr;
  beiEnde?: (grund: StromEnde) => void;
}

export interface RoutenKontext {
  params: Promise<{ id: string }>;
}

const OHNE_SPEICHERN = { "Cache-Control": "no-store" } as const;

function fehler(
  code: ErrorCode,
  optionen: { felder?: FieldError[]; kopf?: Record<string, string> } = {},
): Response {
  const body = errorBody(code, optionen.felder ? { felder: optionen.felder } : {});
  return Response.json(body, {
    status: ERROR_STATUS[code],
    headers: { ...OHNE_SPEICHERN, ...optionen.kopf },
  });
}

async function sitzungHolen(pruefen: SitzungPruefen, request: Request): Promise<SitzungsErgebnis> {
  try {
    const ergebnis = await pruefen(request);
    // Nur ein ausdrückliches `ok: true` mit Sitzungs-Schlüssel gilt.
    if (ergebnis?.ok === true && typeof ergebnis.sitzung === "string" && ergebnis.sitzung !== "") {
      return ergebnis;
    }
  } catch {
    // Fehler in der Prüfung: abgelehnt.
  }
  return { ok: false, status: 401 };
}

/** Baut den `GET`-Handler der Route. */
export function erstelleEreignisRoute(deps: EreignisRouteDeps) {
  return async function ereignisseAbrufen(
    request: Request,
    kontext: RoutenKontext,
  ): Promise<Response> {
    // 1. Sitzung – vor jedem Zugriff auf Datenbank oder LISTEN.
    const sitzung = await sitzungHolen(deps.sitzungPruefen, request);
    if (!sitzung.ok) return fehler("nicht_angemeldet");

    // 2. Eingaben.
    const { id } = await kontext.params;
    if (!isId("conversation", id)) return fehler("nicht_gefunden");
    const conversationId: ConversationId = id;
    const start = startNummer(request);
    if (start.wert === undefined) {
      return fehler("eingabe_ungueltig", { felder: [{ feld: start.feld, code: "format" }] });
    }
    const nachSeq = start.wert;

    let dienste: EreignisDienste;
    try {
      dienste = await deps.dienste();
    } catch {
      return fehler("intern");
    }

    // 3. Unterhaltung vorhanden? Startnummer nicht hinter dem Ende?
    try {
      const unterhaltung = await conversations.get(dienste.db, conversationId);
      if (unterhaltung === undefined) return fehler("nicht_gefunden");
      if (nachSeq > 0 && nachSeq > (await events.lastSeq(dienste.db, conversationId))) {
        return fehler("eingabe_ungueltig", { felder: [{ feld: start.feld, code: "zu_gross" }] });
      }
    } catch {
      return fehler("intern");
    }

    // 4. Platz belegen.
    const freigeben = dienste.zaehler.belegen(sitzung.sitzung);
    if (freigeben === undefined) {
      return fehler("zu_viele_versuche", {
        kopf: { "Retry-After": String(STROM_GRENZEN.wartenSekunden) },
      });
    }

    // 5. Strom öffnen (LISTEN, dann nachholen).
    let strom: ReadableStream<Uint8Array>;
    try {
      strom = await oeffneStrom({
        ...deps.einstellungen,
        db: dienste.db,
        verteiler: dienste.verteiler,
        conversationId,
        nachSeq,
        signal: request.signal,
        uhr: deps.uhr,
        pruefen: async () => {
          const neu = await sitzungHolen(deps.sitzungPruefen, request);
          if (!neu.ok || neu.sitzung !== sitzung.sitzung) return false;
          return (await conversations.get(dienste.db, conversationId)) !== undefined;
        },
        beiEnde: (grund) => {
          freigeben();
          deps.beiEnde?.(grund);
        },
      });
    } catch {
      freigeben();
      return fehler("intern");
    }

    return new Response(strom, { status: 200, headers: { ...SSE_KOPFZEILEN } });
  };
}
