/**
 * PaiBot – Zugang beim Serverstart: Einrichtungs-Code erzeugen und ins Log schreiben, solange
 * PaiBot nicht eingerichtet ist; Hinweis, wenn `APP_URL` fehlt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type Database, repo } from "@paibot/db";
import { t } from "@paibot/shared/texte";
import { prozessDienste, type ZugangsDienste } from "./dienste";
import { type CodeStand, codeSicherstellen } from "./einrichtungs-code";

/**
 * Läuft nach den Migrationen. Ist PaiBot noch nicht eingerichtet und gilt noch kein
 * Einrichtungs-Code, entsteht einer und steht genau einmal im Log. Gilt schon einer (früherer
 * Start, anderer Prozess), entsteht kein neuer; dann steht nur ein Hinweis im Log, wann er erzeugt
 * wurde.
 */
export async function zugangBeimStart(d: ZugangsDienste = prozessDienste()): Promise<void> {
  if (d.appOrigin() === undefined) {
    d.log.warn("APP_URL fehlt oder ist ungültig: Anmelden und Einrichtung lehnen jede Anfrage ab.");
  }
  if (!d.hinterProxy()) d.log.warn(t("zugang.ohne_proxy"));
  let db: Database;
  try {
    db = d.db();
  } catch {
    return; // ohne Datenbank (Entwicklung ohne DATABASE_URL) gibt es keine Einrichtung
  }
  let stand: CodeStand;
  try {
    if (await repo.settings.isSetupComplete(db)) return;
    stand = await codeSicherstellen(d.code, db, d.uhr.now(), d.log.info);
  } catch {
    d.log.warn(
      "Zustand der Einrichtung nicht lesbar; der Einrichtungs-Code entsteht beim ersten Aufruf.",
    );
    return;
  }
  if (stand.art === "vorhanden") {
    d.log.info(t("einrichtung.code.vorhanden", { zeit: stand.seit.toISOString() }));
  }
}
