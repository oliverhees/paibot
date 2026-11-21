/**
 * PaiBot – eine gemeinsame Datenbank-Verbindung je Prozess für Seiten, API-Routen und Proxy.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createDb, type Database } from "@paibot/db";
import { PaiBotError } from "@paibot/shared/fehler";

interface Gemeinsam {
  url: string;
  db: Database;
}

const SCHLUESSEL = Symbol.for("paibot.web.datenbank");
type Halter = { [SCHLUESSEL]?: Gemeinsam };

/** Ist eine Datenbank eingestellt (`DATABASE_URL`)? */
export function datenbankEingestellt(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Die Verbindung des Prozesses (App-Rolle aus `DATABASE_URL`). Sie liegt auf `globalThis`, damit
 * Proxy, Seiten und Routen dieselbe nutzen und das Neuladen in der Entwicklung sie nicht vervielfacht.
 * Ohne `DATABASE_URL` folgt `PaiBotError("intern")`.
 */
export function datenbank(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new PaiBotError("intern");
  const halter = globalThis as Halter;
  const vorhanden = halter[SCHLUESSEL];
  if (vorhanden && vorhanden.url === url) return vorhanden.db;
  const { db } = createDb(url);
  halter[SCHLUESSEL] = { url, db };
  return db;
}
