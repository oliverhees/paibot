/**
 * PaiBot – Eingaben der Routen für Apps (Körper der Anfragen).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { sha256DigestSchema } from "@paibot/shared/grundtypen";
import { APP_ACCESS_LEVELS, APP_TOOL_CLASSES } from "@paibot/shared/tor-fassung-3";
import { z } from "zod";
import { MAX_ADRESSE_ZEICHEN, MAX_TOKEN_ZEICHEN } from "./grenzen";

/** Kurzname einer App: Teil der Modell-Namen, deshalb kurz (höchstens 32 Zeichen). */
export const KURZNAME_MUSTER = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** App verbinden: Adresse, optional Name, Kurzname und persönlicher Token. */
export const appVerbindenEingabe = z.strictObject({
  url: z.string().max(MAX_ADRESSE_ZEICHEN),
  name: z.string().trim().min(1).max(80).optional(),
  kurzname: z.string().regex(KURZNAME_MUSTER).optional(),
  token: z.string().max(MAX_TOKEN_ZEICHEN).optional(),
});
export type AppVerbindenEingabe = z.infer<typeof appVerbindenEingabe>;

/** Ein Werkzeug einstufen: die Klasse und der Abdruck, den der Besitzer gesehen hat. */
export const werkzeugBestaetigenEingabe = z.strictObject({
  klasse: z.enum(APP_TOOL_CLASSES),
  gesehenerAbdruck: sha256DigestSchema,
});
export type WerkzeugBestaetigenEingabe = z.infer<typeof werkzeugBestaetigenEingabe>;

/** Zugriff eines Bots auf eine App setzen. */
export const zugriffSetzenEingabe = z.strictObject({ zugriff: z.enum(APP_ACCESS_LEVELS) });
export type ZugriffSetzenEingabe = z.infer<typeof zugriffSetzenEingabe>;
