/**
 * PaiBot – Dienste des Ereignis-Stroms im Prozess: die gemeinsame Datenbank-Verbindung der App,
 * ein Verteiler (eine LISTEN-Verbindung) und ein Zähler offener Ströme, einmal pro Prozess angelegt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { datenbankMitClient } from "../datenbank";
import type { EreignisDienste } from "./ereignis-route";
import { createStromZaehler } from "./grenzen";
import { ausPostgres, createVerteiler } from "./verteiler";

interface Gemeinsam {
  url: string;
  dienste: EreignisDienste;
}

const SCHLUESSEL = Symbol.for("paibot.ereignis-strom");
type Halter = { [SCHLUESSEL]?: Gemeinsam };

/**
 * Liefert die Dienste des Prozesses. Datenbank und `LISTEN` laufen über die gemeinsame Verbindung
 * aus `lib/datenbank.ts` (App-Rolle aus `DATABASE_URL`); es entsteht kein zweiter Pool. Liegen die
 * Dienste am gemeinsamen Ort `globalThis`, überleben sie auch das Neuladen von Modulen.
 */
export function ereignisDienste(): EreignisDienste {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL fehlt");
  const halter = globalThis as Halter;
  const vorhanden = halter[SCHLUESSEL];
  if (vorhanden && vorhanden.url === url) return vorhanden.dienste;
  const { db, sql } = datenbankMitClient();
  const dienste: EreignisDienste = {
    db,
    verteiler: createVerteiler(ausPostgres(sql)),
    zaehler: createStromZaehler(),
  };
  halter[SCHLUESSEL] = { url, dienste };
  return dienste;
}
