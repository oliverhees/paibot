/**
 * PaiBot – Vorschau des Startbereichs in allen drei Fassungen (nur in der Entwicklung).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { Metadata } from "next";
import { nurInEntwicklung } from "../nur-entwicklung";
import { StartbereichVorschau } from "./vorschau";

export const metadata: Metadata = { title: "Startbereich – Vorschau" };

/** Startbereich einer leeren Unterhaltung, alle Fassungen mit Beispiel-Daten. */
export default function StartbereichSeite() {
  nurInEntwicklung();
  return <StartbereichVorschau />;
}
