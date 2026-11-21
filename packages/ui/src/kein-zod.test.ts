/**
 * PaiBot – Die Bausteine der Oberfläche laden im Browser weder Zod noch die Schemas aus
 * `@paibot/shared/objekte` als Wert: Zod prüft beim Start, ob `Function` erlaubt ist, und löst damit
 * unter der strengen Content-Security-Policy eine Meldung aus.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) return dateien(pfad);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [pfad] : [];
  });
}

/** Module, die Zod ziehen: alles aus `objekte`, `inputs`, `actions`, `events`, `api` als Wert. */
const ZOD_MODULE =
  /@paibot\/shared\/(objekte|inputs|actions|aktionen|events|ereignisse|api|belege|tor)\b/;

/** Hat der Import mindestens einen Wert (nicht nur `type`-Namen) aus einem Zod-Modul? */
function ziehtZod(zeile: string): boolean {
  if (/from\s+["']zod["']/.test(zeile)) return true;
  if (!ZOD_MODULE.test(zeile)) return false;
  if (/^\s*(import|export)\s+type\b/.test(zeile)) return false;
  const namen = /\{([^}]*)\}/.exec(zeile)?.[1];
  if (namen === undefined) return /^\s*(import|export)\b/.test(zeile);
  return namen
    .split(",")
    .map((n) => n.trim())
    .some((n) => n !== "" && !n.startsWith("type "));
}

describe("Bausteine ohne Zod im Browser", () => {
  it("kein Baustein importiert Zod oder ein Schema aus @paibot/shared als Wert", () => {
    const verstoesse: string[] = [];
    for (const datei of dateien(__dirname)) {
      for (const zeile of readFileSync(datei, "utf8").split("\n")) {
        if (ziehtZod(zeile)) verstoesse.push(`${datei}: ${zeile.trim()}`);
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it("erkennt Werte neben Typen (Gegenprobe der Prüfung selbst)", () => {
    expect(
      ziehtZod('import { AVATAR_SHAPES, type AvatarShape } from "@paibot/shared/objekte";'),
    ).toBe(true);
    expect(ziehtZod('import type { AvatarShape } from "@paibot/shared/objekte";')).toBe(false);
    expect(
      ziehtZod('import { type AvatarShape, type BotColor } from "@paibot/shared/objekte";'),
    ).toBe(false);
    expect(ziehtZod('import { z } from "zod";')).toBe(true);
    expect(ziehtZod('import { t } from "@paibot/shared/texte";')).toBe(false);
  });
});
