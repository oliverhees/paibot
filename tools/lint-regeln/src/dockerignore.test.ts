/**
 * PaiBot – Test: Umgebungs-Dateien mit Geheimnissen gelangen nicht in den Docker-Build.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Muster aus .dockerignore (ohne Kommentare und Leerzeilen), in der Reihenfolge der Datei. */
function muster(text: string): string[] {
  return text
    .split("\n")
    .map((z) => z.trim())
    .filter((z) => z !== "" && !z.startsWith("#"));
}

/** Ein Muster als regulärer Ausdruck: `**` beliebig viele Ordner, `*` und `?` innerhalb eines Namens. */
function alsAusdruck(pattern: string): RegExp {
  let text = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i] ?? "";
    if (c === "*" && pattern[i + 1] === "*") {
      i++;
      if (pattern[i + 1] === "/") {
        i++;
        text += "(?:.*/)?";
      } else {
        text += ".*";
      }
    } else if (c === "*") text += "[^/]*";
    else if (c === "?") text += "[^/]";
    else text += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  // Ein Muster für einen Ordner schließt auch alles darin aus.
  return new RegExp(`^${text}(?:/.*)?$`);
}

/** Wie Docker: Die Muster werden der Reihe nach geprüft, das letzte passende entscheidet. */
function ausgeschlossen(liste: string[], datei: string): boolean {
  let ergebnis = false;
  for (const roh of liste) {
    const nein = roh.startsWith("!");
    const pattern = (nein ? roh.slice(1) : roh).replace(/^\//, "");
    if (alsAusdruck(pattern).test(datei)) ergebnis = !nein;
  }
  return ergebnis;
}

describe(".dockerignore", () => {
  const liste = muster(readFileSync(path.join(ROOT, ".dockerignore"), "utf8"));

  it.each([
    ".env",
    "deploy/.env",
    "deploy/.env.lokal",
    "apps/web/.env.production",
    "build-time.env",
    "artifacts/build-time.env",
    "deploy/coolify.env",
  ])("schließt %s aus", (datei) => {
    expect(ausgeschlossen(liste, datei)).toBe(true);
  });

  it.each(["deploy/.env.example", "apps/web/src/lib/umgebung.ts", "deploy/env-erzeugen.sh"])(
    "lässt %s im Build",
    (datei) => {
      expect(ausgeschlossen(liste, datei)).toBe(false);
    },
  );

  it("der Abgleich folgt der Reihenfolge der Muster", () => {
    expect(ausgeschlossen(["**/*.env", "!a.env"], "a.env")).toBe(false);
    expect(ausgeschlossen(["!a.env", "**/*.env"], "a.env")).toBe(true);
  });
});
