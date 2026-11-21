/**
 * PaiBot – API-Route `/api/zugang/anmelden`: Mit dem Passwort anmelden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { route } from "../../../../lib/api/route";
import { anmelden } from "../../../../lib/zugang/anmeldung";

export const dynamic = "force-dynamic";

export const POST = route("anmelden", async (kontext) => ({ daten: await anmelden(kontext) }));
