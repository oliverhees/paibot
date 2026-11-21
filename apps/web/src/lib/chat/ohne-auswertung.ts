/**
 * PaiBot – Zod ohne Code-Auswertung im Browser: Die strenge Content-Security-Policy erlaubt kein\n * `new Function`; ohne diese Einstellung würde Zod es beim Bauen der Schemas versuchen und eine\n * Verletzung melden. Muss vor jedem Modul geladen werden, das Schemas baut.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { config } from "zod";

if (typeof window !== "undefined") config({ jitless: true });
