/**
 * PaiBot – Sitzungsprüfung für den Ereignis-Strom: dieselbe Prüfung wie bei allen API-Routen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { SitzungsErgebnis } from "../sse/sitzung";
import { prozessDienste, type ZugangsDienste } from "./dienste";
import { cookieLesen, sitzungPruefen, sitzungsCookieName } from "./sitzung";

/**
 * Prüft die Sitzung einer Anfrage an den Ereignis-Strom (beim Öffnen und bei jedem Herzschlag).
 * Liefert als festen Schlüssel `sessions.id`; nach Abmelden oder Ablauf: 401.
 */
export async function sitzungFuerStrom(
  request: Request,
  dienste: ZugangsDienste = prozessDienste(),
): Promise<SitzungsErgebnis> {
  const wert = cookieLesen(
    request.headers.get("cookie"),
    sitzungsCookieName({ appUrl: dienste.appOrigin() }),
  );
  const sitzung = await sitzungPruefen(dienste.db(), wert, dienste.uhr.now());
  return sitzung === undefined ? { ok: false, status: 401 } : { ok: true, sitzung: sitzung.id };
}
