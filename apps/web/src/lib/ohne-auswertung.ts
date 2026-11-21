/**
 * PaiBot – Zod ohne Code-Auswertung im Browser: Die strenge Content-Security-Policy erlaubt kein
 * `new Function`; ohne diese Einstellung würde Zod es beim Bauen der Schemas versuchen und eine
 * Verletzung melden. Ein Modul für die ganze Web-App: als erster Import in jedem Einstieg, der im
 * Browser Schemas baut (Rahmen der App, Chat), und vor dem Nachladen des Prüfers der Belege.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { config } from "zod";

if (typeof window !== "undefined") config({ jitless: true });
