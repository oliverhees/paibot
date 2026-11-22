/**
 * PaiBot – API: Zweiten Schlüssel eines Anbieters setzen oder entfernen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { route } from "../../../../../lib/api/route";
import {
  anbieterVerwaltungsschluesselEntfernen,
  anbieterVerwaltungsschluesselSetzen,
} from "../../../../../lib/modelle/verwaltung";

export const dynamic = "force-dynamic";

export const PUT = route(
  "anbieterVerwaltungsschluesselSetzen",
  anbieterVerwaltungsschluesselSetzen,
);
export const DELETE = route(
  "anbieterVerwaltungsschluesselEntfernen",
  anbieterVerwaltungsschluesselEntfernen,
);
