/**
 * PaiBot – Suche in Unterhaltungen: die lesende Route und der Ausschnitt um eine Fundstelle. Der
 * Ausschnitt besteht nur aus Text in drei Teilen (davor, Treffer, danach); die Oberfläche setzt
 * ihn als Text ein, nie als HTML.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { SEARCH_PAGE } from "@paibot/shared/eingaben";
import type { RoutenAktion } from "../api/route";
import type { SuchAusschnitt, SuchErgebnis } from "./such-typen";

/** So viele Unterhaltungen mit passendem Titel stehen über den Nachrichten (nur auf Seite 1). */
export const TITEL_GRENZE = 10;
/** Höchstens so viele Zeichen vor dem Treffer bleiben im Ausschnitt. */
const VOR_ZEICHEN = 50;
/** Höchstens so viele Zeichen nach dem Treffer bleiben im Ausschnitt. */
const NACH_ZEICHEN = 90;

/** Leerraum (auch Zeilenumbrüche) zu einem Leerzeichen zusammenfassen. */
function einzeilig(text: string): string {
  return text.replace(/\s+/g, " ");
}

/**
 * Zerlegt einen Ausschnitt aus der Datenbank um die erste Fundstelle von `suchwort` (ohne Groß-
 * und Kleinschreibung) und kürzt ihn an Wortgrenzen. Findet sich das Suchwort im Ausschnitt nicht
 * genau (seltene Zeichen, die beim Kleinschreiben ihre Länge ändern), bleibt der Anfang ohne
 * Markierung.
 */
export function ausschnittAus(
  roh: string,
  suchwort: string,
  rand: { vorne: boolean; hinten: boolean },
): SuchAusschnitt {
  const text = einzeilig(roh);
  const klein = text.toLowerCase();
  const wort = einzeilig(suchwort).toLowerCase();
  const stelle = klein.length === text.length ? klein.indexOf(wort) : -1;
  if (stelle < 0) {
    const kurz = text.slice(0, VOR_ZEICHEN + NACH_ZEICHEN);
    return {
      vor: "",
      treffer: "",
      nach: kurz,
      gekuerztVorne: rand.vorne,
      gekuerztHinten: rand.hinten || kurz.length < text.length,
    };
  }
  let vor = text.slice(0, stelle);
  let vorneGekuerzt = rand.vorne;
  if (vor.length > VOR_ZEICHEN) {
    vor = vor.slice(-VOR_ZEICHEN);
    const leer = vor.indexOf(" ");
    if (leer >= 0 && leer < VOR_ZEICHEN / 2) vor = vor.slice(leer + 1);
    vorneGekuerzt = true;
  } else if (rand.vorne) {
    // Der Ausschnitt der Datenbank beginnt mitten im Text: bis zum ersten Leerzeichen kürzen.
    const leer = vor.indexOf(" ");
    if (leer >= 0) vor = vor.slice(leer + 1);
  }
  const treffer = text.slice(stelle, stelle + wort.length);
  let nach = text.slice(stelle + wort.length);
  let hintenGekuerzt = rand.hinten;
  if (nach.length > NACH_ZEICHEN) {
    nach = nach.slice(0, NACH_ZEICHEN);
    const leer = nach.lastIndexOf(" ");
    if (leer > NACH_ZEICHEN / 2) nach = nach.slice(0, leer);
    hintenGekuerzt = true;
  }
  return {
    vor: vor.trimStart(),
    treffer,
    nach: nach.trimEnd(),
    gekuerztVorne: vorneGekuerzt,
    gekuerztHinten: hintenGekuerzt,
  };
}

/** Teilt einen Titel in davor, Treffer und danach (ohne Kürzen). */
export function titelTeile(titel: string, suchwort: string): SuchAusschnitt {
  const klein = titel.toLowerCase();
  const stelle = klein.length === titel.length ? klein.indexOf(suchwort.toLowerCase()) : -1;
  if (stelle < 0) {
    return { vor: "", treffer: "", nach: titel, gekuerztVorne: false, gekuerztHinten: false };
  }
  return {
    vor: titel.slice(0, stelle),
    treffer: titel.slice(stelle, stelle + suchwort.length),
    nach: titel.slice(stelle + suchwort.length),
    gekuerztVorne: false,
    gekuerztHinten: false,
  };
}

/**
 * `GET /api/suche?q=…&ab=…`: Unterhaltungen mit passendem Titel (nur auf der ersten Seite) und
 * passende Nachrichten, neueste zuerst, je Seite `SEARCH_PAGE.size`. Liest nur.
 */
export const unterhaltungenSuchen: RoutenAktion<"suche"> = async (k) => {
  const { q, ab } = k.eingabe;
  const titel = ab === 0 ? await repo.search.titles(k.db, q, { limit: TITEL_GRENZE }) : [];
  const { hits, more } = await repo.search.messageHits(k.db, q, {
    limit: SEARCH_PAGE.size,
    offset: ab,
  });
  const ergebnis: SuchErgebnis = {
    suchwort: q,
    titel: titel.map((h) => ({
      unterhaltungId: h.conversationId,
      titel: titelTeile(h.title, q),
      zeit: h.time,
    })),
    nachrichten: hits.map((h) => ({
      unterhaltungId: h.conversationId,
      titel: h.title,
      nachrichtId: h.messageId,
      rolle: h.role === "user" ? "du" : "bot",
      zeit: h.time,
      ausschnitt: ausschnittAus(h.excerpt, q, { vorne: h.cutStart, hinten: h.cutEnd }),
    })),
    ...(more ? { weiter: ab + hits.length } : {}),
  };
  return { daten: ergebnis };
};
