/**
 * PaiBot – holt Rohdaten für die Prüfung im Browser über die Lese-Routen: Beleg mit Umfeld,
 * Schlüssel-Belege, Regeln und die Kette in Stücken (mit Fortschritt). Lädt weder Zod noch den
 * Routen-Vertrag.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { PublicKeyInfo, ReceiptEntry } from "@paibot/shared/belege";
import { apiFetch } from "../api/client";
import type { BelegUmfeld, KettenStueck, SchluesselDaten } from "./lesen";
import { BELEG_PFADE, belegPfad, kettePfad } from "./pfade";
import type { EinzelErgebnis, KettenErgebnis, RegelDaten } from "./pruefung";

/** Fehler einer Lese-Route mit dem Text der Hülle. */
export class LadeFehler extends Error {
  readonly ausweg: string | undefined;
  constructor(text: string, ausweg?: string) {
    super(text);
    this.name = "LadeFehler";
    this.ausweg = ausweg;
  }
}

async function holen<T>(pfad: string): Promise<T> {
  const antwort = await apiFetch<T>("GET", pfad);
  if (!antwort.ok) throw new LadeFehler(antwort.fehler.text, antwort.fehler.ausweg);
  return antwort.daten;
}

export const ladeUmfeld = (id: string) => holen<BelegUmfeld>(belegPfad(id));
export const ladeSchluessel = () => holen<SchluesselDaten>(BELEG_PFADE.belegeSchluessel);
export const ladeRegeln = () => holen<RegelDaten>(BELEG_PFADE.regeln);
export const ladeServerEinzel = (id: string) => holen<EinzelErgebnis>(belegPfad(id, true));
export const ladeServerKette = () =>
  holen<{ ergebnis: KettenErgebnis }>(kettePfad({ pruefung: "server" }));

/** Stand beim stückweisen Laden. */
export interface KettenFortschritt {
  geladen: number;
  gesamt: number;
}

/**
 * Lädt die Kette in Stücken (älteste zuerst) und reicht die Belege weiter, sobald ein Stück da ist.
 * `kopfSchluessel` bekommt die öffentlichen Schlüssel aus dem Kopf (nur zum Vergleich).
 */
export async function* ketteStueckweise(
  beiFortschritt: (stand: KettenFortschritt) => void,
  kopfSchluessel?: (schluessel: PublicKeyInfo[]) => void,
  anzahl = 500,
): AsyncGenerator<ReceiptEntry> {
  let ab: number | undefined = 1;
  let geladen = 0;
  while (ab !== undefined) {
    const stueck: KettenStueck = await holen<KettenStueck>(kettePfad({ ab, anzahl }));
    if (stueck.kopf !== undefined) kopfSchluessel?.(stueck.kopf.publicKeys);
    geladen += stueck.belege.length;
    beiFortschritt({ geladen, gesamt: Math.max(stueck.gesamt, geladen) });
    yield* stueck.belege;
    ab = stueck.weiter;
  }
}
