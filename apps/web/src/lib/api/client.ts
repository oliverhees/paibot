/**
 * PaiBot – API-Aufrufe aus dem Browser: Prüfzeichen aus dem Seitenkopf mitschicken und die
 * Antwort-Hülle auspacken.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ApiErrorDetail, ApiResponse } from "@paibot/shared/api";
import { CSRF } from "@paibot/shared/konstanten";
import { t } from "@paibot/shared/texte";

/** Prüfzeichen aus `<meta name="pb-pruefzeichen">`. */
export function pruefzeichen(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${CSRF.metaName}"]`);
  return meta?.content || undefined;
}

/** Ergebnis eines Aufrufs: Daten oder der Fehler der Hülle (mit Wartezeit bei 429). */
export type ApiErgebnis<T> =
  | { ok: true; daten: T }
  | { ok: false; fehler: ApiErrorDetail; status: number; wartenSekunden?: number };

function fehlerOhneAntwort(): ApiErrorDetail {
  return { code: "intern", text: t("fehler.intern"), ausweg: t("fehler.intern.ausweg") };
}

/**
 * Ruft eine API-Route auf (Methode und Pfad wie im Routen-Vertrag `lib/routen.ts`; ein Test prüft,
 * dass jeder Aufruf in der Oberfläche dort steht). Dieses Modul lädt bewusst weder den Vertrag noch
 * Zod, damit im Browser keine Code-Auswertung nötig ist. Bei jeder verändernden Methode geht das Prüfzeichen als Kopfzeile
 * `X-Pb-Pruefzeichen` mit. Wirft nie; Netzwerkfehler werden zu `intern`.
 */
export async function apiFetch<T>(
  methode: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  pfad: string,
  koerper?: unknown,
): Promise<ApiErgebnis<T>> {
  const kopf: Record<string, string> = { accept: "application/json" };
  if (methode !== "GET") {
    const zeichen = pruefzeichen();
    if (zeichen) kopf[CSRF.header] = zeichen;
  }
  if (koerper !== undefined) kopf["content-type"] = "application/json";
  try {
    const antwort = await fetch(pfad, {
      method: methode,
      headers: kopf,
      credentials: "same-origin",
      ...(koerper === undefined ? {} : { body: JSON.stringify(koerper) }),
    });
    const inhalt = (await antwort.json()) as ApiResponse<T>;
    if (inhalt.ok) return { ok: true, daten: inhalt.daten };
    const warten = Number(antwort.headers.get("retry-after"));
    return {
      ok: false,
      fehler: inhalt.fehler,
      status: antwort.status,
      ...(Number.isFinite(warten) && warten > 0 ? { wartenSekunden: warten } : {}),
    };
  } catch {
    return { ok: false, fehler: fehlerOhneAntwort(), status: 0 };
  }
}
