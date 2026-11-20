/**
 * PaiBot – Beispielseiten nur in der Entwicklung, in Produktion 404.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { notFound } from "next/navigation";

/** Die Beispielseiten gibt es nur in der Entwicklung; in Produktion antworten sie mit 404. */
export function nurInEntwicklung(): void {
  if (process.env.NODE_ENV === "production") notFound();
}
