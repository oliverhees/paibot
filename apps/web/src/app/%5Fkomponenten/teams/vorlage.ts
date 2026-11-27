/**
 * PaiBot – liest die Vorlage des Content-Teams (vorlagen/teams/content-team.json) für die Vorschau.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Vorlage } from "@paibot/ui";

/** Pfad der Vorlage, von `apps/web` (dem Arbeitsordner von Next.js und der Tests) aus gesehen. */
export const VORLAGE_PFAD = resolve(process.cwd(), "../../vorlagen/teams/content-team.json");

/**
 * Liest die Vorlage so, wie sie im Repository liegt, damit die Vorschau den vollen Wortlaut der
 * Anweisungen „aus Vorlage“ zeigt und nichts davon ein zweites Mal im Code steht.
 */
export async function ladeVorlage(pfad: string = VORLAGE_PFAD): Promise<Vorlage> {
  const roh: unknown = JSON.parse(await readFile(pfad, "utf8"));
  if (!istVorlage(roh)) throw new Error(`Vorlage hat nicht die erwartete Form: ${pfad}`);
  return roh;
}

function istVorlage(v: unknown): v is Vorlage {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  const team = o.team as Record<string, unknown> | undefined;
  const leitung = team?.leitung as Record<string, unknown> | undefined;
  return (
    typeof o.titel === "string" &&
    typeof team?.name === "string" &&
    typeof leitung?.name === "string" &&
    Array.isArray(o.bots) &&
    o.bots.length > 0 &&
    o.bots.every(
      (b) =>
        typeof b === "object" &&
        b !== null &&
        typeof (b as Record<string, unknown>).name === "string" &&
        typeof (b as Record<string, unknown>).anweisung === "string",
    )
  );
}
