/**
 * PaiBot – Test: Der Test-Anbieter und seine Test-Werkzeuge gelangen nie in das Laufzeit-Image.
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

/** Zeilen des Dockerfiles; Fortsetzungszeilen (`\`) sind zusammengezogen, Kommentare entfernt. */
function befehle(text: string): string[] {
  return text
    .replace(/\\\r?\n/g, " ")
    .split("\n")
    .map((z) => z.trim())
    .filter((z) => z !== "" && !z.startsWith("#"));
}

/** Befehle einer Stufe (`FROM … AS <name>` bis zum nächsten `FROM`). */
function stufe(text: string, name: string): string[] {
  const alle = befehle(text);
  const start = alle.findIndex((z) => new RegExp(`^FROM\\s+\\S+\\s+AS\\s+${name}$`, "i").test(z));
  if (start < 0) throw new Error(`Stufe ${name} nicht gefunden`);
  const rest = alle.slice(start + 1);
  const ende = rest.findIndex((z) => /^FROM\s/i.test(z));
  return ende < 0 ? rest : rest.slice(0, ende);
}

/** Alle Quellpfade der `COPY`/`ADD`-Zeilen einer Stufe, mit Angabe, ob sie aus dem Build-Kontext kommen. */
function kopierQuellen(zeilen: string[]): { quelle: string; ausKontext: boolean }[] {
  const quellen: { quelle: string; ausKontext: boolean }[] = [];
  for (const zeile of zeilen) {
    const treffer = /^(COPY|ADD)\s+(.*)$/i.exec(zeile);
    if (!treffer) continue;
    const teile = (treffer[2] ?? "").split(/\s+/).filter(Boolean);
    const optionen = teile.filter((t) => t.startsWith("--"));
    const pfade = teile.filter((t) => !t.startsWith("--"));
    const ausKontext = !optionen.some((o) => o.startsWith("--from="));
    for (const pfad of pfade.slice(0, -1)) quellen.push({ quelle: pfad, ausKontext });
  }
  return quellen;
}

const VERBOTEN = "tools/fake-provider";

/** Gründe, warum eine Stufe den Test-Anbieter enthalten könnte (leer = in Ordnung). */
function verstoesse(zeilen: string[]): string[] {
  const gruende: string[] = [];
  for (const { quelle, ausKontext } of kopierQuellen(zeilen)) {
    const normal = path.posix
      .normalize(quelle.replace(/^\/app\/?/, ""))
      .replace(/^\.\/?$/, "")
      .replace(/\/$/, "");
    if (ausKontext) gruende.push(`Kopie aus dem Build-Kontext: ${quelle}`);
    if (quelle.includes("fake-provider")) gruende.push(`Quelle nennt den Test-Anbieter: ${quelle}`);
    // Ein Ordner über dem Test-Anbieter (oder die Wurzel) würde ihn mitnehmen.
    if (normal === "" || normal === "tools" || `${VERBOTEN}/`.startsWith(`${normal}/`)) {
      gruende.push(`Quelle enthält ${VERBOTEN}: ${quelle}`);
    }
  }
  return gruende;
}

describe("Laufzeit-Image enthält keinen Test-Anbieter", () => {
  const dockerfile = readFileSync(path.join(ROOT, "apps/web/Dockerfile"), "utf8");

  it("die Stufe `run` kopiert nur ausgewählte Dateien aus `build`, nichts aus `tools/fake-provider`", () => {
    const run = stufe(dockerfile, "run");
    expect(kopierQuellen(run).length).toBeGreaterThan(0);
    expect(verstoesse(run)).toEqual([]);
  });

  it("die Prüfung erkennt eine Kopier-Zeile für den Test-Anbieter und ihre Verwandten", () => {
    const schlecht = [
      "COPY --from=build /app/tools/fake-provider/dist ./fake",
      "COPY --from=build /app/tools ./tools",
      "COPY --from=build /app ./",
      "COPY --from=build /app/ ./",
      "COPY tools/fake-provider ./x",
      "COPY . .",
      "COPY --from=build /app/apps/web/dist/fake-provider.mjs ./x",
    ];
    for (const zeile of schlecht) expect(verstoesse([zeile]), zeile).not.toEqual([]);
    expect(verstoesse(["COPY --from=build --chown=a:b /app/apps/web/public ./public"])).toEqual([]);
  });

  it("Fortsetzungszeilen werden mitgelesen", () => {
    const text = "FROM x AS run\nCOPY --from=build \\\n  /app/tools/fake-provider ./f\nUSER a\n";
    expect(verstoesse(stufe(text, "run"))).not.toEqual([]);
  });
});
