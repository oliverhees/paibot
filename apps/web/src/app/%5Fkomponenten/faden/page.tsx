/**
 * PaiBot – Beispielseite der Fäden, nur in der Entwicklung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { Metadata } from "next";
import { nurInEntwicklung } from "../nur-entwicklung";
import { FadenVorschau } from "./vorschau";

export const metadata: Metadata = { title: "Fäden – Vorschau" };

/** Fäden eines Teams, alle Szenen mit Beispiel-Daten. */
export default function FadenSeite() {
  nurInEntwicklung();
  return <FadenVorschau />;
}
