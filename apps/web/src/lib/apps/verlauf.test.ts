/**
 * PaiBot – Tests zum Vergleich mit der früher bestätigten Fassung: Auswahl der Fassung und die
 * Grenze der geladenen Fassungen. Liegt die zuletzt bestätigte Fassung außerhalb der Grenze, sagt
 * die Anzeige das; sie behauptet nie, es sei nichts geändert.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { repo } from "@paibot/db";
import { describe, expect, it } from "vitest";
import { vergleichFuer } from "./verlauf";

type AppTool = repo.apps.AppTool;

const abdruck = (n: number) => `sha256:${String(n).padStart(64, "0")}` as AppTool["toolDigest"];

function fassung(version: number, status: AppTool["status"], digest = version): AppTool {
  return { version, status, toolDigest: abdruck(digest) } as AppTool;
}

describe("vergleichFuer", () => {
  it("nimmt die jüngste eingestufte Fassung mit anderem Abdruck, nicht den Vorgänger", () => {
    const verlauf = [
      fassung(1, "neu"),
      fassung(2, "bestaetigt"),
      fassung(3, "geaendert"),
      fassung(4, "geaendert"),
    ];
    const r = vergleichFuer(verlauf, verlauf[3] as AppTool, false);
    expect(r.frueher?.version).toBe(2);
    expect(r.unvollstaendig).toBe(false);
  });

  it("ohne Grenze und ohne eingestufte Fassung: geändert nimmt den Vorgänger, neu hat nichts", () => {
    const verlauf = [fassung(1, "neu"), fassung(2, "geaendert")];
    expect(vergleichFuer(verlauf, verlauf[1] as AppTool, false)).toEqual({
      frueher: verlauf[0],
      unvollstaendig: false,
    });
    const neu = [fassung(1, "neu"), fassung(2, "neu", 1)];
    expect(vergleichFuer(neu, neu[1] as AppTool, false)).toEqual({
      frueher: undefined,
      unvollstaendig: false,
    });
  });

  // Gegenprobe: die Grenze nicht beachten (immer `unvollstaendig: false`) → rot.
  it("abgeschnittener Verlauf ohne eingestufte Fassung: unvollständig, nie „unverändert“, kein falscher Vorgänger", () => {
    const verlauf = [fassung(300, "geaendert"), fassung(301, "geaendert")];
    const r = vergleichFuer(verlauf, verlauf[1] as AppTool, true);
    expect(r.unvollstaendig).toBe(true);
    expect(r.frueher).toBeUndefined();
    const neu = [fassung(300, "neu"), fassung(301, "neu", 7)];
    expect(vergleichFuer(neu, neu[1] as AppTool, true).unvollstaendig).toBe(true);
  });

  it("abgeschnittener Verlauf, aber die eingestufte Fassung liegt im Fenster: ein vollständiger Vergleich", () => {
    const verlauf = [fassung(299, "bestaetigt"), fassung(300, "geaendert")];
    const r = vergleichFuer(verlauf, verlauf[1] as AppTool, true);
    expect(r.frueher?.version).toBe(299);
    expect(r.unvollstaendig).toBe(false);
  });

  it("eine Fassung ohne Vergleichsbedarf (bestätigt) wird nie als unvollständig gemeldet", () => {
    const verlauf = [fassung(1, "neu"), fassung(2, "bestaetigt")];
    expect(vergleichFuer(verlauf, verlauf[1] as AppTool, true)).toEqual({
      frueher: undefined,
      unvollstaendig: false,
    });
  });
});
