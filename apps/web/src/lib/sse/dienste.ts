/**
 * PaiBot – Dienste des Ereignis-Stroms im Prozess: eine Datenbank-Verbindung, ein Verteiler
 * (eine LISTEN-Verbindung) und ein Zähler offener Ströme, einmal pro Prozess angelegt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createDb } from "@paibot/db";
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
 * Liefert die Dienste des Prozesses. Die Verbindung nutzt `DATABASE_URL` (App-Rolle). Liegt sie am
 * gemeinsamen Ort `globalThis`, überlebt sie auch das Neuladen von Modulen in der Entwicklung.
 */
export function ereignisDienste(): EreignisDienste {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL fehlt");
  const halter = globalThis as Halter;
  const vorhanden = halter[SCHLUESSEL];
  if (vorhanden && vorhanden.url === url) return vorhanden.dienste;
  const { db, sql } = createDb(url);
  const dienste: EreignisDienste = {
    db,
    verteiler: createVerteiler(ausPostgres(sql)),
    zaehler: createStromZaehler(),
  };
  halter[SCHLUESSEL] = { url, dienste };
  return dienste;
}
